"""LemonCake provider — validates the Buyer JWT against the LemonCake API.

Runs once when a workspace admin installs the plugin and enters credentials.
"""

from __future__ import annotations

import httpx
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError


class LemonCakeProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict) -> None:
        api_base = (credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = credentials.get("buyer_jwt")
        if not jwt:
            raise ToolProviderCredentialValidationError("Buyer JWT is required.")

        try:
            # Hit a cheap authenticated endpoint to verify the token
            resp = httpx.get(
                f"{api_base}/api/auth/me",
                headers={"Authorization": f"Bearer {jwt}"},
                timeout=10.0,
            )
        except httpx.HTTPError as exc:
            raise ToolProviderCredentialValidationError(
                f"Could not reach LemonCake API at {api_base}: {exc}"
            ) from exc

        if resp.status_code == 401:
            raise ToolProviderCredentialValidationError(
                "Buyer JWT was rejected by the LemonCake API (401)."
            )
        if resp.status_code >= 500:
            raise ToolProviderCredentialValidationError(
                f"LemonCake API returned {resp.status_code}. Try again shortly."
            )
