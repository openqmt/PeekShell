/**
 * SSH 终端会话：多标签、写入、断开。
 * 远端字节流由组件内 listen(`pty://{id}`) 消费，不在此缓存全文。
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

  const activeSession = computed(() =>
    sessions.value.find((s) => s.sessionId === activeSessionId.value) ?? null
  );

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
    await api.disconnectSession(sessionId);
    sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[0]?.sessionId ?? null;
      if (activeSessionId.value) await refreshMetrics();
      else metrics.value = null;
    }
  }

  function select(sessionId: string) {
    activeSessionId.value = sessionId;
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
    if (!activeSessionId.value) {
      metrics.value = null;
      return;
    }
    try {
      metrics.value = await api.fetchHostMetrics(activeSessionId.value);
    } catch {
      // 指标失败不阻断终端使用
    }
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    metrics,
    connecting,
    error,
    connect,
    close,
    select,
    write,
    resize,
    refreshMetrics,
  };
});
