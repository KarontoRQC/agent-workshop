import assert from 'node:assert/strict';

export async function createNodeApiSession(baseUrl) {
  const apiBaseUrl = normalizeApiBaseUrl(baseUrl);
  const response = await fetch(`${apiBaseUrl}/session`, { method: 'POST' });
  const payload = await response.json().catch(() => null);

  assert.equal(response.status, 200, `API session returned HTTP ${response.status}`);
  assert.ok(String(payload?.csrf_token || '').trim(), 'API session returned no CSRF token');
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';', 1)[0];
  assert.ok(cookie.includes('='), 'API session returned no cookie');

  return {
    apiBaseUrl,
    cookie,
    csrfToken: String(payload.csrf_token),
    expiresAt: Number(payload.expires_at || 0),
  };
}

export function nodeApiHeaders(session, headers = {}, recommendationEditToken = '') {
  const nextHeaders = new Headers(headers);
  nextHeaders.set('cookie', session.cookie);
  nextHeaders.set('x-agent-csrf-token', session.csrfToken);

  if (recommendationEditToken) {
    nextHeaders.set('x-recommendation-edit-token', recommendationEditToken);
  }

  return nextHeaders;
}

export function fetchWithNodeApiSession(session, input, init = {}, recommendationEditToken = '') {
  return fetch(input, {
    ...init,
    headers: nodeApiHeaders(session, init.headers, recommendationEditToken),
  });
}

function normalizeApiBaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}
