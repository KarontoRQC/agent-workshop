import type { CombinationAgent, RecommendedAgent } from '../types';
import { API_BASE_URL } from './agentStreamClient';
import { fetchApiMutation } from './apiSession';

export class CombinationAgentError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CombinationAgentError';
    this.status = status;
  }
}

export async function fetchCombinationAgentByRecommendation(
  recommendationId: string,
  signal?: AbortSignal,
): Promise<CombinationAgent | null> {
  const id = recommendationId.trim();

  if (!id) {
    throw new CombinationAgentError('recommendation_id is required', 400);
  }

  const response = await fetch(
    `${API_BASE_URL}/combination-agents/by-recommendation/${encodeURIComponent(id)}?optional=1`,
    { signal },
  );

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new CombinationAgentError(
      typeof payload?.error === 'string' ? payload.error : `Combination agent request failed: ${response.status}`,
      response.status,
    );
  }

  if (payload === null) {
    return null;
  }

  return payload as CombinationAgent;
}

export async function saveCombinationAgentForRecommendation(
  recommendationId: string,
  {
    lineup,
    score,
    title,
  }: {
    lineup: Array<RecommendedAgent | null>;
    score?: Record<string, unknown>;
    title?: string;
  },
  signal?: AbortSignal,
): Promise<CombinationAgent> {
  const id = recommendationId.trim();

  if (!id) {
    throw new CombinationAgentError('recommendation_id is required', 400);
  }

  const response = await fetchApiMutation(
    `${API_BASE_URL}/combination-agents/by-recommendation/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify({ lineup, score: score || {}, title: title || '' }),
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
    throw new CombinationAgentError(
      typeof payload?.error === 'string' ? payload.error : `Combination agent save request failed: ${response.status}`,
      response.status,
    );
  }

  return payload as CombinationAgent;
}
