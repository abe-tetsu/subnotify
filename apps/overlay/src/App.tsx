import { useCallback, useEffect, useRef, useState } from "react";


type OverlayMode = "live" | "named" | "anonymous";

type NotifyEvent = {
  id: string;
  kind: string;
  subscriberName: string;
  subscriberChannelId: string;
  createdAt: string;
};

type OverlayConfig = {
  workspace: string;
  mode: OverlayMode;
  channel: string;
  apiBaseUrl: string | null;
  displayDurationMs: number;
};

function readOverlayConfig(): OverlayConfig {
  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  const scope = segments[0] ?? "preview";
  const workspace = decodeURIComponent(segments[1] ?? "default-workspace");
  const requestedMode = url.searchParams.get("mode");
  const requestedChannel = url.searchParams.get("channel");
  const apiBaseUrl = url.searchParams.get("api");
  const durationParam = url.searchParams.get("duration");

  let mode: OverlayMode = "named";
  if (scope === "live") {
    mode = "live";
  } else if (requestedMode === "anonymous") {
    mode = "anonymous";
  } else if (requestedMode === "named") {
    mode = "named";
  }

  return {
    workspace,
    mode,
    channel: requestedChannel ?? "demo-channel",
    apiBaseUrl: apiBaseUrl ? apiBaseUrl.replace(/\/$/, "") : null,
    displayDurationMs: durationParam ? Number(durationParam) * 1000 : 6000,
  };
}

function LiveOverlay({ config }: { config: OverlayConfig }) {
  const queueRef = useRef<NotifyEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<NotifyEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isShowingRef = useRef(false);

  const seenIdsRef = useRef<Set<string>>(new Set());

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isShowingRef.current = false;
      return;
    }

    const next = queueRef.current.shift()!;
    isShowingRef.current = true;
    setActiveEvent(next);
    setIsVisible(true);

    window.setTimeout(() => {
      setIsVisible(false);

      window.setTimeout(() => {
        setActiveEvent(null);
        showNext();
      }, 400);
    }, config.displayDurationMs);
  }, [config.displayDurationMs]);

  useEffect(() => {
    if (!config.apiBaseUrl) return;

    let nextSeq = 0;
    let cancelled = false;
    // 初回ポーリングでは表示せず、既存イベントのIDだけ記録する
    let initialized = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `${config.apiBaseUrl}/v1/events/${encodeURIComponent(config.workspace)}/poll?since=${nextSeq}`,
        );
        if (!response.ok) return;

        const data = await response.json();
        nextSeq = data.nextSeq ?? nextSeq;

        const events = data.events as NotifyEvent[] | null;
        if (!events || events.length === 0) return;

        if (!initialized) {
          for (const event of events) {
            seenIdsRef.current.add(event.id);
          }
          initialized = true;
          return;
        }

        let hasNew = false;
        for (const event of events) {
          if (!seenIdsRef.current.has(event.id)) {
            seenIdsRef.current.add(event.id);
            queueRef.current.push(event);
            hasNew = true;
          }
        }

        if (hasNew && !isShowingRef.current) {
          showNext();
        }
      } catch (_error) {
        // retry on next interval
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      if (!cancelled) void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [config.apiBaseUrl, showNext]);

  if (!config.apiBaseUrl) {
    return (
      <main className="overlay-shell is-live">
        <section className="ambient-panel" />
        <section className="overlay-card visible">
          <div className="overlay-header">
            <span className="overlay-badge">OBS Live</span>
            <span className="overlay-workspace">{config.workspace}</span>
          </div>
          <div className="overlay-body">
            <h1>API 未接続</h1>
            <p className="overlay-copy">
              URL に ?api=http://localhost:8080 を追加してください。
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="overlay-shell is-live">
      {activeEvent ? (
        <section className={`overlay-card ${isVisible ? "visible" : ""}`}>
          <div className="overlay-header">
            <span className="overlay-badge">新しい登録</span>
            <span className="overlay-workspace">{config.workspace}</span>
          </div>

          <div className="subscriber-row">
            <div className="avatar-ring">
              <div className="avatar-core">
                {(activeEvent.subscriberName || "S").slice(0, 1).toUpperCase()}
              </div>
            </div>

            <div className="subscriber-copy">
              <p className="subscriber-label">チャンネル登録</p>
              <h1 className="subscriber-name">{activeEvent.subscriberName}</h1>
            </div>
          </div>

          <div className="countdown-bar">
            <div
              className="countdown-fill"
              style={{
                animationDuration: `${config.displayDurationMs}ms`,
              }}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

function PreviewOverlay({ config }: { config: OverlayConfig }) {
  const isAnonymous = config.mode === "anonymous";

  return (
    <main className={`overlay-shell ${isAnonymous ? "is-anonymous" : "is-named"}`}>
      <section className="ambient-panel" />
      <section className="overlay-card visible">
        <div className="overlay-header">
          <span className="overlay-badge">
            {isAnonymous ? "Anonymous Preview" : "Named Preview"}
          </span>
          <span className="overlay-workspace">{config.workspace}</span>
        </div>

        <div className="overlay-body">
          <p className="overlay-kicker">Subnotify v2 Overlay</p>
          <h1>
            {isAnonymous ? "Someone just subscribed" : "New subscriber joined"}
          </h1>
          <p className="overlay-copy">
            {isAnonymous
              ? "非公開登録者の増加を想定した preview です。"
              : "公開登録者名を表示する preview です。"}
          </p>
        </div>

        <div className="subscriber-row">
          <div className="avatar-ring">
            <div className="avatar-core">{isAnonymous ? "?" : "S"}</div>
          </div>

          <div className="subscriber-copy">
            <p className="subscriber-label">
              {isAnonymous ? "Anonymous Subscriber" : "Subscriber"}
            </p>
            <p className="subscriber-name">
              {isAnonymous ? "Name hidden" : `@${config.channel}`}
            </p>
          </div>
        </div>

        <div className="overlay-footer">
          <span className="footer-chip">path: {window.location.pathname}</span>
          <span className="footer-chip">mode: {config.mode}</span>
        </div>
      </section>
    </main>
  );
}

function App() {
  const config = readOverlayConfig();

  if (config.mode === "live") {
    return <LiveOverlay config={config} />;
  }

  return <PreviewOverlay config={config} />;
}

export default App;
