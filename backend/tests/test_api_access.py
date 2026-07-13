import pytest

from services.api_access import (
    create_recommendation_edit_token,
    issue_api_session,
    validate_api_session,
    validate_recommendation_edit_token,
)


SECRET = "unit-test-signing-secret-000000000000000000000000"


def test_api_session_roundtrip_and_expiry():
    issued = issue_api_session(SECRET, 60, now=1000, session_id="session-test")

    assert validate_api_session(SECRET, issued.cookie_value, issued.csrf_token, now=1059) == (True, "")
    assert validate_api_session(SECRET, issued.cookie_value, "wrong", now=1059) == (False, "invalid_csrf")
    assert validate_api_session(SECRET, issued.cookie_value, issued.csrf_token, now=1060) == (False, "expired_session")


def test_api_session_rejects_short_signing_secret():
    with pytest.raises(ValueError, match="at least 32"):
        issue_api_session("short", 60)


def test_recommendation_edit_token_is_scoped_to_recommendation():
    token = create_recommendation_edit_token(SECRET, "rec-one")

    assert validate_recommendation_edit_token(SECRET, "rec-one", token)
    assert not validate_recommendation_edit_token(SECRET, "rec-two", token)
    assert not validate_recommendation_edit_token(SECRET, "rec-one", "wrong")
