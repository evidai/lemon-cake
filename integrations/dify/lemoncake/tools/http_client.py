"""Shared HTTP client for LemonCake Dify tools.

Hardening applied here so every tool benefits:

* Fixed User-Agent so our traffic is identifiable in LemonCake request logs.
* Single-source default timeout (20 s connect+read) — overridable per call.
* Automatic retry with exponential backoff on 429 / 502 / 503 / 504 (max 2 retries).
* Structured error parser that surfaces the JSON error shape returned by the
  LemonCake API (`{error, message, code}`) instead of leaking the raw body.
* Optional ``Idempotency-Key`` injector for POST endpoints so network retries
  never double-charge or double-mint a Pay Token.
* Hard cap on response size (1 MiB) as a defense-in-depth measure — we never
  expect a buyer-scoped endpoint to return more than a few KB.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Mapping

import httpx

PLUGIN_UA = "lemoncake-dify/0.0.4 (+https://lemoncake.xyz)"
DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=5.0)
MAX_RESPONSE_BYTES = 1 * 1024 * 1024
RETRYABLE_STATUSES = {429, 502, 503, 504}
MAX_RETRIES = 2


def base_headers(jwt: str, *, idempotency: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {jwt}",
        "User-Agent": PLUGIN_UA,
        "Accept": "application/json",
    }
    if idempotency:
        headers["Idempotency-Key"] = str(uuid.uuid4())
    return headers


def resolve_base(credentials: Mapping[str, Any]) -> str:
    api_base = (credentials.get("api_base_url") or "https://api.lemoncake.xyz").rstrip("/")
    if not api_base.startswith("https://") and "localhost" not in api_base and "127.0.0.1" not in api_base:
        # Refuse to transmit a Buyer JWT over plaintext to a non-loopback host.
        raise ValueError(
            f"api_base_url must be HTTPS (got {api_base!r}). "
            "Plaintext transport would expose the Buyer JWT."
        )
    return api_base


def request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    json: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    timeout: httpx.Timeout | float | None = None,
) -> httpx.Response:
    """Send an HTTP request with retry + size cap. Raises httpx errors on network failure."""
    last_exc: Exception | None = None
    backoff = 0.5
    for attempt in range(MAX_RETRIES + 1):
        try:
            with httpx.Client(timeout=timeout or DEFAULT_TIMEOUT, follow_redirects=False) as client:
                resp = client.request(method, url, headers=headers, json=json, params=params)
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt >= MAX_RETRIES:
                raise
            time.sleep(backoff)
            backoff *= 2
            continue

        if resp.status_code in RETRYABLE_STATUSES and attempt < MAX_RETRIES:
            retry_after = resp.headers.get("Retry-After")
            try:
                sleep_for = float(retry_after) if retry_after else backoff
            except ValueError:
                sleep_for = backoff
            time.sleep(min(sleep_for, 10.0))
            backoff *= 2
            continue

        # Defense-in-depth: cap response body.
        if len(resp.content) > MAX_RESPONSE_BYTES:
            raise httpx.HTTPError(
                f"LemonCake API returned {len(resp.content)} bytes, exceeds {MAX_RESPONSE_BYTES}."
            )
        return resp

    assert last_exc is not None
    raise last_exc


def friendly_error(resp: httpx.Response) -> str:
    """Convert a non-2xx response into a short, user-safe error string.

    Avoids dumping the raw body (which may contain stack traces or request
    echoes in non-prod environments)."""
    try:
        payload = resp.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        msg = payload.get("message") or payload.get("error") or payload.get("detail")
        code = payload.get("code")
        if msg:
            return f"LemonCake API {resp.status_code}"\
                + (f" [{code}]" if code else "") + f": {str(msg)[:200]}"
    return f"LemonCake API error {resp.status_code}."
