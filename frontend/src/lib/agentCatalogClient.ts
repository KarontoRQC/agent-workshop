import type { AgentCatalogItem, RecommendationSnapshot } from '../types';
import { API_BASE_URL } from './agentStreamClient';

export class AgentCatalogError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AgentCatalogError';
    this.status = status;
  }
}

export async function fetchAgentCatalog(signal?: AbortSignal): Promise<AgentCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/agents`, { signal });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AgentCatalogError(
      typeof payload?.error === 'string' ? payload.error : `Agent catalog request failed: ${response.status}`,
      response.status,
    );
  }

  return Array.isArray(payload?.agents) ? (payload.agents as AgentCatalogItem[]) : [];
}

export async function appendAgentToRecommendation(
  recommendationId: string,
  agentId: string,
  signal?: AbortSignal,
): Promise<RecommendationSnapshot> {
  const response = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(recommendationId)}/agents`, {
    body: JSON.stringify({ agent_id: agentId }),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AgentCatalogError(
      typeof payload?.error === 'string' ? payload.error : `Recommendation append request failed: ${response.status}`,
      response.status,
    );
  }

  return payload as RecommendationSnapshot;
}
