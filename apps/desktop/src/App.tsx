import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import "./App.css";

type ServiceStatus = {
  label: string;
  state: "ready" | "planning" | "pending";
  detail: string;
};

type AlertMode = {
  title: string;
  behavior: string;
};

type DesktopOverview = {
  productName: string;
  stageLabel: string;
  summary: string;
  desktopStatus: ServiceStatus;
  serverStatus: ServiceStatus;
  overlayStatus: ServiceStatus;
  architecture: string[];
  alertModes: AlertMode[];
  nextMilestones: string[];
  notes: string[];
};

type DesktopSettings = {
  workspaceLabel: string;
  apiBaseUrl: string;
  overlayBaseUrl: string;
  youtubeChannelHint: string;
};

type TabId = "dashboard" | "settings" | "architecture" | "roadmap";

const fallbackOverview: DesktopOverview = {
  productName: "Subnotify",
  stageLabel: "Desktop Shell",
  summary:
    "Subnotify v2 の最初の Tauri 画面です。ここからクラウドサーバー版の通知基盤へ広げていきます。",
  desktopStatus: {
    label: "Desktop",
    state: "ready",
    detail: "Tauri + React の土台を配置済みです。",
  },
  serverStatus: {
    label: "Server",
    state: "planning",
    detail: "Go API / worker / YouTube polling をこれから実装します。",
  },
  overlayStatus: {
    label: "Overlay",
    state: "planning",
    detail: "OBS から読む公開 URL ベースの overlay を別アプリで用意します。",
  },
  architecture: [
    "Desktop は Tauri + React で管理画面を担当する",
    "Backend は Go で YouTube 連携と通知判定を担当する",
    "Overlay は公開 URL で配信ソフトから読み込む",
  ],
  alertModes: [
    {
      title: "名前あり通知",
      behavior: "公開登録者が取得できた場合は登録者名を表示する",
    },
    {
      title: "名前なし通知",
      behavior: "登録者数だけ増えて公開登録者が取れない場合は匿名通知に切り替える",
    },
  ],
  nextMilestones: [
    "desktop に YouTube 接続状態カードを実装する",
    "Go サーバーの API と worker の雛形を追加する",
    "overlay の v2 デザインを公開 URL 前提で組み直す",
  ],
  notes: [
    "v1 の local overlay server は使わない",
    "秘密情報は Git に入れず .env.local や環境変数で管理する",
    "今回の画面は v2 の作業ベースとして使う",
  ],
};

const fallbackSettings: DesktopSettings = {
  workspaceLabel: "Default Workspace",
  apiBaseUrl: "http://localhost:8080",
  overlayBaseUrl: "https://overlay.example.com/subnotify",
  youtubeChannelHint: "",
};

function statusClassName(state: ServiceStatus["state"]) {
  switch (state) {
    case "ready":
      return "status-dot is-ready";
    case "planning":
      return "status-dot is-planning";
    default:
      return "status-dot";
  }
}

