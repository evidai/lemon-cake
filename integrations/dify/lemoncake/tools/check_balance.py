"""check_balance — GET /api/auth/me (authenticated buyer payload)"""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage


class CheckBalanceTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        api_base = (self.runtime.credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = self.runtime.credentials["buyer_jwt"]

        resp = httpx.get(
            f"{api_base}/api/auth/me",
            headers={"Authorization": f"Bearer {jwt}"},
            timeout=15.0,
        )

        if resp.status_code >= 400:
            yield self.create_text_message(
                f"LemonCake API error {resp.status_code}: {resp.text}"
            )
            return

        data = resp.json()
        yield self.create_json_message(data)

        buyer = data.get("buyer") if isinstance(data, dict) else None
        if buyer:
            yield self.create_text_message(
                f"Balance: {buyer.get('balanceUsdc', '0')} USDC · "
                f"KYA tier: {buyer.get('kycTier', 'NONE')} · "
                f"daily limit: {buyer.get('dailyLimitUsdc', '?')} USDC"
            )
