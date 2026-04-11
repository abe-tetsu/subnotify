use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, Runtime, State};

const DESKTOP_SETTINGS_FILE_NAME: &str = "desktop-settings.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    label: String,
    state: String,
    detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertMode {
    title: String,
    behavior: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOverview {
    product_name: String,
    stage_label: String,
    summary: String,
    desktop_status: ServiceStatus,
    server_status: ServiceStatus,
    overlay_status: ServiceStatus,
    architecture: Vec<String>,
    alert_modes: Vec<AlertMode>,
    next_milestones: Vec<String>,
    notes: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    workspace_label: String,
    api_base_url: String,
    overlay_base_url: String,
    youtube_channel_hint: String,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            workspace_label: "Default Workspace".to_string(),
            api_base_url: "http://localhost:8080".to_string(),
            overlay_base_url: "https://overlay.example.com/subnotify".to_string(),
            youtube_channel_hint: "".to_string(),
        }
    }
}

#[derive(Clone)]
struct DesktopSettingsState {
    inner: Arc<Mutex<DesktopSettings>>,
}

impl DesktopSettingsState {
    fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DesktopSettings::default())),
        }
    }

    fn snapshot(&self) -> DesktopSettings {
        self.inner
            .lock()
            .expect("desktop settings lock poisoned")
            .clone()
    }

    fn update(&self, settings: DesktopSettings) -> DesktopSettings {
        let mut state = self
            .inner
            .lock()
            .expect("desktop settings lock poisoned");
        *state = settings.clone();
        settings
    }
}

#[tauri::command]
fn get_desktop_overview() -> DesktopOverview {
    DesktopOverview {
        product_name: "Subnotify".to_string(),
        stage_label: "Desktop Shell".to_string(),
        summary: "Subnotify v2 の最初の Tauri 画面です。Subscreen v1 の体験を土台にしながら、クラウド前提の通知構成へ移行します。".to_string(),
        desktop_status: ServiceStatus {
            label: "Desktop".to_string(),
            state: "ready".to_string(),
            detail: "Tauri + React の管理画面を配置済みです。接続設定の保存も desktop 側に追加しました。".to_string(),
        },
        server_status: ServiceStatus {
            label: "Server".to_string(),
            state: "planning".to_string(),
            detail: "Go の API / worker / YouTube polling はこれから実装します。".to_string(),
        },
        overlay_status: ServiceStatus {
            label: "Overlay".to_string(),
            state: "planning".to_string(),
            detail: "OBS から読む公開 URL ベースの overlay を別アプリとして用意します。".to_string(),
        },
        architecture: vec![
            "Desktop は Tauri + React で管理画面を担当する".to_string(),
            "Backend は Go で YouTube 連携と通知判定を担当する".to_string(),
            "Overlay は公開 URL を OBS から読み込む構成にする".to_string(),
        ],
        alert_modes: vec![
            AlertMode {
                title: "名前あり通知".to_string(),
                behavior: "公開登録者が取得できた場合は登録者名を表示する".to_string(),
            },
            AlertMode {
                title: "名前なし通知".to_string(),
                behavior: "登録者数だけ増えて公開登録者が拾えない場合は匿名通知に切り替える".to_string(),
            },
        ],
        next_milestones: vec![
            "desktop に YouTube 接続カードを追加する".to_string(),
            "Go サーバーの API と worker の雛形を実装する".to_string(),
            "公開 overlay の v2 デザインを分離して作る".to_string(),
        ],
        notes: vec![
            "v1 の local overlay server は使わない".to_string(),
            "OAuth 情報や API キーは Git に入れず環境変数で管理する".to_string(),
            "desktop の接続設定はローカル設定ファイルへ保存する".to_string(),
        ],
    }
}

#[tauri::command]
fn get_desktop_settings(state: State<'_, DesktopSettingsState>) -> DesktopSettings {
    state.snapshot()
}

#[tauri::command]
fn update_desktop_settings(
    app_handle: tauri::AppHandle,
    state: State<'_, DesktopSettingsState>,
    settings: DesktopSettings,
) -> Result<DesktopSettings, String> {
    let updated = state.update(settings);
    persist_desktop_settings(&app_handle, &updated)?;
    Ok(updated)
}

fn desktop_settings_file_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|error| format!("desktop 設定ディレクトリを解決できませんでした: {error}"))?;

    fs::create_dir_all(&dir)
        .map_err(|error| format!("desktop 設定ディレクトリを作成できませんでした: {error}"))?;

    dir.push(DESKTOP_SETTINGS_FILE_NAME);
    Ok(dir)
}

fn persist_desktop_settings<R: Runtime>(
    app_handle: &AppHandle<R>,
    settings: &DesktopSettings,
) -> Result<(), String> {
    let path = desktop_settings_file_path(app_handle)?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("desktop 設定のシリアライズに失敗しました: {error}"))?;

    fs::write(path, json).map_err(|error| format!("desktop 設定の保存に失敗しました: {error}"))
}

fn load_persisted_desktop_settings<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<Option<DesktopSettings>, String> {
    let path = desktop_settings_file_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(path).map_err(|error| format!("desktop 設定の読み込みに失敗しました: {error}"))?;
    let settings = serde_json::from_str::<DesktopSettings>(&content)
        .map_err(|error| format!("desktop 設定の復元に失敗しました: {error}"))?;

    Ok(Some(settings))
}

pub fn run() {
    let desktop_settings_state = DesktopSettingsState::new();
    let desktop_settings_state_for_setup = desktop_settings_state.clone();

    tauri::Builder::default()
        .manage(desktop_settings_state)
        .setup(move |app| {
            if let Ok(Some(settings)) = load_persisted_desktop_settings(app.handle()) {
                desktop_settings_state_for_setup.update(settings);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_overview,
            get_desktop_settings,
            update_desktop_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
