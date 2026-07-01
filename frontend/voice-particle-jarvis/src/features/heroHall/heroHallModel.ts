import type { AgentStreamEvent } from '../../lib/agentStreamClient';
import { enrichDrawAgent, getCatalogHeroAgents } from '../../lib/agentLaunchCatalog';
import type { AgentUserState, RecommendedAgent } from '../../types';
import { getRecommendedAgentKey } from '../agents/agentUtils';

export type HeroHallLineupId = 'core' | 'growth' | 'conversion';
export type HeroHallLineupsState = Record<HeroHallLineupId, string[]>;
export type AgentUserStateLineupAgent = NonNullable<NonNullable<AgentUserState['lineups']>[HeroHallLineupId]>[number];

const fallbackLineupLimit = 5;

export const heroHallLineups: Array<{ accent: 'cyan' | 'gold' | 'rose'; id: HeroHallLineupId; label: string; tagline: string }> = [
  { accent: 'gold', id: 'core', label: '主力阵容', tagline: '优先启用' },
  { accent: 'cyan', id: 'growth', label: '增长阵容', tagline: '拉新转化' },
  { accent: 'rose', id: 'conversion', label: '成交阵容', tagline: '私域承接' },
];

export const heroHallReferenceHeroLabels = [
  '智慧神殿',
  '启动中',
  '机械先知',
  '数据管家',
  '脑域探索者',
  '创意工坊',
  '策略引擎',
  '霓虹行者',
  '灵感爆发',
  '知识图谱',
  '启动中',
  '决策之王',
  '启动中',
  '成长手册',
];

export const heroHallReferenceRecommendationCards = [
  { name: '战略分析师', reason: '洞察趋势，制定战略，驱动增长', stage: '行业智慧' },
  { name: '行业研究员', reason: '调研市场，分析机会，提供洞察', stage: '行业智慧' },
  { name: '销售助理', reason: '推进潜在客户转化，提升效率', stage: '业绩增长' },
  { name: '销售顾问', reason: '推进潜在客户转化，提升业绩', stage: '业绩增长' },
  { name: '爆款策划师', reason: '输出爆款内容，化内容为商机', stage: '招商增长' },
];

export function createHeroHallLineups(): HeroHallLineupsState {
  return {
    conversion: [],
    core: [],
    growth: [],
  };
}

const heroHallLineupAliases: Record<string, HeroHallLineupId> = {
  acquisition: 'growth',
  conversion: 'conversion',
  core: 'core',
  deal: 'conversion',
  growth: 'growth',
  main: 'core',
  primary: 'core',
  sales: 'conversion',
  transaction: 'conversion',
  主力: 'core',
  主力阵容: 'core',
  核心: 'core',
  核心阵容: 'core',
  增长: 'growth',
  增长阵容: 'growth',
  拉新: 'growth',
  拉新阵容: 'growth',
  转化: 'growth',
  成交: 'conversion',
  成交阵容: 'conversion',
  私域: 'conversion',
  私域承接: 'conversion',
};

export function normalizeHeroHallLineupId(value: unknown, fallback?: HeroHallLineupId): HeroHallLineupId | undefined {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[:：]+$/g, '');

  if (!text) {
    return fallback;
  }

  if (heroHallLineupAliases[text]) {
    return heroHallLineupAliases[text];
  }

  const matchedAlias = Object.entries(heroHallLineupAliases).find(([alias]) => alias && text.includes(alias.toLowerCase()));
  return matchedAlias?.[1] ?? fallback;
}

export function detectRequestedLineupFromText(value: unknown): HeroHallLineupId | undefined {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase();

  if (!text) {
    return undefined;
  }

  const asksForLineup =
    /lineup|\u9635\u5bb9/.test(normalized) ||
    /\u63a8\u8350.*(\u6210\u4ea4|\u79c1\u57df|\u9500\u552e|\u589e\u957f|\u4e3b\u529b|\u6838\u5fc3)/.test(normalized);

  if (!asksForLineup) {
    return undefined;
  }

  if (/deal|sales|conversion|\u6210\u4ea4|\u79c1\u57df|\u590d\u8d2d/.test(normalized)) {
    return 'conversion';
  }

  if (/growth|acquisition|\u589e\u957f|\u62c9\u65b0|\u83b7\u5ba2/.test(normalized)) {
    return 'growth';
  }

  if (/core|main|primary|\u4e3b\u529b|\u6838\u5fc3/.test(normalized)) {
    return 'core';
  }

  return normalizeHeroHallLineupId(text);
}

export function getLineupIntentFromEvent(event: AgentStreamEvent): HeroHallLineupId | undefined {
  if (event.stage !== 'agent_recommendation') {
    return undefined;
  }

  const type = String(event.type || '').trim().toUpperCase();
  const typeIntent: Record<string, HeroHallLineupId> = {
    ACQUISITION_LINEUP: 'growth',
    CORE_LINEUP: 'core',
    DEAL_LINEUP: 'conversion',
    GROWTH_LINEUP: 'growth',
    MAIN_LINEUP: 'core',
    PRIMARY_LINEUP: 'core',
    SALES_LINEUP: 'conversion',
  };

  if (typeIntent[type]) {
    return typeIntent[type];
  }

  if (type === 'LINEUP' || type.endsWith('_LINEUP')) {
    return detectRequestedLineupFromText(event.content);
  }

  return undefined;
}

export function getHeroHallLineupLabel(lineupId: HeroHallLineupId | string | undefined) {
  const normalizedLineup = normalizeHeroHallLineupId(lineupId);
  return heroHallLineups.find((lineup) => lineup.id === normalizedLineup)?.label || '阵容';
}

