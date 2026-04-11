use serde::Serialize;

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

#[tauri::command]
fn get_desktop_overview() -> DesktopOverview {
    DesktopOverview {
        product_name: "Subnotify".to_string(),
        stage_label: "Desktop Shell".to_string(),
        summary: "Subnotify v2 の最初の Tauri 画面です。Subscreen v1 の体験を土台にしながら、クラウド前提の通知構成へ移行します。".to_string(),
        desktop_status: ServiceStatus {
            label: "Desktop".to_string(),
            state: "ready".to_string(),
            detail: "Tauri + React の管理画面を配置済みです。次は接続設定と API 連携を載せます。".to_string(),
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
            "YouTube 接続カードとサーバー設定入力を desktop に追加する".to_string(),
            "Go サーバーの API と worker の雛形を実装する".to_string(),
            "公開 overlay の v2 デザインを分離して作る".to_string(),
        ],
        notes: vec![
            "v1 の local overlay server は使わない".to_string(),
            "OAuth 情報や API キーは Git に入れず環境変数で管理する".to_string(),
            "この画面は v2 全体の作業ベースとして育てていく".to_string(),
        ],
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_desktop_overview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
