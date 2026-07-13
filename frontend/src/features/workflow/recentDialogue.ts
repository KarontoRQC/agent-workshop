import type { Message, RecentDialogueEntry } from '../../types';

export const RECENT_DIALOGUE_HISTORY_MODE = 'bounded_recent';
export const MAX_RECENT_DIALOGUE_MESSAGES = 10;
export const MAX_RECENT_DIALOGUE_MESSAGE_CHARS = 600;
export const MAX_RECENT_DIALOGUE_TOTAL_CHARS = 3200;

export function buildRecentDialogue(messages: Message[]): RecentDialogueEntry[] {
  const firstUserIndex = messages.findIndex((message) => message.speaker === 'you');

  if (firstUserIndex < 0) {
    return [];
  }

  const normalizedReversed: RecentDialogueEntry[] = [];
  let totalChars = 0;

  for (let index = messages.length - 1; index >= firstUserIndex; index -= 1) {
    const message = messages[index];
    const content = String(message.text || '').trim();

    if (!content || content === 'Processing...') {
      continue;
    }

    const remainingChars = MAX_RECENT_DIALOGUE_TOTAL_CHARS - totalChars;

    if (remainingChars <= 0) {
      break;
    }

    const limitedContent = content.slice(0, Math.min(MAX_RECENT_DIALOGUE_MESSAGE_CHARS, remainingChars)).trim();

    if (!limitedContent) {
      continue;
    }

    normalizedReversed.push({
      content: limitedContent,
      role: message.speaker === 'you' ? 'user' : 'assistant',
    });
    totalChars += limitedContent.length;

    if (normalizedReversed.length >= MAX_RECENT_DIALOGUE_MESSAGES) {
      break;
    }
  }

  return normalizedReversed.reverse();
}
