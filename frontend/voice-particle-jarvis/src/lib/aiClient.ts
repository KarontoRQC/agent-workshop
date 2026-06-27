import type { Message } from '../types';

type ChatResponse = {
  text: string;
  source: 'placeholder' | 'endpoint';
};

const fallbackReplies = [
  'Certainly, sir. The reasoning layer is not connected yet, but local operations remain online.',
  'Acknowledged. I am maintaining the dialogue loop and monitoring the particle core.',
  'Understood, sir. Visual systems are stable; the reasoning module can be attached next.',
  'Message received. I will hold position and keep the interface responsive.',
];

function pickFallbackReply(input: string) {
  return fallbackReplies[Array.from(input).reduce((total, char) => total + char.charCodeAt(0), 0) % fallbackReplies.length];
}

export async function requestAIReply(input: string, history: Message[]): Promise<ChatResponse> {
  const endpoint = import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined;

  if (!endpoint) {
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    return { source: 'placeholder', text: pickFallbackReply(input) };
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({ history, message: input }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`AI endpoint failed: ${response.status}`);
  }

  const data = (await response.json()) as { text?: string; reply?: string };
  return { source: 'endpoint', text: data.text ?? data.reply ?? pickFallbackReply(input) };
}
