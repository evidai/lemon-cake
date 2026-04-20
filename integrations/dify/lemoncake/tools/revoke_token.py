"""revoke_token — PATCH /api/tokens/{id}/revoke (atomic kill switch)."""

from __future__ import annotations

import re
from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.http_client import base_headers, friendly_error, request, resolve_base

# UUIDv4 / ULID / cuid2 shaped ids. Kept strict enough to block path traversal
# (`..`, `/`) but loose enough to accept any server-side id format we emit.
_TOKEN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class RevokeTokenTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        try:
            api_base = resolve_base(self.runtime.credentials)
        except ValueError as exc:
            yield self.create_text_message(str(exc))
            return

        jwt = self.runtime.credentials["buyer_jwt"]
        token_id = str(tool_parameters.get("token_id") or "").strip()
        if not _TOKEN_ID_RE.fullmatch(token_id):
            yield self.create_text_message(
                "token_id is missing or malformed (expected an opaque id string)."
            )
            return

        try:
            resp = request(
                "PATCH",
                f"{api_base}/api/tokens/{token_id}/revoke",
                headers=base_headers(jwt, idempotency=True),
            )
        except httpx.HTTPError as exc:
            yield self.create_text_message(f"Network error reaching LemonCake: {exc}")
            return

        if resp.status_code == 404:
            yield self.create_text_message(
                f"Token {token_id} not found or not owned by this buyer."
            )
            return
        if resp.status_code == 409:
            yield self.create_text_message(f"Token {token_id} was already revoked.")
            return
        if resp.status_code >= 400:
            yield self.create_text_message(friendly_error(resp))
            return

        yield self.create_json_message(resp.json() if resp.content else {"revoked": True})
        yield self.create_text_message(
            f"✅ Pay Token {token_id} revoked. "
            "Further charges will be rejected atomically (HTTP 422)."
        )
