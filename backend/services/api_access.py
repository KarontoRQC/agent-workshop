"""Stateless API sessions and recommendation edit capabilities."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import secrets
import time


SESSION_COOKIE_NAME = "agent_session"
CSRF_HEADER_NAME = "X-Agent-CSRF-Token"
RECOMMENDATION_EDIT_HEADER_NAME = "X-Recommendation-Edit-Token"
MIN_SIGNING_SECRET_LENGTH = 32
SESSION_VERSION = "v1"


@dataclass(frozen=True)
class IssuedApiSession:
    cookie_value: str
    csrf_token: str
    expires_at: int


def is_valid_signing_secret(secret: str) -> bool:
    return len(str(secret or "").encode("utf-8")) >= MIN_SIGNING_SECRET_LENGTH


def issue_api_session(secret: str, ttl_seconds: int, *, now: float | None = None, session_id: str | None = None) -> IssuedApiSession:
    _require_signing_secret(secret)
    issued_at = int(time.time() if now is None else now)
    expires_at = issued_at + max(1, int(ttl_seconds))
    normalized_session_id = session_id or secrets.token_urlsafe(24)
    payload = _encode(f"{SESSION_VERSION}:{expires_at}:{normalized_session_id}".encode("utf-8"))
    signature = _sign(secret, f"session:{payload}")

    return IssuedApiSession(
        cookie_value=f"{payload}.{signature}",
        csrf_token=_sign(secret, f"csrf:{payload}"),
        expires_at=expires_at,
    )


def validate_api_session(
    secret: str,
    cookie_value: str,
    csrf_token: str,
    *,
    now: float | None = None,
) -> tuple[bool, str]:
    if not is_valid_signing_secret(secret):
        return False, "configuration"
    if not cookie_value:
        return False, "missing_session"

    try:
        payload, signature = cookie_value.split(".", 1)
    except ValueError:
        return False, "invalid_session"

    if not hmac.compare_digest(signature, _sign(secret, f"session:{payload}")):
        return False, "invalid_session"

    try:
        version, expires_at_text, session_id = _decode(payload).decode("utf-8").split(":", 2)
        expires_at = int(expires_at_text)
    except (ValueError, UnicodeDecodeError):
        return False, "invalid_session"

    if version != SESSION_VERSION or not session_id:
        return False, "invalid_session"
    if expires_at <= int(time.time() if now is None else now):
        return False, "expired_session"
    if not csrf_token or not hmac.compare_digest(csrf_token, _sign(secret, f"csrf:{payload}")):
        return False, "invalid_csrf"

    return True, ""


def create_recommendation_edit_token(secret: str, recommendation_id: str) -> str:
    _require_signing_secret(secret)
    normalized_id = str(recommendation_id or "").strip()

    if not normalized_id:
        raise ValueError("recommendation_id is required")

    return _sign(secret, f"recommendation-edit:{normalized_id}")


def validate_recommendation_edit_token(secret: str, recommendation_id: str, token: str) -> bool:
    if not is_valid_signing_secret(secret) or not token:
        return False

    try:
        expected = create_recommendation_edit_token(secret, recommendation_id)
    except ValueError:
        return False

    return hmac.compare_digest(expected, str(token))


def _require_signing_secret(secret: str) -> None:
    if not is_valid_signing_secret(secret):
        raise ValueError(f"APP_SIGNING_SECRET must contain at least {MIN_SIGNING_SECRET_LENGTH} UTF-8 bytes")


def _sign(secret: str, value: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return _encode(digest)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))
