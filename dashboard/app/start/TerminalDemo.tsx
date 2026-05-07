"use client";

import { useEffect, useRef, useState } from "react";

type Line =
  | { kind: "comment"; text: string }
  | { kind: "input";   text: string }
  | { kind: "output";  text: string; tone?: "ok" | "warn" | "demo" | "muted" }
  | { kind: "result";  text: string; tone?: "ok" | "muted" }
  | { kind: "blank" };

const SCRIPT: ReadonlyArray<{ line: Line; preDelay: number; typeDelay?: number }> = [
  { line: { kind: "comment", text: "# Fresh terminal. No signup. No API keys." }, preDelay: 200 },
  { line: { kind: "input",   text: "npx -y pay-per-call-mcp" },                    preDelay: 600, typeDelay: 65 },
  { line: { kind: "output",  text: "[pay-per-call-mcp] Starting..." },             preDelay: 900 },
  { line: { kind: "output",  text: "  PAY_TOKEN   : ✗ not set", tone: "warn" },    preDelay: 220 },
  { line: { kind: "output",  text: "  BUYER_JWT   : ✗ not set", tone: "warn" },    preDelay: 200 },
  { line: { kind: "output",  text: "  MODE        : 🎮 DEMO (no signup needed)", tone: "demo" }, preDelay: 220 },
  { line: { kind: "blank" }, preDelay: 200 },
  { line: { kind: "output",  text: "[pay-per-call-mcp] Ready.", tone: "ok" },      preDelay: 360 },
  { line: { kind: "blank" }, preDelay: 700 },
  { line: { kind: "comment", text: "# Inside Claude Desktop, ask:" },              preDelay: 200 },
  { line: { kind: "input",   text: "Search Wikipedia for 'Model Context Protocol' via pay-per-call-mcp." }, preDelay: 400, typeDelay: 32 },
  { line: { kind: "blank" }, preDelay: 400 },
  { line: { kind: "result",  text: "→ Claude picks call_service(serviceId=demo_search) ..." }, preDelay: 200 },
  { line: { kind: "result",  text: "→ Wikipedia returned 5 results (real upstream)", tone: "ok" }, preDelay: 1100 },
  { line: { kind: "result",  text: "→ \"MCP is an open standard for connecting AI agents to tools and data...\"" }, preDelay: 350 },
  { line: { kind: "blank" }, preDelay: 200 },
  { line: { kind: "result",  text: "✓ done · $0.000 charged · Demo Mode active", tone: "ok" }, preDelay: 250 },
  { line: { kind: "result",  text: "  set LEMON_CAKE_PAY_TOKEN to unlock paid services →", tone: "muted" }, preDelay: 500 },
];

const RESTART_DELAY_MS = 3500;

export function TerminalDemo() {
  const [rendered, setRendered] = useState<Line[]>([]);
  const [typing,   setTyping]   = useState<{ text: string; full: string } | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let mounted = true;

    async function play() {
      while (mounted && !cancelRef.current) {
        setRendered([]);
        setTyping(null);

        for (const { line, preDelay, typeDelay } of SCRIPT) {
          if (cancelRef.current) return;
          await wait(preDelay);

          if (line.kind === "input" && typeDelay) {
            // typewriter effect for the input line
            for (let i = 1; i <= line.text.length; i++) {
              if (cancelRef.current) return;
              setTyping({ text: line.text.slice(0, i), full: line.text });
              await wait(typeDelay);
            }
            setRendered(prev => [...prev, line]);
            setTyping(null);
          } else {
            setRendered(prev => [...prev, line]);
          }
        }

        await wait(RESTART_DELAY_MS);
      }
    }

    play();
    return () => {
      mounted = false;
      cancelRef.current = true;
    };
  }, []);

  return (
    <div
      className="rounded-2xl bg-[#0b0b10] border border-white/10 overflow-hidden shadow-2xl shadow-black/40"
      role="img"
      aria-label="Animated demo of running pay-per-call-mcp in Demo Mode"
    >
      {/* traffic-light header */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-black/40">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[11px] font-mono text-white/30 tracking-wide">~/projects · pay-per-call-mcp</span>
      </div>

      {/* body */}
      <div className="px-5 py-5 font-mono text-[12.5px] md:text-[13px] leading-relaxed min-h-[440px] md:min-h-[480px]">
        {rendered.map((l, i) => (
          <Row key={i} line={l} />
        ))}
        {typing && (
          <div className="flex items-baseline gap-2">
            <span className="text-[#fffd43]/70 select-none">$</span>
            <span className="text-white/95">
              {typing.text}
              <Cursor />
            </span>
          </div>
        )}
        {!typing && rendered.length > 0 && rendered.length < SCRIPT.length && (
          <div className="text-white/30">
            <Cursor />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ line }: { line: Line }) {
  if (line.kind === "blank") return <div className="h-3" aria-hidden />;
  if (line.kind === "comment") {
    return <div className="text-white/30">{line.text}</div>;
  }
  if (line.kind === "input") {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-[#fffd43]/70 select-none">$</span>
        <span className="text-white/95 break-words">{line.text}</span>
      </div>
    );
  }
  if (line.kind === "output") {
    const cls =
      line.tone === "ok"    ? "text-emerald-300/85" :
      line.tone === "warn"  ? "text-amber-300/75" :
      line.tone === "demo"  ? "text-[#fffd43]/90" :
      line.tone === "muted" ? "text-white/30" :
                              "text-white/65";
    return <div className={`${cls} break-words`}>{line.text}</div>;
  }
  // result
  const cls =
    line.tone === "ok"    ? "text-emerald-300/85" :
    line.tone === "muted" ? "text-white/30" :
                            "text-sky-200/80";
  return <div className={`${cls} break-words`}>{line.text}</div>;
}

function Cursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[7px] h-[14px] -mb-[2px] ml-0.5 bg-[#fffd43]/80 align-middle"
      style={{ animation: "ppc-cursor 1.05s steps(2) infinite" }}
    />
  );
}

function wait(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
