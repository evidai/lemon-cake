"""issue_pay_token — POST /api/tokens (Idempotency-Key enforced)."""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.http_client import base_headers, friendly_error, request, resolve_base


class IssuePayTokenTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        try:
            api_base = resolve_base(self.runtime.credentials)
        except ValueError as exc:
            yield self.create_text_message(str(exc))
            return

        jwt = self.runtime.credentials["buyer_jwt"]

        service_id = str(tool_parameters.get("service_id") or "").strip()
        if not service_id:
            yield self.create_text_message("service_id is required.")
            return

        limit_usdc = str(tool_parameters.get("limit_usdc") or "").strip()
        if not limit_usdc:
            yield self.create_text_message("limit_usdc is required.")
            return

        try:
            expires_in = int(tool_parameters.get("expires_in_seconds") or 86400)
        except (TypeError, ValueError):
            yield self.create_text_message("expires_in_seconds must be an integer.")
            return
        # Clamp to server-side allowed range so the agent can't mint
        # 100-year tokens by passing absurd values.
        expires_in = max(60, min(expires_in, 2_592_000))

        body = {
            "serviceId": service_id,
            "limitUsdc": limit_usdc,
            "expiresInSeconds": expires_in,
            "sandbox": bool(tool_parameters.get("sandbox") or False),
        }

        try:
            resp = request(
                "POST",
                f"{api_base}/api/tokens",
                headers=base_headers(jwt, idempotency=True),
                json=body,
            )
        except httpx.HTTPError as exc:
            yield self.create_text_message(f"Network error reaching LemonCake: {exc}")
            return

        if resp.status_code >= 400:
            yield self.create_text_message(friendly_error(resp))
            return

        payload = resp.json()
        yield self.create_json_message(payload)

        token_id = payload.get("tokenId") if isinstance(payload, dict) else None
        expires_at = payload.get("expiresAt") if isinstance(payload, dict) else None
        yield self.create_text_message(
            f"Issued Pay Token {token_id or '(id unknown)'} for {service_id} "
            f"(limit {limit_usdc} USDC, expires {expires_at or f'in {expires_in}s'}"
            + (", sandbox" if body["sandbox"] else "")
            + "). Use the returned `jwt` field as the Bearer token on the paid call."
        )
