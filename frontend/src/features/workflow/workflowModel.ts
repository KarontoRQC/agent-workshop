import type { AgentStreamEvent } from '../../lib/agentStreamClient';
import { enrichDrawAgent } from '../../lib/agentLaunchCatalog';
import type { AgentAction, AgentGraphPath, AgentTurn, AgentUserState, AgentWorkflow, RecommendedAgent } from '../../types';
import {
  cleanStateText,
  getRecommendedAgentKey,
  hasDisplayableRecommendedAgent,
  normalizeRecommendedAgent,
} from '../agents/agentUtils';
import {
  getHeroHallAgentKey,
  getRecommendedAgentLineup,
  heroHallLineups,
  normalizeHeroHallLineupId,
  type AgentUserStateLineupAgent,
  type HeroHallLineupId,
  type HeroHallLineupsState,
} from '../heroHall/heroHallModel';

const knowledgeGraphTextTypes = ['THINKING_PROCESS', 'ACK', 'DIRECT_REPLY', 'KG_PATH', 'EXPLANATION'] as const;
const agentRecommendationTextTypes = ['THINKING_PROCESS', 'ACK', 'SUMMARY'] as const;

export const PATH_MATCH_ANIMATION_MS = 3600;
export const RECOMMENDATION_DOCK_REVEAL_MS = 900;
export const SPEECH_SEGMENT_WAIT_MS = 45000;

export type SpeechSegmentKey = 'knowledgeAck' | 'knowledgeExplanation' | 'recommendationAck' | 'recommendationSummary';

export type WorkflowRevealState = {
  knowledgeAck: boolean;
  knowledgeExplanation: boolean;
  knowledgePath: boolean;
  recommendationAck: boolean;
  recommendationAgents: boolean;
  recommendationSummary: boolean;
};

export type WorkflowTextKey = 'knowledgeGraph.ACK' | 'knowledgeGraph.EXPLANATION' | 'agentRecommendation.ACK' | 'agentRecommendation.SUMMARY';
export type WorkflowTextOverrides = Map<WorkflowTextKey, string>;

export type PreloadedSpeechAsset = {
  audioPromise: Promise<Blob>;
  text: string;
};

export type WorkflowHighlight = 'none' | 'route' | 'agents';

export type SubmitMessageOptions = {
  resumeListening?: boolean;
};

export type AgentConversationIds = Record<string, string>;

export function createClientConversationIds(): AgentConversationIds {
  const newId = (key: string) => {
    const randomId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    return `web-${key}-${randomId}`;
  };

  return {
    agent_recommendation: newId('agent-recommendation'),
    route_planner: newId('route-planner'),
  };
}

export function ensureClientConversationIds(conversationIds: AgentConversationIds): AgentConversationIds {
  if (conversationIds.route_planner && conversationIds.agent_recommendation) {
    return conversationIds;
  }

  const generatedConversationIds = createClientConversationIds();

  return {
    ...conversationIds,
    agent_recommendation: conversationIds.agent_recommendation || generatedConversationIds.agent_recommendation,
    route_planner: conversationIds.route_planner || generatedConversationIds.route_planner,
  };
}

export function createEmptyAgentWorkflow(): AgentWorkflow {
  return {
    agentRecommendation: {
      ACK: '',
      SUMMARY: '',
      THINKING_PROCESS: '',
      agents: [],
    },
    knowledgeGraph: {
      ACK: '',
      DIRECT_REPLY: '',
      EXPLANATION: '',
      KG_PATH: '',
      THINKING_PROCESS: '',
      graphPath: null,
    },
  };
}

export function createEmptyWorkflowRevealState(): WorkflowRevealState {
  return {
    knowledgeAck: false,
    knowledgeExplanation: false,
    knowledgePath: false,
    recommendationAck: false,
    recommendationAgents: false,
    recommendationSummary: false,
  };
}

