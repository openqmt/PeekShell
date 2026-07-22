use serde_json::json;
use tauri::{Manager, WindowEvent};
use tauri_plugin_store::StoreExt;

/// 单例模式：当新实例启动时，聚焦已有窗口
#[cfg(desktop)]
pub fn setup_single_instance(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let _ = app
            .get_webview_window("main")
            .expect("no main window")
            .set_focus();
    }))
}

/// 恢复窗口位置和大小，并监听事件持久化状态
pub fn setup_window_state(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app
        .store("window_state.json")
        .expect("failed to create store");
    let window = app
        .get_webview_window("main")
        .expect("main window not found");

    // 恢复窗口位置和大小
    if let Some(pos) = store.get("position") {
        if let (Some(x), Some(y)) = (
            pos.get("x").and_then(|v| v.as_f64()),
            pos.get("y").and_then(|v| v.as_f64()),
        ) {
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
    if let Some(size) = store.get("size") {
        if let (Some(w), Some(h)) = (
            size.get("width").and_then(|v| v.as_f64()),
            size.get("height").and_then(|v| v.as_f64()),
        ) {
            if w > 0.0 && h > 0.0 {
                let _ = window.set_size(tauri::PhysicalSize::new(w, h));
            }
        }
    }

    // 居中显示（如果没有保存过位置）
    if store.get("position").is_none() {
        let _ = window.center();
    }

    // 监听窗口事件，保存大小和位置
    let win = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(size) => {
            if size.width > 0 && size.height > 0 && !win.is_minimized().unwrap_or(false) {
                let _ = store.set(
                    "size",
                    json!({
                        "width": size.width,
                        "height": size.height
                    }),
                );
            }
        }
        WindowEvent::Moved(pos) => {
            if !win.is_minimized().unwrap_or(false) && !win.is_maximized().unwrap_or(false) {
                let _ = store.set(
                    "position",
                    json!({
                        "x": pos.x,
                        "y": pos.y
                    }),
                );
            }
        }
        _ => {}
    });
    window.unminimize().unwrap();
    window.show().unwrap();
    window.set_focus().unwrap();
    Ok(())
}
