const DEFAULT_API_BASE_URL = '/api';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeRemoteApiBaseUrl(value: string) {
  const trimmedValue = trimTrailingSlash(value.trim());

  if (!trimmedValue) {
    return '';
  }

  if (/^https?:\/\/[^/]+$/i.test(trimmedValue)) {
    return `${trimmedValue}/api`;
  }

  return trimmedValue;
}

export function resolveApiBaseUrl() {
  const configuredBaseUrl = String(
    import.meta.env.VITE_AGENT_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '',
  ).trim();

  return configuredBaseUrl ? normalizeRemoteApiBaseUrl(configuredBaseUrl) : DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
