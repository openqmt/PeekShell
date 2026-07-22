<script setup lang="ts">
/**
 * 多标签 xterm：每个会话一个 Terminal 实例，按 activeSessionId 切换显示。
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import RemoteExplorer from "./RemoteExplorer.vue";

const sessions = useSessionsStore();
const ui = useUiStore();
const { t } = useI18n();
const { sessions: sessionList, activeSessionId } = storeToRefs(sessions);
const { theme, displayPrefs } = storeToRefs(ui);

const hostEl = ref<HTMLElement | null>(null);
const terms = new Map<string, { term: Terminal; fit: FitAddon; unlisten: UnlistenFn }>();

/** 从当前 CSS 变量读取终端配色，保证与 UI 主题一致。 */
function readTermTheme() {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue("--term-bg").trim() || "#0a0d10",
    foreground: styles.getPropertyValue("--term-fg").trim() || "#d6dde6",
    cursor: styles.getPropertyValue("--accent").trim() || "#3ecf8e",
  };
}

function applyTermTheme() {
  const next = readTermTheme();
  for (const [, entry] of terms) {
    entry.term.options.theme = next;
    // 同步滚动视口背景（xterm.css 默认写死为 #000）
    const viewport = entry.term.element?.querySelector(".xterm-viewport") as HTMLElement | null;
    if (viewport) viewport.style.backgroundColor = next.background;
    entry.term.refresh(0, entry.term.rows - 1);
  }
}

async function ensureTerm(sessionId: string) {
  if (terms.has(sessionId) || !hostEl.value) return;

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: "IBM Plex Mono, ui-monospace, monospace",
    fontSize: 13,
    theme: readTermTheme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(hostEl.value);
  fit.fit();

  term.onData((data) => {
    // 绑定到本会话，避免非当前标签的按键写入到 active 会话
    void api.ptyWrite(sessionId, data);
  });

  const unlisten = await listen<string>(`pty://${sessionId}`, (event) => {
    term.write(event.payload);
  });

  terms.set(sessionId, { term, fit, unlisten });
  showOnly(sessionId);
  void sessions.resize(term.cols, term.rows);
}

function showOnly(sessionId: string) {
  for (const [id, entry] of terms) {
    entry.term.element!.style.display = id === sessionId ? "block" : "none";
  }
  const active = terms.get(sessionId);
  if (active) {
    active.fit.fit();
    active.term.focus();
    void sessions.resize(active.term.cols, active.term.rows);
  }
}

async function onSelect(sessionId: string) {
  sessions.select(sessionId);
  await ensureTerm(sessionId);
  showOnly(sessionId);
}

async function onClose(sessionId: string, ev: Event) {
  ev.stopPropagation();
  const entry = terms.get(sessionId);
  if (entry) {
    entry.unlisten();
    entry.term.dispose();
    terms.delete(sessionId);
  }
  await sessions.close(sessionId);
}

function onResize() {
  if (!activeSessionId.value) return;
  const entry = terms.get(activeSessionId.value);
  if (!entry) return;
  entry.fit.fit();
  void sessions.resize(entry.term.cols, entry.term.rows);
}

watch(
  () => sessionList.value.map((s) => s.sessionId).join(","),
  async () => {
    for (const s of sessionList.value) {
      await ensureTerm(s.sessionId);
    }
    if (activeSessionId.value) showOnly(activeSessionId.value);
  }
);

watch(theme, async () => {
  // 等 <html data-theme> 与 CSS 变量落定后再读色
  await nextTick();
  applyTermTheme();
});

watch(
  () => displayPrefs.value.explorer.show,
  async () => {
    await nextTick();
    onResize();
  }
);

onMounted(async () => {
  window.addEventListener("resize", onResize);
  await nextTick();
  for (const s of sessionList.value) {
    await ensureTerm(s.sessionId);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  for (const [, entry] of terms) {
    entry.unlisten();
    entry.term.dispose();
  }
  terms.clear();
});
</script>

<template>
  <section class="main">
    <div class="tabs">
      <button
        v-for="s in sessionList"
        :key="s.sessionId"
        type="button"
        class="tab"
        :class="{ active: s.sessionId === activeSessionId }"
        @click="onSelect(s.sessionId)"
      >
        <span class="dot" />
        <span>{{ s.title }}</span>
        <span class="x" @click="onClose(s.sessionId, $event)">×</span>
      </button>
      <button type="button" class="tab-add" :title="t('terminal.openFromHosts')" @click="ui.openHostsModal()">＋</button>
    </div>

    <div ref="hostEl" class="term-host">
      <div v-if="!sessionList.length" class="empty">
        {{ t("terminal.empty") }}
      </div>
    </div>

    <RemoteExplorer v-if="displayPrefs.explorer.show" @resized="onResize" />
  </section>
</template>

<style scoped>
.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--term-bg);
}

.tabs {
  height: 32px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: stretch;
  padding: 0 2px;
  gap: 1px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-muted);
  border: none;
  background: transparent;
  border-radius: 6px 6px 0 0;
  margin-top: 2px;
  max-width: 180px;
}

.tab.active {
  background: var(--term-bg);
  color: var(--text);
  border: 1px solid var(--border-soft);
  border-bottom-color: var(--term-bg);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.x { margin-left: 4px; opacity: 0.5; }
.x:hover { opacity: 1; color: var(--danger); }

.tab-add {
  width: 32px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 18px;
  margin-top: 2px;
}

.term-host {
  flex: 1;
  min-height: 0;
  padding: 4px 0 4px 4px;
  position: relative;
}

.term-host :deep(.xterm) { height: 100%; }
.term-host :deep(.xterm-viewport) {
  overflow-y: auto !important;
  /* 覆盖 @xterm/xterm 默认的 #000，跟随 UI 主题 */
  background-color: var(--term-bg) !important;
}
/* xterm 自定义滚动条贴右侧 */
.term-host :deep(.xterm-scrollable-element > .scrollbar.vertical) {
  width: 6px !important;
  right: 0 !important;
}
.term-host :deep(.xterm-scrollable-element > .scrollbar.vertical > .slider) {
  width: 6px !important;
  left: 0 !important;
  border-radius: 999px;
  background: var(--scrollbar-thumb) !important;
}
.term-host :deep(.xterm-scrollable-element > .scrollbar.vertical > .slider:hover) {
  background: var(--scrollbar-thumb-hover) !important;
}

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}
</style>
