type OverlayMode = "live" | "named" | "anonymous";

type OverlayViewModel = {
  workspace: string;
  mode: OverlayMode;
  channel: string;
  title: string;
  subtitle: string;
  badge: string;
  accentClassName: string;
};

function readOverlayViewModel(): OverlayViewModel {
  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  const scope = segments[0] ?? "preview";
  const workspace = decodeURIComponent(segments[1] ?? "default-workspace");
  const requestedMode = url.searchParams.get("mode");
  const requestedChannel = url.searchParams.get("channel");

  let mode: OverlayMode = "named";
  if (scope === "live") {
    mode = "live";
  } else if (requestedMode === "anonymous") {
    mode = "anonymous";
  } else if (requestedMode === "named") {
    mode = "named";
  }

  if (mode === "anonymous") {
    return {
      workspace,
      mode,
      channel: "anonymous-subscriber",
      title: "Someone just subscribed",
      subtitle: "非公開登録者の増加を想定した preview です。",
      badge: "Anonymous Preview",
      accentClassName: "is-anonymous",
    };
  }

  if (mode === "live") {
    return {
      workspace,
      mode,
      channel: requestedChannel ?? "live-channel",
      title: "Subnotify live overlay",
      subtitle: "本番 URL で配信ソフトから読むことを想定した live view です。",
      badge: "OBS Live",
      accentClassName: "is-live",
    };
  }

  return {
    workspace,
    mode,
    channel: requestedChannel ?? "demo-channel",
    title: "New subscriber joined",
    subtitle: "公開登録者名を表示する preview です。",
    badge: "Named Preview",
    accentClassName: "is-named",
  };
}

function App() {
  const view = readOverlayViewModel();

  return (
    <main className={`overlay-shell ${view.accentClassName}`}>
      <section className="ambient-panel" />
      <section className="overlay-card">
        <div className="overlay-header">
          <span className="overlay-badge">{view.badge}</span>
          <span className="overlay-workspace">{view.workspace}</span>
        </div>

        <div className="overlay-body">
          <p className="overlay-kicker">Subnotify v2 Overlay</p>
          <h1>{view.title}</h1>
          <p className="overlay-copy">{view.subtitle}</p>
        </div>

        <div className="subscriber-row">
          <div className="avatar-ring">
            <div className="avatar-core">{view.mode === "anonymous" ? "?" : "S"}</div>
          </div>

          <div className="subscriber-copy">
            <p className="subscriber-label">
              {view.mode === "anonymous" ? "Anonymous Subscriber" : "Subscriber"}
            </p>
            <p className="subscriber-name">
              {view.mode === "anonymous" ? "Name hidden" : `@${view.channel}`}
            </p>
          </div>
        </div>

        <div className="overlay-footer">
          <span className="footer-chip">path: {window.location.pathname}</span>
          <span className="footer-chip">mode: {view.mode}</span>
        </div>
      </section>
    </main>
  );
}

export default App;
