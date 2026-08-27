mod agent;
mod ai_config;
mod credentials;
mod error;
mod hosts;
mod local_fs;
mod ssh;
mod utils;
mod vault;

use agent::schema::{AgentCommandView, AiChatRequest, AiChatResponse};
use agent::{AgentState, ExecuteCommandResponse};
use ai_config::{AiProviderRecord, AiProviderUpsert, AiSettings};
use error::AppResult;
use hosts::{HostRecord, HostUpsert};
use ssh::{
    cancel_all_transfers, test_connection, ConnectionTestRequest, HostMetrics, RemoteDirListing,
    RemoteFileContent, SessionInfo, SessionManager,
};
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use tauri::Manager;
use vault::{VaultEnvelope, VaultState};

#[tauri::command]
fn list_hosts() -> AppResult<Vec<HostRecord>> {
    hosts::list_hosts()
}

#[tauri::command]
fn list_groups() -> AppResult<Vec<String>> {
    hosts::list_groups()
}

#[tauri::command]
fn create_group(name: String) -> AppResult<()> {
    hosts::create_group(&name)
}

#[tauri::command]
fn upsert_host(payload: HostUpsert) -> AppResult<HostRecord> {
    hosts::upsert_host(payload)
}

#[tauri::command]
fn delete_host(id: String) -> AppResult<()> {
    hosts::delete_host(&id)
}

#[tauri::command]
fn rename_group(from: String, to: String) -> AppResult<()> {
    hosts::rename_group(&from, &to)
}

#[tauri::command]
fn delete_group(group: String) -> AppResult<()> {
    hosts::delete_group(&group)
}

#[tauri::command]
fn get_host_secret(id: String, kind: String) -> AppResult<Option<String>> {
    hosts::get_host_secret(&id, &kind)
}

#[tauri::command]
fn get_ai_settings() -> AppResult<AiSettings> {
    ai_config::get_settings()
}

#[tauri::command]
fn upsert_ai_provider(payload: AiProviderUpsert) -> AppResult<AiProviderRecord> {
    ai_config::upsert_provider(payload)
}

#[tauri::command]
fn get_ai_provider_api_key(id: String) -> AppResult<Option<String>> {
    ai_config::get_provider_api_key(&id)
}

#[tauri::command]
fn delete_ai_provider(id: String) -> AppResult<()> {
    ai_config::delete_provider(&id)
}

#[tauri::command]
fn set_active_ai_provider(id: String) -> AppResult<()> {
    ai_config::set_active_provider(&id)
}

#[tauri::command]
fn set_active_ai_model(model: String) -> AppResult<AiProviderRecord> {
    ai_config::set_active_model(&model)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    agent: tauri::State<'_, Arc<AgentState>>,
    sessions: tauri::State<'_, Arc<SessionManager>>,
    payload: AiChatRequest,
) -> AppResult<AiChatResponse> {
    agent::chat(&app, agent.inner(), sessions.inner(), payload).await
}

#[tauri::command]
async fn execute_approved_command(
    app: tauri::AppHandle,
    agent: tauri::State<'_, Arc<AgentState>>,
    sessions: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    command_id: String,
) -> AppResult<ExecuteCommandResponse> {
    agent::execute_approved(
        &app,
        agent.inner(),
        sessions.inner(),
        &session_id,
        &command_id,
    )
    .await
}

#[tauri::command]
async fn reject_agent_command(
    agent: tauri::State<'_, Arc<AgentState>>,
    session_id: String,
    command_id: String,
) -> AppResult<AgentCommandView> {
    agent::reject_command(agent.inner(), &session_id, &command_id).await
}

#[tauri::command]
async fn connect_host(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<SessionManager>>,
    host_id: String,
) -> AppResult<SessionInfo> {
    state.connect(app, &host_id).await
}

#[tauri::command]
async fn test_host_connection(payload: ConnectionTestRequest) -> AppResult<()> {
    test_connection(payload).await
}

#[tauri::command]
async fn disconnect_session(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
) -> AppResult<()> {
    state.disconnect(&session_id).await
}

#[tauri::command]
async fn pty_write(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    state.write(&session_id, &data).await
}

/// Sync frontend-tracked cwd (AI>/PS1) into Agent exec so the next command starts there.
#[tauri::command]
async fn set_session_cwd(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    cwd: String,
) -> AppResult<()> {
    state.set_agent_cwd(&session_id, &cwd).await
}

#[tauri::command]
async fn pty_resize(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    state.resize(&session_id, cols, rows).await
}

#[tauri::command]
async fn fetch_host_metrics(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
) -> AppResult<HostMetrics> {
    state.metrics(&session_id).await
}

#[tauri::command]
async fn list_remote_dir(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<RemoteDirListing> {
    state.list_dir(&session_id, &path).await
}

#[tauri::command]
async fn read_remote_file(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    max_bytes: Option<u64>,
) -> AppResult<RemoteFileContent> {
    state.read_file(&session_id, &path, max_bytes).await
}

#[tauri::command]
async fn write_remote_file(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    content: String,
    max_bytes: Option<u64>,
) -> AppResult<()> {
    state
        .write_file(&session_id, &path, &content, max_bytes)
        .await
}

#[tauri::command]
async fn remote_mkdir(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    state.mkdir(&session_id, &path).await
}

#[tauri::command]
async fn remote_create_file(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    state.create_file(&session_id, &path).await
}

#[tauri::command]
async fn remote_rename(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    from: String,
    to: String,
) -> AppResult<()> {
    state.rename_path(&session_id, &from, &to).await
}

#[tauri::command]
async fn remote_delete(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    state.delete_path(&session_id, &path).await
}

#[tauri::command]
async fn remote_chmod(
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    path: String,
    mode: String,
) -> AppResult<()> {
    state.chmod_path(&session_id, &path, &mode).await
}

#[tauri::command]
fn expand_local_upload(path: String) -> AppResult<Vec<local_fs::LocalUploadItem>> {
    local_fs::expand_local_upload(&path)
}

#[tauri::command]
async fn remote_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    remote_path: String,
    local_path: String,
    transfer_id: String,
) -> AppResult<()> {
    state
        .download_path(app, &session_id, &remote_path, &local_path, &transfer_id)
        .await
}

