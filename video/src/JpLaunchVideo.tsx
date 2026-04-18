import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "./theme";

// ────────────────────────────────────────────────────────────────
// 30秒 日本向けデモ動画 ― 4幕構成:
//   Hook   (0–3s)   : 「AIエージェントの支払いを、会計freeeまで自動連携」
//   Charge (3–12s)  : エージェント課金 → 残高減少
//   Freee  (12–21s) : freee に仕訳が自動登録される行アニメ
//   Tax    (21–27s) : 国税庁 T登録番号 照合 → 適格請求書OK
//   Outro  (27–30s) : ロゴ + CTA
// 30fps / 900 frames
// ────────────────────────────────────────────────────────────────

type Props = { vertical?: boolean };

export const JpLaunchVideo: React.FC<Props> = ({ vertical = false }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgDark, fontFamily: theme.font }}>
      <Sequence from={0} durationInFrames={90}>
        <Hook vertical={vertical} />
      </Sequence>
      <Sequence from={90} durationInFrames={270}>
        <Charge vertical={vertical} />
      </Sequence>
      <Sequence from={360} durationInFrames={270}>
        <FreeeSync vertical={vertical} />
      </Sequence>
      <Sequence from={630} durationInFrames={180}>
        <TaxCheck vertical={vertical} />
      </Sequence>
      <Sequence from={810} durationInFrames={90}>
        <Outro vertical={vertical} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Act 1 — Hook
// ─────────────────────────────────────────────
const Hook: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t1 = spring({ frame: frame - 5,  fps, config: { damping: 14 } });
  const t2 = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  const t3 = spring({ frame: frame - 55, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgCream,
        color: theme.textDark,
        justifyContent: "center",
        alignItems: "center",
        padding: vertical ? 60 : 120,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: vertical ? 60 : 96,
          fontWeight: 900,
          lineHeight: 1.1,
          opacity: t1,
          transform: `translateY(${(1 - t1) * 30}px)`,
        }}
      >
        AIの支払いを、
      </div>
      <div
        style={{
          fontSize: vertical ? 88 : 140,
          fontWeight: 900,
          lineHeight: 1.05,
          letterSpacing: -2,
          opacity: t2,
          transform: `translateY(${(1 - t2) * 30}px)`,
          marginTop: 16,
        }}
      >
        会計freeeまで。
      </div>
      <div
        style={{
          fontSize: vertical ? 34 : 44,
          marginTop: vertical ? 36 : 56,
          opacity: t3 * 0.75,
          fontWeight: 500,
        }}
      >
        Pay Token → 自動仕訳 → インボイス対応
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Act 2 — Charge (ターミナル + 残高)
// ─────────────────────────────────────────────
const CHARGES = [
  { svc: "jina-reader",   yen: 15  },
  { svc: "openai-search", yen: 48  },
  { svc: "jina-reader",   yen: 15  },
  { svc: "tavily-search", yen: 32  },
  { svc: "openai-search", yen: 48  },
];

