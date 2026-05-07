"""show-hn-launch-monitor — pure-script (GitHub Actions) version.

Fetches Show HN + front page from last 24h, filters for relevance, and posts
a Japanese digest with reaction-angle hints to Slack.
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
    "stripe", "openai", "sdk", "autonomous", "ai-agent", "ai agent", "model context",
    "tool use", "rag", "vector", "retrieval", "copilot", "assistant",
]


def categorize(matches: list[str]) -> str:
    has_payment = any(m in matches for m in ("payment", "billing", "x402", "stripe"))
    has_agent = any(m in matches for m in ("agent", "mcp", "autonomous", "ai-agent", "ai agent"))
    if has_payment and has_agent:
        return "COMPETITOR"
    if has_agent or "model context" in matches:
        return "ADJACENT"
    return "SIGNAL"


def run() -> None:
    since = int(time.time()) - 86400
    url = (
        "https://hn.algolia.com/api/v1/search_by_date"
        f"?tags=(show_hn,front_page)&numericFilters=created_at_i%3E{since}"
        "&hitsPerPage=80"
    )
    data = fetch_json(url)
    hits = data.get("hits", [])

    scored = []
    for idx, h in enumerate(hits):
        text = (h.get("title") or "") + " " + (h.get("story_text") or "") + " " + (h.get("url") or "")
        m = keyword_matches(text, KEYWORDS)
        if not m:
            continue
        is_show = "show_hn" in (h.get("_tags") or [])
        # Sort key: Show HN first, then more matches, then stable by index. idx breaks ties so dicts never compare.
        scored.append(((not is_show, -len(m), idx), h, m, is_show))
    scored.sort(key=lambda t: t[0])
    top = scored[:12]

    lines = [
        f"{today_iso()} Show HN / 新着ローンチ監視 ({len(scored)} 件 / 走査 {len(hits)} 件中)",
        "",
    ]
    for rank, (_, h, m, is_show) in enumerate(top, 1):
        prefix = "[Show HN] " if is_show else "[FrontPage] "
        title = prefix + (h.get("title") or "")[:90]
        lines.append(
            format_item_block(
                rank=rank,
                title=title,
                url=h.get("url") or "",
                hn_id=h.get("objectID") or "",
                points=h.get("points") or 0,
                comments=h.get("num_comments") or 0,
                matches=m,
                category=categorize(m),
            )
        )
        if h.get("author"):
            lines.append(f"  by @{h['author']}")
        lines.append("")
    if not top:
        lines.append("(本日は関連する Show HN / フロントページ記事なし)")
        lines.append("")
    lines.append("（pure-script 版: 反応切り口は静的ヒントのみ。本番コメントは人が書く）")

    body = "\n".join(lines)
    print(body)
    post_to_slack("Show HN / 新着ローンチ監視", body)


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        post_to_slack("Show HN 監視 (失敗)", f"{today_iso()} 実行失敗: {e}")
        sys.exit(1)
