<script setup lang="ts">
/**
 * 远端文件树：左侧树形目录，右侧展示选中文件夹内容或文件预览。
 * 靠近 explorer 顶边可拖高度；靠近 entries 右边可拖宽度。
 */
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "../api/tauri";
import { useI18n } from "../i18n";
import { useSessionsStore } from "../stores/sessions";
import { useTransfersStore } from "../stores/transfers";
import { useUiStore } from "../stores/ui";
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

type AttrColKey =
  | "colName"
  | "colSize"
  | "colType"
  | "colModified"
  | "colPermissions"
  | "colGroup";

const ATTR_COL_WIDTHS: Record<AttrColKey, string> = {
  colName: "minmax(120px, 1.6fr)",
  colSize: "72px",
  colType: "88px",
  colModified: "118px",
  colPermissions: "88px",
  colGroup: "72px",
};

const ATTR_COL_ORDER: AttrColKey[] = [
  "colName",
  "colSize",
  "colType",
  "colModified",
  "colPermissions",
  "colGroup",
];

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
const ui = useUiStore();
const transfers = useTransfersStore();
const { activeSessionId } = storeToRefs(sessions);
const { displayPrefs } = storeToRefs(ui);
const { items: transferItems, panelOpen: transfersPanelOpen, defaultDownloadDir, activeCount } =
  storeToRefs(transfers);

const visibleAttrCols = computed(() =>
  ATTR_COL_ORDER.filter((key) => displayPrefs.value.explorer[key])
);

const attrGridStyle = computed(() => ({
  gridTemplateColumns: visibleAttrCols.value.map((key) => ATTR_COL_WIDTHS[key]).join(" ") || "1fr",
}));

function attrCell(entry: Pick<RemoteEntry, "name" | "size" | "isDir" | "fileType" | "modified" | "permissions" | "group">, key: AttrColKey) {
  switch (key) {
    case "colName":
      return entry.name;
    case "colSize":
      return entry.isDir ? "—" : formatSize(entry.size);
    case "colType":
      return formatType({ isDir: entry.isDir, fileType: entry.fileType });
    case "colModified":
      return entry.modified || "—";
    case "colPermissions":
      return entry.permissions || "—";
    case "colGroup":
      return entry.group || "—";
  }
}

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
const statusMsg = ref("");
const actionBusy = ref(false);

type CtxMenuVariant = "entry" | "blank";
type CtxMenu = { x: number; y: number; variant: CtxMenuVariant; entry: RemoteEntry };
type PromptKind = "rename" | "mkdir" | "mkfile" | "chmod" | "delete";

const ctxMenu = ref<CtxMenu | null>(null);
const promptKind = ref<PromptKind | null>(null);
const promptTarget = ref<RemoteEntry | null>(null);
const promptInput = ref("");
const promptInputEl = ref<HTMLInputElement | null>(null);

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

function previewAsEntry(file: RemoteFileContent): RemoteEntry {
  return {
    name: file.name,
    path: file.path,
    size: file.size,
    isDir: false,
    fileType: file.fileType,
    modified: file.modified,
    permissions: file.permissions,
    group: file.group,
  };
}

function makeDirEntry(path: string): RemoteEntry {
  return {
    name: path === ROOT_PATH ? "root" : basenameOf(path),
    path,
    isDir: true,
    size: 0,
    fileType: "directory",
    modified: "",
    permissions: "",
    group: "",
  };
}

/** 上传 / 新建：目录用自身，文件用其父目录 */
function containerDir(entry: RemoteEntry): RemoteEntry {
  return entry.isDir ? entry : makeDirEntry(parentPath(entry.path));
}

