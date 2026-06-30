import { requestLocalMockAgentReply } from './localMockAgent';
import { isAgentStreamEnabled, streamAgentChat, type AgentStreamEvent } from './agentStreamClient';
import { detectConversationLanguage, isChineseLanguage } from './language';
import type { AgentAction, AgentGraphPath, ChatResponse, Message, RecommendedAgent } from '../types';

type AgentConversationIds = Record<string, string>;

export type AIReplyStreamHandlers = {
  onGraphAction?: (action: AgentAction) => void;
  onRecommendedAgents?: (agents: RecommendedAgent[]) => void;
  onStreamText?: (text: string) => void;
};

let agentConversationIds: AgentConversationIds = {};

function createClientConversationIds(): AgentConversationIds {
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

function ensureClientConversationIds(conversationIds: AgentConversationIds): AgentConversationIds {
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

function rememberConversationIds(event: AgentStreamEvent) {
  const next = { ...agentConversationIds };
  const setConversationId = (key: unknown, value: unknown) => {
    const conversationKey = String(key ?? '').trim();
    const conversationId = String(value ?? '').trim();

    if (!conversationKey || !conversationId || next[conversationKey] === conversationId) {
      return;
    }

    next[conversationKey] = conversationId;
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

  agentConversationIds = ensureClientConversationIds(next);
}

function localSpokenFallback(input: string, actions: AgentAction[]) {
  if (!isChineseLanguage(detectConversationLanguage(input))) {
    return undefined;
  }

  if (actions.some((action) => action.type === 'focus_graph_path')) {
    return 'Understood, sir. I have focused the requested graph path and prepared a local control event.';
  }

  return 'Understood, sir. I have processed the request and I am standing by for the next instruction.';
}

export async function requestAIReply(
  input: string,
  history: Message[],
  streamHandlers: AIReplyStreamHandlers = {},
): Promise<ChatResponse> {
  if (isAgentStreamEnabled()) {
    try {
      return await requestStreamingAgentReply(input, streamHandlers);
    } catch (error) {
      console.warn('Agent stream unavailable, falling back to local mock.', error);
    }
  }

  const endpoint = import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined;

  if (!endpoint) {
    const localReply = await requestLocalMockAgentReply(input, history);
    return { ...localReply, source: 'local-mock', spokenText: localSpokenFallback(input, localReply.actions) };
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({ history, message: input }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`AI endpoint failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    actions?: AgentAction[];
    reply?: string;
    spokenText?: string;
    text?: string;
  };
  const localFallback = await requestLocalMockAgentReply(input, history);
  const actions = Array.isArray(data.actions) ? data.actions : localFallback.actions;

  return {
    actions,
    recommendedAgents: localFallback.recommendedAgents,
    source: 'endpoint',
    spokenText: data.spokenText ?? localSpokenFallback(input, actions),
    text: data.text ?? data.reply ?? localFallback.text,
  };
}

async function requestStreamingAgentReply(input: string, streamHandlers: AIReplyStreamHandlers): Promise<ChatResponse> {
  const controller = new AbortController();
  const contentParts: Record<string, string> = {};
  const recommendedAgents: RecommendedAgent[] = [];
  let graphAction: AgentAction | null = null;
  let streamError = '';
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  agentConversationIds = ensureClientConversationIds(agentConversationIds);
  const conversationIdsForRequest = { ...agentConversationIds };
  const emitText = () => {
    const liveText = buildStreamLiveText(contentParts, recommendedAgents);

    if (liveText) {
      streamHandlers.onStreamText?.(liveText);
    }
  };
  const emitAgents = () => streamHandlers.onRecommendedAgents?.([...recommendedAgents]);

  try {
    await streamAgentChat(input, {
      autoSaveHistory: true,
      conversationId: conversationIdsForRequest.route_planner,
      conversationIds: conversationIdsForRequest,
      onCompleted: rememberConversationIds,
      onContentDelta: (event) => {
        appendContentDelta(contentParts, event);
        emitText();
      },
      onConversationUpdated: rememberConversationIds,
      onEvent: rememberConversationIds,
      onGraphPathResolved: (event) => {
        const route = extractGraphRoute(event);

        if (route.length > 0) {
          graphAction = {
            confidence: 0.9,
            label: getFirstText(event.selected_route, event.route) || 'agent graph route',
            route,
            type: 'focus_graph_path',
          };
          streamHandlers.onGraphAction?.(graphAction);
        }
      },
      onRecommendedAgent: (agent) => {
        upsertRecommendedAgent(recommendedAgents, agent, 'streaming');
        emitAgents();
        emitText();
      },
      onRecommendedAgentCompleted: (agent) => {
        upsertRecommendedAgent(recommendedAgents, agent, 'completed');
        emitAgents();
        emitText();
      },
      onRecommendedAgentsCompleted: (agents) => {
        recommendedAgents.splice(
          0,
          recommendedAgents.length,
          ...agents.map((agent, index) => ({ ...agent, agent_index: agent.agent_index ?? index, streamStatus: 'completed' as const })),
        );
        emitAgents();
        emitText();
      },
      onWorkflowError: (event) => {
        streamError = getFirstText(event.error, event.detail) || 'Agent workflow failed.';
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (streamError) {
    throw new Error(streamError);
  }

  const text = buildStreamReplyText(contentParts, recommendedAgents);
  streamHandlers.onStreamText?.(text);

  return {
    actions: graphAction ? [graphAction] : [{ type: 'chat' }],
    recommendedAgents,
    source: 'coze-stream',
    spokenText: getStreamSpokenText(contentParts, text),
    text,
  };
}

function appendContentDelta(contentParts: Record<string, string>, event: AgentStreamEvent) {
  const content = getFirstText(event.content);

  if (!content) {
    return;
  }

  const key = `${event.stage || 'unknown'}.${event.type || 'text'}`;
  contentParts[key] = `${contentParts[key] || ''}${content}`;
}

function upsertRecommendedAgent(
  agents: RecommendedAgent[],
  agent: RecommendedAgent | undefined,
  streamStatus: RecommendedAgent['streamStatus'],
) {
  if (!agent) {
    return;
  }

  const agentIndex = typeof agent.agent_index === 'number' ? agent.agent_index : agents.length;
  const nextAgent = { ...agent, agent_index: agentIndex, streamStatus };
  const existingIndex = agents.findIndex((item) => item.agent_index === agentIndex);

  if (existingIndex >= 0) {
    agents[existingIndex] = { ...agents[existingIndex], ...nextAgent };
    return;
  }

  agents.push(nextAgent);
}

function buildStreamLiveText(contentParts: Record<string, string>, agents: RecommendedAgent[]) {
  const directReply = cleanText(contentParts['knowledge_graph.DIRECT_REPLY']);
  const knowledgeAck = cleanText(contentParts['knowledge_graph.ACK']);
  const explanation = cleanText(contentParts['knowledge_graph.EXPLANATION']);
  const recommendationAck = cleanText(contentParts['agent_recommendation.ACK']);
  const summary = cleanText(contentParts['agent_recommendation.SUMMARY']);
  const agentHint = agents.length > 0 ? `正在匹配 ${agents.length} 个推荐 agent...` : '';

  return [directReply || knowledgeAck, explanation, recommendationAck, summary, agentHint].filter(Boolean).join('\n');
}

function buildStreamReplyText(contentParts: Record<string, string>, agents: RecommendedAgent[]) {
  const directReply = cleanText(contentParts['knowledge_graph.DIRECT_REPLY']);
  const knowledgeAck = cleanText(contentParts['knowledge_graph.ACK']);
  const explanation = cleanText(contentParts['knowledge_graph.EXPLANATION']);
  const recommendationAck = cleanText(contentParts['agent_recommendation.ACK']);
  const summary = cleanText(contentParts['agent_recommendation.SUMMARY']);
  const fallback =
    agents.length > 0
      ? `已筛选 ${agents.length} 个推荐智能体。`
      : 'Agent workflow completed, sir. The response stream did not include display text.';

  return [directReply || knowledgeAck, explanation, recommendationAck, summary].filter(Boolean).join('\n') || fallback;
}

function getStreamSpokenText(contentParts: Record<string, string>, text: string) {
  return (
    cleanText(contentParts['knowledge_graph.ACK']) ||
    cleanText(contentParts['knowledge_graph.DIRECT_REPLY']) ||
    cleanText(contentParts['agent_recommendation.ACK']) ||
    text
  );
}

function extractGraphRoute(event: AgentStreamEvent) {
  const graphPath = (event.graph_path && typeof event.graph_path === 'object' ? event.graph_path : event) as AgentGraphPath;
  const nodeLabels = Array.isArray(graphPath.nodes)
    ? graphPath.nodes.map((node) => getFirstText(node.label)).filter(Boolean)
    : [];

  if (nodeLabels.length > 0) {
    return nodeLabels;
  }

  const routeText = getFirstText(graphPath.route, event.selected_route, event.route);

  return splitRouteText(routeText);
}

function splitRouteText(routeText: string) {
  return routeText
    .replace(/[>→›/、，,]/g, '-')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanText(value: unknown) {
  return getFirstText(value).replace(/\s+/g, ' ').trim();
}

function getFirstText(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text) {
      return text;
    }
  }

  return '';
}
