use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
use uuid::Uuid;
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendConnectionStatus {
    ok: bool,
    checked_at: String,
    status_code: Option<u16>,
    service: Option<String>,
    environment: Option<String>,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeWorkspaceStatus {
    ok: bool,
    checked_at: String,
    connected: bool,
    stage: String,
    channel_hint: String,
    channel_label: String,
    oauth_start_url: Option<String>,
    connected_at: Option<String>,
    last_event: String,
    guidance: Vec<String>,
    message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    #[serde(default = "generate_workspace_id")]
    workspace_label: String,
    api_base_url: String,
    overlay_base_url: String,
    youtube_channel_hint: String,
    #[serde(default)]
    youtube_client_id: String,
    #[serde(default)]
    youtube_client_secret: String,
    #[serde(default = "default_named_message")]
    named_message_template: String,
    #[serde(default = "default_anonymous_message")]
    anonymous_message_template: String,
    #[serde(default = "default_accent_color")]
    accent_color: String,
    #[serde(default = "default_display_duration")]
    display_duration_sec: u64,
    #[serde(default = "default_polling_interval")]
    polling_interval_sec: u64,
    #[serde(default)]
    has_avatar_image: bool,
    #[serde(default = "default_sound_preset")]
    sound_preset: String,
    #[serde(default = "default_sound_volume")]
    sound_volume: f64,
}

fn default_sound_preset() -> String {
    "chime".to_string()
}

fn default_sound_volume() -> f64 {
    0.8
}

fn default_accent_color() -> String {
    "#ef5b31".to_string()
}

fn default_display_duration() -> u64 {
    6
}

fn default_polling_interval() -> u64 {
    30
}

fn generate_workspace_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_named_message() -> String {
    "{subscriber}さん、チャンネル登録ありがとう！".to_string()
}

fn default_anonymous_message() -> String {
    "チャンネル登録ありがとう！".to_string()
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            workspace_label: generate_workspace_id(),
            api_base_url: "http://localhost:8080".to_string(),
            overlay_base_url: "https://overlay.abetetsu.net".to_string(),
            youtube_channel_hint: "".to_string(),
            youtube_client_id: "".to_string(),
            youtube_client_secret: "".to_string(),
            named_message_template: default_named_message(),
            anonymous_message_template: default_anonymous_message(),
            accent_color: default_accent_color(),
            display_duration_sec: default_display_duration(),
            polling_interval_sec: default_polling_interval(),
            has_avatar_image: false,
            sound_preset: default_sound_preset(),
            sound_volume: default_sound_volume(),
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


#[derive(Deserialize)]
struct HealthResponse {
    ok: bool,
    service: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetaResponse {
    environment: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct YouTubeConnectionResponse {
    connected: bool,
    stage: String,
    channel_hint: String,
    channel_label: String,
    oauth_start_url: String,
    connected_at: String,
    last_event: String,
    guidance: Vec<String>,
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
            state: "ready".to_string(),
            detail: "Go の API / worker 雛形に加えて YouTube auth の仮状態遷移まで実装済みです。".to_string(),
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
            "backend の YouTube 状態を永続化できるようにする".to_string(),
            "desktop の初回オンボーディングを整理する".to_string(),
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

    if !updated.youtube_client_id.trim().is_empty()
        && !updated.youtube_client_secret.trim().is_empty()
    {
        let _ = sync_credentials_to_backend(&updated);
    }

    Ok(updated)
}

fn sync_credentials_to_backend(settings: &DesktopSettings) -> Result<(), String> {
    let base_url = settings
        .api_base_url
        .trim()
        .trim_end_matches('/')
        .to_string();
    if base_url.is_empty() {
        return Err("API Base URL が未設定です。".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP クライアントの作成に失敗: {e}"))?;

    let url = format!("{base_url}/v1/youtube/credentials");
    let body = serde_json::json!({
        "clientId": settings.youtube_client_id.trim(),
        "clientSecret": settings.youtube_client_secret.trim(),
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("クレデンシャル送信に失敗: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("クレデンシャル送信がエラー (HTTP {})", response.status()));
    }

    Ok(())
}

#[tauri::command]
fn check_backend_connection(api_base_url: String) -> BackendConnectionStatus {
    let base_url = api_base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return BackendConnectionStatus {
            ok: false,
            checked_at: now_iso8601(),
            status_code: None,
            service: None,
            environment: None,
            message: "API Base URL が未設定です。".to_string(),
        };
    }

    let client = match Client::builder().timeout(Duration::from_secs(3)).build() {
        Ok(client) => client,
        Err(error) => {
            return BackendConnectionStatus {
                ok: false,
                checked_at: now_iso8601(),
                status_code: None,
                service: None,
                environment: None,
                message: format!("HTTP クライアントの初期化に失敗しました: {error}"),
            };
        }
    };

    let health_url = format!("{base_url}/health");
    let meta_url = format!("{base_url}/v1/meta");

    let health_response = match client.get(&health_url).send() {
        Ok(response) => response,
        Err(error) => {
            return BackendConnectionStatus {
                ok: false,
                checked_at: now_iso8601(),
                status_code: None,
                service: None,
                environment: None,
                message: format!("backend への接続に失敗しました: {error}"),
            };
        }
    };

    let status_code = health_response.status().as_u16();
    if !health_response.status().is_success() {
        return BackendConnectionStatus {
            ok: false,
            checked_at: now_iso8601(),
            status_code: Some(status_code),
            service: None,
            environment: None,
            message: format!("health endpoint が失敗しました: HTTP {status_code}"),
        };
    }

    let health_payload = match health_response.json::<HealthResponse>() {
        Ok(payload) => payload,
        Err(error) => {
            return BackendConnectionStatus {
                ok: false,
                checked_at: now_iso8601(),
                status_code: Some(status_code),
                service: None,
                environment: None,
                message: format!("health response の解析に失敗しました: {error}"),
            };
        }
    };

    match client.get(&meta_url).send() {
        Ok(response) if response.status().is_success() => match response.json::<MetaResponse>() {
            Ok(meta_payload) => BackendConnectionStatus {
                ok: health_payload.ok,
                checked_at: now_iso8601(),
                status_code: Some(status_code),
                service: Some(health_payload.service),
                environment: Some(meta_payload.environment),
                message: "backend に接続できました。".to_string(),
            },
            Err(error) => BackendConnectionStatus {
                ok: true,
                checked_at: now_iso8601(),
                status_code: Some(status_code),
                service: Some(health_payload.service),
                environment: None,
                message: format!("health は成功しましたが meta 解析に失敗しました: {error}"),
            },
        },
        Ok(response) => BackendConnectionStatus {
            ok: true,
            checked_at: now_iso8601(),
            status_code: Some(status_code),
            service: Some(health_payload.service),
            environment: None,
            message: format!(
                "health は成功しましたが meta endpoint は HTTP {} でした。",
                response.status().as_u16()
            ),
        },
        Err(error) => BackendConnectionStatus {
            ok: true,
            checked_at: now_iso8601(),
            status_code: Some(status_code),
            service: Some(health_payload.service),
            environment: None,
            message: format!("health は成功しましたが meta 取得に失敗しました: {error}"),
        },
    }
}

#[tauri::command]
fn get_youtube_workspace_status(
    api_base_url: String,
    youtube_channel_hint: String,
) -> YouTubeWorkspaceStatus {
    let base_url = api_base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return YouTubeWorkspaceStatus {
            ok: false,
            checked_at: now_iso8601(),
            connected: false,
            stage: "blocked".to_string(),
            channel_hint: youtube_channel_hint,
            channel_label: "API Base URL 未設定".to_string(),
            oauth_start_url: None,
            connected_at: None,
            last_event: "backend 接続先が未設定のため確認できません。".to_string(),
            guidance: vec![
                "設定タブで API Base URL を入力する".to_string(),
                "backend 接続確認が成功してから YouTube 状態を確認する".to_string(),
            ],
            message: "API Base URL が未設定です。".to_string(),
        };
    }

    let client = match Client::builder().timeout(Duration::from_secs(3)).build() {
        Ok(client) => client,
        Err(error) => {
            return YouTubeWorkspaceStatus {
                ok: false,
                checked_at: now_iso8601(),
                connected: false,
                stage: "error".to_string(),
                channel_hint: youtube_channel_hint,
                channel_label: "接続確認失敗".to_string(),
                oauth_start_url: None,
                connected_at: None,
                last_event: "HTTP クライアントの初期化に失敗しました。".to_string(),
                guidance: vec![],
                message: format!("HTTP クライアントの初期化に失敗しました: {error}"),
            };
        }
    };

    let request_url = format!(
        "{base_url}/v1/youtube/connection?channel_hint={}",
        urlencoding::encode(youtube_channel_hint.trim())
    );

    let response = match client.get(&request_url).send() {
        Ok(response) => response,
        Err(error) => {
            return YouTubeWorkspaceStatus {
                ok: false,
                checked_at: now_iso8601(),
                connected: false,
                stage: "error".to_string(),
                channel_hint: youtube_channel_hint,
                channel_label: "接続確認失敗".to_string(),
                oauth_start_url: None,
                connected_at: None,
                last_event: "YouTube 状態 endpoint に接続できませんでした。".to_string(),
                guidance: vec![
                    "backend が起動しているか確認する".to_string(),
                    "make dev で API と desktop をまとめて起動する".to_string(),
                ],
                message: format!("YouTube 状態 endpoint への接続に失敗しました: {error}"),
            };
        }
    };

    let status_code = response.status();
    if !status_code.is_success() {
        return YouTubeWorkspaceStatus {
            ok: false,
            checked_at: now_iso8601(),
            connected: false,
            stage: "error".to_string(),
            channel_hint: youtube_channel_hint,
            channel_label: "接続確認失敗".to_string(),
            oauth_start_url: None,
            connected_at: None,
            last_event: format!("YouTube 状態 endpoint が HTTP {} を返しました。", status_code.as_u16()),
            guidance: vec![],
            message: format!("YouTube 状態 endpoint が失敗しました: HTTP {}", status_code.as_u16()),
        };
    }

    match response.json::<YouTubeConnectionResponse>() {
        Ok(payload) => {
            let message = if payload.connected {
                "YouTube 接続状態を取得できました。".to_string()
            } else if payload.stage == "auth_started" {
                "OAuth 開始済みです。ブラウザ側の完了後にもう一度確認してください。".to_string()
            } else {
                "YouTube 接続はまだ未完了ですが、接続フローの雛形は取得できました。".to_string()
            };

            YouTubeWorkspaceStatus {
                ok: true,
                checked_at: now_iso8601(),
                connected: payload.connected,
                stage: payload.stage,
                channel_hint: payload.channel_hint,
                channel_label: payload.channel_label,
                oauth_start_url: Some(payload.oauth_start_url),
                connected_at: if payload.connected_at.is_empty() {
                    None
                } else {
                    Some(payload.connected_at)
                },
                last_event: payload.last_event,
                guidance: payload.guidance,
                message,
            }
        }
        Err(error) => YouTubeWorkspaceStatus {
            ok: false,
            checked_at: now_iso8601(),
            connected: false,
            stage: "error".to_string(),
            channel_hint: youtube_channel_hint,
            channel_label: "解析失敗".to_string(),
            oauth_start_url: None,
            connected_at: None,
            last_event: "YouTube 状態 response を解析できませんでした。".to_string(),
            guidance: vec![],
            message: format!("YouTube 状態 response の解析に失敗しました: {error}"),
        },
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendTestEventResult {
    ok: bool,
    message: String,
}

fn avatar_image_path<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("設定ディレクトリを解決できませんでした: {e}"))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("設定ディレクトリを作成できませんでした: {e}"))?;
    dir.push("avatar.png");
    Ok(dir)
}

#[tauri::command]
fn upload_avatar(
    app_handle: tauri::AppHandle,
    state: State<'_, DesktopSettingsState>,
    image_data: String,
) -> Result<DesktopSettings, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let bytes = STANDARD
        .decode(&image_data)
        .map_err(|e| format!("画像データのデコードに失敗: {e}"))?;

    let path = avatar_image_path(&app_handle)?;
    fs::write(&path, &bytes).map_err(|e| format!("アバター画像の保存に失敗: {e}"))?;

    let mut settings = state.snapshot();
    settings.has_avatar_image = true;
    let updated = state.update(settings);
    let _ = persist_desktop_settings(&app_handle, &updated);
    Ok(updated)
}

#[tauri::command]
fn remove_avatar(
    app_handle: tauri::AppHandle,
    state: State<'_, DesktopSettingsState>,
) -> Result<DesktopSettings, String> {
    let path = avatar_image_path(&app_handle)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("アバター画像の削除に失敗: {e}"))?;
    }

    let mut settings = state.snapshot();
    settings.has_avatar_image = false;
    let updated = state.update(settings);
    let _ = persist_desktop_settings(&app_handle, &updated);
    Ok(updated)
}

#[tauri::command]
fn get_avatar_data_url(
    app_handle: tauri::AppHandle,
    state: State<'_, DesktopSettingsState>,
) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let settings = state.snapshot();
    if !settings.has_avatar_image {
        return None;
    }

    let path = avatar_image_path(&app_handle).ok()?;
    let bytes = fs::read(&path).ok()?;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(&bytes)))
}

