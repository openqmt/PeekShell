/**
 * 与 Rust Tauri commands 的薄封装。
 * 业务逻辑留在 store / 组件，这里只做 invoke 与类型对齐。
 */
import { invoke } from "@tauri-apps/api/core";
import type { HostMetrics, HostRecord, HostUpsert, SessionInfo } from "../types/host";

export function listHosts(): Promise<HostRecord[]> {
  return invoke("list_hosts");
}

export function upsertHost(payload: HostUpsert): Promise<HostRecord> {
  return invoke("upsert_host", { payload });
}

export function deleteHost(id: string): Promise<void> {
  return invoke("delete_host", { id });
}

export function renameGroup(from: string, to: string): Promise<void> {
  return invoke("rename_group", { from, to });
}

export function deleteGroup(group: string): Promise<void> {
  return invoke("delete_group", { group });
}

export function connectHost(hostId: string): Promise<SessionInfo> {
  return invoke("connect_host", { hostId });
}

export function disconnectSession(sessionId: string): Promise<void> {
  return invoke("disconnect_session", { sessionId });
}

export function ptyWrite(sessionId: string, data: string): Promise<void> {
  return invoke("pty_write", { sessionId, data });
}

export function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { sessionId, cols, rows });
}

export function fetchHostMetrics(sessionId: string): Promise<HostMetrics> {
  return invoke("fetch_host_metrics", { sessionId });
}
