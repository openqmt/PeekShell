mod ai_config;
mod credentials;
mod error;
mod hosts;
mod ssh;

use ai_config::{AiProviderRecord, AiProviderUpsert, AiSettings};
use error::AppResult;
use hosts::{HostRecord, HostUpsert};
use ssh::{HostMetrics, SessionInfo, SessionManager};
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
async fn connect_host(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<SessionManager>>,
    host_id: String,
) -> AppResult<SessionInfo> {
    state.connect(app, &host_id).await
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sessions = Arc::new(SessionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(sessions)
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
            connect_host,
            disconnect_session,
            pty_write,
            pty_resize,
            fetch_host_metrics
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