function currentContainerEntry(): RemoteEntry | null {
  if (!activeSessionId.value) return null;
  if (selectedIsDir.value && selectedPath.value) {
    return makeDirEntry(selectedPath.value);
  }
  if (preview.value) {
    return makeDirEntry(parentPath(preview.value.path));
  }
  return makeDirEntry(ROOT_PATH);
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

function basenameOf(path: string) {
  if (path === ROOT_PATH) return "root";
  return path.split("/").filter(Boolean).pop() || path;
}

function closeCtxMenu() {
  ctxMenu.value = null;
}

function openCtxMenu(event: MouseEvent, variant: CtxMenuVariant, entry: RemoteEntry) {
  const pad = 8;
  const menuW = 200;
  const menuH = variant === "blank" ? 160 : 320;
  const x = Math.min(event.clientX, window.innerWidth - menuW - pad);
  const y = Math.min(event.clientY, window.innerHeight - menuH - pad);
  ctxMenu.value = { x: Math.max(pad, x), y: Math.max(pad, y), variant, entry };
}

function onEntryContextMenu(entry: RemoteEntry, event: MouseEvent) {
  openCtxMenu(event, "entry", entry);
}

function onPreviewBlankContextMenu(event: MouseEvent) {
  if (!activeSessionId.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".attr-row")) return;
  const container = currentContainerEntry();
  if (!container) return;
  openCtxMenu(event, "blank", container);
}

async function ctxRefresh() {
  closeCtxMenu();
  await refresh();
}

function ctxUpload() {
  if (!ctxMenu.value) return;
  const target =
    ctxMenu.value.variant === "blank"
      ? ctxMenu.value.entry
      : containerDir(ctxMenu.value.entry);
  void uploadInto(target);
}

function ctxNewFolder() {
  if (!ctxMenu.value) return;
  openPrompt("mkdir", containerDir(ctxMenu.value.entry));
}

function ctxNewFile() {
  if (!ctxMenu.value) return;
  openPrompt("mkfile", containerDir(ctxMenu.value.entry));
}

function closePrompt() {
  if (actionBusy.value) return;
  promptKind.value = null;
  promptTarget.value = null;
  promptInput.value = "";
}

const promptTitle = computed(() => {
  switch (promptKind.value) {
    case "rename":
      return t("explorer.rename");
    case "mkdir":
      return t("explorer.newFolder");
    case "mkfile":
      return t("explorer.newFile");
    case "chmod":
      return t("explorer.permissions");
    case "delete":
      return t("explorer.delete");
    default:
      return "";
  }
});

const promptLabel = computed(() => {
  switch (promptKind.value) {
    case "rename":
      return t("explorer.renamePrompt");
    case "mkdir":
      return t("explorer.newFolderPrompt");
    case "mkfile":
      return t("explorer.newFilePrompt");
    case "chmod":
      return t("explorer.chmodPrompt");
    case "delete":
      return promptTarget.value
        ? t("explorer.deleteConfirm", { name: promptTarget.value.name })
        : "";
    default:
      return "";
  }
});

function openPrompt(kind: PromptKind, entry: RemoteEntry) {
  closeCtxMenu();
  promptKind.value = kind;
  promptTarget.value = entry;
  if (kind === "rename") promptInput.value = entry.name;
  else if (kind === "chmod") promptInput.value = "755";
  else promptInput.value = "";
  void nextTick(() => {
    promptInputEl.value?.focus();
    promptInputEl.value?.select();
  });
}

async function invalidateDir(path: string) {
  const next = { ...childrenMap.value };
  delete next[path];
  // drop cached descendants so tree stays consistent after rename/delete
  for (const key of Object.keys(next)) {
    if (key === path || key.startsWith(path.endsWith("/") ? path : `${path}/`)) {
      delete next[key];
    }
  }
  childrenMap.value = next;
}

async function refreshAfterMutation(dirPath: string) {
  await invalidateDir(dirPath);
  expanded.value = { ...expanded.value, [dirPath]: true };
  await fetchDir(dirPath, true);
  if (selectedIsDir.value && selectedPath.value === dirPath) {
    await selectFolder(dirPath, true);
  }
}

async function copyPath(entry: RemoteEntry) {
  closeCtxMenu();
  try {
    await navigator.clipboard.writeText(entry.path);
    statusMsg.value = t("explorer.copied");
    error.value = "";
  } catch (e) {
    error.value = String(e);
  }
}

