import { requestLocalMockAgentReply } from './localMockAgent';
import type { AgentAction, Message, ReplySource } from '../types';

type ChatResponse = {
  actions: AgentAction[];
  source: ReplySource;
  text: string;
};

export async function requestAIReply(input: string, history: Message[]): Promise<ChatResponse> {
  const endpoint = import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined;

  if (!endpoint) {
    const localReply = await requestLocalMockAgentReply(input, history);
    return { ...localReply, source: 'local-mock' };
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
    text?: string;
  };
  const localFallback = await requestLocalMockAgentReply(input, history);

  return {
    actions: Array.isArray(data.actions) ? data.actions : localFallback.actions,
    source: 'endpoint',
    text: data.text ?? data.reply ?? localFallback.text,
  };
}
