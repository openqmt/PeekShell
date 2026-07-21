<script setup lang="ts">
/**
 * 远端文件树：左侧树形目录，右侧展示选中文件夹内容或文件预览。
 * 靠近 explorer 顶边可拖高度；靠近 entries 右边可拖宽度。
 */
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import type { RemoteEntry, RemoteFileContent } from "../types/host";

const emit = defineEmits<{ resized: [] }>();
const { t } = useI18n();

const HEIGHT_KEY = "peekshell.explorerHeight";
const WIDTH_KEY = "peekshell.explorerEntriesWidth";
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 640;
const DEFAULT_HEIGHT = 240;
const MIN_ENTRIES_WIDTH = 140;
const MAX_ENTRIES_WIDTH = 560;
const DEFAULT_ENTRIES_WIDTH = 220;
const EDGE_PX = 6;
const ROOT_PATH = "/";

interface TreeRow {
  entry: RemoteEntry;
  depth: number;
}

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

function parentPath(path: string) {
  if (path === ROOT_PATH) return ROOT_PATH;
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? ROOT_PATH : path.slice(0, idx);
}

function joinPath(dir: string, name: string) {
  return dir === ROOT_PATH ? `/${name}` : `${dir}/${name}`;
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

const pathInput = ref(ROOT_PATH);
const childrenMap = ref<Record<string, RemoteEntry[]>>({});
const expanded = ref<Record<string, boolean>>({ [ROOT_PATH]: true });
const loadingDirs = ref<Record<string, boolean>>({});
const selectedPath = ref<string | null>(null);
const selectedIsDir = ref(false);
const preview = ref<RemoteFileContent | null>(null);
const treeLoading = ref(false);
const previewLoading = ref(false);
const error = ref("");

const resizing = computed(() => draggingHeight.value || draggingWidth.value);
const canGoUp = computed(() => {
  const path = selectedPath.value ?? ROOT_PATH;
  return path !== ROOT_PATH;
});

const treeRows = computed(() => {
  const rows: TreeRow[] = [];
  function walk(dirPath: string, depth: number) {
    const kids = childrenMap.value[dirPath] ?? [];
    for (const entry of kids) {
      rows.push({ entry, depth });
      if (entry.isDir && expanded.value[entry.path]) {
        walk(entry.path, depth + 1);
      }
    }
  }
  walk(ROOT_PATH, 0);
  return rows;
});

const folderEntries = computed(() => {
  if (!selectedPath.value || !selectedIsDir.value) return [];
  return childrenMap.value[selectedPath.value] ?? [];
});

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  const digits = value >= 100 || unit === "B" ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}

function formatType(entry: Pick<RemoteEntry, "isDir" | "fileType">) {
  const raw = entry.fileType.toLowerCase();
  if (entry.isDir || raw.includes("directory") || raw === "d") return t("explorer.typeDir");
  if (raw.includes("link") || raw === "l" || raw === "symlink") return t("explorer.typeSymlink");
  if (raw === "f" || raw === "file" || raw.includes("regular")) return t("explorer.typeFile");
  return entry.fileType || t("explorer.typeFile");
}

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

function resetTree() {
  childrenMap.value = {};
  expanded.value = { [ROOT_PATH]: true };
  loadingDirs.value = {};
  selectedPath.value = null;
  selectedIsDir.value = false;
  preview.value = null;
  pathInput.value = ROOT_PATH;
  error.value = "";
}

async function fetchDir(path: string, force = false) {
  if (!activeSessionId.value) return [];
  if (!force && childrenMap.value[path]) return childrenMap.value[path];

  loadingDirs.value = { ...loadingDirs.value, [path]: true };
  try {
    const listing = await api.listRemoteDir(activeSessionId.value, path);
    childrenMap.value = { ...childrenMap.value, [listing.path]: listing.entries };
    return listing.entries;
  } finally {
    const next = { ...loadingDirs.value };
    delete next[path];
    loadingDirs.value = next;
  }
}

async function ensureAncestorsExpanded(path: string) {
  const parts = path === ROOT_PATH ? [] : path.split("/").filter(Boolean);
  let cursor = ROOT_PATH;
  expanded.value = { ...expanded.value, [ROOT_PATH]: true };
  await fetchDir(ROOT_PATH);
  for (const part of parts) {
    cursor = joinPath(cursor, part);
    expanded.value = { ...expanded.value, [cursor]: true };
    await fetchDir(cursor);
  }
}

async function selectFolder(path: string, expand = true) {
  if (!activeSessionId.value) return;
  error.value = "";
  preview.value = null;
  selectedPath.value = path;
  selectedIsDir.value = true;
  pathInput.value = path;
  if (expand) {
    expanded.value = { ...expanded.value, [path]: true };
  }
  try {
    await fetchDir(path);
  } catch (e) {
    error.value = String(e);
  }
}