#[tauri::command]
async fn remote_upload(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<SessionManager>>,
    session_id: String,
    local_path: String,
    remote_path: String,
    transfer_id: String,
) -> AppResult<()> {
    state
        .upload_file(app, &session_id, &local_path, &remote_path, &transfer_id)
        .await
}

#[tauri::command]
fn cancel_all_transfers_cmd() {
    cancel_all_transfers();
}

/// Open WebView DevTools when remotely enabled via note `devtools` flag.
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
fn export_hosts_sync() -> AppResult<serde_json::Value> {
    hosts::export_sync_payload()
}

#[tauri::command]
fn import_hosts_sync(payload: serde_json::Value) -> AppResult<()> {
    hosts::import_sync_payload(payload)
}

#[tauri::command]
fn export_models_sync() -> AppResult<serde_json::Value> {
    ai_config::export_sync_payload()
}

#[tauri::command]
fn import_models_sync(payload: serde_json::Value) -> AppResult<()> {
    ai_config::import_sync_payload(payload)
}

/// Derive the vault key from the login password and keep it in memory.
/// Pass the cloud `secrets_enc` envelope when one exists so the verifier is checked.
#[tauri::command]
fn vault_unlock(
    state: tauri::State<VaultState>,
    password: String,
    envelope: Option<VaultEnvelope>,
) -> AppResult<()> {
    vault::unlock(&state, &password, envelope.as_ref())
}

#[tauri::command]
fn vault_lock(state: tauri::State<VaultState>) {
    vault::lock(&state);
}

/// Delete host/secret/AI JSON and the audit log from the app data directory.
/// Window geometry (`window_state.json`) is left in place.
#[tauri::command]
fn clear_local_user_data() -> AppResult<()> {
    let Some(base) = dirs::data_dir() else {
        return Err(error::AppError::Message("无法定位数据目录".into()));
    };
    let dir = base.join("PeekShell");
    for name in ["hosts.json", "secrets.json", "ai-config.json", "ai-audit.jsonl"] {
        let path = dir.join(name);
        if path.exists() {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn vault_is_unlocked(state: tauri::State<VaultState>) -> bool {
    vault::is_unlocked(&state)
}

/// Encrypt local `secrets.json` for PUT /sync/secrets_enc. Plaintext never leaves Rust.
#[tauri::command]
fn vault_encrypt_secrets(state: tauri::State<VaultState>) -> AppResult<VaultEnvelope> {
    let map = credentials::export_all()?;
    let plaintext = serde_json::to_string(&map)?;
    vault::encrypt(&state, &plaintext)
}

/// Decrypt a cloud envelope and overwrite local `secrets.json`.
#[tauri::command]
fn vault_decrypt_and_import(
    state: tauri::State<VaultState>,
    envelope: VaultEnvelope,
) -> AppResult<()> {
    let plaintext = vault::decrypt(&state, &envelope)?;
    let map: HashMap<String, String> = serde_json::from_str(&plaintext)?;
    credentials::import_all(map)
}

/// Decrypt a cloud envelope and union into local `secrets.json` (local keys win).
#[tauri::command]
fn vault_decrypt_and_merge_import(
    state: tauri::State<VaultState>,
    envelope: VaultEnvelope,
) -> AppResult<()> {
    let plaintext = vault::decrypt(&state, &envelope)?;
    let map: HashMap<String, String> = serde_json::from_str(&plaintext)?;
    credentials::merge_import(map, true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sessions = Arc::new(SessionManager::new());
    let agent = Arc::new(AgentState::new());

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    // Focus the existing window when a second process starts (desktop only).
    #[cfg(desktop)]
    {
        builder = utils::init::setup_single_instance(builder);
    }

    builder
        .manage(sessions)
        .manage(agent)
        .manage(VaultState::new())
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            list_groups,
            create_group,
            upsert_host,
            delete_host,
            rename_group,
            delete_group,
            get_host_secret,
            get_ai_settings,
            upsert_ai_provider,
            get_ai_provider_api_key,
            delete_ai_provider,
            set_active_ai_provider,
            set_active_ai_model,
            ai_chat,
            execute_approved_command,
            reject_agent_command,
            connect_host,
            test_host_connection,
            disconnect_session,
            pty_write,
            set_session_cwd,
            pty_resize,
            fetch_host_metrics,
            list_remote_dir,
            read_remote_file,
            write_remote_file,
            remote_mkdir,
            remote_create_file,
            remote_rename,
            remote_delete,
            remote_chmod,
            remote_download,
            remote_upload,
            cancel_all_transfers_cmd,
            expand_local_upload,
            open_devtools,
            export_hosts_sync,
            import_hosts_sync,
            export_models_sync,
            import_models_sync,
            vault_unlock,
            vault_lock,
            vault_is_unlocked,
            vault_encrypt_secrets,
            vault_decrypt_and_import,
            vault_decrypt_and_merge_import,
            clear_local_user_data
        ])
        .setup(|app| {
            // Restore last size/position, then show the window.
            utils::init::setup_window_state(app)?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("PeekShell");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PeekShell");
}
