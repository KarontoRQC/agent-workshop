import type { EnrichedDrawAgent } from '../../lib/agentLaunchCatalog';
import type { RecommendationSnapshot } from '../../types';

export const AGENT_LINEUP_SLOT_COUNT = 5;

export type AgentCombinationSceneCard = {
  agents: EnrichedDrawAgent[];
  cover: string;
  label: string;
};

export type AgentLineupScoreMetric = {
  description: string;
  id: string;
  label: string;
  score: number;
};

export type AgentLineupScore = {
  coverageLabels: string[];
  filledCount: number;
  grade: string;
  metrics: AgentLineupScoreMetric[];
  synergyTags: string[];
  total: number;
};

export type AgentLineupScoreOptions = {
  recommendedAgentKeys?: Set<string>;
};

export const ALL_AGENT_LINEUP_CATEGORY_ID = 'all';

export type AgentLineupCategory = {
  count: number;
  id: string;
  label: string;
  variant: 'all' | 'recommended' | 'selected' | 'stage';
};

export function createSceneCards(agents: EnrichedDrawAgent[]): AgentCombinationSceneCard[] {
  const grouped = new Map<string, EnrichedDrawAgent[]>();

  for (const agent of agents) {
    const label = String(agent.function || agent.stageLabel || '精选场景').trim();
    const current = grouped.get(label) || [];

    if (current.length < 3) {
      grouped.set(label, [...current, agent]);
    }
  }

  return Array.from(grouped.entries())
    .filter(([, sceneAgents]) => sceneAgents.length > 0)
    .slice(0, 8)
    .map(([label, sceneAgents]) => ({
      agents: sceneAgents,
      cover: sceneAgents.find((agent) => agent.avatar)?.avatar || '',
      label,
    }));
}

export function getSnapshotStatusText({
  catalogLoading,
  error,
  loading,
  snapshot,
}: {
  catalogLoading: boolean;
  error: string;
  loading: boolean;
  snapshot: RecommendationSnapshot | null;
}) {
  if (error) {
    return '没有读取到这个 id 对应的推荐快照。';
  }

  if (loading || catalogLoading) {
    return '正在同步推荐组合和智能体目录。';
  }

  if (snapshot?.status === 'streaming') {
    return '推荐还在生成中，页面会自动轮询并更新新的智能体入口。';
  }

  if (snapshot?.status === 'failed') {
    return '本次推荐生成失败，下面仅展示已经保存到快照里的可用入口。';
  }

  return '星图快照已锁定，本次推荐英雄阵列已进入殿堂。';
}

export function getEntryTitle(snapshot: RecommendationSnapshot | null) {
  const entryTitle = typeof snapshot?.entry_title === 'string' ? snapshot.entry_title.trim() : '';

  return entryTitle || '智能体组合入口';
}

export function getAgentCombinationKey(agent: EnrichedDrawAgent) {
  return String(agent.id || agent.agent_id || agent.agentKey || agent.launchTarget || agent.name).trim();
}

