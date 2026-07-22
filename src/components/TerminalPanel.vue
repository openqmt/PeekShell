<script setup lang="ts">
/**
 * 多标签 xterm：每个会话一个 Terminal 实例，按 activeSessionId 切换显示。
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import { useUiStore } from "../stores/ui";
import QuickCommandsPanel from "./QuickCommandsPanel.vue";
import RemoteExplorer from "./RemoteExplorer.vue";

const sessions = useSessionsStore();
const ui = useUiStore();
const { t } = useI18n();
const { sessions: sessionList, activeSessionId } = storeToRefs(sessions);
const { theme, displayPrefs } = storeToRefs(ui);

const hostEl = ref<HTMLElement | null>(null);
const terms = new Map<string, { term: Terminal; fit: FitAddon; unlisten: UnlistenFn }>();
const quickCommandsOpen = ref(false);

/** 从当前 CSS 变量读取终端配色，保证与 UI 主题一致。 */
function readTermTheme() {
  const styles = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  return {
    background: styles.getPropertyValue("--term-bg").trim() || "#0a0d10",
    foreground: styles.getPropertyValue("--term-fg").trim() || "#d6dde6",
    cursor: styles.getPropertyValue("--accent").trim() || "#3ecf8e",
    selectionBackground: isLight ? "rgba(31, 157, 99, 0.38)" : "rgba(62, 207, 142, 0.4)",
    selectionInactiveBackground: isLight ? "rgba(31, 157, 99, 0.22)" : "rgba(62, 207, 142, 0.22)",
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

async function readClipboardText(): Promise<string> {
  try {
    return await readText();
  } catch {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }
}

async function writeClipboardText(text: string) {
  if (!text) return;
  try {
    await writeText(text);
  } catch {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }
}

async function pasteIntoSession(term: Terminal) {
  const text = await readClipboardText();
  if (!text) return;
  // 走 xterm.paste，统一换行 / bracketed-paste；最终仍由 onData → ptyWrite
  term.paste(text);
}

function copyTermSelection(term: Terminal): boolean {
  if (!term.hasSelection()) return false;
  const selected = term.getSelection();
  if (!selected) return false;
  void writeClipboardText(selected);
  return true;
}

async function ensureTerm(sessionId: string) {
  if (terms.has(sessionId) || !hostEl.value) return;

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: "IBM Plex Mono, ui-monospace, monospace",
    fontSize: 13,
    theme: readTermTheme(),
    rightClickSelectsWord: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(hostEl.value);
  fit.fit();

  term.onData((data) => {
    // 绑定到本会话，避免非当前标签的按键写入到 active 会话
    void api.ptyWrite(sessionId, data);
  });

  // 快捷键粘贴后短时间内忽略原生 paste，避免粘贴两次
  let ignoreNativePasteUntil = 0;
  const onNativePaste = (ev: Event) => {
    if (performance.now() < ignoreNativePasteUntil) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  term.textarea?.addEventListener("paste", onNativePaste, true);
  term.element?.addEventListener("paste", onNativePaste, true);

  // WebView 里 clipboardData.setData 常无效，改走 Tauri 剪贴板
  const onNativeCopy = (ev: Event) => {
    if (!term.hasSelection()) return;
    ev.preventDefault();
    ev.stopPropagation();
    copyTermSelection(term);
  };
  term.element?.addEventListener("copy", onNativeCopy, true);
  term.textarea?.addEventListener("copy", onNativeCopy, true);

  // Ctrl/Cmd+C（有选区）/ Ctrl+Shift+C 复制；Ctrl/Cmd+V 粘贴
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod || ev.altKey) return true;

    const key = ev.key.toLowerCase();
    if (key === "v" && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopPropagation();
      ignoreNativePasteUntil = performance.now() + 500;
      void pasteIntoSession(term);
      return false;
    }
    // Ctrl+C 有选区时复制；Ctrl+Shift+C 始终尝试复制选区
    if (key === "c" && (ev.shiftKey || term.hasSelection())) {
      if (copyTermSelection(term)) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      }
    }
    return true;
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
      <span class="tabs-spacer" />
      <div class="tabs-tools">
        <button
          type="button"
          class="tab-tool quick-commands-btn"
          :class="{ active: quickCommandsOpen }"
          :title="t('quickCommands.title')"
          :aria-label="t('quickCommands.title')"
          :aria-expanded="quickCommandsOpen"
          @click="quickCommandsOpen = !quickCommandsOpen"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3 4.5 6.5 8 3 11.5M8 11.5h5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="tab-tool"
          :title="t('terminal.openFromHosts')"
          @click="ui.openHostsModal()"
        >
          ＋
        </button>
        <QuickCommandsPanel v-model:open="quickCommandsOpen" />
      </div>
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
  position: relative;
}

.tabs-spacer {
  flex: 1;
  min-width: 8px;
}

.tabs-tools {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px 0 2px;
  flex-shrink: 0;
}

.tab-tool {
  width: 28px;
  height: 26px;
  margin-top: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-size: 16px;
  display: grid;
  place-items: center;
}

.tab-tool:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.tab-tool.active {
  color: var(--accent);
  background: var(--accent-dim);
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
