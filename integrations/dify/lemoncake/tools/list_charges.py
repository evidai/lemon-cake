"""list_charges — GET /api/charges (reconciliation / accounting)."""

from __future__ import annotations

from collections.abc import Generator

import httpx
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.http_client import base_headers, friendly_error, request, resolve_base


class ListChargesTool(Tool):
    def _invoke(self, tool_parameters: dict) -> Generator[ToolInvokeMessage, None, None]:
        try:
            api_base = resolve_base(self.runtime.credentials)
        except ValueError as exc:
            yield self.create_text_message(str(exc))
            return

        jwt = self.runtime.credentials["buyer_jwt"]

        try:
            raw_limit = int(tool_parameters.get("limit") or 20)
        except (TypeError, ValueError):
            raw_limit = 20
        limit = max(1, min(raw_limit, 100))

        try:
            resp = request(
                "GET",
                f"{api_base}/api/charges",
                headers=base_headers(jwt),
                params={"limit": limit},
            )
        except httpx.HTTPError as exc:
            yield self.create_text_message(f"Network error reaching LemonCake: {exc}")
            return

        if resp.status_code >= 400:
            yield self.create_text_message(friendly_error(resp))
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
                f"{len(charges)} charge(s):\n" + "\n".join(lines)
                if lines
                else "No charges yet."
            )