#[tauri::command]
fn send_test_event(
    app_handle: tauri::AppHandle,
    state: State<'_, DesktopSettingsState>,
    subscriber_name: String,
    kind: Option<String>,
) -> SendTestEventResult {
    let settings = state.snapshot();
    let base_url = settings
        .api_base_url
        .trim()
        .trim_end_matches('/')
        .to_string();

    if base_url.is_empty() {
        return SendTestEventResult {
            ok: false,
            message: "API Base URL が未設定です。".to_string(),
        };
    }

    let name = if subscriber_name.trim().is_empty() {
        "テストユーザー".to_string()
    } else {
        subscriber_name.trim().to_string()
    };

    let client = match Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return SendTestEventResult {
                ok: false,
                message: format!("HTTP クライアントの作成に失敗: {error}"),
            };
        }
    };

    let workspace = settings
        .workspace_label
        .trim()
        .replace(' ', "-")
        .to_lowercase();
    let workspace = if workspace.is_empty() {
        "default-workspace".to_string()
    } else {
        workspace
    };
    let event_kind = kind.unwrap_or_else(|| "new_subscriber".to_string());
    let resolved_message = if event_kind == "new_anonymous_subscriber" {
        settings.anonymous_message_template.clone()
    } else {
        settings.named_message_template.replace("{subscriber}", &name)
    };

    let avatar_data_url: Option<String> = if settings.has_avatar_image {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        avatar_image_path(&app_handle)
            .ok()
            .and_then(|p| fs::read(&p).ok())
            .map(|bytes| format!("data:image/png;base64,{}", STANDARD.encode(&bytes)))
    } else {
        None
    };

    let url = format!("{base_url}/v1/events/{workspace}");
    let body = if event_kind == "new_anonymous_subscriber" {
        serde_json::json!({
            "kind": event_kind,
            "message": resolved_message,
            "accentColor": settings.accent_color,
            "displayDurationSec": settings.display_duration_sec,
            "avatarUrl": avatar_data_url,
            "soundPreset": settings.sound_preset,
            "soundVolume": settings.sound_volume,
        })
    } else {
        serde_json::json!({
            "subscriberName": name,
            "kind": event_kind,
            "message": resolved_message,
            "accentColor": settings.accent_color,
            "displayDurationSec": settings.display_duration_sec,
            "avatarUrl": avatar_data_url,
            "soundPreset": settings.sound_preset,
            "soundVolume": settings.sound_volume,
        })
    };

    match client.post(&url).json(&body).send() {
        Ok(response) => {
            if response.status().is_success() {
                SendTestEventResult {
                    ok: true,
                    message: "テスト通知を送信しました。".to_string(),
                }
            } else {
                SendTestEventResult {
                    ok: false,
                    message: format!("テスト送信がエラー (HTTP {})", response.status()),
                }
            }
        }
        Err(error) => SendTestEventResult {
            ok: false,
            message: format!("テスト送信に失敗: {error}"),
        },
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerStatus {
    running: bool,
    message: String,
}

#[derive(Deserialize)]
struct PollingApiResponse {
    running: bool,
    message: String,
}

fn workspace_slug(settings: &DesktopSettings) -> String {
    let w = settings
        .workspace_label
        .trim()
        .replace(' ', "-")
        .to_lowercase();
    if w.is_empty() {
        "default-workspace".to_string()
    } else {
        w
    }
}

#[tauri::command]
fn get_worker_status(state: State<'_, DesktopSettingsState>) -> WorkerStatus {
    let settings = state.snapshot();
    let base_url = settings.api_base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return WorkerStatus { running: false, message: "API Base URL が未設定です。".to_string() };
    }

    let workspace = workspace_slug(&settings);
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(_) => return WorkerStatus { running: false, message: "停止中".to_string() },
    };

    let url = format!("{base_url}/v1/polling/{workspace}/status");
    match client.get(&url).send() {
        Ok(response) => {
            if let Ok(body) = response.json::<PollingApiResponse>() {
                WorkerStatus { running: body.running, message: body.message }
            } else {
                WorkerStatus { running: false, message: "停止中".to_string() }
            }
        }
        Err(_) => WorkerStatus { running: false, message: "API に接続できません".to_string() },
    }
}

