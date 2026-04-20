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

        payload = resp.json()
        yield self.create_json_message(payload)

        # Real API shape: {data: [...], total, page}. Fall back to legacy
        # `charges` key defensively in case the API adds it later.
        charges = None
        if isinstance(payload, dict):
            charges = payload.get("data") or payload.get("charges")
        elif isinstance(payload, list):
            charges = payload

        if isinstance(charges, list):
            lines = [
                f"- {c.get('serviceId')} · {c.get('amountUsdc')} USDC · {c.get('createdAt')}"
                + (" [sandbox]" if c.get("sandbox") else "")
                for c in charges[:limit]
            ]
            total = payload.get("total") if isinstance(payload, dict) else len(charges)
            header = f"{len(charges)} charge(s)"
            if isinstance(total, int) and total > len(charges):
                header += f" of {total}"
            yield self.create_text_message(
                f"{header}:\n" + "\n".join(lines) if lines else "No charges yet."
            )
