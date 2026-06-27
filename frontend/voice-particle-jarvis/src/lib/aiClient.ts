import type { Message } from '../types';

type ChatResponse = {
  text: string;
  source: 'placeholder' | 'endpoint';
};

const fallbackReplies = [
  'Acknowledged. The model endpoint is still empty, so I am keeping the local dialogue loop active.',
  'I heard you. Once the model is connected, this line will become a real contextual response.',
  'Understood. The visual core and voice pipeline are ready; the reasoning layer can be attached next.',
  'Message received. For now, I will answer locally and let the particle core reflect the speaking state.',
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