function isConfigured(value: string) {
  return value.trim().length > 0;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [overview, setOverview] = useState<DesktopOverview>(fallbackOverview);
  const [settings, setSettings] = useState<DesktopSettings>(fallbackSettings);
  const [savedSettings, setSavedSettings] = useState<DesktopSettings>(fallbackSettings);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const hasUnsavedChanges =
    settings.workspaceLabel !== savedSettings.workspaceLabel ||
    settings.apiBaseUrl !== savedSettings.apiBaseUrl ||
    settings.overlayBaseUrl !== savedSettings.overlayBaseUrl ||
    settings.youtubeChannelHint !== savedSettings.youtubeChannelHint;

  const readinessItems = [
    {
      label: "API Base URL",
      value: settings.apiBaseUrl,
      ready: isConfigured(settings.apiBaseUrl),
      help: "Go backend の API 接続先です。",
    },
    {
      label: "Overlay Base URL",
      value: settings.overlayBaseUrl,
      ready: isConfigured(settings.overlayBaseUrl),
      help: "OBS で読む公開 overlay のベース URL です。",
    },
    {
      label: "Workspace Label",
      value: settings.workspaceLabel,
      ready: isConfigured(settings.workspaceLabel),
      help: "複数環境を見分けるための表示名です。",
    },
  ];

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        const nextOverview = await invoke<DesktopOverview>("get_desktop_overview");
        if (isMounted) {
          setOverview(nextOverview);
          setLastError(null);
        }
      } catch (error) {
        if (isMounted) {
          setLastError(`状態の取得に失敗しました: ${String(error)}`);
        }
      }
    };

    const loadSettings = async () => {
      try {
        const nextSettings = await invoke<DesktopSettings>("get_desktop_settings");
        if (isMounted) {
          setSettings(nextSettings);
          setSavedSettings(nextSettings);
          setSettingsMessage("保存済みの desktop 設定を読み込みました。");
        }
      } catch (error) {
        if (isMounted) {
          setSettingsMessage(`desktop 設定の取得に失敗しました: ${String(error)}`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
        }
      }
    };

    void loadOverview();
    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const nextOverview = await invoke<DesktopOverview>("get_desktop_overview");
      const nextSettings = await invoke<DesktopSettings>("get_desktop_settings");
      setOverview(nextOverview);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setLastError(null);
      setSettingsMessage("desktop 設定と状態を再取得しました。");
    } catch (error) {
      setLastError(`状態の再取得に失敗しました: ${String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage("desktop 設定を保存しています...");

    try {
      const updated = await invoke<DesktopSettings>("update_desktop_settings", {
        settings,
      });
      setSettings(updated);
      setSavedSettings(updated);
      setSettingsMessage("desktop 設定を保存しました。");
      setLastError(null);
    } catch (error) {
      setSettingsMessage(`desktop 設定の保存に失敗しました: ${String(error)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Cloud Notification Workspace</p>
          <h1>{overview.productName}</h1>
          <p className="hero-text">{overview.summary}</p>
        </div>

        <div className="hero-status">
          <div className="status-pill">
            <span className={statusClassName(overview.desktopStatus.state)} />
            {overview.stageLabel}
          </div>
          <p className="status-help">
            v1 の見た目を引き継ぎつつ、v2 のクラウド構成へ移るための最初の管理画面です。
          </p>
          <div className="hero-badges">
            <span className="meta-badge">{settings.workspaceLabel}</span>
            <span className="meta-badge">
              {isConfigured(settings.youtubeChannelHint)
                ? `Channel: ${settings.youtubeChannelHint}`
                : "Channel: 未設定"}
            </span>
          </div>
          <div className="action-row">
            <button
              className={`secondary-button ${isRefreshing ? "is-disabled" : ""}`}
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              type="button"
            >
              {isRefreshing ? "更新中..." : "状態を更新"}
            </button>
          </div>
        </div>
      </section>

      <nav className="tab-bar">
        <button
          className={`tab-button ${activeTab === "dashboard" ? "is-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
          type="button"
        >
          ダッシュボード
        </button>
        <button
          className={`tab-button ${activeTab === "settings" ? "is-active" : ""}`}
          onClick={() => setActiveTab("settings")}
          type="button"
        >
          設定
        </button>
        <button
          className={`tab-button ${activeTab === "architecture" ? "is-active" : ""}`}
          onClick={() => setActiveTab("architecture")}
          type="button"
        >
          構成
        </button>
        <button
          className={`tab-button ${activeTab === "roadmap" ? "is-active" : ""}`}
          onClick={() => setActiveTab("roadmap")}
          type="button"
        >
          ロードマップ
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === "dashboard" ? (
          <section className="dashboard-grid">
            {[overview.desktopStatus, overview.serverStatus, overview.overlayStatus].map((item) => (
              <article className="panel-card" key={item.label}>
                <p className="panel-label">{item.label}</p>
                <h2>
                  {item.state === "ready"
                    ? "着手済み"
                    : item.state === "planning"
                      ? "設計中"
                      : "待機中"}
                </h2>
                <p className="panel-text">{item.detail}</p>
                <div className="status-row">
                  <span className={statusClassName(item.state)} />
                  <span className="status-inline-text">{item.label}</span>
                </div>
              </article>
            ))}

            <article className="panel-card wide-card">
              <p className="panel-label">Readiness</p>
              <h2>接続設定の準備状況</h2>
              <div className="stack-list">
                {readinessItems.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="status-row">
                      <span className={item.ready ? "status-dot is-ready" : "status-dot"} />
                      <span className="status-inline-text">{item.label}</span>
                    </div>
                    <p className="panel-text mono-text">
                      {item.value.trim() === "" ? "未設定" : item.value}
                    </p>
                    <p className="field-help">{item.help}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card accent-card wide-card">
              <p className="panel-label">通知モード</p>
              <h2>v2 で切り替える表示ルール</h2>
              <div className="stack-list">
                {overview.alertModes.map((mode) => (
                  <div className="stack-item" key={mode.title}>
                    <strong>{mode.title}</strong>
                    <p className="panel-text">{mode.behavior}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card">
              <p className="panel-label">Desktop Settings</p>
              <h2>接続先と作業ラベル</h2>
              <div className="settings-form">
                <label className="field-group">
                  <span className="field-label">Workspace Label</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        workspaceLabel: event.currentTarget.value,
                      }))
                    }
                    type="text"
                    value={settings.workspaceLabel}
                  />
                  <p className="field-help">環境名や用途が分かる表示名を入れます。</p>
                </label>

                <label className="field-group">
                  <span className="field-label">API Base URL</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        apiBaseUrl: event.currentTarget.value,
                      }))
                    }
                    placeholder="http://localhost:8080"
                    type="url"
                    value={settings.apiBaseUrl}
                  />
                  <p className="field-help">
                    今後接続する Go backend のベース URL です。
                  </p>
                </label>

                <label className="field-group">
                  <span className="field-label">Overlay Base URL</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        overlayBaseUrl: event.currentTarget.value,
                      }))
                    }
                    placeholder="https://overlay.example.com/subnotify"
                    type="url"
                    value={settings.overlayBaseUrl}
                  />
                  <p className="field-help">
                    OBS で読む公開 overlay 側のベース URL を想定しています。
                  </p>
                </label>

                <label className="field-group">
                  <span className="field-label">YouTube Channel Hint</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        youtubeChannelHint: event.currentTarget.value,
                      }))
                    }
                    placeholder="@your-channel"
                    type="text"
                    value={settings.youtubeChannelHint}
                  />
                  <p className="field-help">
                    チャンネル ID やハンドルを仮置きするメモ欄です。
                  </p>
                </label>
              </div>

              <div className="action-row">
                <button
                  className={`secondary-button ${
                    !hasUnsavedChanges || isSavingSettings ? "is-disabled" : ""
                  }`}
                  disabled={!hasUnsavedChanges || isSavingSettings}
                  onClick={() => void handleSaveSettings()}
                  type="button"
                >
                  {isSavingSettings ? "保存中..." : "設定を保存"}
                </button>
              </div>

              <p className={settingsMessage?.includes("失敗") ? "error-text" : "field-help"}>
                {isLoadingSettings
                  ? "desktop 設定を読み込んでいます..."
                  : hasUnsavedChanges
                    ? "未保存の変更があります。必要なら保存してください。"
                    : settingsMessage}
              </p>
            </article>
          </section>
        ) : null}

        {activeTab === "architecture" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card accent-card">
              <p className="panel-label">Architecture</p>
              <h2>v2 の構成イメージ</h2>
              <div className="stack-list">
                {overview.architecture.map((line) => (
                  <div className="stack-item" key={line}>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <p className="panel-label">Notes</p>
              <h2>前提メモ</h2>
              <div className="stack-list">
                {overview.notes.map((line) => (
                  <div className="stack-item" key={line}>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "roadmap" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card">
              <p className="panel-label">Roadmap</p>
              <h2>次に積む作業</h2>
              <div className="timeline-list">
                {overview.nextMilestones.map((line, index) => (
                  <div className="timeline-item" key={line}>
                    <span className="timeline-index">{index + 1}</span>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {lastError ? <p className="error-text sticky-error">{lastError}</p> : null}
      </div>
    </main>
  );
}

export default App;
