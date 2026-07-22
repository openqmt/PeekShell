/**
 * 上传 / 下载任务进度，以及默认本地下载目录。
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export type TransferKind = "upload" | "download";
export type TransferStatus = "running" | "done" | "error";

export interface TransferItem {
  id: string;
  kind: TransferKind;
  name: string;
  remotePath: string;
  localPath: string;
  transferred: number;
  total: number;
  status: TransferStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface TransferProgressPayload {
  id: string;
  transferred: number;
  total: number;
  status: TransferStatus;
  error?: string | null;
}

const DOWNLOAD_DIR_KEY = "peekshell.defaultDownloadDir";
const MAX_ITEMS = 40;

function readDownloadDir(): string {
  return localStorage.getItem(DOWNLOAD_DIR_KEY)?.trim() || "";
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useTransfersStore = defineStore("transfers", () => {
  const items = ref<TransferItem[]>([]);
  const panelOpen = ref(false);
  const defaultDownloadDir = ref(readDownloadDir());
  let unlisten: UnlistenFn | null = null;
  let listening = false;

  const activeCount = computed(
    () => items.value.filter((item) => item.status === "running").length
  );

  watch(defaultDownloadDir, (value) => {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(DOWNLOAD_DIR_KEY, trimmed);
    else localStorage.removeItem(DOWNLOAD_DIR_KEY);
  });

  async function ensureListening() {
    if (listening) return;
    listening = true;
    unlisten = await listen<TransferProgressPayload>("transfer://progress", (event) => {
      const payload = event.payload;
      const item = items.value.find((row) => row.id === payload.id);
      if (!item) return;
      item.transferred = payload.transferred;
      item.total = payload.total;
      item.status = payload.status;
      if (payload.error) item.error = payload.error;
      if (payload.status === "done" || payload.status === "error") {
        item.finishedAt = Date.now();
      }
    });
  }

  function startTransfer(input: {
    kind: TransferKind;
    name: string;
    remotePath: string;
    localPath: string;
    total?: number;
  }): string {
    void ensureListening();
    const id = newId();
    items.value.unshift({
      id,
      kind: input.kind,
      name: input.name,
      remotePath: input.remotePath,
      localPath: input.localPath,
      transferred: 0,
      total: input.total ?? 0,
      status: "running",
      startedAt: Date.now(),
    });
    if (items.value.length > MAX_ITEMS) {
      items.value = items.value.slice(0, MAX_ITEMS);
    }
    panelOpen.value = true;
    return id;
  }

  function markError(id: string, error: string) {
    const item = items.value.find((row) => row.id === id);
    if (!item) return;
    item.status = "error";
    item.error = error;
    item.finishedAt = Date.now();
  }

  function clearFinished() {
    items.value = items.value.filter((item) => item.status === "running");
  }

  function setDefaultDownloadDir(path: string) {
    defaultDownloadDir.value = path.trim();
  }

  function clearDefaultDownloadDir() {
    defaultDownloadDir.value = "";
  }

  function togglePanel(force?: boolean) {
    panelOpen.value = typeof force === "boolean" ? force : !panelOpen.value;
  }

  function dispose() {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    listening = false;
  }

  return {
    items,
    panelOpen,
    defaultDownloadDir,
    activeCount,
    startTransfer,
    markError,
    clearFinished,
    setDefaultDownloadDir,
    clearDefaultDownloadDir,
    togglePanel,
    ensureListening,
    dispose,
  };
});