export function getCatalogAgentsForLineup(lineupId: HeroHallLineupId, limit = fallbackLineupLimit): RecommendedAgent[] {
  const scoredAgents = getCatalogHeroAgents()
    .map((agent, index) => {
      const haystack = [agent.name, agent.stageLabel, agent.metaLabel, agent.fallbackReason].filter(Boolean).join(' ');

      return {
        agent,
        index,
        score: getLineupCatalogScore(lineupId, haystack),
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);

  return scoredAgents.map(({ agent }, index) => ({
    ...agent,
    agent_index: index,
    agent_name: agent.name,
    lineup: lineupId,
    rank: index + 1,
    reason: getLineupFallbackReason(lineupId, agent),
    stage: getLineupFallbackStage(lineupId, agent),
    streamStatus: 'completed' as const,
  }));
}

function getLineupCatalogScore(lineupId: HeroHallLineupId, haystack: string) {
  const weights: Record<HeroHallLineupId, Array<[RegExp, number]>> = {
    conversion: [
      [/\u9500\u552e/i, 34],
      [/\u79c1\u57df/i, 34],
      [/\u6210\u4ea4/i, 30],
      [/\u670b\u53cb\u5708/i, 24],
      [/\u590d\u8d2d/i, 18],
      [/\u8f6c\u5316/i, 14],
      [/\u5ba2\u6237/i, 10],
      [/CRM/i, 10],
    ],
    core: [
      [/\u884c\u4e1a/i, 28],
      [/\u6218\u7565/i, 24],
      [/\u7528\u6237\u753b\u50cf/i, 24],
      [/\u5b9a\u4f4d/i, 18],
      [/\u7ba1\u7406/i, 12],
    ],
    growth: [
      [/\u589e\u957f/i, 30],
      [/\u83b7\u5ba2/i, 28],
      [/\u5f15\u6d41/i, 24],
      [/\u5c0f\u7ea2\u4e66/i, 22],
      [/\u79cd\u8349/i, 20],
      [/\u5185\u5bb9/i, 14],
      [/\u8bc4\u8bba\u533a/i, 14],
    ],
  };

  return weights[lineupId].reduce((score, [pattern, weight]) => score + (pattern.test(haystack) ? weight : 0), 0);
}

function getLineupFallbackStage(lineupId: HeroHallLineupId, agent: RecommendedAgent) {
  if (lineupId === 'conversion') {
    return '\u6210\u4ea4\u8f6c\u5316';
  }

  if (lineupId === 'growth') {
    return '\u589e\u957f\u83b7\u5ba2';
  }

  return String(agent.stage || '\u4e3b\u529b\u7b56\u7565');
}

function getLineupFallbackReason(lineupId: HeroHallLineupId, agent: RecommendedAgent) {
  if (lineupId === 'conversion') {
    return '\u627f\u63a5\u5f53\u524d\u7ebf\u7d22\uff0c\u5f3a\u5316\u79c1\u57df\u8ddf\u8fdb\u4e0e\u6210\u4ea4\u8f6c\u5316\u3002';
  }

  if (lineupId === 'growth') {
    return '\u56f4\u7ed5\u5185\u5bb9\u4e0e\u516c\u57df\u6d41\u91cf\uff0c\u8865\u5f3a\u62c9\u65b0\u83b7\u5ba2\u3002';
  }

  return String(agent.reason || '\u627f\u63a5\u5f53\u524d\u4e1a\u52a1\u8def\u5f84\uff0c\u4f5c\u4e3a\u4e3b\u529b\u63a8\u8fdb\u8282\u70b9\u3002');
}

export function getRecommendedAgentLineup(agent: RecommendedAgent, fallbackIndex?: number): HeroHallLineupId | undefined {
  const explicitLineup = normalizeHeroHallLineupId(agent.lineup ?? agent.lineup_id ?? agent.lineupId ?? agent.LINEUP);

  if (explicitLineup) {
    return explicitLineup;
  }

  if (fallbackIndex === undefined) {
    return undefined;
  }

  return fallbackIndex < 3 ? 'core' : 'growth';
}

export function getHeroHallAgentKey(agent: RecommendedAgent, enrichedAgent = enrichDrawAgent(agent)) {
  return String(
    enrichedAgent.id ||
      enrichedAgent.agentKey ||
      enrichedAgent.launchTarget ||
      agent.agent_key ||
      agent.agentKey ||
      agent.id ||
      getRecommendedAgentKey(agent),
  );
}

export function createHeroHallLineupsFromAgents(agents: Array<{ agent: RecommendedAgent; key: string }>): HeroHallLineupsState {
  const explicitLineups = createHeroHallLineups();

  agents.forEach((agent) => {
    const lineupId = normalizeHeroHallLineupId(agent.agent.lineup ?? agent.agent.lineup_id ?? agent.agent.lineupId ?? agent.agent.LINEUP);

    if (!lineupId) {
      return;
    }

    explicitLineups[lineupId].push(agent.key);
  });

  return explicitLineups;
}

export function mergeHeroHallLineups(current: HeroHallLineupsState, incoming: HeroHallLineupsState): HeroHallLineupsState {
  return heroHallLineups.reduce<HeroHallLineupsState>((nextLineups, lineup) => {
    const incomingKeys = Array.from(new Set(incoming[lineup.id]));

    if (incomingKeys.length > 0) {
      nextLineups[lineup.id] = incomingKeys;
    }

    return nextLineups;
  }, { ...current });
}