function joinLocalPath(dir: string, name: string) {
  const base = dir.replace(/[/\\]+$/, "");
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${base}${sep}${name}`;
}

function formatBytes(n: number) {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function transferPercent(item: { transferred: number; total: number; status: string }) {
  if (item.total > 0) return Math.min(100, Math.round((item.transferred / item.total) * 100));
  if (item.status === "done") return 100;
  return 0;
}

async function pickDefaultDownloadDir() {
  const selected = await open({
    title: t("transfers.pickDownloadDir"),
    directory: true,
    multiple: false,
  });
  if (typeof selected === "string" && selected) {
    transfers.setDefaultDownloadDir(selected);
  }
}

async function downloadEntry(entry: RemoteEntry) {
  closeCtxMenu();
  if (!activeSessionId.value) return;
  const defaultName = entry.isDir ? `${basenameOf(entry.path)}.tar.gz` : basenameOf(entry.path);
  let localPath: string | null = null;
  if (defaultDownloadDir.value) {
    localPath = joinLocalPath(defaultDownloadDir.value, defaultName);
  } else {
    const picked = await save({
      title: t("explorer.downloadTitle"),
      defaultPath: defaultName,
    });
    if (typeof picked === "string" && picked) localPath = picked;
  }
  if (!localPath) return;

  const transferId = transfers.startTransfer({
    kind: "download",
    name: defaultName,
    remotePath: entry.path,
    localPath,
  });
  statusMsg.value = t("explorer.working");
  error.value = "";
  try {
    await api.remoteDownload(activeSessionId.value, entry.path, localPath, transferId);
    statusMsg.value = t("explorer.downloadDone");
  } catch (e) {
    transfers.markError(transferId, String(e));
    statusMsg.value = "";
    error.value = String(e);
  }
}

async function uploadInto(entry: RemoteEntry) {
  closeCtxMenu();
  if (!activeSessionId.value) return;
  const selected = await open({
    title: t("explorer.uploadTitle"),
    multiple: true,
    directory: false,
  });
  if (!selected) return;
  const files = Array.isArray(selected) ? selected : [selected];
  if (!files.length) return;

  statusMsg.value = t("explorer.working");
  error.value = "";
  try {
    for (const localPath of files) {
      const name = localPath.split(/[/\\]/).pop() || "upload.bin";
      const remotePath = joinPath(entry.path, name);
      const transferId = transfers.startTransfer({
        kind: "upload",
        name,
        remotePath,
        localPath,
      });
      try {
        await api.remoteUpload(activeSessionId.value, localPath, remotePath, transferId);
      } catch (e) {
        transfers.markError(transferId, String(e));
        throw e;
      }
    }
    await refreshAfterMutation(entry.path);
    statusMsg.value = t("explorer.uploadDone");
  } catch (e) {
    statusMsg.value = "";
    error.value = String(e);
  }
}

async function submitPrompt() {
  const kind = promptKind.value;
  const entry = promptTarget.value;
  const sessionId = activeSessionId.value;
  if (!kind || !entry || !sessionId || actionBusy.value) return;

  const value = promptInput.value.trim();
  if (kind !== "delete" && !value) return;
  if (kind === "rename" && value === entry.name) {
    promptKind.value = null;
    promptTarget.value = null;
    promptInput.value = "";
    return;
  }

  actionBusy.value = true;
  error.value = "";
  statusMsg.value = t("explorer.working");
  try {
    if (kind === "rename") {
      const to = joinPath(parentPath(entry.path), value);
      await api.remoteRename(sessionId, entry.path, to);
      await invalidateDir(parentPath(entry.path));
      await invalidateDir(entry.path);
      const nextExpanded = { ...expanded.value };
      if (nextExpanded[entry.path]) {
        delete nextExpanded[entry.path];
        nextExpanded[to] = true;
      }
      expanded.value = nextExpanded;
      await fetchDir(parentPath(entry.path), true);
      if (entry.isDir) await selectFolder(to, true);
      else await selectFile({ ...entry, name: value, path: to });
    } else if (kind === "mkdir") {
      const path = joinPath(entry.path, value);
      await api.remoteMkdir(sessionId, path);
      await refreshAfterMutation(entry.path);
    } else if (kind === "mkfile") {
      const path = joinPath(entry.path, value);
      await api.remoteCreateFile(sessionId, path);
      await refreshAfterMutation(entry.path);
    } else if (kind === "chmod") {
      await api.remoteChmod(sessionId, entry.path, value);
      await refreshAfterMutation(parentPath(entry.path));
      if (entry.isDir) await selectFolder(entry.path, false);
      else await selectFile(entry);
    } else if (kind === "delete") {
      const parent = parentPath(entry.path);
      await api.remoteDelete(sessionId, entry.path);
      await invalidateDir(entry.path);
      await invalidateDir(parent);
      const nextExpanded = { ...expanded.value };
      delete nextExpanded[entry.path];
      expanded.value = nextExpanded;
      await fetchDir(parent, true);
      await selectFolder(parent, true);
    }
    promptKind.value = null;
    promptTarget.value = null;
    promptInput.value = "";
    statusMsg.value = "";
  } catch (e) {
    statusMsg.value = "";
    error.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}

function onGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (ctxMenu.value && !target?.closest?.(".ctx-menu")) {
    closeCtxMenu();
  }
  if (
    transfersPanelOpen.value &&
    !target?.closest?.(".transfers-panel") &&
    !target?.closest?.(".transfers-btn")
  ) {
    transfers.togglePanel(false);
  }
}

watch(
  activeSessionId,
  () => {
    void bootstrap();
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("pointerdown", onGlobalPointerDown, true);
  void transfers.ensureListening();
});

onBeforeUnmount(() => {
  draggingHeight.value = false;
  draggingWidth.value = false;
  window.removeEventListener("pointerdown", onGlobalPointerDown, true);
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
        class="tool-icon"
        :title="t('explorer.parentTitle')"
        :aria-label="t('explorer.parentTitle')"
        :disabled="!activeSessionId || !canGoUp || treeLoading"
        @click="goParent"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M8 12.5V4.5M8 4.5 4.5 8M8 4.5 11.5 8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
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
        class="tool-icon"
        :title="t('explorer.go')"
        :aria-label="t('explorer.go')"
        :disabled="!activeSessionId || treeLoading"
        @click="goPath"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M3 8h9.5M12.5 8 9 4.5M12.5 8 9 11.5"
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
        class="tool-icon"
        :title="t('common.refresh')"
        :aria-label="t('common.refresh')"
        :disabled="!activeSessionId || treeLoading"
        @click="refresh"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M13 8a5 5 0 1 1-1.3-3.4M13 3.5V7H9.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="transfers-wrap">
        <button
          type="button"
          class="tool-icon transfers-btn"
          :class="{ active: transfersPanelOpen || activeCount > 0 }"
          :title="t('transfers.title')"
          :aria-label="t('transfers.title')"
          :aria-expanded="transfersPanelOpen"
          @click="transfers.togglePanel()"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M5 3.5v9M5 3.5 2.5 6M5 3.5 7.5 6M11 12.5v-9M11 12.5 8.5 10M11 12.5 13.5 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span v-if="activeCount" class="transfers-badge">{{ activeCount }}</span>
        </button>

        <div v-if="transfersPanelOpen" class="transfers-panel" @mousedown.stop>
          <div class="transfers-head">
            <strong>{{ t("transfers.title") }}</strong>
            <button
              type="button"
              class="btn ghost mini"
              :disabled="!transferItems.some((i) => i.status !== 'running')"
              @click="transfers.clearFinished()"
            >
              {{ t("transfers.clearFinished") }}
            </button>
          </div>

          <div class="transfers-dir">
            <div class="transfers-dir-label">{{ t("transfers.defaultDir") }}</div>
            <div class="transfers-dir-row">
              <span class="transfers-dir-path" :title="defaultDownloadDir || t('transfers.defaultDirHint')">
                {{ defaultDownloadDir || t("transfers.defaultDirHint") }}
              </span>
              <button type="button" class="btn ghost mini" @click="pickDefaultDownloadDir">
                {{ t("transfers.pickDir") }}
              </button>
              <button
                type="button"
                class="btn ghost mini"
                :disabled="!defaultDownloadDir"
                @click="transfers.clearDefaultDownloadDir()"
              >
                {{ t("transfers.clearDir") }}
              </button>
            </div>
          </div>

          <div v-if="!transferItems.length" class="transfers-empty">{{ t("transfers.empty") }}</div>
          <div v-else class="transfers-list">
            <div v-for="item in transferItems" :key="item.id" class="transfer-item">
              <div class="transfer-top">
                <span class="transfer-kind" :class="item.kind">
                  {{ item.kind === "download" ? t("explorer.download") : t("explorer.upload") }}
                </span>
                <span class="transfer-name" :title="item.name">{{ item.name }}</span>
                <span class="transfer-status" :class="item.status">
                  {{
                    item.status === "running"
                      ? t("transfers.running")
                      : item.status === "done"
                        ? t("transfers.done")
                        : t("transfers.failed")
                  }}
                </span>
              </div>
              <div class="transfer-bar">
                <i
                  :style="{
                    width:
                      item.total > 0 || item.status === 'done'
                        ? transferPercent(item) + '%'
                        : item.status === 'running'
                          ? '35%'
                          : '0%',
                  }"
                  :class="{ indeterminate: item.status === 'running' && !item.total }"
                />
              </div>
              <div class="transfer-meta">
                <span>
                  {{ formatBytes(item.transferred) }}
                  <template v-if="item.total"> / {{ formatBytes(item.total) }}</template>
                </span>
                <span v-if="item.total">{{ transferPercent(item) }}%</span>
              </div>
              <div v-if="item.error" class="transfer-error">{{ item.error }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-line">{{ error }}</div>
    <div v-else-if="statusMsg" class="status-line">{{ statusMsg }}</div>

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
          @contextmenu.prevent="onEntryContextMenu(row.entry, $event)"
        >
          <span
            class="twist"
            :class="{
              open: row.entry.isDir && expanded[row.entry.path],
              file: !row.entry.isDir,
              loading: !!loadingDirs[row.entry.path],
            }"
            @click="toggleExpand(row.entry, $event)"
          >
            <svg
              v-if="row.entry.isDir && !loadingDirs[row.entry.path]"
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 3.5 10.5 8 6 12.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span v-else-if="row.entry.isDir" class="twist-loading" aria-hidden="true" />
          </span>
          <span class="kind">{{ row.entry.isDir ? "DIR" : "FILE" }}</span>
          <span class="name">{{ row.entry.name }}</span>
        </button>
      </div>

      <div class="preview" @contextmenu.prevent="onPreviewBlankContextMenu">
        <div v-if="!activeSessionId" class="placeholder">{{ t("explorer.previewHint") }}</div>
        <div v-else-if="previewLoading || (selectedIsDir && selectedPath && loadingDirs[selectedPath])" class="placeholder">
          {{ t(previewLoading ? "explorer.reading" : "common.loading") }}
        </div>
        <div v-else-if="!selectedPath" class="placeholder">{{ t("explorer.selectItem") }}</div>

        <template v-else-if="selectedIsDir">
          <div v-if="visibleAttrCols.length" class="attr-head" :style="attrGridStyle">
            <span v-for="col in visibleAttrCols" :key="col">{{ t(`explorer.${col}`) }}</span>
          </div>
          <div v-if="!folderEntries.length" class="placeholder">{{ t("explorer.emptyDir") }}</div>
          <button
            v-for="entry in folderEntries"
            :key="entry.path"
            type="button"
            class="attr-row"
            :class="{ dir: entry.isDir }"
            :style="attrGridStyle"
            @click="onRightEntryClick(entry)"
            @contextmenu.prevent.stop="onEntryContextMenu(entry, $event)"
          >
            <span
              v-for="col in visibleAttrCols"
              :key="col"
              :class="{ name: col === 'colName', mono: col === 'colPermissions' }"
              :title="col === 'colName' || col === 'colModified' ? attrCell(entry, col) : undefined"
            >{{ attrCell(entry, col) }}</span>
          </button>
        </template>

        <template v-else-if="preview">
          <div v-if="visibleAttrCols.length" class="attr-head" :style="attrGridStyle">
            <span v-for="col in visibleAttrCols" :key="col">{{ t(`explorer.${col}`) }}</span>
          </div>
          <div
            class="attr-row file-meta"
            :style="attrGridStyle"
            @contextmenu.prevent.stop="onEntryContextMenu(previewAsEntry(preview), $event)"
          >
            <span
              v-for="col in visibleAttrCols"
              :key="col"
              :class="{ name: col === 'colName', mono: col === 'colPermissions' }"
              :title="col === 'colName' || col === 'colModified' ? attrCell(previewAsEntry(preview), col) : undefined"
            >{{ attrCell(previewAsEntry(preview), col) }}</span>
          </div>
          <div
            v-if="preview.truncated"
            class="trunc-banner"
            @contextmenu.prevent.stop="onEntryContextMenu(previewAsEntry(preview), $event)"
          >
            {{ t("explorer.truncated") }}
          </div>
          <pre
            v-if="preview.binary"
            class="preview-body muted"
            @contextmenu.prevent.stop="onEntryContextMenu(previewAsEntry(preview), $event)"
          >{{ t("explorer.binary") }}</pre>
          <pre
            v-else
            class="preview-body"
            @contextmenu.prevent.stop="onEntryContextMenu(previewAsEntry(preview), $event)"
          >{{ preview.content || t("explorer.emptyFile") }}</pre>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="ctxMenu"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @contextmenu.prevent
      >
        <template v-if="ctxMenu.variant === 'blank'">
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxRefresh">
            {{ t("common.refresh") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxUpload">
            {{ t("explorer.upload") }}
          </button>
          <div class="ctx-sep" />
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxNewFile">
            {{ t("explorer.newFile") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxNewFolder">
            {{ t("explorer.newFolder") }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxRefresh">
            {{ t("common.refresh") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="copyPath(ctxMenu.entry)">
            {{ t("explorer.copyPath") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="downloadEntry(ctxMenu.entry)">
            {{ t("explorer.download") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxUpload">
            {{ t("explorer.upload") }}
          </button>
          <div class="ctx-sep" />
          <button
            type="button"
            class="ctx-item danger"
            :disabled="actionBusy"
            @click="openPrompt('delete', ctxMenu.entry)"
          >
            {{ t("explorer.delete") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxNewFile">
            {{ t("explorer.newFile") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="ctxNewFolder">
            {{ t("explorer.newFolder") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="openPrompt('rename', ctxMenu.entry)">
            {{ t("explorer.rename") }}
          </button>
          <button type="button" class="ctx-item" :disabled="actionBusy" @click="openPrompt('chmod', ctxMenu.entry)">
            {{ t("explorer.permissions") }}
          </button>
        </template>
      </div>
    </Teleport>

    <div
      v-if="promptKind"
      class="prompt-overlay"
      @click.self="closePrompt"
      @keydown.esc.prevent="closePrompt"
    >
      <div class="prompt-box" role="dialog" :aria-label="promptTitle">
        <h3>{{ promptTitle }}</h3>
        <p v-if="promptKind === 'delete'" class="prompt-message">{{ promptLabel }}</p>
        <div v-else class="field">
          <label for="explorerPromptInput">{{ promptLabel }}</label>
          <input
            id="explorerPromptInput"
            ref="promptInputEl"
            v-model="promptInput"
            type="text"
            autocomplete="off"
            :disabled="actionBusy"
            @keydown.enter.prevent="submitPrompt"
          />
        </div>
        <div class="prompt-actions">
          <button type="button" class="btn ghost md" :disabled="actionBusy" @click="closePrompt">
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="btn md"
            :class="promptKind === 'delete' ? 'danger' : 'primary'"
            :disabled="actionBusy || (promptKind !== 'delete' && !promptInput.trim())"
            @click="submitPrompt"
          >
            {{ actionBusy ? t("explorer.working") : promptKind === "delete" ? t("explorer.delete") : t("common.confirm") }}
          </button>
        </div>
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
.explorer.resize-height .tool-icon,
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
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-soft);
}

.tool-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  display: grid;
  place-items: center;
}

.tool-icon:hover:not(:disabled) {
  color: var(--text);
  background: var(--bg-hover);
  border-color: var(--border);
}

.tool-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.transfers-wrap {
  position: relative;
  flex-shrink: 0;
}

.transfers-btn {
  position: relative;
}

.transfers-btn.active {
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--accent-dim);
}

.transfers-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--accent);
  color: #06140e;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

:global([data-theme="light"]) .transfers-badge {
  color: #ffffff;
}

.transfers-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: min(360px, 72vw);
  max-height: min(360px, 50vh);
  z-index: 30;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.transfers-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-soft);
}

.transfers-head strong {
  font-size: 12px;
  font-weight: 600;
}

.transfers-dir {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-elevated);
}

.transfers-dir-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.transfers-dir-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.transfers-dir-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.transfers-empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
}

.transfers-list {
  flex: 1;
  overflow: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.transfer-item {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--border-soft);
  background: var(--bg-elevated);
}

.transfer-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.transfer-kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border-soft);
  color: var(--text-muted);
}

.transfer-kind.download {
  color: var(--term-cyan);
  border-color: rgba(110, 200, 212, 0.35);
}

.transfer-kind.upload {
  color: var(--accent);
  border-color: var(--accent-border);
}

.transfer-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}

.transfer-status {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-dim);
}

.transfer-status.running { color: var(--term-cyan); }
.transfer-status.done { color: var(--accent); }
.transfer-status.error { color: var(--danger); }

.transfer-bar {
  height: 5px;
  border-radius: 999px;
  background: var(--bg-root);
  overflow: hidden;
  border: 1px solid var(--border-soft);
}

.transfer-bar > i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.15s ease;
}

.transfer-bar > i.indeterminate {
  animation: transfer-pulse 1.1s ease-in-out infinite;
}

@keyframes transfer-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

.transfer-meta {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.transfer-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--danger);
  word-break: break-all;
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
  display: flex;
  flex-direction: column;
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
  display: grid;
  place-items: center;
  border-radius: 3px;
  transition: transform 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.twist:not(.file):hover {
  background: var(--bg-active);
  color: var(--text);
}

.twist.open {
  transform: rotate(90deg);
  color: var(--accent);
}

.twist.loading {
  transform: none;
}

.twist-loading {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  border-top-color: var(--accent);
  animation: twist-spin 0.7s linear infinite;
}

@keyframes twist-spin {
  to {
    transform: rotate(360deg);
  }
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

.tree-row.dir {
  user-select: none;
  -webkit-user-select: none;
}

.tree-row.dir .kind,
.tree-row.dir .name {
  color: var(--accent);
  font-weight: 600;
  user-select: none;
  -webkit-user-select: none;
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

.attr-row.dir {
  user-select: none;
  -webkit-user-select: none;
}

.attr-row.dir .name {
  color: var(--accent);
  font-weight: 600;
  user-select: none;
  -webkit-user-select: none;
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

.status-line {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-dim);
}

.ctx-menu {
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

.ctx-item {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
}

.ctx-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.ctx-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctx-item.danger {
  color: var(--danger);
}

.ctx-item.danger:hover:not(:disabled) {
  background: var(--danger-dim);
}

.ctx-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--border-soft);
}

.prompt-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--overlay);
}

.prompt-box {
  width: min(360px, 100%);
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

.prompt-box h3 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 650;
}

.prompt-message {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
