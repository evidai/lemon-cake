"""daily-prospect-finder — pure-script (GitHub Actions) version with optional
LLM-driven Japanese translation + opener drafting.

- Phase 1 (always): fetch HN comments + stories from last 7d for "building agent"
  type signals across multiple per-phrase, per-tag queries (Algolia HN API
  doesn't honor OR + multi-tag in one call), dedupe by author.
- Phase 2 (only if ANTHROPIC_API_KEY is present): call Claude Haiku 4.5 once with
  the prospect list and get back:
    * 一字一句和訳 of the English signal snippet
    * English opener draft (60-120 words, DM/reply ready)
    * 一字一句和訳 of the opener
    * Japanese intent memo (why the opener works)
- Phase 3: format Japanese-first digest and post to Slack. If Phase 2 was skipped,
  fall back to the snippet-only static-hint format.
"""

from __future__ import annotations

import json
import sys
import time
import traceback
import urllib.parse

from common import (
    claude_messages,
    fetch_json,
    keyword_matches,
    post_to_slack,
    strip_code_fence,
    today_iso,
)

# Phrase-level signals — each fetched separately because Algolia OR syntax is fragile.
PHRASES = [
    "mcp server",
    "agent infrastructure",
    "building an agent",
    "tool use",
    "ai agent payment",
    "agent billing",
]

# Per-hit secondary keywords for relevance scoring
SCORE_KEYWORDS = [
    "payment", "billing", "x402", "per-call", "per call", "monetize", "budget", "cost",
    "stripe", "anthropic", "openai", "claude", "gpt",
]

# What the user is building — context for the LLM when drafting openers.
BUILDER_CONTEXT = (
    "The user is building lemon-cake-mcp / pay-per-call-mcp / KYAPay — "
    "infrastructure for AI-agent payments and per-call billing. "
    "The funnel as of 2026-05-05 was 624 npm downloads but 0 paying buyers, "
    "so prospects must be high-fit (people actively building agent infrastructure "
    "or hitting per-call cost / billing problems)."
)


def fetch_phrase(phrase: str, tag: str, since: int) -> list[dict]:
    q = urllib.parse.quote(f'"{phrase}"', safe="")
    url = (
        "https://hn.algolia.com/api/v1/search"
        f"?query={q}&tags={tag}"
        f"&numericFilters=created_at_i%3E{since}&hitsPerPage=20"
    )
    try:
        return fetch_json(url).get("hits", [])
    except Exception as e:  # noqa: BLE001
        print(f"warn: fetch {phrase}/{tag}: {e}", file=sys.stderr)
        return []


def gather_prospects() -> tuple[list[dict], int]:
    since = int(time.time()) - 7 * 86400
    raw_hits: list[dict] = []
    for phrase in PHRASES:
        for tag in ("comment", "story"):
            raw_hits.extend(fetch_phrase(phrase, tag, since))

    seen_authors: set[str] = set()
    seen_ids: set[str] = set()
    items: list[dict] = []
    for h in raw_hits:
        oid = h.get("objectID") or ""
        if oid in seen_ids:
            continue
        seen_ids.add(oid)
        author = h.get("author") or h.get("story_author") or ""
        if not author or author in seen_authors:
            continue
        seen_authors.add(author)
        text = (h.get("comment_text") or h.get("story_text") or h.get("title") or "")[:400]
        if not text:
            continue
        is_comment = h.get("comment_text") is not None
        bonus = keyword_matches(text, SCORE_KEYWORDS)
        items.append({
            "author": author,
            "kind": "comment" if is_comment else "story",
            "url": f"https://news.ycombinator.com/item?id={oid}",
            "created_at": h.get("created_at", ""),
            "text": text,
            "bonus": bonus,
            "fit": min(5, 3 + len(bonus)),
        })
    items.sort(key=lambda x: (-x["fit"], x["author"]))
    return items[:12], len(raw_hits)


def llm_enrich(top: list[dict]) -> list[dict] | None:
    """Ask Claude Haiku 4.5 to translate each signal and draft an opener with translation.

    Returns a list of dicts (one per input item, same order) with keys:
      signal_jp_full, signal_jp_summary, opener_en, opener_jp, opener_intent_jp
    Or None if the LLM call fails / returns garbage.
    """
    if not top:
        return []

    payload_items = [
        {
            "i": idx,
            "author": p["author"],
            "kind": p["kind"],
            "snippet_en": p["text"],
        }
        for idx, p in enumerate(top)
    ]

    system = (
        "You assist a Japanese-speaking founder by translating HN signals to Japanese "
        "and drafting cold-outreach openers in English with parallel Japanese translation. "
        + BUILDER_CONTEXT
        + "\n\n"
        "For each item, produce:\n"
        "1. signal_jp_full — natural Japanese translation of the snippet (1-3 sentences, no padding)\n"
        "2. signal_jp_summary — 30-60 character Japanese summary of what this person is building or struggling with\n"
        "3. opener_en — 60-120 word English DM/reply that opens with a specific question (NOT a pitch). Don't paste any URL. Tone: peer asking a curious question, not a salesperson.\n"
        "4. opener_jp — accurate Japanese translation of opener_en (sentence-by-sentence, not summary)\n"
        "5. opener_intent_jp — 30-60 character Japanese note on why this opener should work for this person\n\n"
        "Return ONLY a JSON array of objects with these exact keys plus 'i' (the index). No markdown, no commentary."
    )

    user_msg = "Items:\n" + json.dumps(payload_items, ensure_ascii=False, indent=2)
    raw = claude_messages(
        messages=[{"role": "user", "content": user_msg}],
        model="claude-haiku-4-5",
        max_tokens=8192,
        system=system,
    )
    if not raw:
        return None

    try:
        cleaned = strip_code_fence(raw)
        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            print(f"warn: LLM returned non-list JSON: {type(parsed)}", file=sys.stderr)
            return None
        # Reorder by 'i' to match input
        by_idx = {item.get("i", -1): item for item in parsed if isinstance(item, dict)}
        return [by_idx.get(i, {}) for i in range(len(top))]
    except json.JSONDecodeError as e:
        print(f"warn: LLM JSON parse failed: {e}\nfirst 300 chars: {raw[:300]}", file=sys.stderr)
        return None


