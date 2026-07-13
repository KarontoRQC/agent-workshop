"""HTTP access checks shared by protected API routes."""

from __future__ import annotations

from dataclasses import replace

from flask import current_app, jsonify, request

from config import ApiSecuritySettings, get_api_security_settings
from services.api_access import (
    CSRF_HEADER_NAME,
    RECOMMENDATION_EDIT_HEADER_NAME,
    SESSION_COOKIE_NAME,
    is_valid_signing_secret,
    validate_api_session,
    validate_recommendation_edit_token,
)


TEST_SIGNING_SECRET = "test-only-agent-api-signing-secret-0000000000000000"


def get_active_security_settings() -> ApiSecuritySettings:
    settings = current_app.config.get("API_SECURITY_SETTINGS") or get_api_security_settings()

    if current_app.config.get("TESTING") and not is_valid_signing_secret(settings.signing_secret):
        return replace(settings, signing_secret=TEST_SIGNING_SECRET)

    return settings


def require_api_session():
    if current_app.config.get("TESTING") and not current_app.config.get("ENFORCE_TEST_API_SECURITY"):
        return None

    settings = get_active_security_settings()
    valid, reason = validate_api_session(
        settings.signing_secret,
        request.cookies.get(SESSION_COOKIE_NAME, ""),
        request.headers.get(CSRF_HEADER_NAME, ""),
    )

    if valid:
        return None
    if reason == "configuration":
        current_app.logger.error("API signing secret is not configured")
        return jsonify({"error": "API access is not configured"}), 503
    if reason == "invalid_csrf":
        return jsonify({"error": "invalid API request token"}), 403

    return jsonify({"error": "API session is required"}), 401


def require_recommendation_edit_access(recommendation_id: str):
    if current_app.config.get("TESTING") and not current_app.config.get("ENFORCE_TEST_API_SECURITY"):
        return None

    session_error = require_api_session()

    if session_error is not None:
        return session_error

    settings = get_active_security_settings()
    edit_token = request.headers.get(RECOMMENDATION_EDIT_HEADER_NAME, "")

    if not validate_recommendation_edit_token(settings.signing_secret, recommendation_id, edit_token):
        return jsonify({"error": "recommendation is read-only"}), 403

    return None
