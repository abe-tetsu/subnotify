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

type TabId = "dashboard" | "architecture" | "roadmap";

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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [overview, setOverview] = useState<DesktopOverview>(fallbackOverview);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

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

    void loadOverview();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const nextOverview = await invoke<DesktopOverview>("get_desktop_overview");
      setOverview(nextOverview);
      setLastError(null);
    } catch (error) {
      setLastError(`状態の再取得に失敗しました: ${String(error)}`);
    } finally {
      setIsRefreshing(false);
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
                <h2>{item.state === "ready" ? "着手済み" : item.state === "planning" ? "設計中" : "待機中"}</h2>
                <p className="panel-text">{item.detail}</p>
                <div className="status-row">
                  <span className={statusClassName(item.state)} />
                  <span className="status-inline-text">{item.label}</span>
                </div>
              </article>
            ))}

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
