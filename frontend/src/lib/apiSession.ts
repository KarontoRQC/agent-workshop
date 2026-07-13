import { API_BASE_URL } from './apiBase';
import { getRecommendationEditToken } from './recommendationEditAccess';

const SESSION_CACHE_KEY = 'jarvis:api-session';
const SESSION_REFRESH_MARGIN_SECONDS = 30;

type SessionCache = {
  csrfToken: string;
  expiresAt: number;
};

type ApiMutationOptions = {
  recommendationId?: string;
};

let sessionRequest: Promise<SessionCache> | null = null;

export class ApiSessionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiSessionError';
    this.status = status;
  }
}

export async function fetchApiMutation(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiMutationOptions = {},
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await ensureApiSession();
    const headers = new Headers(init.headers);
    headers.set('X-Agent-CSRF-Token', session.csrfToken);

    if (options.recommendationId) {
      const editToken = getRecommendationEditToken(options.recommendationId);

      if (editToken) {
        headers.set('X-Recommendation-Edit-Token', editToken);
      }
    }

    const response = await fetch(input, {
      ...init,
      credentials: 'same-origin',
      headers,
    });

    if (response.status !== 401 || attempt > 0) {
      return response;
    }

    clearApiSessionCache();
  }

  throw new ApiSessionError('API session could not be established', 401);
}

export async function ensureApiSession() {
  const cached = readSessionCache();

  if (cached) {
    return cached;
  }

  if (!sessionRequest) {
    sessionRequest = createApiSession().finally(() => {
      sessionRequest = null;
    });
  }

  return sessionRequest;
}

export function clearApiSessionCache() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(SESSION_CACHE_KEY);
  }
}

async function createApiSession(): Promise<SessionCache> {
  const response = await fetch(`${API_BASE_URL}/session`, {
    credentials: 'same-origin',
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiSessionError(
      typeof payload?.error === 'string' ? payload.error : `API session request failed: ${response.status}`,
      response.status,
    );
  }

  const csrfToken = typeof payload?.csrf_token === 'string' ? payload.csrf_token.trim() : '';
  const expiresAt = Number(payload?.expires_at || 0);

  if (!csrfToken || !Number.isFinite(expiresAt)) {
    throw new ApiSessionError('API session response is incomplete', 502);
  }

  const session = { csrfToken, expiresAt };
  writeSessionCache(session);
  return session;
}

function readSessionCache(): SessionCache | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_CACHE_KEY) || 'null') as Partial<SessionCache> | null;
    const csrfToken = typeof parsed?.csrfToken === 'string' ? parsed.csrfToken.trim() : '';
    const expiresAt = Number(parsed?.expiresAt || 0);

    if (csrfToken && expiresAt > Date.now() / 1000 + SESSION_REFRESH_MARGIN_SECONDS) {
      return { csrfToken, expiresAt };
    }
  } catch {
    // A malformed cache is replaced by a fresh server session.
  }

  clearApiSessionCache();
  return null;
}

function writeSessionCache(session: SessionCache) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  }
}
