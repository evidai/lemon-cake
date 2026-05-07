"""xhn-engagement-opportunity-scan — pure-script (GitHub Actions) version.

Fetches HN top stories from last 24h, filters for AI-agent / MCP / payment
relevance, and posts a Japanese digest with comment-angle hints to Slack.
"""

from __future__ import annotations

import sys
import time
import traceback

from common import (
    fetch_json,
    format_item_block,
    keyword_matches,
    post_to_slack,
    today_iso,
)

KEYWORDS = [
    "mcp", "agent", "llm", "claude", "anthropic", "x402", "payment", "billing",
    "stripe", "openai", "sdk", "gpt", "autonomous", "ai-agent", "ai agent",
]


def run() -> None:
    since = int(time.time()) - 86400
    url = (
        "https://hn.algolia.com/api/v1/search"
        f"?tags=story&numericFilters=created_at_i%3E{since}%2Cpoints%3E20"
        "&hitsPerPage=30"
    )
    data = fetch_json(url)
    hits = data.get("hits", [])

    scored = []
    for h in hits:
        text = (h.get("title") or "") + " " + (h.get("url") or "")
        m = keyword_matches(text, KEYWORDS)
        if m:
            scored.append((len(m), h, m))
    scored.sort(key=lambda t: -t[0])
    top = scored[:15]

    lines = [
        f"{today_iso()} X/HN エンゲージメント候補 ({len(scored)} 件 / 走査 {len(hits)} 件中)",
        "",
    ]
    for rank, (_, h, m) in enumerate(top, 1):
        lines.append(
            format_item_block(
                rank=rank,
                title=(h.get("title") or "")[:90],
                url=h.get("url") or "",
                hn_id=h.get("objectID") or "",
                points=h.get("points") or 0,
                comments=h.get("num_comments") or 0,
                matches=m,
            )
        )
        lines.append("")
    if not top:
        lines.append("(本日は関連する直近 24h ストーリーなし)")
        lines.append("")
    lines.append("（pure-script 版: コメント切り口は静的ヒントのみ。本番コメントは人が書く）")

    body = "\n".join(lines)
    print(body)
    post_to_slack("X/HN エンゲージメント候補", body)


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        post_to_slack("X/HN エンゲージメント候補 (失敗)", f"{today_iso()} 実行失敗: {e}")
        sys.exit(1)
