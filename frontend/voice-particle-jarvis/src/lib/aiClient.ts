import type { Message } from '../types';

type ChatResponse = {
  text: string;
  source: 'placeholder' | 'endpoint';
};

const fallbackReplies = [
  '我先占位回应：这句话后面会交给模型理解。现在我会用粒子状态表示我听到了。',
  '模型接口还空着，但交互链路已经预留好了：语音转文字，然后把文字送去理解层。',
  '收到。等你接模型后，这里会变成真正的上下文对话；现在先保持本地占位。',
  '先不接模型也可以。我们把视觉和状态机打磨好，后面只换这一层回复来源。',
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
