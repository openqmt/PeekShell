/**
 * SSH 终端会话：多标签、写入、断开。
 * 远端字节流由组件内 listen(`pty://{id}`) 消费，不在此缓存全文。
 * 各会话当前工作目录由终端 PS1/`cd` 跟踪，供文件树同步。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as api from "../api/tauri";
import type { HostMetrics, SessionInfo } from "../types/host";

export const useSessionsStore = defineStore("sessions", () => {
  const sessions = ref<SessionInfo[]>([]);
  const activeSessionId = ref<string | null>(null);
  const metrics = ref<HostMetrics | null>(null);
  const connecting = ref(false);
  const error = ref("");
  /** Absolute remote cwd per session (e.g. `/home`), updated from terminal. */
  const cwdBySession = ref<Record<string, string>>({});

  const activeSession = computed(() =>
    sessions.value.find((s) => s.sessionId === activeSessionId.value) ?? null
  );

  const activeCwd = computed(() => {
    const id = activeSessionId.value;
    if (!id) return null;
    return cwdBySession.value[id] ?? null;
  });

  function setSessionCwd(sessionId: string, path: string) {
    const normalized = path.trim();
    if (!normalized.startsWith("/")) return;
    if (cwdBySession.value[sessionId] === normalized) return;
    cwdBySession.value = { ...cwdBySession.value, [sessionId]: normalized };
  }

  async function connect(hostId: string) {
    connecting.value = true;
    error.value = "";
    try {
      const info = await api.connectHost(hostId);
      sessions.value.push(info);
      activeSessionId.value = info.sessionId;
      // 指标异步拉取，不阻塞「连接成功 → 关弹窗」
      void refreshMetrics();
      return info;
    } catch (e) {
      error.value = String(e);
      throw e;
    } finally {
      connecting.value = false;
    }
  }

  async function close(sessionId: string) {
    const wasActive = activeSessionId.value === sessionId;
    const nextId = wasActive
      ? sessions.value.find((s) => s.sessionId !== sessionId)?.sessionId ?? null
      : activeSessionId.value;

    // 先切走活动会话并清指标，避免断开等待期间侧栏仍显示旧数据
    if (wasActive) {
      activeSessionId.value = nextId;
      if (!nextId) metrics.value = null;
    }

    try {
      await api.disconnectSession(sessionId);
    } finally {
      sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);
      const { [sessionId]: _removed, ...rest } = cwdBySession.value;
      void _removed;
      cwdBySession.value = rest;
      if (wasActive && activeSessionId.value) {
        void refreshMetrics();
      } else if (!activeSessionId.value) {
        metrics.value = null;
      }
    }
  }

  function select(sessionId: string) {
    activeSessionId.value = sessionId;
    metrics.value = null;
    void refreshMetrics();
  }

  async function write(data: string) {
    if (!activeSessionId.value) return;
    await api.ptyWrite(activeSessionId.value, data);
  }

  async function resize(cols: number, rows: number) {
    if (!activeSessionId.value) return;
    await api.ptyResize(activeSessionId.value, cols, rows);
  }

  async function refreshMetrics() {
    const sessionId = activeSessionId.value;
    if (!sessionId) {
      metrics.value = null;
      return;
    }
    try {
      const next = await api.fetchHostMetrics(sessionId);
      // 断开或切换会话后忽略过期响应，避免旧指标写回侧栏
      if (activeSessionId.value === sessionId) {
        metrics.value = next;
      }
    } catch {
      // 指标失败不阻断终端使用
      if (!activeSessionId.value) metrics.value = null;
    }
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeCwd,
    cwdBySession,
    metrics,
    connecting,
    error,
    connect,
    close,
    select,
    setSessionCwd,
    write,
    resize,
    refreshMetrics,
  };
});
