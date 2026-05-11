//! LIMEN OS shell — Tauri v2 backend library.

mod apps;
mod commands;
mod ipc_client;

use tauri::Manager as _;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Windowed dev mode: LIMEN_WINDOWED=1 overrides fullscreen/chrome.
            if std::env::var("LIMEN_WINDOWED").as_deref() == Ok("1")
                && let Some(win) = app.get_webview_window("main")
            {
                let _ = win.set_fullscreen(false);
                let _ = win.set_decorations(true);
                let _ = win.set_always_on_top(false);
                let _ = win.set_skip_taskbar(false);
                let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::<f64> {
                    width: 1280.0,
                    height: 800.0,
                }));
                let _ = win.center();
            }

            // Start the synapsd event listener in the background.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                ipc_client::run_event_listener(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::voice_command,
            commands::tts_speak,
            commands::ai_query,
            commands::set_scene,
            commands::get_session,
            commands::open_app,
            commands::launch_app,
            commands::list_apps,
            commands::get_sysinfo,
            commands::check_setup_complete,
            commands::save_setup_config,
            commands::list_cameras,
            commands::camera_started,
            commands::camera_stopped,
            commands::camera_switched,
            commands::presence_event,
            commands::network_state_event,
            commands::scan_network,
            commands::waldiez_check,
            commands::waldiez_run,
            commands::waldiez_convert,
            commands::waldiez_stop,
            commands::waldiez_input,
            commands::waldiez_control,
            commands::list_dir,
            commands::read_text_file,
            commands::open_browser_window,
            commands::browser_window_navigate,
            commands::close_browser_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running limen shell");
}