async function selectFile(entry: RemoteEntry) {
  if (!activeSessionId.value) return;
  error.value = "";
  selectedPath.value = entry.path;
  selectedIsDir.value = false;
  pathInput.value = parentPath(entry.path);
  previewLoading.value = true;
  try {
    preview.value = await api.readRemoteFile(activeSessionId.value, entry.path);
  } catch (e) {
    preview.value = null;
    error.value = String(e);
  } finally {
    previewLoading.value = false;
  }
}

async function toggleExpand(entry: RemoteEntry, event?: Event) {
  event?.stopPropagation();
  if (!entry.isDir) return;
  if (expanded.value[entry.path]) {
    const next = { ...expanded.value };
    delete next[entry.path];
    expanded.value = next;
    return;
  }
  expanded.value = { ...expanded.value, [entry.path]: true };
  try {
    await fetchDir(entry.path);
  } catch (e) {
    error.value = String(e);
  }
}

async function onTreeClick(entry: RemoteEntry) {
  if (entry.isDir) {
    const isExpanded = !!expanded.value[entry.path];
    if (isExpanded) {
      const next = { ...expanded.value };
      delete next[entry.path];
      expanded.value = next;
      // 折叠时仍选中该文件夹，右侧继续展示其内容
      await selectFolder(entry.path, false);
    } else {
      await selectFolder(entry.path, true);
    }
    return;
  }
  expanded.value = { ...expanded.value, [parentPath(entry.path)]: true };
  await selectFile(entry);
}

async function onRightEntryClick(entry: RemoteEntry) {
  if (entry.isDir) {
    expanded.value = { ...expanded.value, [entry.path]: true };
    await selectFolder(entry.path, true);
    return;
  }
  await selectFile(entry);
}

async function bootstrap() {
  if (!activeSessionId.value) {
    resetTree();
    return;
  }
  treeLoading.value = true;
  error.value = "";
  try {
    resetTree();
    await selectFolder(ROOT_PATH, true);
  } catch (e) {
    error.value = String(e);
  } finally {
    treeLoading.value = false;
  }
}

async function goParent() {
  if (!selectedPath.value || selectedPath.value === ROOT_PATH) return;
  await selectFolder(parentPath(selectedPath.value), true);
}

async function goPath() {
  const target = pathInput.value.trim() || ROOT_PATH;
  try {
    await ensureAncestorsExpanded(target);
    await selectFolder(target, true);
  } catch (e) {
    error.value = String(e);
  }
}

async function refresh() {
  if (!activeSessionId.value) return;
  const focus = selectedIsDir.value && selectedPath.value ? selectedPath.value : ROOT_PATH;
  // 清掉该目录缓存后重载
  const next = { ...childrenMap.value };
  delete next[focus];
  childrenMap.value = next;
  try {
    await selectFolder(focus, true);
  } catch (e) {
    error.value = String(e);
  }
}

