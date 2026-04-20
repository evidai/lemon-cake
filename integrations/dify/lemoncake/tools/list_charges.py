"""list_charges — GET /api/charges"""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage


class ListChargesTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        api_base = (self.runtime.credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = self.runtime.credentials["buyer_jwt"]
        limit = max(1, min(int(tool_parameters.get("limit") or 20), 100))

        resp = httpx.get(
            f"{api_base}/api/charges",
            params={"limit": limit},
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

        charges = data.get("charges") if isinstance(data, dict) else data
        if isinstance(charges, list):
            lines = [
                f"- {c.get('serviceId')} · {c.get('amountUsdc')} USDC · {c.get('createdAt')}"
                + (" [sandbox]" if c.get("sandbox") else "")
                for c in charges[:limit]
            ]
            yield self.create_text_message(
                f"{len(charges)} charge(s):\n" + "\n".join(lines) if lines else "No charges yet."
            )
