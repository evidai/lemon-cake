"""Shared helpers for scheduled Slack-delivery tasks running on GitHub Actions.

stdlib-only by design — works in any Python 3.9+ environment without `pip install`.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

DEFAULT_TIMEOUT = 20


def fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """GET a JSON URL with sensible defaults. Raises on HTTP error."""
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "lemon-cake-slack-task/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def post_to_slack(title: str, body: str) -> None:
    """POST a message to Slack via the webhook in env $SLACK_WEBHOOK_URL.

    No-op (with a warning) if the env var is missing — so a misconfigured workflow
    never fails the whole run.
    """
    webhook = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    if not webhook:
        print("warning: SLACK_WEBHOOK_URL not set — skipping Slack post", file=sys.stderr)
        return

    # Slack's text limit is 40000; leave headroom.
    max_len = 35000
    if len(body) > max_len:
        body = body[:max_len] + "\n…(以下省略)"

    payload = json.dumps({"text": f"*{title}*\n{body}"}).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
    except urllib.error.HTTPError as e:
        print(f"slack-notify: HTTP {e.code} — {e.read().decode('utf-8', errors='replace')[:200]}", file=sys.stderr)
        raise


def today_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def keyword_matches(text: str, keywords: list[str]) -> list[str]:
    """Return the subset of `keywords` that appear (case-insensitive substring) in `text`."""
    low = (text or "").lower()
    return [k for k in keywords if k.lower() in low]


def comment_angle_hint(matches: list[str], category: str) -> str:
    """Static templated hint based on matched keywords.

    Pure-script mode has no LLM, so we generate hints from a small lookup table
    rather than fabricating angles. The user reads the hint as a starting point
    and writes the actual comment themselves.
    """
    if not matches:
        return "(該当なし)"
    has_payment = any(m in matches for m in ("payment", "billing", "x402", "stripe"))
    has_agent = any(m in matches for m in ("agent", "mcp", "autonomous", "ai-agent", "ai agent"))
    has_llm = any(m in matches for m in ("llm", "claude", "anthropic", "openai", "gpt", "sdk"))
    if has_payment and has_agent:
        return "コメント切り口: エージェントの per-call 課金で自分が踏んだ実装上の罠を 1 つ共有 (型を質問でなく経験で開く)"
    if has_agent and has_llm:
        return "コメント切り口: MCP / agent 周りで自分が試した具体的な構成 (失敗含む) を 1 段落で書く"
    if has_payment:
        return "コメント切り口: 決済まわりの実装で「ドキュメントに書いてない落とし穴」を 1 つ書く"
    if has_agent:
        return "コメント切り口: 自分が今直面しているエージェント実装上の課題を 1 つ質問形式で書く"
    if has_llm:
        return "コメント切り口: 元投稿の主張に対して、自分が観測した補強データ or 反例を 1 段落で出す"
    return f"コメント切り口: マッチしたキーワード ({', '.join(matches[:3])}) のうち最も自分の経験に近いものから入る"


def format_item_block(rank: int, title: str, url: str, hn_id: str, points: int, comments: int, matches: list[str], category: str = "") -> str:
    """Format a single digest entry in the standard Japanese-first layout.

    Title is the original English (we don't have an LLM in pure-script mode), so we
    prefix `(原題)` to make the reader's mental model clear: anything after that prefix
    is verbatim English from the source.
    """
    lines = [
        f"【{rank}】(原題) {title}  ({points}pt / {comments}c)",
    ]
    if category:
        lines.append(f"  カテゴリ: {category}")
    if matches:
        lines.append(f"  マッチキーワード: {', '.join(matches[:5])}")
    if url:
        lines.append(f"  URL: {url}")
    if hn_id:
        lines.append(f"  HN: https://news.ycombinator.com/item?id={hn_id}")
    lines.append(f"  {comment_angle_hint(matches, category)}")
    return "\n".join(lines)
