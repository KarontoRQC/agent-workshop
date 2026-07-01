import type { AgentLineupId, AgentUserState, RecommendedAgent } from '../types';

const DEFAULT_REMOTE_API_BASE_URL = 'http://106.52.56.14/agent-workshop-api';

export type AgentStreamEvent = {
  agent?: RecommendedAgent;
  agent_index?: number;
  agents?: RecommendedAgent[];
  chat_ids?: Record<string, string>;
  content?: string;
  conversation_id?: string;
  conversation_ids?: Record<string, string>;
  conversation_key?: string;
  detail?: unknown;
  error?: string;
  event: string;
  master_conversation_id?: string;
  node?: unknown;
  route?: string;
  stage?: string;
  type?: string;
  [key: string]: unknown;
};

type StreamAgentHandlers = {
  agentNames?: string[];
  autoSaveHistory?: boolean;
  conversationId?: string;
  conversationIds?: Record<string, string>;
  onCompleted?: (event: AgentStreamEvent) => void;
  onContentDelta?: (event: AgentStreamEvent) => void;
  onConversationUpdated?: (event: AgentStreamEvent) => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onGraphNode?: (node: unknown, event: AgentStreamEvent) => void;
  onGraphPathResolved?: (event: AgentStreamEvent) => void;
  onRecommendedAgent?: (agent: RecommendedAgent | undefined, event: AgentStreamEvent) => void;
  onRecommendedAgentCompleted?: (agent: RecommendedAgent | undefined, event: AgentStreamEvent) => void;
  onRecommendedAgentStarted?: (event: AgentStreamEvent) => void;
  onRecommendedAgentsCompleted?: (agents: RecommendedAgent[], event: AgentStreamEvent) => void;
  onWorkflowError?: (event: AgentStreamEvent) => void;
  requestedLineup?: AgentLineupId | string;
  signal?: AbortSignal;
  userState?: AgentUserState;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function resolveApiBaseUrl() {
  const configuredBaseUrl = String(
    import.meta.env.VITE_AGENT_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '',
  ).trim();

  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  return import.meta.env.DEV ? '/api' : DEFAULT_REMOTE_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const COZE_CHAT_STREAM_URL = `${API_BASE_URL}/coze/chat/stream`;

export function isAgentStreamEnabled() {
  const rawValue = String(import.meta.env.VITE_ENABLE_AGENT_STREAM ?? 'true').trim().toLowerCase();

  return !['0', 'false', 'no', 'off'].includes(rawValue);
}

export async function streamAgentChat(message: string, handlers: StreamAgentHandlers = {}) {
  const body: {
    agent_names?: string[];
    auto_save_history?: boolean;
    conversation_id?: string;
    conversation_ids?: Record<string, string>;
    lineups?: AgentUserState['lineups'];
    message: string;
    parameters: Record<string, never>;
    requested_lineup?: AgentLineupId | string;
    user_state?: AgentUserState;
  } = {
    message,
    parameters: {},
  };

  if (Array.isArray(handlers.agentNames) && handlers.agentNames.length > 0) {
    body.agent_names = handlers.agentNames;
  }

  if (handlers.conversationId) {
    body.conversation_id = handlers.conversationId;
  }

  if (handlers.conversationIds && Object.keys(handlers.conversationIds).length > 0) {
    body.conversation_ids = handlers.conversationIds;
  }

  if (typeof handlers.autoSaveHistory === 'boolean') {
    body.auto_save_history = handlers.autoSaveHistory;
  }

  if (handlers.requestedLineup) {
    body.requested_lineup = handlers.requestedLineup;
  }

  if (handlers.userState && Object.keys(handlers.userState).length > 0) {
    body.user_state = handlers.userState;

    if (handlers.userState.lineups) {
      body.lineups = handlers.userState.lineups;
    }
  }

  const response = await fetch(COZE_CHAT_STREAM_URL, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: handlers.signal,
  });

  if (!response.ok) {
    throw new Error(await formatResponseError(response));
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';

    for (const frame of frames) {
      emitSseFrame(frame, handlers);
    }
  }

  const tail = `${buffer}${decoder.decode()}`;
  if (tail.trim()) {
    emitSseFrame(tail, handlers);
  }
}

async function formatResponseError(response: Response) {
  const payload = await response.json().catch(() => null);

  if (payload?.detail?.msg) {
    return payload.detail.msg;
  }

  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }

  if (typeof payload?.error === 'string') {
    return payload.error;
  }

  return `Agent endpoint failed: ${response.status}`;
}

function emitSseFrame(frame: string, handlers: StreamAgentHandlers) {
  const event = parseSseFrame(frame);

  if (!event) {
    return;
  }

  handlers.onEvent?.(event);

  if (event.event === 'content.delta') {
    handlers.onContentDelta?.(event);
  }

  if (event.event === 'conversation.updated') {
    handlers.onConversationUpdated?.(event);
  }

  if (event.event === 'recommended_agent.started') {
    handlers.onRecommendedAgentStarted?.(event);
  }

  if (event.event === 'recommended_agents.delta') {
    handlers.onRecommendedAgent?.(event.agent, event);
  }

  if (event.event === 'recommended_agent.completed') {
    handlers.onRecommendedAgentCompleted?.(event.agent, event);
  }

  if (event.event === 'recommended_agents.completed') {
    handlers.onRecommendedAgentsCompleted?.(event.agents || [], event);
  }

  if (event.event === 'graph.node.delta') {
    handlers.onGraphNode?.(event.node, event);
  }

  if (event.event === 'graph.path.resolved') {
    handlers.onGraphPathResolved?.(event);
  }

  if (event.event === 'workflow.error') {
    handlers.onWorkflowError?.(event);
  }

  if (event.event === 'workflow.completed' || event.event === 'chat.completed') {
    handlers.onCompleted?.(event);
  }
}

function parseSseFrame(frame: string): AgentStreamEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .join('\n');

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? (parsed as AgentStreamEvent) : null;
  } catch {
    return null;
  }
}
