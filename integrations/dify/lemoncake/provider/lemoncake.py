"""LemonCake provider — validates the Buyer JWT against the LemonCake API.

Runs once when a workspace admin installs the plugin and enters credentials.
Defense in depth:

* Reject plaintext (non-HTTPS) `api_base_url` values so the Buyer JWT never
  leaves the host unencrypted.
* Do not echo the JWT, `api_base_url`, or server response body back to the
  user — only the HTTP status and a short diagnostic string.
* Short timeouts (connect 5 s / read 10 s) so a hung upstream can't stall the
  plugin install flow.
"""

from __future__ import annotations

import httpx
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError


_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
_UA = "lemoncake-dify/0.0.2 (+https://lemoncake.xyz)"


class LemonCakeProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict) -> None:
        api_base = (credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
        jwt = credentials.get("buyer_jwt")
        if not jwt:
            raise ToolProviderCredentialValidationError("Buyer JWT is required.")

        if (
            not api_base.startswith("https://")
            and "localhost" not in api_base
            and "127.0.0.1" not in api_base
        ):
            raise ToolProviderCredentialValidationError(
                "api_base_url must use HTTPS — sending a Buyer JWT over "
                "plaintext transport would expose it."
            )

        try:
            with httpx.Client(timeout=_TIMEOUT, follow_redirects=False) as client:
                resp = client.get(
                    f"{api_base}/api/auth/me",
                    headers={
                        "Authorization": f"Bearer {jwt}",
                        "User-Agent": _UA,
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError as exc:
            raise ToolProviderCredentialValidationError(
                f"Could not reach LemonCake API at {api_base}: {exc}"
            ) from exc

        if resp.status_code == 401:
            raise ToolProviderCredentialValidationError(
                "Buyer JWT was rejected by the LemonCake API (401). "
                "Re-issue the token in Dashboard → Settings → API."
            )
        if resp.status_code == 403:
            raise ToolProviderCredentialValidationError(
                "Buyer account is suspended (403). "
                "Contact contact@aievid.com to reinstate."
            )
        if resp.status_code >= 500:
            raise ToolProviderCredentialValidationError(
                f"LemonCake API returned {resp.status_code}. Try again shortly."
            )
        if resp.status_code >= 400:
            raise ToolProviderCredentialValidationError(
                f"LemonCake API rejected the credentials ({resp.status_code})."
            )
