export type ConversationLanguage = 'en-US' | 'zh-CN';

export function detectConversationLanguage(text: string): ConversationLanguage {
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWordCount = (text.match(/[a-zA-Z]{2,}/g) ?? []).length;

  if (cjkCount > 0) {
    return 'zh-CN';
  }

  return latinWordCount > 0 ? 'en-US' : 'zh-CN';
}

export function isChineseLanguage(language: ConversationLanguage) {
  return language === 'zh-CN';
}
