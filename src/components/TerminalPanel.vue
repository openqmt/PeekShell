<script setup lang="ts">
/**
 * 多标签 xterm：每个会话一个 Terminal 实例，按 activeSessionId 切换显示。
 * 右键菜单区分选区 / 空白；支持查找与终端偏好（字体、配色、背景）。
 */
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import { matchShortcut, useTerminalPrefsStore } from "../stores/terminalPrefs";
import { useUiStore } from "../stores/ui";
import QuickCommandsPanel from "./QuickCommandsPanel.vue";
import RemoteExplorer from "./RemoteExplorer.vue";

type TermEntry = {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  unlisten: UnlistenFn;
};

type CtxMenuState = {
  x: number;
  y: number;
  hasSelection: boolean;
};

const sessions = useSessionsStore();
const ui = useUiStore();
const termPrefsStore = useTerminalPrefsStore();
const { t } = useI18n();
const { sessions: sessionList, activeSessionId } = storeToRefs(sessions);
const { theme, displayPrefs } = storeToRefs(ui);
const { prefs: termPrefs } = storeToRefs(termPrefsStore);

const hostEl = ref<HTMLElement | null>(null);
const findInputEl = ref<HTMLInputElement | null>(null);
const terms = new Map<string, TermEntry>();
const quickCommandsOpen = ref(false);
const ctxMenu = ref<CtxMenuState | null>(null);
const findOpen = ref(false);
const findQuery = ref("");