export function createInitialLineupKeys(agents: EnrichedDrawAgent[]) {
  const seen = new Set<string>();
  const keys = agents
    .map(getAgentCombinationKey)
    .filter((key) => {
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, AGENT_LINEUP_SLOT_COUNT);

  return padLineupKeys(keys);
}

export function padLineupKeys(keys: string[]) {
  return Array.from({ length: AGENT_LINEUP_SLOT_COUNT }, (_, index) => keys[index] || '');
}

export function createAgentLineupCategories({
  agents,
  recommendedAgentKeys,
  selectedAgentKeys,
}: {
  agents: EnrichedDrawAgent[];
  recommendedAgentKeys: Set<string>;
  selectedAgentKeys: Set<string>;
}): AgentLineupCategory[] {
  const recommendedCount = agents.filter((agent) => recommendedAgentKeys.has(getAgentCombinationKey(agent))).length;
  const selectedCount = agents.filter((agent) => selectedAgentKeys.has(getAgentCombinationKey(agent))).length;
  const stageCategories = new Map<string, AgentLineupCategory>();

  for (const agent of agents) {
    const label = getAgentLineupCategoryLabel(agent);
    const id = getAgentLineupCategoryId(label);
    const category = stageCategories.get(id);

    if (category) {
      category.count += 1;
    } else {
      stageCategories.set(id, {
        count: 1,
        id,
        label,
        variant: 'stage',
      });
    }
  }

  return [
    {
      count: agents.length,
      id: ALL_AGENT_LINEUP_CATEGORY_ID,
      label: '全部',
      variant: 'all',
    },
    ...(recommendedCount > 0
      ? [
          {
            count: recommendedCount,
            id: 'recommended',
            label: '推荐优先',
            variant: 'recommended' as const,
          },
        ]
      : []),
    ...(selectedCount > 0
      ? [
          {
            count: selectedCount,
            id: 'selected',
            label: '已入阵',
            variant: 'selected' as const,
          },
        ]
      : []),
    ...Array.from(stageCategories.values()),
  ];
}

export function filterAgentLineupCandidates({
  activeCategoryId,
  agents,
  recommendedAgentKeys,
  selectedAgentKeys,
}: {
  activeCategoryId: string;
  agents: EnrichedDrawAgent[];
  recommendedAgentKeys: Set<string>;
  selectedAgentKeys: Set<string>;
}) {
  if (!activeCategoryId || activeCategoryId === ALL_AGENT_LINEUP_CATEGORY_ID) {
    return agents;
  }

  if (activeCategoryId === 'recommended') {
    return agents.filter((agent) => recommendedAgentKeys.has(getAgentCombinationKey(agent)));
  }

  if (activeCategoryId === 'selected') {
    return agents.filter((agent) => selectedAgentKeys.has(getAgentCombinationKey(agent)));
  }

  return agents.filter((agent) => getAgentLineupCategoryId(getAgentLineupCategoryLabel(agent)) === activeCategoryId);
}

export function calculateAgentLineupScore(lineupAgents: EnrichedDrawAgent[], options: AgentLineupScoreOptions = {}): AgentLineupScore {
  const filledAgents = lineupAgents.slice(0, AGENT_LINEUP_SLOT_COUNT);
  const filledCount = filledAgents.length;
  const readinessScore = Math.round((filledCount / AGENT_LINEUP_SLOT_COUNT) * 100);
  const categoryStats = getLineupCategoryStats(filledAgents);
  const coverageLabels = categoryStats.labels;
  const synergyTags = uniqueStrings(
    filledAgents.flatMap((agent) => [agent.metaLabel, ...(Array.isArray(agent.tags) ? agent.tags : []), agent.function, agent.type]),
  ).slice(0, 6);
  const recommendedMatchCount = getRecommendedMatchCount(filledAgents, options.recommendedAgentKeys);
  const coverageScore = getCoverageScore(categoryStats, filledCount);
  const availabilityScore =
    filledCount === 0 ? 0 : Math.round((filledAgents.filter((agent) => Boolean(agent.launchTarget || agent.canOpen)).length / filledCount) * 100);
  const reasonablenessScore = getReasonablenessScore({
    categoryStats,
    filledCount,
    recommendedAgentKeys: options.recommendedAgentKeys,
    recommendedMatchCount,
    synergyTagCount: synergyTags.length,
  });
  const total = Math.round(readinessScore * 0.2 + coverageScore * 0.3 + availabilityScore * 0.15 + reasonablenessScore * 0.35);

  return {
    coverageLabels: coverageLabels.slice(0, 5),
    filledCount,
    grade: getLineupGrade(total),
    metrics: [
      {
        description: `${filledCount}/${AGENT_LINEUP_SLOT_COUNT} 位已入阵`,
        id: 'readiness',
        label: '阵容成型',
        score: readinessScore,
      },
      {
        description: getCoverageDescription(categoryStats, filledCount),
        id: 'coverage',
        label: '能力覆盖',
        score: coverageScore,
      },
      {
        description: `${filledAgents.filter((agent) => Boolean(agent.launchTarget || agent.canOpen)).length} 个可打开入口`,
        id: 'availability',
        label: '落地可用',
        score: availabilityScore,
      },
      {
        description: getReasonablenessDescription(categoryStats, filledCount, recommendedMatchCount, options.recommendedAgentKeys),
        id: 'reasonableness',
        label: '组合合理',
        score: reasonablenessScore,
      },
    ],
    synergyTags: getScoreTags({ categoryStats, synergyTags }),
    total,
  };
}

export function getAgentRarity(agent: EnrichedDrawAgent, index: number, variant: 'catalog' | 'recommended') {
  const explicitLevel = ['rarity', 'level', 'tier', 'scoreLabel']
    .map((key) => getStringField(agent, key))
    .find((value) => /\b(?:UR|SSR|SR|S|A)\b/u.test(value.toUpperCase()));
  const matchedLevel = explicitLevel?.toUpperCase().match(/\b(?:UR|SSR|SR|S|A)\b/u)?.[0];

  if (matchedLevel && !['完成', '生成中'].includes(matchedLevel)) {
    return matchedLevel;
  }

  const numericScore = Number.parseFloat(String(agent.score ?? ''));

  if (Number.isFinite(numericScore)) {
    if (numericScore >= 95) {
      return 'SSR';
    }

    if (numericScore >= 88) {
      return 'SR';
    }

    if (numericScore >= 78) {
      return 'S';
    }
  }

  if (variant === 'recommended') {
    return index < 3 ? 'SSR' : 'SR';
  }

  return index < 8 ? 'SR' : 'S';
}

type AgentLineupCategoryStats = {
  counts: Array<{
    count: number;
    label: string;
  }>;
  dominantCount: number;
  dominantLabel: string;
  labels: string[];
  repeatedCount: number;
  uniqueCount: number;
};

function getLineupCategoryStats(agents: EnrichedDrawAgent[]): AgentLineupCategoryStats {
  const categoryCounts = new Map<string, number>();

  for (const agent of agents) {
    const label = getAgentLineupCategoryLabel(agent);
    categoryCounts.set(label, (categoryCounts.get(label) || 0) + 1);
  }

  const counts = Array.from(categoryCounts.entries())
    .map(([label, count]) => ({ count, label }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN'));
  const dominant = counts[0];

  return {
    counts,
    dominantCount: dominant?.count || 0,
    dominantLabel: dominant?.label || '',
    labels: counts.map((entry) => entry.label),
    repeatedCount: counts.reduce((sum, entry) => sum + Math.max(0, entry.count - 1), 0),
    uniqueCount: counts.length,
  };
}

function getCoverageScore(categoryStats: AgentLineupCategoryStats, filledCount: number) {
  if (filledCount === 0) {
    return 0;
  }

  const targetCategoryCount = Math.min(AGENT_LINEUP_SLOT_COUNT, 4);
  const breadthScore = Math.round((categoryStats.uniqueCount / targetCategoryCount) * 100);
  const repeatPenalty = categoryStats.repeatedCount * 10;

  return clampScore(breadthScore - repeatPenalty);
}

function getReasonablenessScore({
  categoryStats,
  filledCount,
  recommendedAgentKeys,
  recommendedMatchCount,
  synergyTagCount,
}: {
  categoryStats: AgentLineupCategoryStats;
  filledCount: number;
  recommendedAgentKeys?: Set<string>;
  recommendedMatchCount: number;
  synergyTagCount: number;
}) {
  if (filledCount === 0) {
    return 0;
  }

  const targetCategoryCount = Math.min(AGENT_LINEUP_SLOT_COUNT, 4);
  const uniqueRatio = categoryStats.uniqueCount / targetCategoryCount;
  const dominantRatio = categoryStats.dominantCount / filledCount;
  const dominancePenalty = getDominancePenalty(dominantRatio, filledCount);
  const balanceScore = clampScore(Math.round(uniqueRatio * 100 - categoryStats.repeatedCount * 10 - dominancePenalty + 8));
  const tagTarget = Math.min(Math.max(filledCount * 2, 1), 6);
  const tagScore = clampScore(Math.round((synergyTagCount / tagTarget) * 100));
  const recommendedFitScore = getRecommendedFitScore({ filledCount, recommendedAgentKeys, recommendedMatchCount });

  return clampScore(Math.round(balanceScore * 0.72 + tagScore * 0.12 + recommendedFitScore * 0.16));
}

function getRecommendedMatchCount(agents: EnrichedDrawAgent[], recommendedAgentKeys?: Set<string>) {
  if (!recommendedAgentKeys?.size) {
    return 0;
  }

  return agents.filter((agent) => recommendedAgentKeys.has(getAgentCombinationKey(agent))).length;
}

function getRecommendedFitScore({
  filledCount,
  recommendedAgentKeys,
  recommendedMatchCount,
}: {
  filledCount: number;
  recommendedAgentKeys?: Set<string>;
  recommendedMatchCount: number;
}) {
  if (filledCount === 0) {
    return 0;
  }

  if (!recommendedAgentKeys?.size) {
    return 86;
  }

  return Math.round((recommendedMatchCount / filledCount) * 100);
}

function getDominancePenalty(dominantRatio: number, filledCount: number) {
  if (filledCount < 3) {
    return 0;
  }

  if (dominantRatio >= 0.8) {
    return 35;
  }

  if (dominantRatio >= 0.6) {
    return 22;
  }

  if (dominantRatio >= 0.5) {
    return 10;
  }

  return 0;
}

function getCoverageDescription(categoryStats: AgentLineupCategoryStats, filledCount: number) {
  if (filledCount === 0) {
    return '等待能力覆盖';
  }

  if (categoryStats.uniqueCount <= 1 && filledCount >= 2) {
    return `${categoryStats.dominantLabel}过度集中`;
  }

  if (categoryStats.dominantCount >= 3) {
    return `${categoryStats.dominantLabel}占${categoryStats.dominantCount}位，建议补其他能力`;
  }

  return `${categoryStats.uniqueCount} 类能力：${categoryStats.labels.slice(0, 3).join(' / ')}`;
}

function getReasonablenessDescription(
  categoryStats: AgentLineupCategoryStats,
  filledCount: number,
  recommendedMatchCount: number,
  recommendedAgentKeys?: Set<string>,
) {
  if (filledCount === 0) {
    return '等待组合成型';
  }

  if (categoryStats.dominantCount >= 3) {
    return '同类智能体过多，组合风险偏高';
  }

  if (categoryStats.uniqueCount < Math.min(filledCount, 3)) {
    return '能力角色偏少，建议补齐协作环节';
  }

  if (recommendedAgentKeys?.size && recommendedMatchCount === 0) {
    return '未保留推荐核心，需人工确认';
  }

  if (recommendedMatchCount > 0) {
    return `保留 ${recommendedMatchCount} 位推荐核心`;
  }

  return '能力分布相对均衡';
}

function getScoreTags({ categoryStats, synergyTags }: { categoryStats: AgentLineupCategoryStats; synergyTags: string[] }) {
  const warnings = categoryStats.dominantCount >= 3 ? [`${categoryStats.dominantLabel}偏多`] : [];

  return uniqueStrings([...warnings, ...categoryStats.labels, ...synergyTags]).slice(0, 8);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getLineupGrade(score: number) {
  if (score >= 96) {
    return 'SSS';
  }

  if (score >= 90) {
    return 'SS';
  }

  if (score >= 82) {
    return 'S';
  }

  if (score >= 72) {
    return 'A';
  }

  return 'B';
}
function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();

  return values
    .map((value) => String(value ?? '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function getStringField(agent: EnrichedDrawAgent, key: string) {
  const value = agent[key];

  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function getAgentLineupCategoryLabel(agent: EnrichedDrawAgent) {
  const fallbackFromMeta = getStringField(agent, 'metaLabel').split(/\s*[/｜|]\s*/u)[0];
  const labels = [
    agent.stageLabel,
    getStringField(agent, 'function'),
    fallbackFromMeta,
    getStringField(agent, 'type'),
    Array.isArray(agent.tags) ? agent.tags[0] : '',
  ];

  for (const label of labels) {
    const normalized = normalizeAgentLineupCategoryLabel(label);

    if (normalized) {
      return normalized;
    }
  }

  return '通用能力';
}

function normalizeAgentLineupCategoryLabel(value: unknown) {
  const label = String(value ?? '').trim().replace(/\s+/gu, ' ');

  if (!label || ['推荐', '推荐生成中', '生成中', '完成', '智能体生成中'].includes(label)) {
    return '';
  }

  return label;
}

function getAgentLineupCategoryId(label: string) {
  return `stage:${label}`;
}