def format_with_translations(top: list[dict], enriched: list[dict], total_fetched: int) -> str:
    lines = [
        f"{today_iso()} 見込み発掘 ({len(top)} 名 / 走査 {total_fetched} ヒット (重複含む))",
        "",
    ]
    for rank, (p, e) in enumerate(zip(top, enriched), 1):
        snippet = p["text"].replace("\n", " ").strip()[:200]
        lines.append(f"【{rank}】@{p['author']}  (fit={p['fit']}/5  {p['kind']}  {p['created_at'][:10]})")
        lines.append(f"  URL: {p['url']}")
        lines.append(f"  シグナル断片 (原文・英): {snippet}…")
        if e.get("signal_jp_full"):
            lines.append(f"  シグナル和訳: {e['signal_jp_full']}")
        if e.get("signal_jp_summary"):
            lines.append(f"  シグナル要約: {e['signal_jp_summary']}")
        if p["bonus"]:
            lines.append(f"  追加マッチ: {', '.join(p['bonus'][:5])}")
        lines.append("")
        if e.get("opener_en"):
            lines.append("  opener 案 (英語、DM/reply にそのまま貼れる):")
            for line in e["opener_en"].strip().split("\n"):
                lines.append(f"    {line}")
            lines.append("")
        if e.get("opener_jp"):
            lines.append("  opener 案 (和訳):")
            for line in e["opener_jp"].strip().split("\n"):
                lines.append(f"    {line}")
            lines.append("")
        if e.get("opener_intent_jp"):
            lines.append(f"  opener 意図: {e['opener_intent_jp']}")
        lines.append("")
        lines.append("─" * 40)
        lines.append("")
    if not top:
        lines.append("(直近 7 日に該当シグナル無し — フレーズフィルタが厳しすぎる可能性)")
    return "\n".join(lines)


def format_static_fallback(top: list[dict], total_fetched: int) -> str:
    """No-LLM fallback: original static-hint format."""
    lines = [
        f"{today_iso()} 見込み発掘 ({len(top)} 名 / 走査 {total_fetched} ヒット (重複含む))",
        "",
        "(注: ANTHROPIC_API_KEY が未設定のため和訳・opener ドラフトはスキップ。",
        "GitHub Secrets に追加すると次回から日本語訳付きで届きます。)",
        "",
    ]
    for rank, p in enumerate(top, 1):
        snippet = p["text"].replace("\n", " ").strip()[:200]
        lines.append(f"【{rank}】@{p['author']}  (fit={p['fit']}/5  {p['kind']}  {p['created_at'][:10]})")
        lines.append(f"  URL: {p['url']}")
        lines.append(f"  シグナル断片 (原文・英): {snippet}…")
        if p["bonus"]:
            lines.append(f"  追加マッチ: {', '.join(p['bonus'][:5])}")
        lines.append(_static_opener_hint(p["bonus"]))
        lines.append("")
    if not top:
        lines.append("(直近 7 日に該当シグナル無し)")
    return "\n".join(lines)


def _static_opener_hint(bonus: list[str]) -> str:
    if any(b in bonus for b in ("payment", "billing", "x402", "per-call", "per call", "monetize")):
        return "  opener 切り口: 決済まわりで自分が解いた問題を 1 つ匂わせて、相手の現状を質問する"
    if any(b in bonus for b in ("budget", "cost")):
        return "  opener 切り口: token cost を抑えた具体策を 1 つ共有 → 相手のスケール感を質問"
    return "  opener 切り口: 「I'm building something adjacent — curious how you're handling X right now」型で質問先行"


def run() -> None:
    top, total_fetched = gather_prospects()
    enriched = llm_enrich(top) if top else []

    if enriched is not None and any(e for e in enriched):
        body = format_with_translations(top, enriched, total_fetched)
    else:
        body = format_static_fallback(top, total_fetched)

    print(body)
    post_to_slack("見込み発掘", body)


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        post_to_slack("見込み発掘 (失敗)", f"{today_iso()} 実行失敗: {e}")
        sys.exit(1)
