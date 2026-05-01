const PRICING_PER_MTOK_USD: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export function tokensToJpy(
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }
): number {
  const p = PRICING_PER_MTOK_USD[model] ?? PRICING_PER_MTOK_USD["claude-sonnet-4-6"];
  const usd =
    (usage.input_tokens / 1e6) * p.input +
    (usage.output_tokens / 1e6) * p.output +
    ((usage.cache_read_input_tokens ?? 0) / 1e6) * p.cacheRead;
  const usdjpy = Number(process.env.USDJPY ?? 150);
  return Math.round(usd * usdjpy * 100) / 100;
}