const Charge: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ¥300 → ¥142 over ~9s
  const spent = CHARGES.reduce((acc, c, i) => {
    const showAt = 30 + i * 45;
    const p = interpolate(frame, [showAt, showAt + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return acc + c.yen * p;
  }, 0);
  const balance = Math.max(0, 300 - spent);

  const enter = spring({ frame, fps, config: { damping: 20 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgDark,
        color: theme.white,
        padding: vertical ? 48 : 80,
        flexDirection: vertical ? "column" : "row",
        gap: vertical ? 40 : 60,
      }}
    >
      {/* Terminal */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#0c0c14",
          border: "1px solid #1e1e2e",
          borderRadius: 16,
          padding: vertical ? 28 : 40,
          fontFamily: theme.fontMono,
          fontSize: vertical ? 20 : 24,
          opacity: enter,
          transform: `translateX(${(1 - enter) * -40}px)`,
        }}
      >
        <div style={{ color: "#7aa2f7", marginBottom: 18 }}>$ claude --with-lemoncake</div>
        {CHARGES.map((c, i) => {
          const showAt = 30 + i * 45;
          const visible = frame >= showAt;
          if (!visible) return null;
          const lineOpacity = interpolate(frame, [showAt, showAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{ marginBottom: 12, opacity: lineOpacity }}>
              <span style={{ color: theme.green }}>→ POST</span>{" "}
              <span style={{ color: "#c0caf5" }}>/proxy/{c.svc}</span>{"  "}
              <span style={{ color: theme.bgCream }}>¥{c.yen}</span>
            </div>
          );
        })}
      </div>

      {/* Balance card */}
      <div
        style={{
          width: vertical ? "100%" : 520,
          backgroundColor: theme.bgCream,
          color: theme.textDark,
          borderRadius: 20,
          padding: vertical ? 32 : 44,
          opacity: enter,
          transform: `translateX(${(1 - enter) * 40}px)`,
        }}
      >
        <div style={{ fontSize: vertical ? 22 : 28, fontWeight: 600, opacity: 0.7 }}>
          🍋 Pay Token 残高
        </div>
        <div
          style={{
            fontSize: vertical ? 92 : 128,
            fontWeight: 900,
            letterSpacing: -3,
            marginTop: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ¥{balance.toFixed(0)}
        </div>
        <div style={{ fontSize: vertical ? 20 : 24, marginTop: 8, opacity: 0.6 }}>
          上限 ¥300 / 24h
        </div>
        <div
          style={{
            marginTop: vertical ? 28 : 40,
            height: 14,
            borderRadius: 8,
            backgroundColor: "rgba(26,15,0,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(balance / 300) * 100}%`,
              height: "100%",
              backgroundColor: theme.textDark,
              transition: "width 0.2s",
            }}
          />
        </div>
        <div
          style={{
            marginTop: vertical ? 28 : 36,
            fontSize: vertical ? 22 : 26,
            fontWeight: 700,
            color: theme.green,
          }}
        >
          ● 課金中 · 自動で会計連携
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Act 3 — freee 自動仕訳
// ─────────────────────────────────────────────
const JOURNAL_ROWS = [
  { date: "2026-04-19", debit: "通信費",     credit: "未払金", amount: 15, memo: "jina-reader" },
  { date: "2026-04-19", debit: "通信費",     credit: "未払金", amount: 48, memo: "openai-search" },
  { date: "2026-04-19", debit: "通信費",     credit: "未払金", amount: 15, memo: "jina-reader" },
  { date: "2026-04-19", debit: "通信費",     credit: "未払金", amount: 32, memo: "tavily-search" },
  { date: "2026-04-19", debit: "通信費",     credit: "未払金", amount: 48, memo: "openai-search" },
];

const FreeeSync: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgDark,
        color: theme.white,
        padding: vertical ? 40 : 80,
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* freee header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: vertical ? 28 : 40,
          opacity: enter,
          transform: `translateY(${(1 - enter) * -20}px)`,
        }}
      >
        <div
          style={{
            width: vertical ? 56 : 72,
            height: vertical ? 56 : 72,
            borderRadius: 14,
            backgroundColor: "#2da44e",
            display: "grid",
            placeItems: "center",
            fontSize: vertical ? 30 : 40,
            fontWeight: 900,
            color: theme.white,
          }}
        >
          f
        </div>
        <div>
          <div style={{ fontSize: vertical ? 28 : 36, fontWeight: 800 }}>
            会計freee · 自動仕訳
          </div>
          <div style={{ fontSize: vertical ? 18 : 22, opacity: 0.6 }}>
            LemonCake → freee API (OAuth 2.0)
          </div>
        </div>
      </div>

      {/* Journal table */}
      <div
        style={{
          backgroundColor: "#0c0c14",
          border: "1px solid #1e1e2e",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: vertical ? "1fr 1fr 1fr 0.8fr" : "1.2fr 1fr 1fr 1fr 1.5fr",
            padding: vertical ? "14px 16px" : "18px 28px",
            backgroundColor: "#13131e",
            fontSize: vertical ? 16 : 20,
            fontWeight: 700,
            color: "#9aa5ce",
            gap: 12,
          }}
        >
          <div>日付</div>
          <div>借方</div>
          <div>貸方</div>
          {!vertical && <div>金額</div>}
          <div>摘要</div>
        </div>

        {JOURNAL_ROWS.map((row, i) => {
          const showAt = 20 + i * 36;
          const visible = frame >= showAt;
          if (!visible) return null;
          const p = interpolate(frame, [showAt, showAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: vertical ? "1fr 1fr 1fr 0.8fr" : "1.2fr 1fr 1fr 1fr 1.5fr",
                padding: vertical ? "14px 16px" : "20px 28px",
                fontSize: vertical ? 18 : 22,
                fontFamily: theme.fontMono,
                borderTop: "1px solid #1e1e2e",
                opacity: p,
                transform: `translateX(${(1 - p) * -20}px)`,
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ color: "#c0caf5" }}>{row.date}</div>
              <div style={{ color: theme.green, fontWeight: 700 }}>{row.debit}</div>
              <div style={{ color: "#f7768e", fontWeight: 700 }}>{row.credit}</div>
              {!vertical && (
                <div style={{ color: theme.bgCream, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  ¥{row.amount}
                </div>
              )}
              <div style={{ color: "#9aa5ce" }}>
                {vertical ? `¥${row.amount} ${row.memo}` : row.memo}
              </div>
            </div>
          );
        })}
      </div>

      {/* footer tag */}
      {frame > 220 && (
        <div
          style={{
            marginTop: vertical ? 24 : 36,
            alignSelf: "flex-end",
            fontSize: vertical ? 20 : 26,
            color: theme.green,
            fontWeight: 700,
          }}
        >
          ✓ 5 件の仕訳を登録しました
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Act 4 — 国税庁 インボイス照合
// ─────────────────────────────────────────────
const TaxCheck: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20 } });

  const lookupDone  = frame > 60;
  const approvedP   = interpolate(frame, [90, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgDark,
        color: theme.white,
        padding: vertical ? 60 : 120,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          fontSize: vertical ? 22 : 28,
          opacity: 0.6 * enter,
          marginBottom: 18,
          letterSpacing: 2,
        }}
      >
        国税庁 適格請求書発行事業者 公表サイト
      </div>

      <div
        style={{
          backgroundColor: "#0c0c14",
          border: "1px solid #1e1e2e",
          borderRadius: 20,
          padding: vertical ? 36 : 56,
          width: vertical ? "92%" : 900,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 20}px)`,
        }}
      >
        <div style={{ fontSize: vertical ? 22 : 26, opacity: 0.6 }}>登録番号</div>
        <div
          style={{
            fontSize: vertical ? 44 : 64,
            fontFamily: theme.fontMono,
            fontWeight: 800,
            letterSpacing: 2,
            marginTop: 8,
            color: theme.bgCream,
          }}
        >
          T1234567890123
        </div>

        <div
          style={{
            marginTop: vertical ? 28 : 40,
            fontSize: vertical ? 22 : 26,
            opacity: 0.7,
            fontFamily: theme.fontMono,
          }}
        >
          {lookupDone ? "→ 200 OK" : "→ GET /api/v1/invoice/..."}
        </div>

        {approvedP > 0 && (
          <div
            style={{
              marginTop: vertical ? 28 : 40,
              padding: vertical ? "18px 22px" : "24px 32px",
              borderRadius: 14,
              backgroundColor: "rgba(16,185,129,0.12)",
              border: `2px solid ${theme.green}`,
              opacity: approvedP,
              transform: `scale(${0.96 + approvedP * 0.04})`,
            }}
          >
            <div style={{ fontSize: vertical ? 26 : 34, fontWeight: 900, color: theme.green }}>
              ✓ 適格請求書発行事業者
            </div>
            <div style={{ fontSize: vertical ? 18 : 22, marginTop: 8, opacity: 0.8 }}>
              消費税10% · 仕入税額控除の対象
            </div>
          </div>
        )}
      </div>

      {frame > 130 && (
        <div
          style={{
            marginTop: vertical ? 28 : 40,
            fontSize: vertical ? 24 : 30,
            fontWeight: 700,
            color: theme.bgCream,
            opacity: interpolate(frame, [130, 160], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          源泉徴収 10.21% も自動控除
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Act 5 — Outro
// ─────────────────────────────────────────────
const Outro: React.FC<Props> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoP = spring({ frame, fps, config: { damping: 12 } });
  const textP = spring({ frame: frame - 15, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bgCream,
        color: theme.textDark,
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: vertical ? 160 : 220,
          transform: `scale(${logoP})`,
        }}
      >
        🍋
      </div>
      <div
        style={{
          fontSize: vertical ? 72 : 120,
          fontWeight: 900,
          letterSpacing: -3,
          marginTop: vertical ? 8 : 16,
          opacity: textP,
        }}
      >
        LemonCake
      </div>
      <div
        style={{
          fontSize: vertical ? 28 : 38,
          fontWeight: 600,
          marginTop: vertical ? 24 : 36,
          opacity: textP * 0.85,
          maxWidth: vertical ? 900 : 1200,
        }}
      >
        AIの財布に、会計と税務まで。
      </div>
      <div
        style={{
          fontSize: vertical ? 30 : 40,
          fontWeight: 800,
          marginTop: vertical ? 28 : 40,
          opacity: textP,
        }}
      >
        lemoncake.xyz
      </div>
    </AbsoluteFill>
  );
};
