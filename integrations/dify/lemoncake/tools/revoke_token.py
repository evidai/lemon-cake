"""revoke_token — PATCH /api/tokens/{id}/revoke (atomic kill switch)"""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage


class RevokeTokenTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        api_base = (self.runtime.credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = self.runtime.credentials["buyer_jwt"]
        token_id = tool_parameters["token_id"]

        resp = httpx.patch(
            f"{api_base}/api/tokens/{token_id}/revoke",
            headers={"Authorization": f"Bearer {jwt}"},
            timeout=15.0,
        )

        if resp.status_code == 404:
            yield self.create_text_message(
                f"Token {token_id} not found or not owned by this buyer."
            )
            return
        if resp.status_code == 409:
            yield self.create_text_message(
                f"Token {token_id} was already revoked."
            )
            return
        if resp.status_code >= 400:
            yield self.create_text_message(
                f"LemonCake API error {resp.status_code}: {resp.text}"
            )
            return

        yield self.create_json_message(resp.json() if resp.content else {"revoked": True})
        yield self.create_text_message(
            f"✅ Pay Token {token_id} revoked. Any further charges will be rejected (HTTP 422)."
        )
