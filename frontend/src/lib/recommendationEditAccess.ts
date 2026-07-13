const EDIT_TOKEN_STORAGE_PREFIX = 'jarvis:recommendation-edit:';

function storageKey(recommendationId: string) {
  return `${EDIT_TOKEN_STORAGE_PREFIX}${recommendationId.trim()}`;
}

export function storeRecommendationEditToken(recommendationId: string, token: string) {
  const id = recommendationId.trim();
  const normalizedToken = token.trim();

  if (!id || !normalizedToken || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey(id), normalizedToken);
}

export function getRecommendationEditToken(recommendationId: string) {
  const id = recommendationId.trim();

  if (!id || typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(storageKey(id))?.trim() || '';
}

export function hasRecommendationEditAccess(recommendationId: string) {
  return Boolean(getRecommendationEditToken(recommendationId));
}
