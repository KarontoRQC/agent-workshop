import { requestLocalMockAgentReply } from './localMockAgent';
import { detectConversationLanguage, isChineseLanguage } from './language';
import type { AgentAction, Message, ReplySource } from '../types';

type ChatResponse = {
  actions: AgentAction[];
  source: ReplySource;
  spokenText?: string;
  text: string;
};

function localSpokenFallback(input: string, actions: AgentAction[]) {
  if (!isChineseLanguage(detectConversationLanguage(input))) {
    return undefined;
  }

  if (actions.some((action) => action.type === 'focus_graph_path')) {
    return 'Understood, sir. I have focused the requested graph path and prepared a local control event.';
  }

  return 'Understood, sir. I have processed the request and I am standing by for the next instruction.';
}

export async function requestAIReply(input: string, history: Message[]): Promise<ChatResponse> {
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
    source: 'endpoint',
    spokenText: data.spokenText ?? localSpokenFallback(input, actions),
    text: data.text ?? data.reply ?? localFallback.text,
  };
}
