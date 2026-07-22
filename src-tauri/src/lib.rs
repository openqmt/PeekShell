mod agent;
mod ai_config;
mod credentials;
mod error;
mod hosts;
mod local_fs;
mod ssh;

use agent::schema::{AgentCommandView, AiChatRequest, AiChatResponse};
use agent::{AgentState, ExecuteCommandResponse};
use ai_config::{AiProviderRecord, AiProviderUpsert, AiSettings};
use error::AppResult;
use hosts::{HostRecord, HostUpsert};
use ssh::{
    test_connection, ConnectionTestRequest, HostMetrics, RemoteDirListing, RemoteFileContent,
    SessionInfo, SessionManager,
};

use std::sync::Arc;
use tauri::Manager;

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
fn get_ai_settings() -> AppResult<AiSettings> {
    ai_config::get_settings()
}

#[tauri::command]
fn upsert_ai_provider(payload: AiProviderUpsert) -> AppResult<AiProviderRecord> {
    ai_config::upsert_provider(payload)
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
) -> AppResult<RemoteFileContent> {
    state.read_file(&session_id, &path).await
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sessions = Arc::new(SessionManager::new());
    let agent = Arc::new(AgentState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(sessions)
        .manage(agent)
        .invoke_handler(tauri::generate_handler![
            list_hosts,
            list_groups,
            create_group,
            upsert_host,
            delete_host,
            rename_group,
            delete_group,
            get_ai_settings,
            upsert_ai_provider,
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
            pty_resize,
            fetch_host_metrics,
            list_remote_dir,
            read_remote_file,
            remote_mkdir,
            remote_create_file,
            remote_rename,
            remote_delete,
            remote_chmod,
            remote_download,
            remote_upload,
            expand_local_upload
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("PeekShell");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PeekShell");
}
