<script setup lang="ts">
/**
 * 远端目录浏览：左侧列出路径下条目，右侧预览选中文件内容。
 * 靠近 explorer 顶边可拖高度；靠近 entries 右边可拖宽度。
 */
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import * as api from "../api/tauri";
import { useSessionsStore } from "../stores/sessions";
import type { RemoteEntry, RemoteFileContent } from "../types/host";

const emit = defineEmits<{ resized: [] }>();

const HEIGHT_KEY = "peekshell.explorerHeight";
const WIDTH_KEY = "peekshell.explorerEntriesWidth";
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 640;
const DEFAULT_HEIGHT = 240;
const MIN_ENTRIES_WIDTH = 140;
const MAX_ENTRIES_WIDTH = 560;
const DEFAULT_ENTRIES_WIDTH = 220;
const EDGE_PX = 6;

function readStoredHeight() {
  const raw = Number(localStorage.getItem(HEIGHT_KEY));
  if (!Number.isFinite(raw)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(raw)));
}

function readStoredEntriesWidth() {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  if (!Number.isFinite(raw)) return DEFAULT_ENTRIES_WIDTH;
  return Math.min(MAX_ENTRIES_WIDTH, Math.max(MIN_ENTRIES_WIDTH, Math.round(raw)));
}

const sessions = useSessionsStore();
const { activeSessionId } = storeToRefs(sessions);

const explorerEl = ref<HTMLElement | null>(null);
const entriesEl = ref<HTMLElement | null>(null);
const height = ref(readStoredHeight());
const entriesWidth = ref(readStoredEntriesWidth());
const draggingHeight = ref(false);
const draggingWidth = ref(false);
const nearTopEdge = ref(false);
const nearEntriesEdge = ref(false);
const pathInput = ref("/");
const currentPath = ref("/");
const entries = ref<RemoteEntry[]>([]);
const selectedPath = ref<string | null>(null);
const preview = ref<RemoteFileContent | null>(null);
const loading = ref(false);
const previewLoading = ref(false);
const error = ref("");

const canGoUp = computed(() => currentPath.value !== "/");
const selectedEntry = computed(
  () => entries.value.find((entry) => entry.path === selectedPath.value) ?? null
);
const resizing = computed(() => draggingHeight.value || draggingWidth.value);

function clampHeight(value: number) {
  const maxByViewport = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.7));
  return Math.min(Math.min(MAX_HEIGHT, maxByViewport), Math.max(MIN_HEIGHT, Math.round(value)));
}

function clampEntriesWidth(value: number, panesWidth: number) {
  const maxByPane = Math.max(MIN_ENTRIES_WIDTH, panesWidth - 160);
  return Math.min(
    Math.min(MAX_ENTRIES_WIDTH, maxByPane),
    Math.max(MIN_ENTRIES_WIDTH, Math.round(value))
  );
}

function isNearTopEdge(event: MouseEvent) {
  const el = explorerEl.value;
  if (!el) return false;
  const top = el.getBoundingClientRect().top;
  return event.clientY - top >= 0 && event.clientY - top <= EDGE_PX;
}

