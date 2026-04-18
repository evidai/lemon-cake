import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "./theme";

// ────────────────────────────────────────────────────────────────
// 30-second launch video — 4 acts:
//   Hook (0-3s)          : "I gave my AI a $2 wallet"
//   BalanceDrop (3-15s)  : counter $2.000 → $1.353, charge rows flash
//   KillSwitch (15-23s)  : red button → 422 Token revoked
//   Outro (23-30s)       : logo + URL
// All frame math in 30 fps.
// ────────────────────────────────────────────────────────────────

type Props = { vertical?: boolean };

export const LaunchVideo: React.FC<Props> = ({ vertical = false }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgDark, fontFamily: theme.font }}>
      {/* Act 1 — 0 to 3s */}
      <Sequence from={0} durationInFrames={90}>
        <Hook vertical={vertical} />
      </Sequence>

      {/* Act 2 — 3s to 15s */}
      <Sequence from={90} durationInFrames={360}>
        <BalanceDrop vertical={vertical} />
      </Sequence>

      {/* Act 3 — 15s to 23s */}
      <Sequence from={450} durationInFrames={240}>
        <KillSwitch vertical={vertical} />
      </Sequence>

      {/* Act 4 — 23s to 30s */}
      <Sequence from={690} durationInFrames={210}>
        <Outro vertical={vertical} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════════
// Act 1 — Hook
// ════════════════════════════════════════════════════════════════

const Hook: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background: yellow cream
  // Headline fades + scales in
  const scale = spring({ frame, fps, config: { damping: 14 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const dollarOpacity = interpolate(frame, [25, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgCream,
        justifyContent: "center",
        alignItems: "center",
        padding: vertical ? 60 : 80,
      }}
    >
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: "center" }}>
        <div
          style={{
            fontSize: vertical ? 84 : 128,
            fontWeight: 900,
            color: theme.textDark,
            lineHeight: 1.08,
            letterSpacing: -2,
          }}
        >
          I gave my AI agent
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: vertical ? 110 : 164,
            fontWeight: 900,
            color: theme.textDark,
            lineHeight: 1,
            letterSpacing: -3,
            opacity: dollarOpacity,
          }}
        >
          a <span style={{ color: theme.red }}>$2</span> wallet.
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: vertical ? 34 : 44,
            color: `${theme.textDark}99`,
            fontWeight: 500,
            opacity: dollarOpacity,
          }}
        >
          Watch what happened →
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════════
// Act 2 — Balance drop (the money shot)
// ════════════════════════════════════════════════════════════════