export function getVisibleWorkflow(
  workflow: AgentWorkflow,
  reveal: WorkflowRevealState,
  textOverrides?: WorkflowTextOverrides,
  agentRevealCount?: number | null,
): AgentWorkflow {
  const getText = (key: WorkflowTextKey, fallback: string) => textOverrides?.get(key) ?? fallback;
  const visibleAgents =
    reveal.recommendationAgents && typeof agentRevealCount === 'number'
      ? workflow.agentRecommendation.agents.slice(0, Math.min(agentRevealCount, workflow.agentRecommendation.agents.length))
      : workflow.agentRecommendation.agents;

  return {
    agentRecommendation: {
      ACK: reveal.recommendationAck ? getText('agentRecommendation.ACK', workflow.agentRecommendation.ACK) : '',
      SUMMARY: reveal.recommendationSummary ? getText('agentRecommendation.SUMMARY', workflow.agentRecommendation.SUMMARY) : '',
      THINKING_PROCESS: reveal.recommendationAck ? workflow.agentRecommendation.THINKING_PROCESS : '',
      agents: reveal.recommendationAgents ? visibleAgents : [],
      ...(reveal.recommendationAgents && workflow.agentRecommendation.lineupIntent
        ? { lineupIntent: workflow.agentRecommendation.lineupIntent }
        : {}),
    },
    knowledgeGraph: {
      ACK: reveal.knowledgeAck ? getText('knowledgeGraph.ACK', workflow.knowledgeGraph.ACK) : '',
      DIRECT_REPLY: reveal.knowledgeAck ? workflow.knowledgeGraph.DIRECT_REPLY : '',
      EXPLANATION: reveal.knowledgeExplanation ? getText('knowledgeGraph.EXPLANATION', workflow.knowledgeGraph.EXPLANATION) : '',
      KG_PATH: reveal.knowledgePath ? workflow.knowledgeGraph.KG_PATH : '',
      THINKING_PROCESS: reveal.knowledgeAck ? workflow.knowledgeGraph.THINKING_PROCESS : '',
      graphPath: reveal.knowledgePath ? workflow.knowledgeGraph.graphPath : null,
    },
  };
}

export function getRevealForSpeechSegment(segment: SpeechSegmentKey): Partial<WorkflowRevealState> {
  if (segment === 'knowledgeAck') {
    return { knowledgeAck: true };
  }

  if (segment === 'knowledgeExplanation') {
    return { knowledgeExplanation: true };
  }

  if (segment === 'recommendationAck') {
    return { recommendationAck: true };
  }

  return { recommendationSummary: true };
}

export function getTextKeyForSpeechSegment(segment: SpeechSegmentKey): WorkflowTextKey {
  if (segment === 'knowledgeAck') {
    return 'knowledgeGraph.ACK';
  }

  if (segment === 'knowledgeExplanation') {
    return 'knowledgeGraph.EXPLANATION';
  }

  if (segment === 'recommendationAck') {
    return 'agentRecommendation.ACK';
  }

  return 'agentRecommendation.SUMMARY';
}

export function createAgentTurn(id: string, user: string): AgentTurn {
  return {
    error: '',
    fallbackText: '',
    id,
    source: 'coze-stream',
    status: 'streaming',
    user,
    workflow: createEmptyAgentWorkflow(),
  };
}

export function getWorkflowSection(event: AgentStreamEvent): keyof AgentWorkflow | null {
  if (
    event.stage === 'knowledge_graph' &&
    (knowledgeGraphTextTypes as readonly string[]).includes(event.type || '')
  ) {
    return 'knowledgeGraph';
  }

  if (event.stage === 'agent_recommendation' && (agentRecommendationTextTypes as readonly string[]).includes(event.type || '')) {
    return 'agentRecommendation';
  }

  return null;
}

export function appendWorkflowContent(workflow: AgentWorkflow, section: keyof AgentWorkflow, type: string | undefined, content: string) {
  if (!type || !content) {
    return workflow;
  }

  if (section === 'knowledgeGraph') {
    if (!(knowledgeGraphTextTypes as readonly string[]).includes(type)) {
      return workflow;
    }

    return {
      ...workflow,
      knowledgeGraph: {
        ...workflow.knowledgeGraph,
        [type]: `${workflow.knowledgeGraph[type as keyof AgentWorkflow['knowledgeGraph']] || ''}${content}`,
      },
    };
  }

  if (!(agentRecommendationTextTypes as readonly string[]).includes(type)) {
    return workflow;
  }

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      [type]: `${workflow.agentRecommendation[type as keyof AgentWorkflow['agentRecommendation']] || ''}${content}`,
    },
  };
}

export function setWorkflowGraphPath(workflow: AgentWorkflow, graphPath: AgentGraphPath): AgentWorkflow {
  return {
    ...workflow,
    knowledgeGraph: {
      ...workflow.knowledgeGraph,
      graphPath,
    },
  };
}