function isNearEntriesRightEdge(event: MouseEvent) {
  const el = entriesEl.value;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    event.clientX >= rect.right - EDGE_PX &&
    event.clientX <= rect.right + EDGE_PX &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function onExplorerMove(event: MouseEvent) {
  if (resizing.value) return;
  nearTopEdge.value = isNearTopEdge(event);
  nearEntriesEdge.value = !nearTopEdge.value && isNearEntriesRightEdge(event);
}

function onExplorerLeave() {
  if (!resizing.value) {
    nearTopEdge.value = false;
    nearEntriesEdge.value = false;
  }
}

function onExplorerDown(event: MouseEvent) {
  if (event.button !== 0) return;

  if (isNearTopEdge(event)) {
    event.preventDefault();
    draggingHeight.value = true;
    nearTopEdge.value = true;
    nearEntriesEdge.value = false;
    const startY = event.clientY;
    const startHeight = height.value;

    function onMove(ev: MouseEvent) {
      height.value = clampHeight(startHeight + (startY - ev.clientY));
      emit("resized");
    }

    function onUp() {
      draggingHeight.value = false;
      nearTopEdge.value = false;
      localStorage.setItem(HEIGHT_KEY, String(height.value));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      emit("resized");
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return;
  }

  if (isNearEntriesRightEdge(event)) {
    event.preventDefault();
    draggingWidth.value = true;
    nearEntriesEdge.value = true;
    nearTopEdge.value = false;
    const startX = event.clientX;
    const startWidth = entriesWidth.value;
    const panesWidth = entriesEl.value?.parentElement?.clientWidth ?? 0;

    function onMove(ev: MouseEvent) {
      entriesWidth.value = clampEntriesWidth(startWidth + (ev.clientX - startX), panesWidth);
    }

    function onUp() {
      draggingWidth.value = false;
      nearEntriesEdge.value = false;
      localStorage.setItem(WIDTH_KEY, String(entriesWidth.value));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
}

function parentPath(path: string) {
  if (path === "/") return "/";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

async function loadDir(path: string) {
  if (!activeSessionId.value) {
    entries.value = [];
    currentPath.value = "/";
    pathInput.value = "/";
    selectedPath.value = null;
    preview.value = null;
    error.value = "";
    return;
  }
  loading.value = true;
  error.value = "";
  selectedPath.value = null;
  preview.value = null;
  try {
    const listing = await api.listRemoteDir(activeSessionId.value, path);
    currentPath.value = listing.path;
    pathInput.value = listing.path;
    entries.value = listing.entries;
  } catch (e) {
    error.value = String(e);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function openEntry(entry: RemoteEntry) {
  if (entry.isDir) {
    await loadDir(entry.path);
    return;
  }
  if (!activeSessionId.value) return;
  selectedPath.value = entry.path;
  previewLoading.value = true;
  error.value = "";
  try {
    preview.value = await api.readRemoteFile(activeSessionId.value, entry.path);
  } catch (e) {
    preview.value = null;
    error.value = String(e);
  } finally {
    previewLoading.value = false;
  }
}

function goParent() {
  if (!canGoUp.value) return;
  void loadDir(parentPath(currentPath.value));
}

function goPath() {
  void loadDir(pathInput.value.trim() || "/");
}

function refresh() {
  void loadDir(currentPath.value);
}

watch(
  activeSessionId,
  () => {
    void loadDir("/");
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  draggingHeight.value = false;
  draggingWidth.value = false;
});
</script>

<template>
  <div
    ref="explorerEl"
    class="explorer"
    :class="{
      dragging: resizing,
      'resize-height': nearTopEdge || draggingHeight,
      'resize-width': nearEntriesEdge || draggingWidth,
    }"
    :style="{ height: height + 'px' }"
    @mousemove="onExplorerMove"
    @mouseleave="onExplorerLeave"
    @mousedown="onExplorerDown"
  >
    <div class="toolbar">
      <button
        type="button"
        class="btn ghost mini"
        title="返回上级目录"
        :disabled="!activeSessionId || !canGoUp || loading"
        @click="goParent"
      >
        ↑ 上级
      </button>
      <input
        v-model="pathInput"
        class="path-input"
        type="text"
        spellcheck="false"
        :disabled="!activeSessionId || loading"
        placeholder="/ 根目录"
        @keydown.enter.prevent="goPath"
      />
      <button
        type="button"
        class="btn ghost mini"
        :disabled="!activeSessionId || loading"
        @click="goPath"
      >
        转到
      </button>
      <button
        type="button"
        class="btn ghost mini"
        :disabled="!activeSessionId || loading"
        @click="refresh"
      >
        刷新
      </button>
    </div>

    <div v-if="error" class="error-line">{{ error }}</div>

    <div class="panes" :style="{ gridTemplateColumns: `${entriesWidth}px 1fr` }">
      <div ref="entriesEl" class="entries">
        <div v-if="!activeSessionId" class="placeholder">连接主机后浏览远端目录</div>
        <div v-else-if="loading" class="placeholder">加载中…</div>
        <div v-else-if="!entries.length" class="placeholder">空目录</div>
        <button
          v-for="entry in entries"
          :key="entry.path"
          type="button"
          class="entry"
          :class="{ selected: selectedPath === entry.path, dir: entry.isDir }"
          @click="openEntry(entry)"
          @dblclick="entry.isDir ? openEntry(entry) : undefined"
        >
          <span class="kind">{{ entry.isDir ? "DIR" : "FILE" }}</span>
          <span class="name">{{ entry.name }}</span>
        </button>
      </div>

      <div class="preview">
        <div v-if="!activeSessionId" class="placeholder">文件内容将显示在这里</div>
        <div v-else-if="previewLoading" class="placeholder">读取文件中…</div>
        <div v-else-if="!selectedEntry || selectedEntry.isDir" class="placeholder">
          选择左侧文件以预览内容
        </div>
        <template v-else-if="preview">
          <div class="preview-meta">
            <span class="file-path">{{ preview.path }}</span>
            <span class="file-size">{{ preview.size }} B</span>
            <span v-if="preview.truncated" class="warn">已截断（最多 512KB）</span>
          </div>
          <pre v-if="preview.binary" class="preview-body muted">二进制文件，无法预览文本内容</pre>
          <pre v-else class="preview-body">{{ preview.content || "(空文件)" }}</pre>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer {
  flex: 0 0 auto;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.explorer.dragging {
  user-select: none;
}

.explorer.resize-height,
.explorer.resize-height .toolbar,
.explorer.resize-height .path-input,
.explorer.resize-height .btn,
.explorer.resize-height .entry {
  cursor: ns-resize;
}

.explorer.resize-width,
.explorer.resize-width .entry,
.explorer.resize-width .placeholder,
.explorer.resize-width .preview,
.explorer.resize-width .preview-body,
.explorer.resize-width .preview-meta {
  cursor: ew-resize;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-soft);
}

.path-input {
  flex: 1;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-root);
  color: var(--text);
  padding: 0 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  outline: none;
}

.path-input:focus {
  border-color: var(--accent-border);
}

.error-line {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--danger);
  background: var(--danger-dim);
}

.panes {
  flex: 1;
  min-height: 0;
  display: grid;
}

.entries,
.preview {
  min-height: 0;
  overflow: auto;
}

.entries {
  border-right: 1px solid var(--border-soft);
  min-width: 0;
}

.entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
}

.entry:hover {
  background: var(--bg-hover);
}

.entry.selected {
  background: var(--accent-dim);
  color: var(--accent);
}

.entry.dir .name {
  font-weight: 600;
}

.kind {
  width: 32px;
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.entry.dir .kind {
  color: var(--accent);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.placeholder {
  padding: 18px 12px;
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-soft);
  font-size: 11px;
  color: var(--text-muted);
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  color: var(--text);
}

.file-size {
  font-family: var(--font-mono);
}

.warn {
  color: var(--warn);
}

.preview-body {
  margin: 0;
  padding: 10px;
  font-size: 11.5px;
  line-height: 1.45;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}

.preview-body.muted {
  color: var(--text-dim);
}
</style>
