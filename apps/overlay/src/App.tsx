import { useCallback, useEffect, useRef, useState } from "react";


type OverlayMode = "live" | "named" | "anonymous";

type NotifyEvent = {
  id: string;
  kind: string;
  subscriberName: string;
  subscriberChannelId: string;
  message: string;
  accentColor: string;
  displayDurationSec: number;
  avatarUrl: string;
  soundPreset: string;
  soundVolume: number;
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

type SoundPreset = {
  name: string;
  play: (ctx: AudioContext, volume: number) => void;
};

const soundPresets: Record<string, SoundPreset> = {
  chime: {
    name: "チャイム",
    play: (ctx, volume) => {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume * 0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1046, now + 0.18);
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1318, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(1567, now + 0.28);
      osc2.connect(gain);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.5);
    },
  },
  bell: {
    name: "ベル",
    play: (ctx, volume) => {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(volume * 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.8);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.8);
    },
  },
  pop: {
    name: "ポップ",
    play: (ctx, volume) => {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(volume * 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.25);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.25);
    },
  },
  none: {
    name: "なし",
    play: () => {},
  },
};

let audioContext: AudioContext | null = null;

function playSound(preset: string, volume: number) {
  if (preset === "none" || !preset) return;
  const sound = soundPresets[preset];
  if (!sound) return;

  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  sound.play(audioContext, Math.max(0, Math.min(1, volume)));
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

    playSound(next.soundPreset || "chime", next.soundVolume > 0 ? next.soundVolume : 0.8);

    const duration = next.displayDurationSec > 0
      ? next.displayDurationSec * 1000
      : config.displayDurationMs;

    window.setTimeout(() => {
      setIsVisible(false);

      window.setTimeout(() => {
        setActiveEvent(null);
        showNext();
      }, 400);
    }, duration);
  }, [config.displayDurationMs]);

  useEffect(() => {
    if (!config.apiBaseUrl) return;

    let nextSeq = 0;
    let cancelled = false;
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
        // 次の間隔でリトライ
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

  const isAnonymous = activeEvent?.kind === "new_anonymous_subscriber";

  return (
    <main className="overlay-shell is-live">
      {activeEvent ? (
        <section
          className={`overlay-card ${isVisible ? "visible" : ""} ${isAnonymous ? "is-anonymous-card" : ""}`}
          style={activeEvent.accentColor ? { "--accent": activeEvent.accentColor } as React.CSSProperties : undefined}
        >
          <div className="overlay-header">
            <span className="overlay-badge">
              チャンネル登録ありがとう！
            </span>
            <span className="overlay-workspace">{config.workspace}</span>
          </div>

          <div className="subscriber-row">
            <div className={`avatar-ring ${isAnonymous ? "is-anonymous-ring" : ""}`}>
              <div className="avatar-core">
                {activeEvent.avatarUrl ? (
                  <img src={activeEvent.avatarUrl} alt="" className="avatar-image" />
                ) : isAnonymous ? (
                  "?"
                ) : (
                  (activeEvent.subscriberName || "S").slice(0, 1).toUpperCase()
                )}
              </div>
            </div>

            <div className="subscriber-copy">
              <h1 className="subscriber-name">
                {activeEvent.message
                  || (isAnonymous
                    ? "チャンネル登録ありがとう！"
                    : `${activeEvent.subscriberName}さん、チャンネル登録ありがとう！`)}
              </h1>
            </div>
          </div>

          <div className="countdown-bar">
            <div
              className="countdown-fill"
              style={{
                animationDuration: `${activeEvent.displayDurationSec > 0 ? activeEvent.displayDurationSec * 1000 : config.displayDurationMs}ms`,
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