watch(
  activeSessionId,
  () => {
    void bootstrap();
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
        :title="t('explorer.parentTitle')"
        :disabled="!activeSessionId || !canGoUp || treeLoading"
        @click="goParent"
      >
        {{ t("explorer.parent") }}
      </button>
      <input
        v-model="pathInput"
        class="path-input"
        type="text"
        spellcheck="false"
        :disabled="!activeSessionId || treeLoading"
        :placeholder="t('explorer.pathPlaceholder')"
        @keydown.enter.prevent="goPath"
      />
      <button
        type="button"
        class="btn ghost mini"
        :disabled="!activeSessionId || treeLoading"
        @click="goPath"
      >
        {{ t("explorer.go") }}
      </button>
      <button
        type="button"
        class="btn ghost mini"
        :disabled="!activeSessionId || treeLoading"
        @click="refresh"
      >
        {{ t("common.refresh") }}
      </button>
    </div>

    <div v-if="error" class="error-line">{{ error }}</div>

    <div class="panes" :style="{ gridTemplateColumns: `${entriesWidth}px 1fr` }">
      <div ref="entriesEl" class="entries">
        <div v-if="!activeSessionId" class="placeholder">{{ t("explorer.needConnect") }}</div>
        <div v-else-if="treeLoading" class="placeholder">{{ t("common.loading") }}</div>
        <div v-else-if="!treeRows.length" class="placeholder">{{ t("explorer.emptyDir") }}</div>
        <button
          v-for="row in treeRows"
          :key="row.entry.path"
          type="button"
          class="tree-row"
          :class="{
            selected: selectedPath === row.entry.path,
            dir: row.entry.isDir,
          }"
          :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
          @click="onTreeClick(row.entry)"
        >
          <span
            class="twist"
            :class="{
              open: row.entry.isDir && expanded[row.entry.path],
              file: !row.entry.isDir,
            }"
            @click="toggleExpand(row.entry, $event)"
          >
            {{ row.entry.isDir ? (loadingDirs[row.entry.path] ? "…" : "▸") : "" }}
          </span>
          <span class="kind">{{ row.entry.isDir ? "DIR" : "FILE" }}</span>
          <span class="name">{{ row.entry.name }}</span>
        </button>
      </div>

      <div class="preview">
        <div v-if="!activeSessionId" class="placeholder">{{ t("explorer.previewHint") }}</div>
        <div v-else-if="previewLoading || (selectedIsDir && selectedPath && loadingDirs[selectedPath])" class="placeholder">
          {{ t(previewLoading ? "explorer.reading" : "common.loading") }}
        </div>
        <div v-else-if="!selectedPath" class="placeholder">{{ t("explorer.selectItem") }}</div>

        <template v-else-if="selectedIsDir">
          <div class="attr-head">
            <span>{{ t("explorer.colName") }}</span>
            <span>{{ t("explorer.colSize") }}</span>
            <span>{{ t("explorer.colType") }}</span>
            <span>{{ t("explorer.colModified") }}</span>
            <span>{{ t("explorer.colPermissions") }}</span>
            <span>{{ t("explorer.colGroup") }}</span>
          </div>
          <div v-if="!folderEntries.length" class="placeholder">{{ t("explorer.emptyDir") }}</div>
          <button
            v-for="entry in folderEntries"
            :key="entry.path"
            type="button"
            class="attr-row"
            :class="{ dir: entry.isDir }"
            @click="onRightEntryClick(entry)"
          >
            <span class="name" :title="entry.name">{{ entry.name }}</span>
            <span>{{ entry.isDir ? "—" : formatSize(entry.size) }}</span>
            <span>{{ formatType(entry) }}</span>
            <span :title="entry.modified">{{ entry.modified || "—" }}</span>
            <span class="mono">{{ entry.permissions || "—" }}</span>
            <span>{{ entry.group || "—" }}</span>
          </button>
        </template>

        <template v-else-if="preview">
          <div class="attr-head">
            <span>{{ t("explorer.colName") }}</span>
            <span>{{ t("explorer.colSize") }}</span>
            <span>{{ t("explorer.colType") }}</span>
            <span>{{ t("explorer.colModified") }}</span>
            <span>{{ t("explorer.colPermissions") }}</span>
            <span>{{ t("explorer.colGroup") }}</span>
          </div>
          <div class="attr-row file-meta">
            <span class="name" :title="preview.name">{{ preview.name }}</span>
            <span>{{ formatSize(preview.size) }}</span>
            <span>{{ formatType({ isDir: false, fileType: preview.fileType }) }}</span>
            <span :title="preview.modified">{{ preview.modified || "—" }}</span>
            <span class="mono">{{ preview.permissions || "—" }}</span>
            <span>{{ preview.group || "—" }}</span>
          </div>
          <div v-if="preview.truncated" class="trunc-banner">{{ t("explorer.truncated") }}</div>
          <pre v-if="preview.binary" class="preview-body muted">{{ t("explorer.binary") }}</pre>
          <pre v-else class="preview-body">{{ preview.content || t("explorer.emptyFile") }}</pre>
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
.explorer.resize-height .tree-row,
.explorer.resize-height .attr-row {
  cursor: ns-resize;
}

.explorer.resize-width,
.explorer.resize-width .tree-row,
.explorer.resize-width .attr-row,
.explorer.resize-width .placeholder,
.explorer.resize-width .preview,
.explorer.resize-width .preview-body,
.explorer.resize-width .attr-head {
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

.tree-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
}

.tree-row:hover {
  background: var(--bg-hover);
}

.tree-row.selected {
  background: var(--accent-dim);
  color: var(--accent);
}

.twist {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-dim);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  border-radius: 3px;
  transition: transform 0.12s ease;
}

.twist:not(.file):hover {
  background: var(--bg-active);
  color: var(--text);
}

.twist.open {
  transform: rotate(90deg);
  color: var(--accent);
}

.kind {
  flex-shrink: 0;
  margin-right: 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.tree-row.dir .kind,
.tree-row.dir .name {
  color: var(--accent);
  font-weight: 600;
}

.tree-row.selected.dir .kind,
.tree-row.selected.dir .name {
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

.attr-head,
.attr-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.6fr) 72px 88px 118px 88px 72px;
  gap: 8px;
  align-items: center;
  padding: 5px 10px;
  font-size: 11px;
}

.attr-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-weight: 600;
}

.attr-row {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border-soft);
  background: transparent;
  color: var(--text-muted);
  text-align: left;
  font-family: var(--font-mono);
  cursor: pointer;
}

.attr-row:hover {
  background: var(--bg-hover);
}

.attr-row.dir .name {
  color: var(--accent);
  font-weight: 600;
}

.attr-row.file-meta {
  cursor: default;
  color: var(--text);
  background: var(--bg-root);
}

.attr-row .mono {
  font-family: var(--font-mono);
}

.trunc-banner {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--warn);
  background: var(--warn-dim);
  border-bottom: 1px solid var(--border-soft);
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