const hostSurfaceStyle = computed(() => {
  const img = termPrefs.value.backgroundImage.trim();
  if (!img) return undefined;
  const safe = img.replace(/\\/g, "/").replace(/"/g, '\\"');
  return {
    backgroundImage: `url("${safe}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
});

const hostOverlayStyle = computed(() => {
  const img = termPrefs.value.backgroundImage.trim();
  if (!img) return undefined;
  const opacity = 1 - termPrefs.value.backgroundOpacity;
  return { backgroundColor: `rgba(0, 0, 0, ${opacity})` };
});

function themeColorsFromCss() {
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

function readTermTheme() {
  const scheme = termPrefs.value.colorScheme;
  const hasBgImage = !!termPrefs.value.backgroundImage.trim();
  let base =
    scheme === "custom"
      ? {
          background: termPrefs.value.customColors.background,
          foreground: termPrefs.value.customColors.foreground,
          cursor: termPrefs.value.customColors.cursor,
          selectionBackground: "rgba(62, 207, 142, 0.4)",
          selectionInactiveBackground: "rgba(62, 207, 142, 0.22)",
        }
      : scheme === "dark"
        ? {
            background: "#0a0d10",
            foreground: "#d6dde6",
            cursor: "#3ecf8e",
            selectionBackground: "rgba(62, 207, 142, 0.4)",
            selectionInactiveBackground: "rgba(62, 207, 142, 0.22)",
          }
        : scheme === "light"
          ? {
              background: "#fbfcfd",
              foreground: "#1a2330",
              cursor: "#1f9d63",
              selectionBackground: "rgba(31, 157, 99, 0.38)",
              selectionInactiveBackground: "rgba(31, 157, 99, 0.22)",
            }
          : themeColorsFromCss();

  if (hasBgImage) {
    base = { ...base, background: "transparent" };
  }
  return base;
}

function applyTermTheme() {
  const next = readTermTheme();
  for (const [, entry] of terms) {
    entry.term.options.theme = next;
    const viewport = entry.term.element?.querySelector(".xterm-viewport") as HTMLElement | null;
    if (viewport) viewport.style.backgroundColor = next.background;
    entry.term.refresh(0, entry.term.rows - 1);
  }
}

function applyTermFont() {
  for (const [, entry] of terms) {
    entry.term.options.fontFamily = termPrefs.value.fontFamily;
    entry.term.options.fontSize = termPrefs.value.fontSize;
    entry.fit.fit();
  }
  if (activeSessionId.value) {
    const active = terms.get(activeSessionId.value);
    if (active) void sessions.resize(active.term.cols, active.term.rows);
  }
}

function applyTermPrefs() {
  applyTermTheme();
  applyTermFont();
}

function activeEntry(): TermEntry | null {
  if (!activeSessionId.value) return null;
  return terms.get(activeSessionId.value) ?? null;
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
  term.paste(text);
}

function copyTermSelection(term: Terminal): boolean {
  if (!term.hasSelection()) return false;
  const selected = term.getSelection();
  if (!selected) return false;
  void writeClipboardText(selected);
  return true;
}

function clearActiveBuffer() {
  const entry = activeEntry();
  if (!entry) return;
  entry.term.clear();
}

function openFind(seed = "") {
  findOpen.value = true;
  if (seed) findQuery.value = seed;
  void nextTick(() => findInputEl.value?.focus());
  if (findQuery.value) findNext();
}

function closeFind() {
  findOpen.value = false;
  const entry = activeEntry();
  entry?.search.clearDecorations();
}

function findNext() {
  const entry = activeEntry();
  if (!entry || !findQuery.value) return;
  entry.search.findNext(findQuery.value);
}

function findPrev() {
  const entry = activeEntry();
  if (!entry || !findQuery.value) return;
  entry.search.findPrevious(findQuery.value);
}

function closeCtxMenu() {
  ctxMenu.value = null;
}

function onTermContextMenu(ev: MouseEvent) {
  if (!activeSessionId.value) return;
  ev.preventDefault();
  ev.stopPropagation();
  const entry = activeEntry();
  const hasSelection = !!entry?.term.hasSelection() && !!entry.term.getSelection();
  const pad = 8;
  const menuW = 180;
  const menuH = hasSelection ? 180 : 120;
  const x = Math.min(ev.clientX, window.innerWidth - menuW - pad);
  const y = Math.min(ev.clientY, window.innerHeight - menuH - pad);
  ctxMenu.value = { x: Math.max(pad, x), y: Math.max(pad, y), hasSelection };
}

function ctxCopy() {
  const entry = activeEntry();
  if (entry) copyTermSelection(entry.term);
  closeCtxMenu();
}

function ctxPaste() {
  const entry = activeEntry();
  if (entry) void pasteIntoSession(entry.term);
  closeCtxMenu();
}

function ctxFind() {
  const entry = activeEntry();
  const seed = entry?.term.hasSelection() ? entry.term.getSelection() : "";
  closeCtxMenu();
  openFind(seed.trim());
}

function ctxClear() {
  clearActiveBuffer();
  closeCtxMenu();
}

function ctxMore() {
  closeCtxMenu();
  ui.openTerminalSettingsModal();
}

function onGlobalPointerDown(ev: PointerEvent) {
  const target = ev.target as HTMLElement | null;
  if (ctxMenu.value && !target?.closest?.(".term-ctx-menu")) {
    closeCtxMenu();
  }
}

async function ensureTerm(sessionId: string) {
  if (terms.has(sessionId) || !hostEl.value) return;

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: termPrefs.value.fontFamily,
    fontSize: termPrefs.value.fontSize,
    theme: readTermTheme(),
    // 避免右键自动选词，以便区分「选区菜单」与「空白菜单」
    rightClickSelectsWord: false,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.open(hostEl.value);
  fit.fit();

  term.onData((data) => {
    void api.ptyWrite(sessionId, data);
  });

  let ignoreNativePasteUntil = 0;
  const onNativePaste = (ev: Event) => {
    if (performance.now() < ignoreNativePasteUntil) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  term.textarea?.addEventListener("paste", onNativePaste, true);
  term.element?.addEventListener("paste", onNativePaste, true);

  const onNativeCopy = (ev: Event) => {
    if (!term.hasSelection()) return;
    ev.preventDefault();
    ev.stopPropagation();
    copyTermSelection(term);
  };
  term.element?.addEventListener("copy", onNativeCopy, true);
  term.textarea?.addEventListener("copy", onNativeCopy, true);

  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    const shortcuts = termPrefs.value.shortcuts;

    if (matchShortcut(ev, shortcuts.paste)) {
      ev.preventDefault();
      ev.stopPropagation();
      ignoreNativePasteUntil = performance.now() + 500;
      void pasteIntoSession(term);
      return false;
    }
    if (matchShortcut(ev, shortcuts.copy)) {
      if (copyTermSelection(term)) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      }
    }
    if (matchShortcut(ev, shortcuts.find)) {
      ev.preventDefault();
      ev.stopPropagation();
      openFind(term.hasSelection() ? term.getSelection() : findQuery.value);
      return false;
    }
    if (matchShortcut(ev, shortcuts.clear)) {
      ev.preventDefault();
      ev.stopPropagation();
      term.clear();
      return false;
    }
    // 兼容：有选区时 Ctrl/Cmd+C 仍可复制
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "c") {
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

  terms.set(sessionId, { term, fit, search, unlisten });
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
  await nextTick();
  applyTermTheme();
});

watch(
  termPrefs,
  () => {
    applyTermPrefs();
  },
  { deep: true }
);

watch(
  () => displayPrefs.value.explorer.show,
  async () => {
    await nextTick();
    onResize();
  }
);

onMounted(async () => {
  window.addEventListener("resize", onResize);
  window.addEventListener("pointerdown", onGlobalPointerDown, true);
  await nextTick();
  for (const s of sessionList.value) {
    await ensureTerm(s.sessionId);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("pointerdown", onGlobalPointerDown, true);
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

    <div
      ref="hostEl"
      class="term-host"
      :class="{ 'has-bg-image': !!termPrefs.backgroundImage.trim() }"
      :style="hostSurfaceStyle"
      @contextmenu="onTermContextMenu"
    >
      <div v-if="termPrefs.backgroundImage.trim()" class="term-bg-overlay" :style="hostOverlayStyle" />
      <div v-if="findOpen" class="term-find" @mousedown.stop @contextmenu.stop>
        <input
          ref="findInputEl"
          v-model="findQuery"
          type="text"
          class="term-find-input"
          :placeholder="t('terminal.findPlaceholder')"
          @keydown.enter.exact.prevent="findNext"
          @keydown.enter.shift.prevent="findPrev"
          @keydown.esc.prevent="closeFind"
        />
        <button type="button" class="term-find-btn" :title="t('terminal.findPrev')" @click="findPrev">
          ↑
        </button>
        <button type="button" class="term-find-btn" :title="t('terminal.findNext')" @click="findNext">
          ↓
        </button>
        <button type="button" class="term-find-btn" :title="t('terminal.findClose')" @click="closeFind">
          ✕
        </button>
      </div>
      <div v-if="!sessionList.length" class="empty">
        {{ t("terminal.empty") }}
      </div>
    </div>

    <RemoteExplorer v-if="displayPrefs.explorer.show" @resized="onResize" />

    <Teleport to="body">
      <div
        v-if="ctxMenu"
        class="term-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @contextmenu.prevent
      >
        <template v-if="ctxMenu.hasSelection">
          <button type="button" class="ctx-item" @click="ctxCopy">{{ t("terminal.ctxCopy") }}</button>
          <button type="button" class="ctx-item" @click="ctxPaste">{{ t("terminal.ctxPaste") }}</button>
          <div class="ctx-sep" />
        </template>
        <button type="button" class="ctx-item" @click="ctxFind">{{ t("terminal.ctxFind") }}</button>
        <button type="button" class="ctx-item" @click="ctxClear">{{ t("terminal.ctxClear") }}</button>
        <div class="ctx-sep" />
        <button type="button" class="ctx-item" @click="ctxMore">{{ t("terminal.ctxMore") }}</button>
      </div>
    </Teleport>
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

.term-host.has-bg-image {
  background-color: transparent;
}

.term-bg-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.term-host :deep(.xterm) {
  height: 100%;
  position: relative;
  z-index: 1;
}

.term-host :deep(.xterm-viewport) {
  overflow-y: auto !important;
  background-color: var(--term-bg) !important;
}

.term-host.has-bg-image :deep(.xterm-viewport) {
  background-color: transparent !important;
}

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

.term-find {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.term-find-input {
  width: 180px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--bg-root);
  color: var(--text);
  font-size: 12px;
}

.term-find-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.term-find-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
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
  z-index: 1;
}
</style>

<style>
/* Teleport 到 body，不能用 scoped */
.term-ctx-menu {
  position: fixed;
  z-index: 100;
  min-width: 168px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.term-ctx-menu .ctx-item {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.term-ctx-menu .ctx-item:hover {
  background: var(--bg-hover);
}

.term-ctx-menu .ctx-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--border-soft);
}
</style>
