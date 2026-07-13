import type { RecommendationSnapshot, RecommendedAgent } from '../types';
import { API_BASE_URL } from './agentStreamClient';
import { fetchApiMutation } from './apiSession';

export class RecommendationSnapshotError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RecommendationSnapshotError';
    this.status = status;
  }
}

export async function fetchRecommendationSnapshot(
  recommendationId: string,
  signal?: AbortSignal,
): Promise<RecommendationSnapshot> {
  const id = recommendationId.trim();

  if (!id) {
    throw new RecommendationSnapshotError('recommendation_id is required', 400);
  }

  const response = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(id)}`, { signal });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RecommendationSnapshotError(
      typeof payload?.error === 'string' ? payload.error : `Recommendation snapshot request failed: ${response.status}`,
      response.status,
    );
  }

  return payload as RecommendationSnapshot;
}

export async function saveRecommendationLineup(
  recommendationId: string,
  lineup: Array<RecommendedAgent | null>,
  score?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RecommendationSnapshot> {
  const id = recommendationId.trim();

  if (!id) {
    throw new RecommendationSnapshotError('recommendation_id is required', 400);
  }

  const response = await fetchApiMutation(
    `${API_BASE_URL}/recommendations/${encodeURIComponent(id)}/lineup`,
    {
      body: JSON.stringify({ lineup, score: score || {} }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'PUT',
      signal,
    },
    { recommendationId: id },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RecommendationSnapshotError(
      typeof payload?.error === 'string' ? payload.error : `Recommendation lineup save request failed: ${response.status}`,
      response.status,
    );
  }

  return payload as RecommendationSnapshot;
}
