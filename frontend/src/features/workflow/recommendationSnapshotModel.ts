import type { RecommendationSnapshot, RecommendedAgent } from '../../types';

export function getAgentCombinationEntryIdFromUrl(url: string) {
  try {
    const searchParams = new URL(url).searchParams;

    if (searchParams.get('agent_combination') !== '1') {
      return '';
    }

    return searchParams.get('id')?.trim() || '';
  } catch {
    return '';
  }
}

export function shouldPollRecommendationSnapshot(snapshot: Pick<RecommendationSnapshot, 'status'> | null | undefined) {
  return snapshot?.status === 'streaming';
}

export function snapshotToRecommendedAgents(snapshot: RecommendationSnapshot | null | undefined): RecommendedAgent[] {
  if (!snapshot) {
    return [];
  }

  const fallbackStreamStatus = snapshot.status === 'streaming' ? 'streaming' : 'completed';

  return snapshot.agents.map((agent) => ({
    ...agent,
    streamStatus: agent.streamStatus || fallbackStreamStatus,
  }));
}
