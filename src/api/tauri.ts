/**
 * 与 Rust Tauri commands 的薄封装。
 * 业务逻辑留在 store / 组件，这里只做 invoke 与类型对齐。
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  AiChatResponse,
  AiProviderRecord,
  AiProviderUpsert,
  AiSettings,
  AgentCommand,
  ExecuteCommandResponse,
  ExecMode,
} from "../types/ai";
import type {
  AuthType,
  HostMetrics,
  HostRecord,
  HostUpsert,
  LocalUploadItem,
  RemoteDirListing,
  RemoteFileContent,
  SessionInfo,
} from "../types/host";

export function getAiSettings(): Promise<AiSettings> {
  return invoke("get_ai_settings");
}

export function upsertAiProvider(payload: AiProviderUpsert): Promise<AiProviderRecord> {
  return invoke("upsert_ai_provider", { payload });
}

/** Load a stored API key for the edit dialog. Not kept in Pinia. */
export function getAiProviderApiKey(id: string): Promise<string | null> {
  return invoke("get_ai_provider_api_key", { id });
}

export function deleteAiProvider(id: string): Promise<void> {
  return invoke("delete_ai_provider", { id });
}

export function setActiveAiProvider(id: string): Promise<void> {
  return invoke("set_active_ai_provider", { id });
}

export function setActiveAiModel(model: string): Promise<AiProviderRecord> {
  return invoke("set_active_ai_model", { model });
}

export function aiChat(payload: {
  sessionId: string;
  message: string;
  execMode: ExecMode;
  history: { role: string; content: string }[];
  requestId: string;
  locale: string;
}): Promise<AiChatResponse> {
  return invoke("ai_chat", { payload });
}

export function executeApprovedCommand(
  sessionId: string,
  commandId: string
): Promise<ExecuteCommandResponse> {
  return invoke("execute_approved_command", { sessionId, commandId });
}

export function rejectAgentCommand(sessionId: string, commandId: string): Promise<AgentCommand> {
  return invoke("reject_agent_command", { sessionId, commandId });
}

export function listHosts(): Promise<HostRecord[]> {
  return invoke("list_hosts");
}

export function listGroups(): Promise<string[]> {
  return invoke("list_groups");
}

export function createGroup(name: string): Promise<void> {
  return invoke("create_group", { name });
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

/** Load a stored password/passphrase for the edit dialog. Not kept in Pinia. */
export function getHostSecret(
  id: string,
  kind: "password" | "passphrase",
): Promise<string | null> {
  return invoke("get_host_secret", { id, kind });
}

export function connectHost(hostId: string): Promise<SessionInfo> {
  return invoke("connect_host", { hostId });
}

export interface ConnectionTestPayload {
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  hostId?: string;
}

/** 用当前表单凭证探测 SSH，不保存主机、不创建会话。 */
export function testHostConnection(payload: ConnectionTestPayload): Promise<void> {
  return invoke("test_host_connection", { payload });
}

export function disconnectSession(sessionId: string): Promise<void> {
  return invoke("disconnect_session", { sessionId });
}

export function ptyWrite(sessionId: string, data: string): Promise<void> {
  return invoke("pty_write", { sessionId, data });
}

/** Align Rust Agent exec cwd with the terminal AI>/PS1 path. */
export function setSessionCwd(sessionId: string, cwd: string): Promise<void> {
  return invoke("set_session_cwd", { sessionId, cwd });
}

export function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { sessionId, cols, rows });
}

export function fetchHostMetrics(sessionId: string): Promise<HostMetrics> {
  return invoke("fetch_host_metrics", { sessionId });
}

export function listRemoteDir(sessionId: string, path: string): Promise<RemoteDirListing> {
  return invoke("list_remote_dir", { sessionId, path });
}

export function readRemoteFile(
  sessionId: string,
  path: string,
  maxBytes?: number
): Promise<RemoteFileContent> {
  return invoke("read_remote_file", { sessionId, path, maxBytes });
}

export function writeRemoteFile(
  sessionId: string,
  path: string,
  content: string,
  maxBytes?: number
): Promise<void> {
  return invoke("write_remote_file", { sessionId, path, content, maxBytes });
}

export function remoteMkdir(sessionId: string, path: string): Promise<void> {
  return invoke("remote_mkdir", { sessionId, path });
}

export function remoteCreateFile(sessionId: string, path: string): Promise<void> {
  return invoke("remote_create_file", { sessionId, path });
}

export function remoteRename(sessionId: string, from: string, to: string): Promise<void> {
  return invoke("remote_rename", { sessionId, from, to });
}

export function remoteDelete(sessionId: string, path: string): Promise<void> {
  return invoke("remote_delete", { sessionId, path });
}

export function remoteChmod(sessionId: string, path: string, mode: string): Promise<void> {
  return invoke("remote_chmod", { sessionId, path, mode });
}

export function remoteDownload(
  sessionId: string,
  remotePath: string,
  localPath: string,
  transferId: string
): Promise<void> {
  return invoke("remote_download", { sessionId, remotePath, localPath, transferId });
}

export function remoteUpload(
  sessionId: string,
  localPath: string,
  remotePath: string,
  transferId: string
): Promise<void> {
  return invoke("remote_upload", { sessionId, localPath, remotePath, transferId });
}

export function cancelAllTransfers(): Promise<void> {
  return invoke("cancel_all_transfers_cmd");
}

export function expandLocalUpload(path: string): Promise<LocalUploadItem[]> {
  return invoke("expand_local_upload", { path });
}

/** Open WebView DevTools when the remote `devtools` flag is on (requires tauri `devtools` feature). */
export function openDevtools(): Promise<void> {
  return invoke("open_devtools");
}

export function exportHostsSync(): Promise<Record<string, unknown>> {
  return invoke("export_hosts_sync");
}

export function importHostsSync(payload: Record<string, unknown>): Promise<void> {
  return invoke("import_hosts_sync", { payload });
}

export function exportModelsSync(): Promise<Record<string, unknown>> {
  return invoke("export_models_sync");
}

export function importModelsSync(payload: Record<string, unknown>): Promise<void> {
  return invoke("import_models_sync", { payload });
}

export function vaultUnlock(
  password: string,
  envelope?: Record<string, unknown> | null,
): Promise<void> {
  return invoke("vault_unlock", { password, envelope: envelope ?? null });
}

export function vaultLock(): Promise<void> {
  return invoke("vault_lock");
}

export function vaultIsUnlocked(): Promise<boolean> {
  return invoke("vault_is_unlocked");
}

export function vaultEncryptSecrets(): Promise<Record<string, unknown>> {
  return invoke("vault_encrypt_secrets");
}

export function vaultDecryptAndImport(envelope: Record<string, unknown>): Promise<void> {
  return invoke("vault_decrypt_and_import", { envelope });
}

export function vaultDecryptAndMergeImport(envelope: Record<string, unknown>): Promise<void> {
  return invoke("vault_decrypt_and_merge_import", { envelope });
}

/** Wipe hosts/secrets/AI files (and the audit log) from the native app-data dir. */
export function clearLocalUserData(): Promise<void> {
  return invoke("clear_local_user_data");
}