const BalanceDrop: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Balance animates from 2.000 → 1.353 over 12s in 5 steps
  // Each "charge" fires at a specific frame
  const charges = [
    { atFrame: 30,  amount: 0.142, service: "jina-reader",  desc: "fetch competitor site" },
    { atFrame: 90,  amount: 0.091, service: "jina-reader",  desc: "fetch blog post" },
    { atFrame: 150, amount: 0.198, service: "openai-search", desc: "competitive analysis" },
    { atFrame: 210, amount: 0.116, service: "jina-reader",  desc: "fetch pricing page" },
    { atFrame: 275, amount: 0.100, service: "openai-search", desc: "summarize findings" },
  ];

  const startBalance = 2.000;
  let current = startBalance;
  const balanceAtFrame = (f: number) => {
    let bal = startBalance;
    for (const c of charges) {
      if (f >= c.atFrame) bal -= c.amount;
    }
    return bal;
  };

  const balance = balanceAtFrame(frame);
  const entry = spring({ frame, fps, config: { damping: 20 } });

  // Charges list: only those that already fired, newest-first
  const visibleCharges = charges.filter((c) => frame >= c.atFrame).reverse();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgDark,
        flexDirection: vertical ? "column" : "row",
        padding: vertical ? 40 : 80,
        gap: 40,
      }}
    >
      {/* LEFT SIDE — Agent activity (simulated terminal) */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#0d0d13",
          borderRadius: 24,
          border: "1px solid #ffffff15",
          padding: 36,
          fontFamily: theme.fontMono,
          fontSize: vertical ? 20 : 22,
          color: "#ffffff90",
          opacity: entry,
        }}
      >
        <div style={{ color: theme.bgCream, marginBottom: 20, fontSize: vertical ? 22 : 26 }}>
          ● Claude · autonomous
        </div>
        <div style={{ color: "#ffffff60", marginBottom: 28, fontSize: vertical ? 18 : 20 }}>
          &gt; research M2M payment competitors
        </div>
        {visibleCharges
          .slice()
          .reverse() // oldest first in the log
          .map((c, i) => {
            const fadein = interpolate(frame, [c.atFrame, c.atFrame + 10], [0, 1], {
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  marginBottom: 16,
                  opacity: fadein,
                  transform: `translateY(${(1 - fadein) * 10}px)`,
                  display: "flex",
                  gap: 16,
                }}
              >
                <span style={{ color: theme.green }}>✓</span>
                <span style={{ color: theme.bgCream }}>{c.service}</span>
                <span style={{ color: "#ffffff55" }}>—</span>
                <span>{c.desc}</span>
              </div>
            );
          })}
        {/* Blinking cursor */}
        {frame > 275 && (
          <div style={{ marginTop: 28, color: "#ffffff40" }}>
            &gt; {frame % 20 < 10 ? "█" : " "}
          </div>
        )}
      </div>

      {/* RIGHT SIDE — Balance card */}
      <div
        style={{
          flex: vertical ? 0.7 : 1,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          opacity: entry,
          transform: `translateX(${(1 - entry) * (vertical ? 0 : 40)}px)`,
        }}
      >
        {/* Main balance card */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#0d0d13",
            borderRadius: 24,
            border: "1px solid #ffffff15",
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 18,
              color: "#ffffff50",
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            🍋 LemonCake · Pay Token Balance
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div
              style={{
                fontFamily: theme.fontMono,
                fontSize: vertical ? 120 : 180,
                fontWeight: 900,
                color: theme.bgCream,
                letterSpacing: -4,
                lineHeight: 1,
                transition: "transform 100ms",
              }}
            >
              ${balance.toFixed(3)}
            </div>
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 22,
              color: "#ffffff60",
              fontFamily: theme.fontMono,
            }}
          >
            limit: $2.000 · expires in 24h · service: jina-reader
          </div>

          {/* Progress bar */}
          <div
            style={{
              marginTop: 32,
              height: 10,
              backgroundColor: "#ffffff15",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(balance / 2.0) * 100}%`,
                backgroundColor: theme.bgCream,
                borderRadius: 999,
                transition: "width 100ms",
              }}
            />
          </div>
        </div>

        {/* Recent charges (latest 3) */}
        <div
          style={{
            backgroundColor: "#0d0d13",
            borderRadius: 24,
            border: "1px solid #ffffff15",
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#ffffff40",
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Recent charges
          </div>
          {visibleCharges.slice(0, 3).map((c, i) => {
            const fadein = interpolate(frame, [c.atFrame, c.atFrame + 8], [0, 1], {
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={`${c.atFrame}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 0",
                  borderBottom: i < 2 ? "1px solid #ffffff10" : "none",
                  opacity: fadein,
                  fontFamily: theme.fontMono,
                }}
              >
                <span style={{ color: "#ffffff70", fontSize: 18 }}>{c.service}</span>
                <span style={{ color: theme.red, fontSize: 20, fontWeight: 700 }}>
                  −${c.amount.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════════
// Act 3 — Kill Switch
// ════════════════════════════════════════════════════════════════

const KillSwitch: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0-60f (0-2s):  "Something off?" question
  // 60-120f (2-4s): red button pulses
  // 120-150f (4-5s): button pressed
  // 150-210f (5-7s): "422 Token revoked" error
  // 210-240f (7-8s): "Atomic. Race-free." subtitle

  const questionOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const buttonOp = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp" });
  const buttonPulse =
    frame < 120
      ? 1 + Math.sin((frame - 50) * 0.3) * 0.05
      : interpolate(frame, [120, 135], [1.05, 0.95], { extrapolateRight: "clamp" });

  const errorOp = interpolate(frame, [140, 170], [0, 1], { extrapolateRight: "clamp" });
  const subtitleOp = interpolate(frame, [200, 220], [0, 1], { extrapolateRight: "clamp" });

  const pressed = frame >= 120;
  const buttonScale = pressed ? 0.95 : buttonPulse;
  const buttonBg = pressed ? "#7f1d1d" : theme.red;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        flexDirection: "column",
        gap: 40,
      }}
    >
      {/* Question */}
      <div
        style={{
          fontSize: vertical ? 48 : 64,
          color: theme.white,
          fontWeight: 900,
          opacity: questionOp,
          textAlign: "center",
        }}
      >
        {frame < 140 ? "Something off? Kill it." : ""}
      </div>

      {/* Red button */}
      {frame < 140 && (
        <div
          style={{
            opacity: buttonOp,
            transform: `scale(${buttonScale})`,
            transition: "transform 80ms",
          }}
        >
          <button
            style={{
              backgroundColor: buttonBg,
              color: theme.white,
              border: "none",
              borderRadius: 24,
              padding: vertical ? "40px 80px" : "48px 96px",
              fontSize: vertical ? 48 : 64,
              fontWeight: 900,
              fontFamily: theme.font,
              cursor: "pointer",
              boxShadow: `0 0 ${40 + buttonPulse * 30}px ${theme.red}88, 0 0 0 ${pressed ? 0 : 8}px #ffffff10`,
              letterSpacing: -1,
            }}
          >
            ⏻ REVOKE TOKEN
          </button>
        </div>
      )}

      {/* 422 error */}
      {frame >= 140 && (
        <div
          style={{
            opacity: errorOp,
            backgroundColor: "#0d0d13",
            border: `2px solid ${theme.red}`,
            borderRadius: 24,
            padding: vertical ? 40 : 60,
            fontFamily: theme.fontMono,
            textAlign: "left",
            maxWidth: vertical ? "90%" : 1200,
          }}
        >
          <div
            style={{
              fontSize: vertical ? 24 : 32,
              color: theme.red,
              fontWeight: 900,
              marginBottom: 16,
            }}
          >
            ● 422 Unprocessable Entity
          </div>
          <div style={{ fontSize: vertical ? 28 : 40, color: theme.white, fontWeight: 600 }}>
            {"{"} &quot;error&quot;: &quot;Token has been revoked&quot; {"}"}
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: vertical ? 22 : 28,
              color: "#ffffff50",
              fontFamily: theme.font,
              opacity: subtitleOp,
            }}
          >
            Atomic. Race-free. Irreversible.
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ════════════════════════════════════════════════════════════════
// Act 4 — Outro
// ════════════════════════════════════════════════════════════════

