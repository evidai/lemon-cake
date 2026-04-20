"""issue_pay_token — POST /api/tokens"""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage


class IssuePayTokenTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        api_base = (self.runtime.credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = self.runtime.credentials["buyer_jwt"]

        body = {
            "serviceId": tool_parameters["service_id"],
            "limitUsdc": str(tool_parameters["limit_usdc"]),
            "expiresInSeconds": int(tool_parameters.get("expires_in_seconds") or 86400),
            "sandbox": bool(tool_parameters.get("sandbox") or False),
        }

        resp = httpx.post(
            f"{api_base}/api/tokens",
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=20.0,
        )

        if resp.status_code >= 400:
            yield self.create_text_message(
                f"LemonCake API error {resp.status_code}: {resp.text}"
            )
            return

        data = resp.json()
        yield self.create_json_message(data)
        yield self.create_text_message(
            f"Issued Pay Token for {body['serviceId']} (limit {body['limitUsdc']} USDC, expires in {body['expiresInSeconds']}s)."
        )
