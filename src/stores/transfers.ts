/**
 * 上传 / 下载任务进度，以及默认本地下载目录。
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import * as api from "../api/tauri";

export type TransferKind = "upload" | "download";
export type TransferStatus = "queued" | "running" | "done" | "error" | "paused";

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

export type TransferEnqueueInput = {
  kind: TransferKind;
  name: string;
  remotePath: string;
  localPath: string;
  total?: number;
};

interface TransferProgressPayload {
  id: string;
  transferred: number;
  total: number;
  status: string;
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

function isTerminalStatus(status: string) {
  return status === "done" || status === "error";
}

export const useTransfersStore = defineStore("transfers", () => {
  const items = ref<TransferItem[]>([]);
  const panelOpen = ref(false);
  const defaultDownloadDir = ref(readDownloadDir());
  /** Current multi-file batch size; 0 means no active batch. */
  const batchTotal = ref(0);
  const batchCompleted = ref(0);
  /** Bumped by stopAll so queued frontend loops can exit early. */
  const abortEpoch = ref(0);
  /** True while a resume loop is driving paused → queued → running transfers. */
  const resuming = ref(false);
  let unlisten: UnlistenFn | null = null;
  let listening = false;

  const activeCount = computed(
    () => items.value.filter((item) => item.status === "running").length
  );

  const pendingCount = computed(
    () =>
      items.value.filter((item) => item.status === "running" || item.status === "queued").length
  );

  const pausedCount = computed(
    () => items.value.filter((item) => item.status === "paused").length
  );

  const canResume = computed(() => pausedCount.value > 0 && pendingCount.value === 0);

  /** Badge / header label like `3/12` while a batch is tracked. */
  const batchProgressLabel = computed(() => {
    if (batchTotal.value <= 1) return "";
    return `${batchCompleted.value}/${batchTotal.value}`;
  });

  const hasBatchProgress = computed(() => batchTotal.value > 1);

  watch(defaultDownloadDir, (value) => {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(DOWNLOAD_DIR_KEY, trimmed);
    else localStorage.removeItem(DOWNLOAD_DIR_KEY);
  });

  function noteFinished() {
    if (batchTotal.value <= 0) return;
    batchCompleted.value = Math.min(batchTotal.value, batchCompleted.value + 1);
  }

  function trimItems() {
    if (items.value.length > MAX_ITEMS) {
      items.value = items.value.slice(0, MAX_ITEMS);
    }
  }

  async function ensureListening() {
    if (listening) return;
    listening = true;
    unlisten = await listen<TransferProgressPayload>("transfer://progress", (event) => {
      const payload = event.payload;
      const item = items.value.find((row) => row.id === payload.id);
      if (!item) return;
      // Stopped / paused on the UI — ignore late backend updates.
      if (item.status === "paused") return;
      const wasActive = item.status === "running" || item.status === "queued";
      item.transferred = payload.transferred;
      item.total = payload.total;
      // Backend "cancelled" after Stop is treated as paused already; ignore.
      if (payload.status === "cancelled") return;
      item.status = payload.status as TransferStatus;
      if (payload.error) item.error = payload.error;
      if (isTerminalStatus(payload.status)) {
        item.finishedAt = Date.now();
        if (wasActive) noteFinished();
      }
    });
  }

  /** Start counting a multi-file upload/download batch (`done/total` badge). */
  function beginBatch(total: number) {
    const n = Math.max(0, Math.floor(total));
    if (n <= 1) {
      batchTotal.value = 0;
      batchCompleted.value = 0;
      return;
    }
    batchTotal.value = n;
    batchCompleted.value = 0;
  }

  function clearBatch() {
    batchTotal.value = 0;
    batchCompleted.value = 0;
  }

  function snapshotAbortEpoch() {
    return abortEpoch.value;
  }

  function isAborted(epoch: number) {
    return abortEpoch.value !== epoch;
  }

  /** Pause every running/queued transfer; button switches to Continue. */
  function stopAll() {
    abortEpoch.value += 1;
    void api.cancelAllTransfers();
    for (const item of items.value) {
      if (item.status !== "running" && item.status !== "queued") continue;
      item.status = "paused";
      item.error = undefined;
      item.finishedAt = Date.now();
      // Do not noteFinished — paused items remain part of the batch to resume.
    }
  }

  /**
   * Re-queue paused items so Continue can drive them again.
   * Returns ids in list order (top to bottom).
   */
  function prepareResume(): string[] {
    const ids: string[] = [];
    for (const item of items.value) {
      if (item.status !== "paused") continue;
      item.status = "queued";
      item.transferred = 0;
      item.error = undefined;
      item.finishedAt = undefined;
      item.startedAt = Date.now();
      ids.push(item.id);
    }
    beginBatch(ids.length);
    return ids;
  }

  /**
   * List all files in the panel first as `queued`, then callers activate + transfer one by one.
   * Returns ids in the same order as `entries`.
   */
  function enqueueTransfers(entries: TransferEnqueueInput[]): string[] {
    void ensureListening();
    if (!entries.length) return [];
    beginBatch(entries.length);
    const created = entries.map((input) => ({
      id: newId(),
      kind: input.kind,
      name: input.name,
      remotePath: input.remotePath,
      localPath: input.localPath,
      transferred: 0,
      total: input.total ?? 0,
      status: "queued" as const,
      startedAt: Date.now(),
    }));
    items.value = [...created, ...items.value];
    trimItems();
    return created.map((row) => row.id);
  }

  /** Mark a queued item as running right before invoking the backend transfer. */
  function activateTransfer(id: string): boolean {
    const item = items.value.find((row) => row.id === id);
    if (!item) return false;
    if (item.status === "paused") return false;
    if (item.status === "queued") {
      item.status = "running";
      item.startedAt = Date.now();
    }
    return item.status === "running";
  }

  function startTransfer(input: TransferEnqueueInput): string {
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
    trimItems();
    return id;
  }

  function markError(id: string, error: string) {
    const item = items.value.find((row) => row.id === id);
    if (!item || item.status === "paused") return;
    const wasActive = item.status === "running" || item.status === "queued";
    item.status = "error";
    item.error = error;
    item.finishedAt = Date.now();
    if (wasActive) noteFinished();
  }

  function clearFinished() {
    items.value = items.value.filter(
      (item) =>
        item.status === "running" || item.status === "queued" || item.status === "paused"
    );
    if (pendingCount.value === 0 && pausedCount.value === 0) clearBatch();
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
    pendingCount,
    pausedCount,
    canResume,
    resuming,
    batchTotal,
    batchCompleted,
    batchProgressLabel,
    hasBatchProgress,
    abortEpoch,
    beginBatch,
    clearBatch,
    snapshotAbortEpoch,
    isAborted,
    stopAll,
    prepareResume,
    enqueueTransfers,
    activateTransfer,
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