const Outro: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12 } });
  const tagOp = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  const urlOp = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" });
  const ctaOp = interpolate(frame, [100, 130], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgDark,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          fontSize: vertical ? 200 : 280,
          lineHeight: 1,
        }}
      >
        🍋
      </div>

      {/* Wordmark */}
      <div
        style={{
          fontSize: vertical ? 80 : 120,
          fontWeight: 900,
          color: theme.white,
          letterSpacing: -2,
          transform: `scale(${logoScale})`,
        }}
      >
        LemonCake
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: vertical ? 34 : 48,
          color: theme.bgCream,
          fontWeight: 600,
          marginTop: 24,
          opacity: tagOp,
          textAlign: "center",
          maxWidth: vertical ? "90%" : 1400,
          lineHeight: 1.2,
        }}
      >
        Give your AI agent a wallet.
        <br />
        With a kill switch.
      </div>

      {/* URL */}
      <div
        style={{
          marginTop: 40,
          fontSize: vertical ? 38 : 52,
          fontFamily: theme.fontMono,
          color: theme.bgCream,
          fontWeight: 700,
          opacity: urlOp,
          letterSpacing: -1,
        }}
      >
        lemoncake.xyz
      </div>

      {/* Install hints */}
      <div
        style={{
          marginTop: 36,
          opacity: ctaOp,
          display: "flex",
          gap: vertical ? 16 : 24,
          flexDirection: vertical ? "column" : "row",
        }}
      >
        {["npx lemon-cake-mcp", "npm i eliza-plugin-lemoncake"].map((cmd) => (
          <div
            key={cmd}
            style={{
              fontFamily: theme.fontMono,
              fontSize: vertical ? 22 : 26,
              color: "#ffffff60",
              backgroundColor: "#ffffff10",
              border: "1px solid #ffffff15",
              padding: "14px 24px",
              borderRadius: 12,
            }}
          >
            $ {cmd}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