export function setWorkflowLineupIntent(workflow: AgentWorkflow, lineupId: HeroHallLineupId | undefined): AgentWorkflow {
  if (!lineupId) {
    return workflow;
  }

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      lineupIntent: lineupId,
    },
  };
}

export function upsertRecommendedAgent(workflow: AgentWorkflow, agent: RecommendedAgent | undefined, options: Partial<RecommendedAgent> = {}) {
  if (!agent) {
    return workflow;
  }

  const currentAgents = workflow.agentRecommendation.agents;
  const normalizedAgent = normalizeRecommendedAgent(agent);
  const key = getRecommendedAgentKey(normalizedAgent);
  const existingIndex = currentAgents.findIndex((item) => getRecommendedAgentKey(item) === key);
  const hasActiveField = Object.prototype.hasOwnProperty.call(options, 'activeField');

  if (existingIndex >= 0) {
    return {
      ...workflow,
      agentRecommendation: {
        ...workflow.agentRecommendation,
        agents: currentAgents.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                ...normalizedAgent,
                activeField: hasActiveField ? options.activeField ?? null : item.activeField ?? null,
                streamStatus: options.streamStatus || item.streamStatus || 'streaming',
              }
            : item,
        ),
      },
    };
  }

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents: [
        ...currentAgents,
        {
          ...normalizedAgent,
          activeField: hasActiveField ? options.activeField ?? null : null,
          streamStatus: options.streamStatus || 'streaming',
        },
      ],
    },
  };
}

export function replaceRecommendedAgents(workflow: AgentWorkflow, agents: RecommendedAgent[]) {
  const currentAgents = workflow.agentRecommendation.agents;

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents: agents.map((agent, index) => {
        const normalizedAgent = normalizeRecommendedAgent(agent, index);
        const existing = currentAgents.find((item) => getRecommendedAgentKey(item) === getRecommendedAgentKey(normalizedAgent));

        return {
          ...existing,
          ...normalizedAgent,
          activeField: null,
          streamStatus: 'completed' as const,
        };
      }),
    },
  };
}

