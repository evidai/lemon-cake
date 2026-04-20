"""check_balance — GET /api/auth/me (authenticated buyer payload)."""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.http_client import base_headers, friendly_error, request, resolve_base


class CheckBalanceTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        try:
            api_base = resolve_base(self.runtime.credentials)
        except ValueError as exc:
            yield self.create_text_message(str(exc))
            return

        jwt = self.runtime.credentials["buyer_jwt"]

        try:
            resp = request(
                "GET",
                f"{api_base}/api/auth/me",
                headers=base_headers(jwt),
            )
        except httpx.HTTPError as exc:
            yield self.create_text_message(f"Network error reaching LemonCake: {exc}")
            return

        if resp.status_code >= 400:
            yield self.create_text_message(friendly_error(resp))
            return

        data = resp.json()
        yield self.create_json_message(data)

        buyer = data.get("buyer") if isinstance(data, dict) else None
        if buyer:
            suspended = " · ⚠ SUSPENDED" if buyer.get("suspended") else ""
            yield self.create_text_message(
                f"Balance: {buyer.get('balanceUsdc', '0')} USDC · "
                f"KYA tier: {buyer.get('kycTier', 'NONE')} · "
                f"daily limit: {buyer.get('dailyLimitUsdc', '?')} USDC" + suspended
            )
