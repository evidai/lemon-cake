"use client";

import { useState } from "react";

export function CopyCommand({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // ignore
        }
      }}
      className="group flex w-full items-center gap-3 rounded-2xl bg-black/60 border border-white/10 px-5 py-4 text-left hover:border-[#fffd43]/40 transition"
      aria-label={label ?? "Copy command"}
    >
      <span className="text-[#fffd43]/70 font-mono text-sm shrink-0">$</span>
      <code className="flex-1 font-mono text-sm md:text-base text-white/90 break-all">{value}</code>
      <span
        className={`shrink-0 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-md transition ${
          copied
            ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
            : "bg-white/5 text-white/50 border border-white/10 group-hover:bg-[#fffd43]/10 group-hover:text-[#fffd43] group-hover:border-[#fffd43]/30"
        }`}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