export function splitRouteText(routeText: string) {
  return String(routeText || '')
    .split(/\s*(?:>|›|→|->|-|—|–|\/|、|，|,)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildAgentStateItem(agent: RecommendedAgent, index: number, lineup?: HeroHallLineupId, key?: string) {
  const agentName = cleanStateText(agent.agent_name || agent.name);
  const fallbackName = cleanStateText(agent.name || agent.agent_name);

  return {
    agent_name: agentName,
    key,
    lineup: lineup ?? getRecommendedAgentLineup(agent, index),
    name: fallbackName && fallbackName !== agentName ? fallbackName : undefined,
    rank: agent.rank ?? index + 1,
    reason: cleanStateText(agent.reason),
    stage: cleanStateText(agent.stage),
  };
}

function buildLineupsFromStateAgents(agents: NonNullable<AgentUserState['recommended_agents']>) {
  const lineups: NonNullable<AgentUserState['lineups']> = {
    conversion: [],
    core: [],
    growth: [],
  };

  agents.forEach((agent, index) => {
    const lineupId = normalizeHeroHallLineupId(agent.lineup, index < 3 ? 'core' : 'growth') ?? 'core';
    lineups[lineupId]?.push({ ...agent, lineup: lineupId });
  });

  return lineups;
}

export function buildHeroHallLineupUserState(lineups: HeroHallLineupsState, agents: RecommendedAgent[]): AgentUserState {
  const visibleAgents = agents.filter(hasDisplayableRecommendedAgent).map((agent, index) => {
    const enrichedAgent = enrichDrawAgent(agent);

    return {
      agent,
      key: getHeroHallAgentKey(agent, enrichedAgent),
      stateItem: buildAgentStateItem(agent, index, getRecommendedAgentLineup(agent, index)),
    };
  });
  const agentByKey = new Map(visibleAgents.map((agent) => [agent.key, agent]));
  const lineupState: NonNullable<AgentUserState['lineups']> = {
    conversion: [],
    core: [],
    growth: [],
  };

  heroHallLineups.forEach((lineup) => {
    lineups[lineup.id].forEach((agentKey, index) => {
      const agent = agentByKey.get(agentKey);

      if (!agent) {
        lineupState[lineup.id]?.push({
          agent_name: agentKey,
          key: agentKey,
          lineup: lineup.id,
          rank: index + 1,
        });
        return;
      }

      lineupState[lineup.id]?.push({
        ...agent.stateItem,
        key: agent.key,
        lineup: lineup.id,
        rank: agent.stateItem.rank ?? index + 1,
      });
    });
  });

  return { lineups: lineupState };
}

export function mergeAgentUserState(baseState: AgentUserState | undefined, lineupState: AgentUserState): AgentUserState | undefined {
  const merged: AgentUserState = {
    ...(baseState || {}),
  };

  if (lineupState.lineups) {
    merged.lineups = lineupState.lineups;
  }

  const lineupAgents = Object.values(lineupState.lineups || {})
    .flat()
    .filter(Boolean) as AgentUserStateLineupAgent[];

  if (lineupAgents.length > 0) {
    const lineupEntries = lineupAgents
      .map((agent): [string, AgentUserStateLineupAgent] => [cleanStateText(agent.agent_name || agent.name || agent.key), agent])
      .filter(([key]) => Boolean(key));
    const lineupByName = new Map<string, AgentUserStateLineupAgent>(lineupEntries);

    merged.recommended_agents =
      merged.recommended_agents && merged.recommended_agents.length > 0
        ? merged.recommended_agents.map((agent) => {
            const key = cleanStateText(agent.agent_name || agent.name);
            const lineupAgent = lineupByName.get(key);

            return lineupAgent ? { ...agent, lineup: lineupAgent.lineup } : agent;
          })
        : lineupAgents.map((agent) => ({
            agent_name: agent.agent_name,
            lineup: agent.lineup,
            name: agent.name,
            rank: agent.rank,
            reason: agent.reason,
            stage: agent.stage,
          }));
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildAgentUserStateFromWorkflow(workflow: AgentWorkflow): AgentUserState | null {
  const knowledgePath = cleanStateText(workflow.knowledgeGraph.KG_PATH);
  const knowledgePathNodes = splitRouteText(knowledgePath);
  const recommendedAgents = workflow.agentRecommendation.agents
    .map((agent, index) => buildAgentStateItem(agent, index))
    .filter((agent) => agent.agent_name || agent.name)
    .slice(0, 10);
  const recommendationSummary = cleanStateText(workflow.agentRecommendation.SUMMARY);
  const userState: AgentUserState = {};

  if (knowledgePath) {
    userState.knowledge_path = knowledgePath;
  }

  if (knowledgePathNodes.length > 0) {
    userState.knowledge_path_nodes = knowledgePathNodes;
  }

  if (recommendedAgents.length > 0) {
    userState.recommended_agents = recommendedAgents;
    userState.lineups = buildLineupsFromStateAgents(recommendedAgents);
  }

  if (recommendationSummary) {
    userState.recommendation_summary = recommendationSummary;
  }

  return Object.keys(userState).length > 0 ? userState : null;
}

export function getLatestAgentUserState(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];

    if (turn.status === 'streaming') {
      continue;
    }

    const userState = buildAgentUserStateFromWorkflow(turn.workflow);

    if (userState) {
      return userState;
    }
  }

  return undefined;
}

export function getLatestDisplayableRecommendedAgents(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const agents = turns[index].workflow.agentRecommendation.agents;

    if (agents.some(hasDisplayableRecommendedAgent)) {
      return agents;
    }
  }

  return [];
}

export function getLatestRouteSegments(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const route = splitRouteText(turns[index].workflow.knowledgeGraph.KG_PATH);

    if (route.length > 0) {
      return route;
    }
  }

  return [];
}

export function getLatestRecommendationSummary(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const summary = cleanStateText(turns[index].workflow.agentRecommendation.SUMMARY);

    if (summary) {
      return summary;
    }
  }

  return '';
}

export function getActionFromRoute(routeText: string): AgentAction | null {
  const route = splitRouteText(routeText);

  if (route.length === 0) {
    return null;
  }

  return {
    confidence: 0.92,
    label: route.at(-1) || 'agent route',
    route,
    type: 'focus_graph_path',
  };
}

