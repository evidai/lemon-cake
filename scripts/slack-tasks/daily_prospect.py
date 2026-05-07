"""daily-prospect-finder — pure-script (GitHub Actions) version.

Searches HN comments + stories from last 7d for "building agent" / "mcp" type
signals across multiple per-phrase, per-tag queries (Algolia HN API doesn't
honor OR + multi-tag in one call), dedupes by author, and posts a Japanese
prospect list with opener-angle hints to Slack.
"""

from __future__ import annotations

import sys
import time
import traceback
import urllib.parse

from common import (
    fetch_json,
    keyword_matches,
    post_to_slack,
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


def run() -> None:
    since = int(time.time()) - 7 * 86400
    raw_hits: list[dict] = []
    for phrase in PHRASES:
        for tag in ("comment", "story"):
            raw_hits.extend(fetch_phrase(phrase, tag, since))

    seen_authors: set[str] = set()
    seen_ids: set[str] = set()
    items = []
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
            # base 3 (matched a primary phrase), +1 per scoring keyword, capped at 5
            "fit": min(5, 3 + len(bonus)),
        })
    items.sort(key=lambda x: (-x["fit"], x["author"]))
    top = items[:12]

    lines = [
        f"{today_iso()} 見込み発掘 ({len(items)} 名 / 走査 {len(raw_hits)} ヒット (重複含む))",
        "",
    ]
    for rank, p in enumerate(top, 1):
        snippet = p["text"].replace("\n", " ").strip()[:200]
        lines.append(f"【{rank}】@{p['author']}  (fit={p['fit']}/5  {p['kind']}  {p['created_at'][:10]})")
        lines.append(f"  URL: {p['url']}")
        lines.append(f"  シグナル断片 (原文・英): {snippet}…")
        if p["bonus"]:
            lines.append(f"  追加マッチ: {', '.join(p['bonus'][:5])}")
        lines.append(_opener_hint(p["bonus"]))
        lines.append("")
    if not top:
        lines.append("(直近 7 日に該当シグナル無し — フレーズフィルタが厳しすぎる可能性)")
        lines.append("")
    lines.append("（pure-script 版: opener は静的ヒントのみ。本番 DM は人が書く）")

    body = "\n".join(lines)
    print(body)
    post_to_slack("見込み発掘", body)


def _opener_hint(bonus: list[str]) -> str:
    if any(b in bonus for b in ("payment", "billing", "x402", "per-call", "per call", "monetize")):
        return "  opener 切り口: 決済まわりで自分が解いた問題を 1 つ匂わせて、相手の現状を質問する"
    if any(b in bonus for b in ("budget", "cost")):
        return "  opener 切り口: token cost を抑えた具体策を 1 つ共有 → 相手のスケール感を質問"
    return "  opener 切り口: 「I'm building something adjacent — curious how you're handling X right now」型で質問先行"


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        post_to_slack("見込み発掘 (失敗)", f"{today_iso()} 実行失敗: {e}")
        sys.exit(1)