#[tauri::command]
fn start_worker(state: State<'_, DesktopSettingsState>) -> WorkerStatus {
    let settings = state.snapshot();
    let base_url = settings.api_base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return WorkerStatus { running: false, message: "API Base URL が未設定です。".to_string() };
    }

    let workspace = workspace_slug(&settings);
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(e) => return WorkerStatus { running: false, message: format!("HTTP クライアント作成失敗: {e}") },
    };

    let url = format!("{base_url}/v1/polling/{workspace}/start");
    let body = serde_json::json!({
        "intervalSec": settings.polling_interval_sec,
    });

    match client.post(&url).json(&body).send() {
        Ok(response) => {
            if let Ok(body) = response.json::<PollingApiResponse>() {
                WorkerStatus { running: body.running, message: body.message }
            } else {
                WorkerStatus { running: false, message: "レスポンスの解析に失敗".to_string() }
            }
        }
        Err(e) => WorkerStatus { running: false, message: format!("ポーリング開始に失敗: {e}") },
    }
}

#[tauri::command]
fn stop_worker(state: State<'_, DesktopSettingsState>) -> WorkerStatus {
    let settings = state.snapshot();
    let base_url = settings.api_base_url.trim().trim_end_matches('/').to_string();
    if base_url.is_empty() {
        return WorkerStatus { running: false, message: "API Base URL が未設定です。".to_string() };
    }

    let workspace = workspace_slug(&settings);
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(_) => return WorkerStatus { running: false, message: "停止しました".to_string() },
    };

    let url = format!("{base_url}/v1/polling/{workspace}/stop");
    match client.post(&url).send() {
        Ok(response) => {
            if let Ok(body) = response.json::<PollingApiResponse>() {
                WorkerStatus { running: body.running, message: body.message }
            } else {
                WorkerStatus { running: false, message: "停止しました".to_string() }
            }
        }
        Err(_) => WorkerStatus { running: false, message: "停止しました".to_string() },
    }
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

fn now_iso8601() -> String {
    let datetime: chrono::DateTime<chrono::Utc> = SystemTime::now().into();
    datetime.to_rfc3339()
}

pub fn run() {
    let desktop_settings_state = DesktopSettingsState::new();
    let desktop_settings_state_for_setup = desktop_settings_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(desktop_settings_state)
        .setup(move |app| {
            if let Ok(Some(mut settings)) = load_persisted_desktop_settings(app.handle()) {
                if settings.workspace_label.trim().is_empty()
                    || settings.workspace_label == "Default Workspace"
                {
                    settings.workspace_label = generate_workspace_id();
                    let _ = persist_desktop_settings(&app.handle(), &settings);
                }
                let updated = desktop_settings_state_for_setup.update(settings);
                if !updated.youtube_client_id.trim().is_empty()
                    && !updated.youtube_client_secret.trim().is_empty()
                {
                    let _ = sync_credentials_to_backend(&updated);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_overview,
            get_desktop_settings,
            update_desktop_settings,
            check_backend_connection,
            get_youtube_workspace_status,
            send_test_event,
            upload_avatar,
            remove_avatar,
            get_avatar_data_url,
            get_worker_status,
            start_worker,
            stop_worker
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
