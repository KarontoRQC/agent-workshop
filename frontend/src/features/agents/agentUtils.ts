import type { RecommendedAgent } from '../../types';

export function normalizeRecommendedAgent(agent: RecommendedAgent, fallbackIndex?: number): RecommendedAgent {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return agent;
  }

  if (fallbackIndex === undefined) {
    return agent;
  }

  return {
    agent_index: fallbackIndex,
    ...agent,
  };
}

export function getRecommendedAgentKey(agent: RecommendedAgent) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || ''}-${agent.agent_name || agent.name || 'pending'}`;
}

export function cleanStateText(value: unknown) {
  return String(value ?? '').trim();
}

export function hasDisplayableRecommendedAgent(agent: RecommendedAgent) {
  return Boolean(cleanStateText(agent.agent_name || agent.name || agent.stage || agent.reason));
}

export function getAgentDisplayName(agent: RecommendedAgent) {
  return String(agent.agent_name || agent.name || '智能体生成中');
}

export function getAgentStage(agent: RecommendedAgent, index: number) {
  return String(agent.stage || ['核心阶段', '需求挖掘', '精准定位'][index % 3]);
}