export function buildAgentReplyText(workflow: AgentWorkflow, fallbackText = '') {
  const knowledgeGraph = workflow.knowledgeGraph;
  const agentRecommendation = workflow.agentRecommendation;

  return (
    knowledgeGraph.DIRECT_REPLY ||
    [knowledgeGraph.ACK, knowledgeGraph.EXPLANATION, agentRecommendation.ACK, agentRecommendation.SUMMARY]
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n') ||
    fallbackText
  ).trim();
}

export function getCompletedSpeechSegment(event: AgentStreamEvent): SpeechSegmentKey | null {
  if (event.event !== 'content.completed') {
    return null;
  }

  if (event.stage === 'knowledge_graph' && event.type === 'ACK') {
    return 'knowledgeAck';
  }

  if (event.stage === 'knowledge_graph' && event.type === 'EXPLANATION') {
    return 'knowledgeExplanation';
  }

  if (event.stage === 'agent_recommendation' && event.type === 'ACK') {
    return 'recommendationAck';
  }

  if (event.stage === 'agent_recommendation' && event.type === 'SUMMARY') {
    return 'recommendationSummary';
  }

  return null;
}

export function getSpeechTextForSegment(workflow: AgentWorkflow, segment: SpeechSegmentKey) {
  if (segment === 'knowledgeAck') {
    return cleanSpeechText(workflow.knowledgeGraph.ACK);
  }

  if (segment === 'knowledgeExplanation') {
    return cleanSpeechText(workflow.knowledgeGraph.EXPLANATION);
  }

  if (segment === 'recommendationAck') {
    return cleanSpeechText(workflow.agentRecommendation.ACK);
  }

  return cleanSpeechText(workflow.agentRecommendation.SUMMARY);
}

export function extractAckSpeechText(text: string) {
  const matches = String(text || '').matchAll(/<ACK\b[^>]*>([\s\S]*?)<\/ACK>/gi);

  return Array.from(matches)
    .map((match) => cleanSpeechText(match[1] || ''))
    .filter(Boolean)
    .join('\n\n');
}

export function cleanSpeechText(text: string) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

export function stripSpeechTagSyntax(text: string) {
  return String(text || '')
    .replace(/<\/?(?:ACK|EXPLANATION|EXPLATION|SUMMARY)\b[^>]*>/gi, '')
    .trim();
}

export function normalizeSubtitleText(text: string) {
  return stripSpeechTagSyntax(text).replace(/\s+/g, ' ').trim();
}

export function hasAgentOutput(turn: AgentTurn | null) {
  if (!turn) {
    return false;
  }

  const workflow = turn.workflow;

  return Boolean(
    turn.fallbackText ||
      turn.error ||
      workflow.knowledgeGraph.THINKING_PROCESS ||
      workflow.knowledgeGraph.ACK ||
      workflow.knowledgeGraph.DIRECT_REPLY ||
      workflow.knowledgeGraph.KG_PATH ||
      workflow.knowledgeGraph.EXPLANATION ||
      workflow.agentRecommendation.THINKING_PROCESS ||
      workflow.agentRecommendation.ACK ||
      workflow.agentRecommendation.SUMMARY ||
      workflow.agentRecommendation.lineupIntent ||
      workflow.agentRecommendation.agents.length,
  );
}

export function formatWorkflowError(event: AgentStreamEvent) {
  if (typeof event.detail === 'string') {
    return event.detail;
  }

  if (typeof event.error === 'string') {
    return event.error;
  }

  return '智能体接口返回异常';
}

export function updateTurnById(turnId: string, update: (turn: AgentTurn) => AgentTurn) {
  return (current: AgentTurn[]) => current.map((turn) => (turn.id === turnId ? update(turn) : turn));
}

export function mergeConversationIdsFromEvent(current: AgentConversationIds, event: AgentStreamEvent) {
  const next = { ...current };
  let changed = false;

  const setConversationId = (key: string, value: unknown) => {
    const conversationId = String(value ?? '').trim();

    if (!key || !conversationId || next[key] === conversationId) {
      return;
    }

    next[key] = conversationId;
    changed = true;
  };

  if (event.conversation_ids && typeof event.conversation_ids === 'object') {
    for (const [key, value] of Object.entries(event.conversation_ids)) {
      setConversationId(key, value);
    }
  }

  setConversationId('route_planner', event.master_conversation_id);

  if (typeof event.conversation_key === 'string') {
    setConversationId(event.conversation_key, event.conversation_id);
  }

  return changed ? next : current;
}
