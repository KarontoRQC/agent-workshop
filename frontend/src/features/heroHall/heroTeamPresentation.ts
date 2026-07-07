import type { EnrichedDrawAgent } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';

type PresentableHeroTeamAgent = {
  agent: RecommendedAgent;
  enrichedAgent: Pick<EnrichedDrawAgent, 'fallbackReason' | 'stageLabel'>;
  key: string;
  name: string;
};

export type HeroTeamPresentation = {
  dotCount: number;
  lineupLabel: string;
  metricLabel: string;
  rankLabel: string;
  reason: string;
  stage: string;
};

const LINEUP_LABELS: Record<string, string> = {
  conversion: '成交阵容',
  core: '核心阵容',
  growth: '增长阵容',
};

export function getHeroTeamPresentation(agent: PresentableHeroTeamAgent, index: number): HeroTeamPresentation {
  return {
    dotCount: 3,
    lineupLabel: getLineupLabel(agent.agent.lineup || agent.agent.lineup_id || agent.agent.lineupId),
    metricLabel: '推荐序位',
    rankLabel: formatRank(agent.agent.rank, index),
    reason: firstText(agent.agent.reason) || '推荐理由生成中',
    stage: firstText(agent.agent.stage) || '推荐生成中',
  };
}

function getLineupLabel(value: unknown) {
  const lineup = firstText(value);

  return LINEUP_LABELS[lineup] || lineup || '推荐阵容';
}

function formatRank(rank: unknown, index: number) {
  const rankText = firstText(rank);
  const rankNumber = Number.parseInt(rankText, 10);
  const fallbackNumber = index + 1;
  const displayNumber = Number.isFinite(rankNumber) && rankNumber > 0 ? rankNumber : fallbackNumber;

  return String(displayNumber).padStart(2, '0');
}

function firstText(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}
