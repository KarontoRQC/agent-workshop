import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import {
  ArrowUpRight,
  BrainCircuit,
  Crown,
  ExternalLink,
  GitBranch,
  GripVertical,
  Keyboard,
  Mic,
  MicOff,
  PackageOpen,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { API_BASE_URL, streamAgentChat, type AgentStreamEvent } from './lib/agentStreamClient';
import { requestAIReply } from './lib/aiClient';
import { enrichDrawAgent, getAgentLaunchTargets, getCatalogHeroAgents, openAgentLaunchTargets } from './lib/agentLaunchCatalog';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from './lib/language';
import type {
  AgentAction,
  AgentGraphPath,
  AgentStatus,
  AgentTurn,
  AgentUserState,
  AgentWorkflow,
  Message,
  ParticleSettings,
  RecommendedAgent,
  ReplySource,
} from './types';
import './App.css';

const baseSettings: ParticleSettings = {
  energy: 0.34,
  mode: 'idle',
  pulseSeed: 0,
};

type HeroHallLineupId = 'core' | 'growth' | 'conversion';
type HeroHallLineupsState = Record<HeroHallLineupId, string[]>;
type AgentUserStateLineupAgent = NonNullable<NonNullable<AgentUserState['lineups']>[HeroHallLineupId]>[number];

const fallbackLineupLimit = 5;

const heroHallLineups: Array<{ accent: 'cyan' | 'gold' | 'rose'; id: HeroHallLineupId; label: string; tagline: string }> = [
  { accent: 'gold', id: 'core', label: '主力阵容', tagline: '优先启用' },
  { accent: 'cyan', id: 'growth', label: '增长阵容', tagline: '拉新转化' },
  { accent: 'rose', id: 'conversion', label: '成交阵容', tagline: '私域承接' },
];

function createHeroHallLineups(): HeroHallLineupsState {
  return {
    conversion: [],
    core: [],
    growth: [],
  };
}

const heroHallLineupAliases: Record<string, HeroHallLineupId> = {
  acquisition: 'growth',
  conversion: 'conversion',
  core: 'core',
  deal: 'conversion',
  growth: 'growth',
  main: 'core',
  primary: 'core',
  sales: 'conversion',
  transaction: 'conversion',
  主力: 'core',
  主力阵容: 'core',
  核心: 'core',
  核心阵容: 'core',
  增长: 'growth',
  增长阵容: 'growth',
  拉新: 'growth',
  拉新阵容: 'growth',
  转化: 'growth',
  成交: 'conversion',
  成交阵容: 'conversion',
  私域: 'conversion',
  私域承接: 'conversion',
};

function normalizeHeroHallLineupId(value: unknown, fallback?: HeroHallLineupId): HeroHallLineupId | undefined {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[:：]+$/g, '');

  if (!text) {
    return fallback;
  }

  if (heroHallLineupAliases[text]) {
    return heroHallLineupAliases[text];
  }

  const matchedAlias = Object.entries(heroHallLineupAliases).find(([alias]) => alias && text.includes(alias.toLowerCase()));
  return matchedAlias?.[1] ?? fallback;
}

function detectRequestedLineupFromText(value: unknown): HeroHallLineupId | undefined {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase();

  if (!text) {
    return undefined;
  }

  const asksForLineup =
    /lineup|\u9635\u5bb9/.test(normalized) ||
    /\u63a8\u8350.*(\u6210\u4ea4|\u79c1\u57df|\u9500\u552e|\u589e\u957f|\u4e3b\u529b|\u6838\u5fc3)/.test(normalized);

  if (!asksForLineup) {
    return undefined;
  }

  if (/deal|sales|conversion|\u6210\u4ea4|\u79c1\u57df|\u590d\u8d2d/.test(normalized)) {
    return 'conversion';
  }

  if (/growth|acquisition|\u589e\u957f|\u62c9\u65b0|\u83b7\u5ba2/.test(normalized)) {
    return 'growth';
  }

  if (/core|main|primary|\u4e3b\u529b|\u6838\u5fc3/.test(normalized)) {
    return 'core';
  }

  return normalizeHeroHallLineupId(text);
}

function getLineupIntentFromEvent(event: AgentStreamEvent): HeroHallLineupId | undefined {
  if (event.stage !== 'agent_recommendation') {
    return undefined;
  }

  const type = String(event.type || '').trim().toUpperCase();
  const typeIntent: Record<string, HeroHallLineupId> = {
    ACQUISITION_LINEUP: 'growth',
    CORE_LINEUP: 'core',
    DEAL_LINEUP: 'conversion',
    GROWTH_LINEUP: 'growth',
    MAIN_LINEUP: 'core',
    PRIMARY_LINEUP: 'core',
    SALES_LINEUP: 'conversion',
  };

  if (typeIntent[type]) {
    return typeIntent[type];
  }

  if (type === 'LINEUP' || type.endsWith('_LINEUP')) {
    return detectRequestedLineupFromText(event.content);
  }

  return undefined;
}

function getHeroHallLineupLabel(lineupId: HeroHallLineupId | string | undefined) {
  const normalizedLineup = normalizeHeroHallLineupId(lineupId);
  return heroHallLineups.find((lineup) => lineup.id === normalizedLineup)?.label || '\u9635\u5bb9';
}

function getCatalogAgentsForLineup(lineupId: HeroHallLineupId, limit = fallbackLineupLimit): RecommendedAgent[] {
  const scoredAgents = getCatalogHeroAgents()
    .map((agent, index) => {
      const haystack = [agent.name, agent.stageLabel, agent.metaLabel, agent.fallbackReason].filter(Boolean).join(' ');

      return {
        agent,
        index,
        score: getLineupCatalogScore(lineupId, haystack),
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);

  return scoredAgents.map(({ agent }, index) => ({
    ...agent,
    agent_index: index,
    agent_name: agent.name,
    lineup: lineupId,
    rank: index + 1,
    reason: getLineupFallbackReason(lineupId, agent),
    stage: getLineupFallbackStage(lineupId, agent),
    streamStatus: 'completed' as const,
  }));
}

function getLineupCatalogScore(lineupId: HeroHallLineupId, haystack: string) {
  const weights: Record<HeroHallLineupId, Array<[RegExp, number]>> = {
    conversion: [
      [/\u9500\u552e/i, 34],
      [/\u79c1\u57df/i, 34],
      [/\u6210\u4ea4/i, 30],
      [/\u670b\u53cb\u5708/i, 24],
      [/\u590d\u8d2d/i, 18],
      [/\u8f6c\u5316/i, 14],
      [/\u5ba2\u6237/i, 10],
      [/CRM/i, 10],
    ],
    core: [
      [/\u884c\u4e1a/i, 28],
      [/\u6218\u7565/i, 24],
      [/\u7528\u6237\u753b\u50cf/i, 24],
      [/\u5b9a\u4f4d/i, 18],
      [/\u7ba1\u7406/i, 12],
    ],
    growth: [
      [/\u589e\u957f/i, 30],
      [/\u83b7\u5ba2/i, 28],
      [/\u5f15\u6d41/i, 24],
      [/\u5c0f\u7ea2\u4e66/i, 22],
      [/\u79cd\u8349/i, 20],
      [/\u5185\u5bb9/i, 14],
      [/\u8bc4\u8bba\u533a/i, 14],
    ],
  };

  return weights[lineupId].reduce((score, [pattern, weight]) => score + (pattern.test(haystack) ? weight : 0), 0);
}

function getLineupFallbackStage(lineupId: HeroHallLineupId, agent: RecommendedAgent) {
  if (lineupId === 'conversion') {
    return '\u6210\u4ea4\u8f6c\u5316';
  }

  if (lineupId === 'growth') {
    return '\u589e\u957f\u83b7\u5ba2';
  }

  return String(agent.stage || '\u4e3b\u529b\u7b56\u7565');
}

function getLineupFallbackReason(lineupId: HeroHallLineupId, agent: RecommendedAgent) {
  if (lineupId === 'conversion') {
    return '\u627f\u63a5\u5f53\u524d\u7ebf\u7d22\uff0c\u5f3a\u5316\u79c1\u57df\u8ddf\u8fdb\u4e0e\u6210\u4ea4\u8f6c\u5316\u3002';
  }

  if (lineupId === 'growth') {
    return '\u56f4\u7ed5\u5185\u5bb9\u4e0e\u516c\u57df\u6d41\u91cf\uff0c\u8865\u5f3a\u62c9\u65b0\u83b7\u5ba2\u3002';
  }

  return String(agent.reason || '\u627f\u63a5\u5f53\u524d\u4e1a\u52a1\u8def\u5f84\uff0c\u4f5c\u4e3a\u4e3b\u529b\u63a8\u8fdb\u8282\u70b9\u3002');
}

function getRecommendedAgentLineup(agent: RecommendedAgent, fallbackIndex?: number): HeroHallLineupId | undefined {
  const explicitLineup = normalizeHeroHallLineupId(agent.lineup ?? agent.lineup_id ?? agent.lineupId ?? agent.LINEUP);

  if (explicitLineup) {
    return explicitLineup;
  }

  if (fallbackIndex === undefined) {
    return undefined;
  }

  return fallbackIndex < 3 ? 'core' : 'growth';
}

function getHeroHallAgentKey(agent: RecommendedAgent, enrichedAgent = enrichDrawAgent(agent)) {
  return String(
    enrichedAgent.id ||
      enrichedAgent.agentKey ||
      enrichedAgent.launchTarget ||
      agent.agent_key ||
      agent.agentKey ||
      agent.id ||
      getRecommendedAgentKey(agent),
  );
}

const demoGraphAction: AgentAction = {
  confidence: 1,
  label: 'knowledge graph preview',
  route: ['Agent Workshop', 'Knowledge Graph', 'Path selection', 'Graph controller'],
  type: 'focus_graph_path',
};

const preferredVoiceHints = [
  'microsoft george online natural',
  'microsoft brian online natural',
  'microsoft guy online natural',
  'microsoft ryan online natural',
  'microsoft andrew online natural',
  'microsoft george',
  'google uk english male',
  'daniel',
  'george',
  'microsoft brian',
  'microsoft guy',
  'microsoft david',
  'microsoft mark',
  'microsoft ryan',
  'microsoft andrew',
  'microsoft william',
  'alex',
  'english male',
  'uk english male',
  'us english male',
];

const matureMaleVoiceHints = [
  'male',
  'guy',
  'george',
  'david',
  'mark',
  'daniel',
  'brian',
  'ryan',
  'william',
  'andrew',
  'roger',
  'james',
];

const avoidedVoiceHints = ['zira', 'hazel', 'susan', 'zira desktop', 'female', 'aria', 'jenny', 'emma', 'samantha'];
const TTS_SPEECH_URL = `${API_BASE_URL}/tts/speech`;
const preferredChineseVoiceHints = [
  'microsoft yunyang',
  'microsoft yunjian',
  'microsoft yunxi',
  'yunyang',
  'yunjian',
  'yunxi',
  'kangkang',
  'huihui',
  'chinese',
];
const wakeWords = ['jarvis', '贾维斯', '贾贾维斯', '加维斯', '甲维斯', '嘉维斯'];
const knowledgeGraphTextTypes = ['THINKING_PROCESS', 'ACK', 'DIRECT_REPLY', 'KG_PATH', 'EXPLANATION'] as const;
const agentRecommendationTextTypes = ['THINKING_PROCESS', 'ACK', 'SUMMARY'] as const;
const PATH_MATCH_ANIMATION_MS = 3600;
const RECOMMENDATION_DOCK_REVEAL_MS = 900;
const SPEECH_SEGMENT_WAIT_MS = 45000;

type SpeechSegmentKey = 'knowledgeAck' | 'knowledgeExplanation' | 'recommendationAck' | 'recommendationSummary';

type WorkflowRevealState = {
  knowledgeAck: boolean;
  knowledgeExplanation: boolean;
  knowledgePath: boolean;
  recommendationAck: boolean;
  recommendationAgents: boolean;
  recommendationSummary: boolean;
};

type WorkflowTextKey = 'knowledgeGraph.ACK' | 'knowledgeGraph.EXPLANATION' | 'agentRecommendation.ACK' | 'agentRecommendation.SUMMARY';
type WorkflowTextOverrides = Map<WorkflowTextKey, string>;

type PreloadedSpeechAsset = {
  audioPromise: Promise<Blob>;
  text: string;
};

type SpeechCallbacks = {
  onEnd?: () => void;
  onError?: (reason: string) => void;
  onPulse?: () => void;
  onStart?: () => void;
};

type SpeechOutputOptions = {
  audioBlob?: Blob;
  displayText?: string;
  minimumVisualDurationMs?: number;
  onSettled?: () => void;
  resumeListening?: boolean;
};

type InputMode = 'text' | 'voice';

type WorkflowHighlight = 'none' | 'route' | 'agents';

type SubmitMessageOptions = {
  resumeListening?: boolean;
};

type AgentConversationIds = Record<string, string>;

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

class TtsRequestError extends Error {
  fallbackToBrowser: boolean;

  constructor(message: string, fallbackToBrowser = false) {
    super(message);
    this.name = 'TtsRequestError';
    this.fallbackToBrowser = fallbackToBrowser;
  }
}

function extractWakeCommand(raw: string) {
  const text = raw.trim();
  const lowered = text.toLowerCase();
  const matchedWord = wakeWords.find((word) => lowered.includes(word.toLowerCase()));

  if (!matchedWord) {
    return null;
  }

  const startIndex = lowered.indexOf(matchedWord.toLowerCase());
  const command = text
    .slice(startIndex + matchedWord.length)
    .replace(/^[\s,，.。:：;；!?！？]+/, '')
    .trim();

  return { command, wakeWord: matchedWord };
}

function wantsSleep(raw: string) {
  const lowered = raw.trim().toLowerCase();

  if (/\u9000\u4e0b|\u5f85\u547d|\u505c\u6b62\u76d1\u542c|\u505c\u4e0b|\u4f11\u7720|\u5173\u95ed\u8bed\u97f3|\u4e0d\u7528\u542c/.test(raw)) {
    return true;
  }

  return ['stand by', 'sleep', 'stop listening', '退下', '待命', '停止监听', '休眠'].some((keyword) =>
    lowered.includes(keyword),
  );
}

function voiceScore(voice: SpeechSynthesisVoice, language: ConversationLanguage) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (isChineseLanguage(language)) {
    if (!lang.startsWith('zh') && !name.includes('chinese')) {
      return -100;
    }

    const preferredIndex = preferredChineseVoiceHints.findIndex((hint) => name.includes(hint));
    const preferredScore = preferredIndex >= 0 ? 120 - preferredIndex * 5 : 0;
    const maleScore = ['yunyang', 'yunjian', 'yunxi', 'kangkang'].some((hint) => name.includes(hint)) ? 34 : 0;
    const naturalScore = name.includes('natural') ? 20 : name.includes('online') ? 12 : 0;
    const mandarinScore = lang.includes('cn') || lang.includes('hans') ? 24 : lang.startsWith('zh') ? 12 : 0;

    return preferredScore + maleScore + naturalScore + mandarinScore;
  }

  if (!lang.startsWith('en')) {
    return -100;
  }

  if (avoidedVoiceHints.some((hint) => name.includes(hint))) {
    return -30;
  }

  const preferredIndex = preferredVoiceHints.findIndex((hint) => name.includes(hint));
  const preferredScore = preferredIndex >= 0 ? 120 - preferredIndex * 4 : 0;
  const maleScore = matureMaleVoiceHints.some((hint) => name.includes(hint)) ? 28 : 0;
  const naturalScore = name.includes('natural') ? 18 : name.includes('online') ? 10 : 0;
  const accentScore = lang === 'en-gb' ? 30 : lang.startsWith('en-gb') ? 26 : lang.startsWith('en-us') ? 10 : 4;
  const localScore = voice.localService ? 3 : 0;

  return preferredScore + maleScore + naturalScore + accentScore + localScore;
}

function selectVoiceForLanguage(language: ConversationLanguage) {
  const voices = window.speechSynthesis.getVoices();

  return voices
    .filter((voice) => voiceScore(voice, language) > 0)
    .sort((left, right) => voiceScore(right, language) - voiceScore(left, language))[0] ?? null;
}

function polishSpokenLine(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\bAI\b/g, 'A.I.')
    .replace(/\bendpoint\b/gi, 'end point')
    .replace(/\bJARVIS\b/g, 'Jarvis')
    .replace(/([.!?])\s+/g, '$1 ')
    .trim();
}

function primeSpeechOutput() {
  if (!('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.getVoices();
  window.speechSynthesis.resume();
}

let activeSpeechAudio: HTMLAudioElement | null = null;
let activeSpeechObjectUrl = '';

function getTtsMode() {
  const rawMode = String(import.meta.env.VITE_TTS_BROWSER_FALLBACK ?? 'auto')
    .trim()
    .toLowerCase();

  if (['1', 'true', 'browser'].includes(rawMode)) {
    return 'browser';
  }

  if (['0', 'false', 'server'].includes(rawMode)) {
    return 'server';
  }

  return 'auto';
}

function isFallbackableTtsError(error: unknown) {
  if (error instanceof TtsRequestError) {
    return error.fallbackToBrowser;
  }

  return getTtsMode() === 'auto' && error instanceof TypeError;
}

function cancelSpeechPlayback() {
  if (activeSpeechAudio) {
    activeSpeechAudio.pause();
    activeSpeechAudio.removeAttribute('src');
    activeSpeechAudio.load();
    activeSpeechAudio = null;
  }

  if (activeSpeechObjectUrl) {
    URL.revokeObjectURL(activeSpeechObjectUrl);
    activeSpeechObjectUrl = '';
  }
}

async function requestTtsAudio(text: string) {
  const response = await fetch(TTS_SPEECH_URL, {
    body: JSON.stringify({ mood: 'neutral', text }),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw await formatTtsResponseError(response);
  }

  const audio = await response.blob();

  if (!audio.size) {
    throw new Error('TTS interface returned empty audio.');
  }

  return audio;
}

async function formatTtsResponseError(response: Response) {
  const payload = await response.json().catch(() => null);
  let message = `TTS interface failed: ${response.status}`;

  if (typeof payload?.detail === 'string') {
    message = payload.detail;
  } else if (typeof payload?.error === 'string') {
    message = payload.error;
  }

  const normalizedMessage = message.toLowerCase();
  const fallbackToBrowser =
    getTtsMode() === 'auto' &&
    (response.status >= 500 ||
      normalizedMessage.includes('tts is not configured') ||
      normalizedMessage.includes('local tts is not configured') ||
      normalizedMessage.includes('tts_provider'));

  return new TtsRequestError(message, fallbackToBrowser);
}

async function playTtsSpeech(text: string, callbacks: SpeechCallbacks, preparedAudio?: Blob) {
  cancelSpeechPlayback();

  let pulseTimer: number | null = null;
  let started = false;
  const clearPulseTimer = () => {
    if (pulseTimer !== null) {
      window.clearInterval(pulseTimer);
      pulseTimer = null;
    }
  };
  const finish = () => {
    clearPulseTimer();
    cancelSpeechPlayback();
    callbacks.onEnd?.();
  };

  try {
    const audioBlob = preparedAudio || (await requestTtsAudio(text));
    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);

    activeSpeechAudio = audio;
    activeSpeechObjectUrl = objectUrl;
    audio.preload = 'auto';
    audio.onplaying = () => {
      if (started) {
        return;
      }

      started = true;
      callbacks.onStart?.();
      callbacks.onPulse?.();
      pulseTimer = window.setInterval(() => callbacks.onPulse?.(), 360);
    };
    audio.onended = finish;
    audio.onerror = () => {
      clearPulseTimer();
      cancelSpeechPlayback();
      callbacks.onError?.('TTS audio playback failed.');
      callbacks.onEnd?.();
    };

    await audio.play();
  } catch (error) {
    clearPulseTimer();
    cancelSpeechPlayback();

    if (isFallbackableTtsError(error)) {
      playBrowserSpeech(text, callbacks);
      return;
    }

    callbacks.onError?.(error instanceof Error ? error.message : 'TTS interface failed.');
    callbacks.onEnd?.();
  }
}

function speakNow(text: string, callbacks: SpeechCallbacks) {
  const language = detectConversationLanguage(text);
  const voice = selectVoiceForLanguage(language);
  const utterance = new SpeechSynthesisUtterance(polishSpokenLine(text));

  utterance.lang = voice?.lang ?? (isChineseLanguage(language) ? 'zh-CN' : 'en-GB');
  utterance.rate = isChineseLanguage(language) ? 0.96 : 0.9;
  utterance.pitch = isChineseLanguage(language) ? 0.56 : 0.42;
  utterance.volume = 1;

  if (voice) {
    utterance.voice = voice;
  }

  let resumeTimer: number | null = null;
  const stopResumeTimer = () => {
    if (resumeTimer !== null) {
      window.clearInterval(resumeTimer);
      resumeTimer = null;
    }
  };

  utterance.onstart = () => callbacks.onStart?.();
  utterance.onboundary = () => callbacks.onPulse?.();
  utterance.onend = () => {
    stopResumeTimer();
    callbacks.onEnd?.();
  };
  utterance.onerror = (event) => {
    stopResumeTimer();
    const reason = event.error || 'Speech synthesis failed.';
    console.warn(reason);
    callbacks.onError?.(reason);
    callbacks.onEnd?.();
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 120);
  resumeTimer = window.setInterval(() => {
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      stopResumeTimer();
      return;
    }

    window.speechSynthesis.resume();
  }, 300);
  window.setTimeout(stopResumeTimer, 12000);
}

function playBrowserSpeech(text: string, callbacks: SpeechCallbacks = {}) {
  if (!('speechSynthesis' in window)) {
    callbacks.onError?.('Speech synthesis is not available in this browser.');
    return false;
  }

  primeSpeechOutput();

  if (window.speechSynthesis.getVoices().length > 0) {
    speakNow(text, callbacks);
    return true;
  }

  let didSpeak = false;
  const speakAfterVoicesLoad = () => {
    if (didSpeak) {
      return;
    }

    didSpeak = true;
    window.speechSynthesis.removeEventListener('voiceschanged', speakAfterVoicesLoad);
    speakNow(text, callbacks);
  };

  window.speechSynthesis.addEventListener('voiceschanged', speakAfterVoicesLoad);
  window.setTimeout(speakAfterVoicesLoad, 700);
  return true;
}

function speak(text: string, callbacks: SpeechCallbacks = {}, preparedAudio?: Blob) {
  const ttsMode = getTtsMode();

  if (ttsMode === 'browser') {
    return playBrowserSpeech(text, callbacks);
  }

  void playTtsSpeech(polishSpokenLine(text), callbacks, preparedAudio);
  return true;
}

function createEmptyAgentWorkflow(): AgentWorkflow {
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

function createEmptyWorkflowRevealState(): WorkflowRevealState {
  return {
    knowledgeAck: false,
    knowledgeExplanation: false,
    knowledgePath: false,
    recommendationAck: false,
    recommendationAgents: false,
    recommendationSummary: false,
  };
}

function getVisibleWorkflow(
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

function getRevealForSpeechSegment(segment: SpeechSegmentKey): Partial<WorkflowRevealState> {
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

function getTextKeyForSpeechSegment(segment: SpeechSegmentKey): WorkflowTextKey {
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

function createAgentTurn(id: string, user: string): AgentTurn {
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

function getWorkflowSection(event: AgentStreamEvent): keyof AgentWorkflow | null {
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

function appendWorkflowContent(workflow: AgentWorkflow, section: keyof AgentWorkflow, type: string | undefined, content: string) {
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

function setWorkflowGraphPath(workflow: AgentWorkflow, graphPath: AgentGraphPath): AgentWorkflow {
  return {
    ...workflow,
    knowledgeGraph: {
      ...workflow.knowledgeGraph,
      graphPath,
    },
  };
}

function setWorkflowLineupIntent(workflow: AgentWorkflow, lineupId: HeroHallLineupId | undefined): AgentWorkflow {
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

function upsertRecommendedAgent(workflow: AgentWorkflow, agent: RecommendedAgent | undefined, options: Partial<RecommendedAgent> = {}) {
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

function replaceRecommendedAgents(workflow: AgentWorkflow, agents: RecommendedAgent[]) {
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

function normalizeRecommendedAgent(agent: RecommendedAgent, fallbackIndex?: number): RecommendedAgent {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return agent;
  }

  if (fallbackIndex === undefined) {
    return agent;
  }

  return {
    agent_index: fallbackIndex,
    ...agent,
  };
}

function getRecommendedAgentKey(agent: RecommendedAgent) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || ''}-${agent.agent_name || agent.name || 'pending'}`;
}

function splitRouteText(routeText: string) {
  return String(routeText || '')
    .split(/\s*(?:>|›|→|->|-|—|–|\/|、|，|,)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function cleanStateText(value: unknown) {
  return String(value ?? '').trim();
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

function buildHeroHallLineupUserState(lineups: HeroHallLineupsState, agents: RecommendedAgent[]): AgentUserState {
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

function mergeAgentUserState(baseState: AgentUserState | undefined, lineupState: AgentUserState): AgentUserState | undefined {
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
    const lineupByName = new Map<string, AgentUserStateLineupAgent>(
      lineupEntries,
    );

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

function getLatestAgentUserState(turns: AgentTurn[]) {
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

function hasDisplayableRecommendedAgent(agent: RecommendedAgent) {
  return Boolean(cleanStateText(agent.agent_name || agent.name || agent.stage || agent.reason));
}

function getLatestDisplayableRecommendedAgents(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const agents = turns[index].workflow.agentRecommendation.agents;

    if (agents.some(hasDisplayableRecommendedAgent)) {
      return agents;
    }
  }

  return [];
}

function getLatestRouteSegments(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const route = splitRouteText(turns[index].workflow.knowledgeGraph.KG_PATH);

    if (route.length > 0) {
      return route;
    }
  }

  return [];
}

function getLatestRecommendationSummary(turns: AgentTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const summary = cleanStateText(turns[index].workflow.agentRecommendation.SUMMARY);

    if (summary) {
      return summary;
    }
  }

  return '';
}

function getActionFromRoute(routeText: string): AgentAction | null {
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

function buildAgentReplyText(workflow: AgentWorkflow, fallbackText = '') {
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

function getCompletedSpeechSegment(event: AgentStreamEvent): SpeechSegmentKey | null {
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

function getSpeechTextForSegment(workflow: AgentWorkflow, segment: SpeechSegmentKey) {
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

function extractAckSpeechText(text: string) {
  const matches = String(text || '').matchAll(/<ACK\b[^>]*>([\s\S]*?)<\/ACK>/gi);

  return Array.from(matches)
    .map((match) => cleanSpeechText(match[1] || ''))
    .filter(Boolean)
    .join('\n\n');
}

function cleanSpeechText(text: string) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function stripSpeechTagSyntax(text: string) {
  return String(text || '')
    .replace(/<\/?(?:ACK|EXPLANATION|EXPLATION|SUMMARY)\b[^>]*>/gi, '')
    .trim();
}

function normalizeSubtitleText(text: string) {
  return stripSpeechTagSyntax(text).replace(/\s+/g, ' ').trim();
}

function hasAgentOutput(turn: AgentTurn | null) {
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

function formatWorkflowError(event: AgentStreamEvent) {
  if (typeof event.detail === 'string') {
    return event.detail;
  }

  if (typeof event.error === 'string') {
    return event.error;
  }

  return '智能体接口返回异常';
}

function getAgentDisplayName(agent: RecommendedAgent) {
  return String(agent.agent_name || agent.name || '智能体生成中');
}

function getAgentStage(agent: RecommendedAgent, index: number) {
  return String(agent.stage || ['核心阶段', '需求挖掘', '精准定位'][index % 3]);
}

function updateTurnById(turnId: string, update: (turn: AgentTurn) => AgentTurn) {
  return (current: AgentTurn[]) => current.map((turn) => (turn.id === turnId ? update(turn) : turn));
}

function mergeConversationIdsFromEvent(current: AgentConversationIds, event: AgentStreamEvent) {
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

export default function App() {
  const demoGraphEnabled = new URLSearchParams(window.location.search).has('demoGraph');
  const speechCaptionTimerRef = useRef<number | null>(null);
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const speechSessionRef = useRef(0);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ start: () => Promise<void>; stop: () => void } | null>(null);
  const lastSpeechPulseAtRef = useRef(0);
  const agentRequestRef = useRef<AbortController | null>(null);
  const agentConversationIdsRef = useRef<AgentConversationIds>(createClientConversationIds());
  const lastHeroHallAutoKeyRef = useRef('');
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
  const [, setConversationIdsVersion] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [heroHallOpen, setHeroHallOpen] = useState(false);
  const [heroHallLineupState, setHeroHallLineupState] = useState<HeroHallLineupsState>(() => createHeroHallLineups());
  const [pinnedRecommendedAgents, setPinnedRecommendedAgents] = useState<RecommendedAgent[]>([]);
  const [routeDockVisible, setRouteDockVisible] = useState(demoGraphEnabled);
  const [recommendationDockVisible, setRecommendationDockVisible] = useState(false);
  const [workflowHighlight, setWorkflowHighlight] = useState<WorkflowHighlight>('none');
  const [draft, setDraft] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [interfaceLanguage, setInterfaceLanguage] = useState<ConversationLanguage>('zh-CN');
  const [lastAction, setLastAction] = useState<AgentAction | null>(demoGraphEnabled ? demoGraphAction : null);
  const [lastHeard, setLastHeard] = useState('');
  const [manualVoiceSession, setManualVoiceSession] = useState(false);
  const recognitionLanguage: ConversationLanguage = 'zh-CN';
  const [currentSpeechText, setCurrentSpeechText] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, speaker: 'ai', text: '晚上好，先生。系统已上线，正在待命。' },
  ]);

  const rememberConversationIds = useCallback((event: AgentStreamEvent) => {
    const nextConversationIds = mergeConversationIdsFromEvent(agentConversationIdsRef.current, event);

    if (nextConversationIds === agentConversationIdsRef.current) {
      return;
    }

    agentConversationIdsRef.current = nextConversationIds;
    setConversationIdsVersion((version) => version + 1);
  }, []);

  const clearSpeechEndTimer = useCallback(() => {
    if (speechEndTimerRef.current !== null) {
      window.clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
  }, []);

  const clearSpeechCaptionTimer = useCallback(() => {
    if (speechCaptionTimerRef.current !== null) {
      window.clearTimeout(speechCaptionTimerRef.current);
      speechCaptionTimerRef.current = null;
    }
  }, []);

  const startSpeechCaption = useCallback(
    (displayText: string, speechSessionId: number) => {
      clearSpeechCaptionTimer();
      setCurrentSpeechText('');

      const normalizedDisplayText = displayText.trim();

      if (!normalizedDisplayText) {
        return;
      }

      const chunkSize = normalizedDisplayText.length > 150 ? 5 : normalizedDisplayText.length > 72 ? 4 : 3;
      let cursor = 0;

      const tick = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        cursor = Math.min(normalizedDisplayText.length, cursor + chunkSize);
        setCurrentSpeechText(normalizedDisplayText.slice(0, cursor));

        if (cursor < normalizedDisplayText.length) {
          speechCaptionTimerRef.current = window.setTimeout(tick, 26);
        } else {
          speechCaptionTimerRef.current = null;
        }
      };

      tick();
    },
    [clearSpeechCaptionTimer],
  );

  const beginSpeechOutput = useCallback(() => {
    clearSpeechEndTimer();
    speechOutputActiveRef.current = true;
    lastSpeechPulseAtRef.current = performance.now();
    setSettings((current) => ({ ...current, energy: 1, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
  }, [clearSpeechEndTimer]);

  const pulseSpeechOutput = useCallback(() => {
    const now = performance.now();

    if (now - lastSpeechPulseAtRef.current < 420) {
      return;
    }

    lastSpeechPulseAtRef.current = now;
    setSettings((current) => ({ ...current, energy: 1, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
  }, []);

  const finishSpeechOutput = useCallback(() => {
    clearSpeechEndTimer();
    clearSpeechCaptionTimer();
    speechOutputActiveRef.current = false;
    setCurrentSpeechText('');
    setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
  }, [clearSpeechCaptionTimer, clearSpeechEndTimer]);

  const speakWithParticleOutput = useCallback(
    (text: string, options: SpeechOutputOptions = {}) => {
      const shouldResumeListening = options.resumeListening ?? true;
      const speechSessionId = speechSessionRef.current + 1;
      speechSessionRef.current = speechSessionId;

      setSpeechError('');
      startSpeechCaption(options.displayText ?? text, speechSessionId);
      voiceControlRef.current?.pause();
      beginSpeechOutput();

      const estimatedDuration = Math.min(15000, Math.max(5600, text.length * 92));
      const startedAt = performance.now();
      const settleSpeechOutput = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        finishSpeechOutput();
        if (shouldResumeListening) {
          window.setTimeout(() => {
            void micLevelRef.current?.start();
            voiceControlRef.current?.resume();
          }, 260);
        }

        options.onSettled?.();
      };
      const finishAfterMinimum = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        const elapsed = performance.now() - startedAt;
        const minimumVisualDuration = options.minimumVisualDurationMs ?? Math.min(estimatedDuration, 5200);
        const remaining = Math.max(0, minimumVisualDuration - elapsed);

        clearSpeechEndTimer();
        speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, remaining);
      };
      const queued = speak(
        text,
        {
          onEnd: finishAfterMinimum,
          onError: (reason) => {
            if (speechSessionId === speechSessionRef.current) {
              setSpeechError(reason);
            }
          },
          onPulse: () => {
            if (speechSessionId === speechSessionRef.current) {
              pulseSpeechOutput();
            }
          },
          onStart: () => {
            if (speechSessionId === speechSessionRef.current) {
              beginSpeechOutput();
            }
          },
        },
        options.audioBlob,
      );

      speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, queued ? estimatedDuration + 30000 : 5200);
    },
    [beginSpeechOutput, clearSpeechEndTimer, finishSpeechOutput, pulseSpeechOutput, startSpeechCaption],
  );

  const finishReplyWithoutSpeech = useCallback(
    (shouldResumeListening: boolean) => {
      clearSpeechEndTimer();
      clearSpeechCaptionTimer();
      speechOutputActiveRef.current = false;
      setCurrentSpeechText('');
      setSpeechError('');
      setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));

      if (shouldResumeListening) {
        window.setTimeout(() => {
          void micLevelRef.current?.start();
          voiceControlRef.current?.resume();
        }, 260);
      }
    },
    [clearSpeechCaptionTimer, clearSpeechEndTimer],
  );

  const submitMessage = useCallback(
    async (raw: string, options: SubmitMessageOptions = {}) => {
      const text = raw.trim();

      if (!text) {
        return;
      }

      if (agentStatus === 'streaming' || agentRequestRef.current) {
        return;
      }

      const shouldResumeListening = options.resumeListening ?? (inputMode === 'voice' && (voiceAwake || manualVoiceSession));
      const now = Date.now();
      const nextUserMessage: Message = { id: now, speaker: 'you', text };
      const turnId = `turn-${now}`;
      const controller = new AbortController();
      const history = [...messages, nextUserMessage];
      agentConversationIdsRef.current = ensureClientConversationIds(agentConversationIdsRef.current);
      const conversationIdsForRequest = { ...agentConversationIdsRef.current };
      const latestRecommendedAgentsForState = getLatestDisplayableRecommendedAgents(agentTurns);
      const recommendedAgentsForLineupState =
        latestRecommendedAgentsForState.length > 0 ? latestRecommendedAgentsForState : pinnedRecommendedAgents;
      const lineupStateForRequest = buildHeroHallLineupUserState(heroHallLineupState, recommendedAgentsForLineupState);
      const userStateForRequest = mergeAgentUserState(getLatestAgentUserState(agentTurns), lineupStateForRequest);
      const requestedLineupForRequest = detectRequestedLineupFromText(text);

      agentRequestRef.current = controller;
      voiceControlRef.current?.pause();
      micLevelRef.current?.stop();
      setDraft('');
      setReplySource('coze-stream');
      setAgentStatus('streaming');
      setLastHeard('');
      setWorkflowHighlight('none');
      setAgentTurns((current) => [...current.slice(-9), createAgentTurn(turnId, text)]);
      setMessages((current) => [
        ...current.slice(-18),
        nextUserMessage,
        { id: now + 1, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));

      let accumulatedWorkflow = setWorkflowLineupIntent(createEmptyAgentWorkflow(), requestedLineupForRequest);
      let revealState: WorkflowRevealState = { ...createEmptyWorkflowRevealState(), knowledgeAck: true };
      let cardsCompleted = false;
      let routeActionReady = false;
      let committedRouteAction: AgentAction | null = null;
      let routeKey = '';
      let hasSeenKnowledgePath = false;
      let streamError = '';
      let speechSegmentsClosed = false;
      let requestedLineupForResponse = requestedLineupForRequest;
      let appliedLineupFallback = false;
      const cardReadyWaiters: Array<(ready: boolean) => void> = [];
      const routeActionWaiters: Array<(action: AgentAction | null) => void> = [];
      const speechAssets = new Map<SpeechSegmentKey, PreloadedSpeechAsset>();
      const speechWaiters = new Map<SpeechSegmentKey, Array<(asset: PreloadedSpeechAsset | null) => void>>();
      const textOverrides: WorkflowTextOverrides = new Map();
      let agentRevealCount: number | null = null;
      const publishVisibleWorkflow = () => {
        const visibleWorkflow = getVisibleWorkflow(accumulatedWorkflow, revealState, textOverrides, agentRevealCount);
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, workflow: visibleWorkflow })));
      };
      const commitWorkflow = (workflow: AgentWorkflow) => {
        accumulatedWorkflow = workflow;
        publishVisibleWorkflow();
      };
      const revealWorkflow = (nextReveal: Partial<WorkflowRevealState>) => {
        revealState = { ...revealState, ...nextReveal };
        publishVisibleWorkflow();
      };
      const isSpeechSegmentVisible = (segment: SpeechSegmentKey) => {
        if (segment === 'knowledgeAck') {
          return revealState.knowledgeAck;
        }

        if (segment === 'knowledgeExplanation') {
          return revealState.knowledgeExplanation;
        }

        if (segment === 'recommendationAck') {
          return revealState.recommendationAck;
        }

        return revealState.recommendationSummary;
      };
      const replayBufferedText = async (key: WorkflowTextKey, text: string) => {
        const normalizedText = text.trim();

        if (!normalizedText) {
          textOverrides.delete(key);
          publishVisibleWorkflow();
          return;
        }

        const chunkSize = normalizedText.length > 140 ? 5 : normalizedText.length > 72 ? 4 : 3;

        for (let index = chunkSize; index < normalizedText.length; index += chunkSize) {
          if (controller.signal.aborted) {
            return;
          }

          textOverrides.set(key, normalizedText.slice(0, index));
          publishVisibleWorkflow();
          await wait(24);
        }

        textOverrides.delete(key);
        publishVisibleWorkflow();
      };
      const revealSpeechSegment = (segment: SpeechSegmentKey, text: string) => {
        const alreadyVisible = isSpeechSegmentVisible(segment);
        const textKey = getTextKeyForSpeechSegment(segment);

        if (!alreadyVisible) {
          textOverrides.set(textKey, '');
        }

        revealWorkflow(getRevealForSpeechSegment(segment));

        if (!alreadyVisible) {
          void replayBufferedText(textKey, text);
        }
      };
      const commitRouteAction = (routeText: string) => {
        const routeAction = getActionFromRoute(routeText);

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return;
        }

        const nextRouteKey = routeAction.route.join('/');

        if (nextRouteKey === routeKey) {
          return;
        }

        routeKey = nextRouteKey;
        routeActionReady = true;
        committedRouteAction = routeAction;
        routeActionWaiters.splice(0).forEach((resolve) => resolve(routeAction));
      };
      const commitKnowledgePathIfReady = () => {
        if (!hasSeenKnowledgePath || routeActionReady) {
          return;
        }

        commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
      };
      const commitTurnError = (error: string) => {
        streamError = error;
        setAgentStatus('error');
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, error, status: 'error' })));
      };
      const preloadSpeechSegment = (segment: SpeechSegmentKey) => {
        const segmentText = getSpeechTextForSegment(accumulatedWorkflow, segment);

        if (!segmentText) {
          return;
        }

        const existing = speechAssets.get(segment);
        if (existing?.text === segmentText) {
          return;
        }

        const asset: PreloadedSpeechAsset = {
          audioPromise: requestTtsAudio(segmentText),
          text: segmentText,
        };
        speechAssets.set(segment, asset);
        speechWaiters.get(segment)?.splice(0).forEach((resolve) => resolve(asset));
      };
      const waitForSpeechSegment = (segment: SpeechSegmentKey) => {
        const existing = speechAssets.get(segment);

        if (existing) {
          return Promise.resolve(existing);
        }

        if (speechSegmentsClosed) {
          return Promise.resolve(null);
        }

        return new Promise<PreloadedSpeechAsset | null>((resolve) => {
          const timer = window.setTimeout(() => resolve(null), SPEECH_SEGMENT_WAIT_MS);
          const resolveOnce = (asset: PreloadedSpeechAsset | null) => {
            window.clearTimeout(timer);
            resolve(asset);
          };
          const waiters = speechWaiters.get(segment) || [];
          waiters.push(resolveOnce);
          speechWaiters.set(segment, waiters);
        });
      };
      const closeSpeechSegments = () => {
        speechSegmentsClosed = true;
        speechWaiters.forEach((waiters) => waiters.splice(0).forEach((resolve) => resolve(null)));
      };
      const playSpeechSegment = async (segment: SpeechSegmentKey) => {
        const asset = await waitForSpeechSegment(segment);
        const speechText = asset?.text || getSpeechTextForSegment(accumulatedWorkflow, segment);

        if (!speechText) {
          return;
        }

        revealSpeechSegment(segment, speechText);

        const audioBlob = asset
          ? await asset.audioPromise.catch((error) => {
              if (!isFallbackableTtsError(error)) {
                setSpeechError(error instanceof Error ? error.message : 'TTS preload failed.');
              }
              return null;
            })
          : undefined;

        await new Promise<void>((resolve) => {
          speakWithParticleOutput(speechText, {
            audioBlob: audioBlob ?? undefined,
            displayText: speechText,
            minimumVisualDurationMs: 0,
            onSettled: resolve,
            resumeListening: false,
          });
        });
      };
      const waitForRouteAction = () => {
        if (committedRouteAction) {
          return Promise.resolve(committedRouteAction);
        }

        return new Promise<AgentAction | null>((resolve) => {
          routeActionWaiters.push(resolve);
        });
      };
      const closeRouteAction = () => {
        if (routeActionWaiters.length === 0) {
          return;
        }

        routeActionWaiters.splice(0).forEach((resolve) => resolve(getActionFromRoute(accumulatedWorkflow.knowledgeGraph.KG_PATH)));
      };
      const markCardsReady = () => {
        cardsCompleted = true;
        cardReadyWaiters.splice(0).forEach((resolve) => resolve(true));
      };
      const markCardsReadyIfAvailable = () => {
        if (accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          markCardsReady();
        }
      };
      const applyLineupFallbackAgents = (lineupId: HeroHallLineupId) => {
        if (appliedLineupFallback && requestedLineupForResponse === lineupId) {
          return;
        }

        const fallbackAgents = getCatalogAgentsForLineup(lineupId);

        if (fallbackAgents.length === 0) {
          return;
        }

        appliedLineupFallback = true;
        requestedLineupForResponse = lineupId;
        commitWorkflow(setWorkflowLineupIntent(replaceRecommendedAgents(accumulatedWorkflow, fallbackAgents), lineupId));
        agentRevealCount = null;
        revealWorkflow({ recommendationAgents: true });
        setHeroHallLineupState((current) =>
          mergeHeroHallLineups(
            current,
            createHeroHallLineupsFromAgents(
              fallbackAgents.map((agent) => ({
                agent,
                key: getHeroHallAgentKey(agent),
              })),
            ),
          ),
        );
        setHeroHallOpen(true);
        setRecommendationDockVisible(true);
        setWorkflowHighlight('agents');
        markCardsReady();
      };
      const closeCardsReady = () => {
        const hasCards = accumulatedWorkflow.agentRecommendation.agents.length > 0;

        if (hasCards) {
          cardsCompleted = true;
        }

        cardReadyWaiters.splice(0).forEach((resolve) => resolve(hasCards));
      };
      const waitForCardsReady = () => {
        if (cardsCompleted || accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          return Promise.resolve(true);
        }

        return new Promise<boolean>((resolve) => {
          const timer = window.setTimeout(() => resolve(false), SPEECH_SEGMENT_WAIT_MS);
          cardReadyWaiters.push((ready) => {
            window.clearTimeout(timer);
            resolve(ready);
          });
        });
      };
      const activatePathAnimation = async () => {
        const routeAction = await waitForRouteAction();

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return false;
        }

        revealWorkflow({ knowledgePath: true });
        setLastAction(routeAction);
        setRouteDockVisible(true);
        setWorkflowHighlight('route');
        return true;
      };
      const runCardAnimation = async () => {
        const hasCards = await waitForCardsReady();

        if (!hasCards) {
          return;
        }

        if (revealState.recommendationAgents) {
          agentRevealCount = null;
          publishVisibleWorkflow();
          await wait(RECOMMENDATION_DOCK_REVEAL_MS);
          return;
        }

        agentRevealCount = 1;
        revealWorkflow({ recommendationAgents: true });
        setRecommendationDockVisible(true);
        setWorkflowHighlight('agents');

        while (agentRevealCount < accumulatedWorkflow.agentRecommendation.agents.length) {
          if (controller.signal.aborted) {
            return;
          }

          await wait(260);
          agentRevealCount += 1;
          publishVisibleWorkflow();
        }

        agentRevealCount = null;
        publishVisibleWorkflow();
        await wait(RECOMMENDATION_DOCK_REVEAL_MS);
      };
      const revealCompletedWorkflow = () => {
        revealWorkflow({
          knowledgeAck: true,
          knowledgeExplanation: true,
          knowledgePath: true,
          recommendationAck: true,
          recommendationAgents: true,
          recommendationSummary: true,
        });
      };
      const orchestrationPromise = (async () => {
        await playSpeechSegment('knowledgeAck');
        const pathAnimationActive = await activatePathAnimation();
        if (pathAnimationActive) {
          await Promise.all([playSpeechSegment('knowledgeExplanation'), wait(PATH_MATCH_ANIMATION_MS)]);
        } else {
          await playSpeechSegment('knowledgeExplanation');
        }
        setWorkflowHighlight('none');
        await playSpeechSegment('recommendationAck');
        await Promise.all([playSpeechSegment('recommendationSummary'), runCardAnimation()]);
        setWorkflowHighlight('none');
        revealCompletedWorkflow();
      })();

      try {
        await streamAgentChat(text, {
          autoSaveHistory: true,
          conversationId: conversationIdsForRequest.route_planner,
          conversationIds: conversationIdsForRequest,
          requestedLineup: requestedLineupForRequest,
          signal: controller.signal,
          userState: userStateForRequest,
          onEvent(event) {
            rememberConversationIds(event);

            const speechSegment = getCompletedSpeechSegment(event);

            if (speechSegment) {
              preloadSpeechSegment(speechSegment);
              return;
            }
          },
          onCompleted(event) {
            rememberConversationIds(event);
            commitKnowledgePathIfReady();
          },
          onContentDelta(event) {
            const lineupIntent = getLineupIntentFromEvent(event);

            if (lineupIntent) {
              requestedLineupForResponse = lineupIntent;
              commitWorkflow(setWorkflowLineupIntent(accumulatedWorkflow, lineupIntent));
              applyLineupFallbackAgents(lineupIntent);
            }

            const section = getWorkflowSection(event);

            if (!section) {
              return;
            }

            const nextWorkflow = appendWorkflowContent(accumulatedWorkflow, section, event.type, event.content || '');
            commitWorkflow(nextWorkflow);

            if (event.stage === 'knowledge_graph' && event.type === 'KG_PATH') {
              hasSeenKnowledgePath = true;
              return;
            }

            commitKnowledgePathIfReady();
          },
          onGraphPathResolved(event) {
            const graphPath = {
              ...event,
              route: String(event.route || accumulatedWorkflow.knowledgeGraph.KG_PATH || ''),
            } as AgentGraphPath;
            const nextWorkflow = setWorkflowGraphPath(accumulatedWorkflow, graphPath);
            commitWorkflow(nextWorkflow);
            commitRouteAction(graphPath.route || '');
          },
          onRecommendedAgentStarted(event) {
            commitKnowledgePathIfReady();
            const agentIndex = typeof event.agent_index === 'number' ? event.agent_index : undefined;
            const nextWorkflow = upsertRecommendedAgent(
              accumulatedWorkflow,
              agentIndex === undefined ? undefined : { agent_index: agentIndex },
              { streamStatus: 'streaming' },
            );
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgent(agent, event) {
            commitKnowledgePathIfReady();
            const delta = event.delta as { field?: string } | undefined;
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: typeof delta?.field === 'string' ? delta.field : null,
              streamStatus: 'streaming',
            });
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgentCompleted(agent) {
            commitKnowledgePathIfReady();
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: null,
              streamStatus: 'completed',
            });
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgentsCompleted(agents) {
            commitKnowledgePathIfReady();
            const normalizedAgents = requestedLineupForResponse
              ? agents.map((agent) => ({
                  ...agent,
                  lineup: getRecommendedAgentLineup(agent) || requestedLineupForResponse,
                }))
              : agents;

            if (normalizedAgents.length > 0) {
              appliedLineupFallback = false;
            }

            commitWorkflow(
              setWorkflowLineupIntent(
                replaceRecommendedAgents(accumulatedWorkflow, normalizedAgents),
                requestedLineupForResponse,
              ),
            );
            markCardsReady();
          },
          onWorkflowError(event) {
            commitKnowledgePathIfReady();
            commitTurnError(formatWorkflowError(event));
          },
        });

        if (!routeActionReady) {
          commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
        }
        if (accumulatedWorkflow.agentRecommendation.agents.length === 0 && requestedLineupForResponse) {
          applyLineupFallbackAgents(requestedLineupForResponse);
        }
        if (accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          markCardsReady();
        } else {
          closeCardsReady();
        }
        closeSpeechSegments();
        closeRouteAction();

        const finalText = buildAgentReplyText(accumulatedWorkflow, streamError || 'Agent 已完成，但没有返回可展示内容。');
        const finalStatus: AgentStatus = streamError ? 'error' : 'completed';
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: finalText }];
        });
        setAgentStatus(finalStatus);
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, status: finalStatus })));
        void orchestrationPromise.finally(() => {
          finishReplyWithoutSpeech(shouldResumeListening);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          closeSpeechSegments();
          closeRouteAction();
          closeCardsReady();
          setWorkflowHighlight('none');
          return;
        }

        closeSpeechSegments();
        closeRouteAction();
        closeCardsReady();
        setWorkflowHighlight('none');

        try {
          const response = await requestAIReply(text, history);
          setReplySource(response.source);
          setAgentStatus('completed');
          setLastAction(response.actions[0] ?? null);
          setAgentTurns(
            updateTurnById(turnId, (turn) => ({
              ...turn,
              fallbackText: response.text,
              source: response.source,
              status: 'completed',
            })),
          );
          setMessages((current) => {
            const withoutThinking = current.filter((message) => message.text !== 'Processing...');
            return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: response.text }];
          });
          const speechText = extractAckSpeechText(response.spokenText ?? response.text);
          if (speechText) {
            speakWithParticleOutput(speechText, {
              displayText: speechText,
              resumeListening: shouldResumeListening,
            });
          } else {
            finishReplyWithoutSpeech(shouldResumeListening);
          }
        } catch {
          const fallback =
            error instanceof Error && error.message
              ? `智能体接口连接失败：${error.message}`
              : '智能体接口连接失败，本地操作仍保持在线。';

          setReplySource('local-mock');
          setAgentStatus('error');
          setLastAction({ type: 'chat' });
          setAgentTurns(
            updateTurnById(turnId, (turn) => ({
              ...turn,
              error: fallback,
              fallbackText: fallback,
              source: 'local-mock',
              status: 'error',
            })),
          );
          setMessages((current) => {
            const withoutThinking = current.filter((message) => message.text !== 'Processing...');
            return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: fallback }];
          });
          const speechText = extractAckSpeechText(fallback);
          if (speechText) {
            speakWithParticleOutput(speechText, { displayText: speechText, resumeListening: shouldResumeListening });
          } else {
            finishReplyWithoutSpeech(shouldResumeListening);
          }
        }
      } finally {
        if (agentRequestRef.current === controller) {
          agentRequestRef.current = null;
        }
      }
    },
    [
      agentStatus,
      agentTurns,
      finishReplyWithoutSpeech,
      heroHallLineupState,
      inputMode,
      manualVoiceSession,
      messages,
      pinnedRecommendedAgents,
      rememberConversationIds,
      speakWithParticleOutput,
      voiceAwake,
    ],
  );

  const handleVoiceCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();

      if (agentStatus === 'streaming' || agentRequestRef.current) {
        voiceControlRef.current?.pause();
        micLevelRef.current?.stop();
        setLastHeard('');
        return;
      }

      if (!text || speechOutputActiveRef.current) {
        return;
      }

      setLastHeard(text);
      setInputMode('voice');
      const inputLanguage = detectConversationLanguage(text);
      setInterfaceLanguage(inputLanguage);

      if (wantsSleep(text)) {
        setManualVoiceSession(false);
        setVoiceAwake(false);
        setLastAction(null);
        setLastHeard('');
        voiceControlRef.current?.stop();
        micLevelRef.current?.stop();
        setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
        return;
      }

      const wakeCommand = extractWakeCommand(text);

      if (!voiceAwake) {
        setManualVoiceSession(false);
        setVoiceAwake(true);

        if (wakeCommand?.command) {
          void submitMessage(wakeCommand.command, { resumeListening: true });
          return;
        }

        if (!wakeCommand) {
          void submitMessage(text, { resumeListening: true });
          return;
        }

        return;
      }

      void submitMessage(wakeCommand?.command || text, { resumeListening: true });
    },
    [agentStatus, speakWithParticleOutput, submitMessage, voiceAwake],
  );

  const voice = useVoiceControl(handleVoiceCommand, recognitionLanguage);
  voiceControlRef.current = { pause: voice.pause, resume: voice.resume, stop: voice.stop };
  const micLevel = useMicLevel();
  micLevelRef.current = { start: micLevel.start, stop: micLevel.stop };

  useEffect(() => {
    primeSpeechOutput();
    return () => {
      agentRequestRef.current?.abort();
      clearSpeechEndTimer();
      cancelSpeechPlayback();
    };
  }, [clearSpeechEndTimer]);

  const toggleManualVoiceSession = useCallback(() => {
    if (!voice.supported) {
      return;
    }

    primeSpeechOutput();
    setInputMode('voice');

    if (manualVoiceSession || voiceAwake) {
      speechSessionRef.current += 1;
      clearSpeechEndTimer();
      speechOutputActiveRef.current = false;
      cancelSpeechPlayback();
      window.speechSynthesis?.cancel();
      setManualVoiceSession(false);
      setVoiceAwake(false);
      setLastAction(null);
      setLastHeard('');
      setCurrentSpeechText('');
      setSpeechError('');
      voice.stop();
      micLevel.stop();
      setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
      return;
    }

    setManualVoiceSession(true);
    setVoiceAwake(true);
    setLastAction(null);
    setLastHeard('');
    voice.stop();
    setSettings((current) => ({ ...current, energy: 0.82, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    void micLevel.start();
    voice.start();

  }, [clearSpeechEndTimer, manualVoiceSession, micLevel, voice, voiceAwake]);

  const switchInputMode = useCallback(
    (nextMode: InputMode) => {
      setInputMode(nextMode);

      if (nextMode !== 'text') {
        return;
      }

      speechSessionRef.current += 1;
      clearSpeechEndTimer();
      speechOutputActiveRef.current = false;
      cancelSpeechPlayback();
      window.speechSynthesis?.cancel();
      setManualVoiceSession(false);
      setVoiceAwake(false);
      setLastHeard('');
      setCurrentSpeechText('');
      setSpeechError('');
      voice.stop();
      micLevel.stop();
      setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
    },
    [clearSpeechEndTimer, micLevel, voice],
  );

  const sendDraftMessage = useCallback(
    () => {
      void submitMessage(draft, { resumeListening: false });
    },
    [draft, submitMessage],
  );

  const handleDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }

      event.preventDefault();
      void submitMessage(draft, { resumeListening: false });
    },
    [draft, submitMessage],
  );

  const latestDisplayableRecommendedAgents = getLatestDisplayableRecommendedAgents(agentTurns);
  const recommendedAgents =
    latestDisplayableRecommendedAgents.length > 0 ? latestDisplayableRecommendedAgents : pinnedRecommendedAgents;
  const fallbackRoute = getLatestRouteSegments(agentTurns);
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : fallbackRoute;
  const dockRouteSegments = routeDockVisible && graphRoute.length > 0 ? graphRoute : [];
  const dockRecommendedAgents = recommendationDockVisible ? recommendedAgents : [];
  const graphFocusKey =
    graphRoute.length > 0
      ? `${lastAction?.type === 'focus_graph_path' ? lastAction.label : graphRoute.at(-1)}:${graphRoute.join('/')}`
      : '';
  const heroHallSummary = getLatestRecommendationSummary(agentTurns);
  const heroHallKey = recommendedAgents.map(getRecommendedAgentKey).join('|');
  const heroHallReady = agentStatus === 'completed' && recommendedAgents.length > 0 && Boolean(heroHallSummary);
  const readoutText =
    settings.mode === 'thinking'
      ? isChineseLanguage(interfaceLanguage)
        ? '思考中...'
        : 'Thinking...'
      : settings.mode === 'speaking'
        ? currentSpeechText
        : '';
  const voiceCaptionError = inputMode === 'text' ? '' : speechError || voice.error || micLevel.error;
  const captionText =
    voiceCaptionError ||
    (inputMode === 'text'
      ? ''
      : voice.listening
        ? voiceAwake
          ? lastHeard
            ? isChineseLanguage(interfaceLanguage)
              ? `语音模式已激活。听到：${lastHeard}`
              : `Voice mode active. Heard: ${lastHeard}`
            : isChineseLanguage(interfaceLanguage)
              ? '语音模式已激活，可以直接说。'
              : 'Voice mode active. Speak naturally.'
        : isChineseLanguage(interfaceLanguage)
          ? '说“贾维斯”唤醒语音模式。'
          : 'Say "Jarvis" to wake voice mode.'
      : isChineseLanguage(interfaceLanguage)
        ? '语音待命。'
        : 'Voice standby.');

  useEffect(() => {
    if (latestDisplayableRecommendedAgents.length > 0) {
      setPinnedRecommendedAgents(latestDisplayableRecommendedAgents);
    }
  }, [latestDisplayableRecommendedAgents]);

  useEffect(() => {
    if (!heroHallReady || !heroHallKey || lastHeroHallAutoKeyRef.current === heroHallKey) {
      return undefined;
    }

    lastHeroHallAutoKeyRef.current = heroHallKey;
    const timer = window.setTimeout(() => setHeroHallOpen(true), 620);

    return () => window.clearTimeout(timer);
  }, [heroHallKey, heroHallReady]);

  return (
    <main className="app-shell" data-hero-hall={heroHallOpen}>
      <ParticleField
        audioLevel={micLevel.level}
        graphFocusKey={graphFocusKey}
        graphRoute={graphRoute}
        settings={settings}
      />
      <div className="scene-vignette" />
      <WorkflowDock
        active={agentStatus === 'streaming' || workflowHighlight !== 'none'}
        agents={dockRecommendedAgents}
        highlight={workflowHighlight}
        onOpenHeroHall={() => setHeroHallOpen(true)}
        routeSegments={dockRouteSegments}
      />
      <AgentHeroHall
        agents={recommendedAgents}
        open={heroHallOpen}
        onClose={() => setHeroHallOpen(false)}
        onLineupsChange={setHeroHallLineupState}
        routeSegments={graphRoute}
      />

      {!heroHallOpen ? (
        <section className="dialogue-stage" aria-label="AI particle dialogue">
          {captionText ? (
            <div className="orb-caption" data-testid="conversation-state">
              <Sparkles size={16} />
              <span>{captionText}</span>
            </div>
          ) : null}

          {readoutText ? (
            <div className="voice-readout" aria-live="polite">
              <span>{readoutText}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <AgentConsole
        draft={draft}
        inputMode={inputMode}
        onDraftKeyDown={handleDraftKeyDown}
        onModeChange={switchInputMode}
        onSend={sendDraftMessage}
        onToggleVoice={toggleManualVoiceSession}
        setDraft={setDraft}
        speakingText={currentSpeechText}
        status={agentStatus}
        turns={agentTurns}
        voiceHeardText={lastHeard}
        voiceAwake={voiceAwake}
        voiceListening={voice.listening}
        voiceTranscript={voice.transcript}
        voiceSupported={voice.supported}
      />
    </main>
  );
}

function WorkflowDock({
  active,
  agents,
  highlight,
  onOpenHeroHall,
  routeSegments,
}: {
  active: boolean;
  agents: RecommendedAgent[];
  highlight: WorkflowHighlight;
  onOpenHeroHall: () => void;
  routeSegments: string[];
}) {
  const hasRoute = routeSegments.length > 0;
  const hasAgents = agents.length > 0;
  const visibleAgents = agents;
  const agentListRef = useRef<HTMLDivElement>(null);
  const agentListKey = visibleAgents.map(getRecommendedAgentKey).join('|');

  useEffect(() => {
    const list = agentListRef.current;

    if (list) {
      list.scrollTop = 0;
    }
  }, [agentListKey]);

  if (!hasRoute && !hasAgents) {
    return null;
  }

  return (
    <aside
      className="workflow-dock"
      data-active={active}
      data-highlight={highlight}
      aria-label="Agent workflow context"
    >
      {hasRoute ? <RouteResult highlighted={highlight === 'route'} routeSegments={routeSegments} /> : null}
      {hasAgents ? (
        <section className={`workflow-dock-section workflow-agent-panel ${highlight === 'agents' ? 'is-prism' : ''}`}>
          <div className="workflow-dock-title">
            <Sparkles size={14} />
            <strong>推荐智能体</strong>
            <span>{agents.length}</span>
          </div>
          <div className="workflow-agent-list" ref={agentListRef}>
            {visibleAgents.map((agent, index) => (
              <RecommendedAgentCard agent={agent} index={index} key={getRecommendedAgentKey(agent)} />
            ))}
          </div>
          <RecommendedAgentLaunchBar agents={agents} onOpenHeroHall={onOpenHeroHall} />
        </section>
      ) : null}
    </aside>
  );
}

type AgentConsoleProps = {
  draft: string;
  inputMode: InputMode;
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (mode: InputMode) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  setDraft: (value: string) => void;
  speakingText: string;
  status: AgentStatus;
  turns: AgentTurn[];
  voiceAwake: boolean;
  voiceHeardText: string;
  voiceListening: boolean;
  voiceTranscript: string;
  voiceSupported: boolean;
};

function AgentConsole({
  draft,
  inputMode,
  onDraftKeyDown,
  onModeChange,
  onSend,
  onToggleVoice,
  setDraft,
  speakingText,
  status,
  turns,
  voiceAwake,
  voiceHeardText,
  voiceListening,
  voiceTranscript,
  voiceSupported,
}: AgentConsoleProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isStreaming = status === 'streaming';
  const visibleVoiceText = voiceHeardText || voiceTranscript;
  const latestTurn = turns.at(-1) ?? null;
  const latestTurnId = latestTurn?.id ?? '';
  const hasTurns = turns.length > 0;
  const pendingVoiceText = inputMode === 'voice' && !hasTurns ? visibleVoiceText : '';

  const scrollThreadToBottom = useCallback(() => {
    const thread = threadRef.current;

    if (!thread) {
      return;
    }

    thread.scrollTop = thread.scrollHeight;
  }, []);

  const handleThreadScroll = useCallback(() => {
    const thread = threadRef.current;

    if (!thread) {
      return;
    }

    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 28;
  }, []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scrollThreadToBottom();
  }, [latestTurnId, scrollThreadToBottom]);

  useLayoutEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollThreadToBottom();
    }
  }, [pendingVoiceText, scrollThreadToBottom, status, turns]);

  const handleComposerSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSend();
    },
    [onSend],
  );

  return (
    <aside
      className="agent-console"
      data-has-turn={hasTurns}
      data-input-mode={inputMode}
      data-status={status}
      aria-label="Agent response panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {hasTurns || pendingVoiceText ? (
        <div className="agent-console-thread" aria-live="polite" onScroll={handleThreadScroll} ref={threadRef}>
          {hasTurns ? (
            <>
              {turns.map((turn) => (
                <section className="agent-turn" key={turn.id}>
                  <article className="agent-user-line">
                    <span aria-hidden="true">
                      <UserRound size={14} />
                    </span>
                    <p>{turn.user}</p>
                  </article>
                  <AgentResponse
                    active={turn.status === 'streaming'}
                    speakingText={turn.id === latestTurnId ? speakingText : ''}
                    turn={turn}
                  />
                </section>
              ))}
            </>
          ) : (
            <article className="agent-user-line">
              <span aria-hidden="true">
                <UserRound size={14} />
              </span>
              <p>{pendingVoiceText}</p>
            </article>
          )}
        </div>
      ) : null}

      <div className="agent-input-hub">
        <div className="agent-mode-switch" role="tablist" aria-label="输入模式">
          <button
            type="button"
            aria-selected={inputMode === 'voice'}
            className={inputMode === 'voice' ? 'active' : ''}
            onClick={() => onModeChange('voice')}
            role="tab"
          >
            <Mic size={15} />
            <span>语音</span>
          </button>
          <button
            type="button"
            aria-selected={inputMode === 'text'}
            className={inputMode === 'text' ? 'active' : ''}
            onClick={() => onModeChange('text')}
            role="tab"
          >
            <Keyboard size={15} />
            <span>打字</span>
          </button>
        </div>

        {inputMode === 'voice' ? (
          <div className="agent-voice-module">
            <div className="voice-presence" aria-hidden="true" data-active={voiceListening} data-awake={voiceAwake} />
            <button
              aria-label={voiceAwake ? 'Stand down voice mode' : 'Wake voice mode'}
              aria-pressed={voiceAwake}
              className="voice-toggle"
              data-active={voiceAwake}
              disabled={!voiceSupported || isStreaming}
              onClick={onToggleVoice}
              title={voiceAwake ? 'Stand down' : 'Wake voice'}
              type="button"
            >
              {voiceAwake ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <em>{voiceSupported ? (voiceAwake ? '语音已激活' : '语音待命') : '语音不可用'}</em>
          </div>
        ) : (
          <form className="agent-composer" onSubmit={handleComposerSubmit}>
            <textarea
              value={draft}
              disabled={isStreaming}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder={isStreaming ? 'Agent 正在生成...' : '问你的 agent...'}
              rows={1}
            />
            <button type="submit" disabled={!draft.trim() || isStreaming} aria-label="发送给 agent">
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

function AgentResponse({ active, speakingText, turn }: { active: boolean; speakingText: string; turn: AgentTurn }) {
  const workflow = turn.workflow;
  const knowledgeGraph = workflow.knowledgeGraph;
  const recommendation = workflow.agentRecommendation;
  const routeSegments = splitRouteText(knowledgeGraph.KG_PATH);
  const lineupIntent = normalizeHeroHallLineupId(recommendation.lineupIntent);
  const lineupAgentCount = lineupIntent
    ? recommendation.agents.filter((agent) => getRecommendedAgentLineup(agent) === lineupIntent).length ||
      recommendation.agents.length
    : 0;
  const showOutput = hasAgentOutput(turn);

  if (!showOutput && active) {
    return <TypingLine />;
  }

  return (
    <article className="agent-response">
      {renderThinkingText('思考过程', knowledgeGraph.THINKING_PROCESS, active && !knowledgeGraph.ACK)}
      {renderAgentSubtitle(knowledgeGraph.DIRECT_REPLY, speakingText)}
      {renderAgentSubtitle(knowledgeGraph.ACK, speakingText)}
      {renderToolCallDivider('route', routeSegments.length)}
      {renderAgentSubtitle(knowledgeGraph.EXPLANATION, speakingText)}
      {renderThinkingText('推荐思考', recommendation.THINKING_PROCESS, active && !recommendation.ACK)}
      {renderAgentSubtitle(recommendation.ACK, speakingText)}
      {renderToolCallDivider('lineup', lineupAgentCount, lineupIntent)}
      {renderToolCallDivider('agents', recommendation.agents.length)}
      {renderAgentSubtitle(recommendation.SUMMARY, speakingText)}
      {renderAgentSubtitle(turn.fallbackText, speakingText)}
      {turn.error && <p className="agent-error-text">{turn.error}</p>}
      {active && <TypingLine />}
    </article>
  );
}

function renderToolCallDivider(kind: 'agents' | 'lineup' | 'route', count: number, lineupId?: HeroHallLineupId) {
  if (kind === 'lineup' && !lineupId) {
    return null;
  }

  if (count <= 0 && kind !== 'lineup') {
    return null;
  }

  const isRoute = kind === 'route';
  const isLineup = kind === 'lineup';
  const lineupLabel = getHeroHallLineupLabel(lineupId);
  const title = isRoute ? '知识路径工具调用' : isLineup ? `${lineupLabel}工具调用` : '智能体推荐工具调用';
  const detail = isRoute
    ? `${count} 个路径节点已匹配`
    : isLineup
      ? count > 0
        ? `${count} 个${lineupLabel}智能体已匹配`
        : `正在匹配${lineupLabel}智能体`
      : `${count} 个推荐智能体已生成`;

  return (
    <section className={`agent-tool-call agent-tool-call-${kind}`} aria-label={title}>
      <span className="agent-tool-call-rail" />
      <div className="agent-tool-call-core">
        <span className="agent-tool-call-icon" aria-hidden="true">
          {isRoute ? <GitBranch size={13} /> : isLineup ? <Trophy size={13} /> : <Sparkles size={13} />}
        </span>
        <strong>{title}</strong>
        <em>{detail}</em>
      </div>
      <span className="agent-tool-call-rail" />
    </section>
  );
}

function renderThinkingText(label: string, text: string, active: boolean) {
  const visibleText = stripSpeechTagSyntax(text);

  if (!visibleText) {
    return null;
  }

  return (
    <section className="agent-thinking-stream" data-active={active} data-collapsed={!active}>
      <div>
        <BrainCircuit size={13} />
        <strong>{label}</strong>
      </div>
      <p>{visibleText}</p>
    </section>
  );
}

function renderAgentSubtitle(text: string, speakingText: string) {
  const visibleText = stripSpeechTagSyntax(text);
  const normalizedVisibleText = normalizeSubtitleText(visibleText);
  const normalizedSpeakingText = normalizeSubtitleText(speakingText);
  const isSpeaking = Boolean(
    normalizedVisibleText &&
      normalizedSpeakingText &&
      (normalizedVisibleText === normalizedSpeakingText ||
        normalizedVisibleText.startsWith(normalizedSpeakingText) ||
        normalizedSpeakingText.startsWith(normalizedVisibleText)),
  );

  return visibleText ? (
    <section className="agent-subtitle-line" data-speaking={isSpeaking}>
      <p>{visibleText}</p>
    </section>
  ) : null;
}

function RouteResult({ highlighted, routeSegments }: { highlighted: boolean; routeSegments: string[] }) {
  return (
    <section className={`workflow-dock-section workflow-route-panel ${highlighted ? 'is-prism' : ''}`}>
      <div className="workflow-dock-title">
        <GitBranch size={14} />
        <strong>知识路径</strong>
        <span>{routeSegments.length}</span>
      </div>
      <div className="workflow-route-chain">
        {routeSegments.map((segment, index) => (
          <span data-current={index === routeSegments.length - 1} key={`${index}-${segment}`}>
            {segment}
          </span>
        ))}
      </div>
    </section>
  );
}

function RecommendedAgentCard({ agent, index }: { agent: RecommendedAgent; index: number }) {
  const enrichedAgent = enrichDrawAgent(agent);
  const active = agent.streamStatus !== 'completed';
  const name = enrichedAgent.name || getAgentDisplayName(agent);
  const stage = enrichedAgent.stageLabel || getAgentStage(agent, index);
  const reason = String(agent.reason || enrichedAgent.fallbackReason || '').trim();
  const variant = ['cyan', 'gold', 'violet'][index % 3];
  const canOpen = Boolean(enrichedAgent.launchTarget);
  const statusLabel = active ? '匹配中' : canOpen ? '可打开' : '已匹配';
  const cardClassName = `recommended-agent-card recommended-agent-${variant} ${canOpen ? 'is-clickable' : 'is-static'}`;
  const cardBody = (
    <>
      <span className="recommended-agent-index">{String(index + 1).padStart(2, '0')}</span>
      <span className={`recommended-agent-avatar ${enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
        {enrichedAgent.avatar ? <img alt="" loading="lazy" src={enrichedAgent.avatar} /> : <Sparkles size={18} />}
      </span>
      <div className="recommended-agent-copy">
        <div className="recommended-agent-head">
          <strong title={name}>{name}</strong>
          <span className="recommended-agent-status">{statusLabel}</span>
        </div>
        <div className="recommended-agent-meta">
          <em title={stage}>{stage}</em>
          <span>{enrichedAgent.metaLabel}</span>
        </div>
        {reason ? <p>{reason}</p> : null}
      </div>
      <span className="recommended-agent-open-hint">
        {canOpen ? (
          <>
            <ExternalLink size={13} />
            打开
          </>
        ) : (
          '待补链接'
        )}
      </span>
    </>
  );

  if (canOpen) {
    return (
      <a className={cardClassName} data-active={active} href={enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
        {cardBody}
      </a>
    );
  }

  return (
    <article aria-disabled="true" aria-label={`${name} 推荐智能体`} className={cardClassName} data-active={active}>
      {cardBody}
    </article>
  );
}

function RecommendedAgentLaunchBar({ agents, onOpenHeroHall }: { agents: RecommendedAgent[]; onOpenHeroHall: () => void }) {
  const enrichedAgents = agents.map(enrichDrawAgent);
  const launchTargets = getAgentLaunchTargets(enrichedAgents);
  const canOpen = launchTargets.length > 0;

  return (
    <div className="recommended-agent-package">
      <div>
        <span>智能体组合包</span>
        <strong>{agents.length} 个智能体已生成</strong>
      </div>
      <div className="recommended-agent-package-actions">
        <button aria-label="进入智能体英雄殿堂" className="recommended-agent-package-hall" onClick={onOpenHeroHall} type="button">
          <Crown size={14} />
          <span>殿堂</span>
        </button>
        <button disabled={!canOpen} onClick={() => openAgentLaunchTargets(launchTargets)} type="button">
          <PackageOpen size={15} />
          <span>{canOpen ? '打开组合' : '暂无链接'}</span>
          {canOpen ? (
            <em>
              {launchTargets.length}
              <ArrowUpRight size={12} />
            </em>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function createHeroHallLineupsFromAgents(agents: Array<{ agent: RecommendedAgent; key: string }>): HeroHallLineupsState {
  const explicitLineups = createHeroHallLineups();

  agents.forEach((agent) => {
    const lineupId = normalizeHeroHallLineupId(agent.agent.lineup ?? agent.agent.lineup_id ?? agent.agent.lineupId ?? agent.agent.LINEUP);

    if (!lineupId) {
      return;
    }

    explicitLineups[lineupId].push(agent.key);
  });

  return explicitLineups;
}

function mergeHeroHallLineups(current: HeroHallLineupsState, incoming: HeroHallLineupsState): HeroHallLineupsState {
  return heroHallLineups.reduce<HeroHallLineupsState>((nextLineups, lineup) => {
    const incomingKeys = Array.from(new Set(incoming[lineup.id]));

    if (incomingKeys.length > 0) {
      nextLineups[lineup.id] = incomingKeys;
    }

    return nextLineups;
  }, { ...current });
}

function safeParseDragPayload(value: string) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { agentKey?: unknown; sourceIndex?: unknown };
    const agentKey = typeof parsed.agentKey === 'string' ? parsed.agentKey : '';
    const sourceIndex = typeof parsed.sourceIndex === 'number' ? parsed.sourceIndex : undefined;

    return agentKey ? { agentKey, sourceIndex } : null;
  } catch {
    return null;
  }
}

function AgentHeroHall({
  agents,
  onClose,
  onLineupsChange,
  open,
  routeSegments,
}: {
  agents: RecommendedAgent[];
  onClose: () => void;
  onLineupsChange: Dispatch<SetStateAction<HeroHallLineupsState>>;
  open: boolean;
  routeSegments: string[];
}) {
  const catalogHeroAgents = useMemo(
    () =>
      getCatalogHeroAgents().map((enrichedAgent, index) => ({
        agent: enrichedAgent,
        enrichedAgent,
        key: getHeroHallAgentKey(enrichedAgent, enrichedAgent),
        name: enrichedAgent.name || getAgentDisplayName(enrichedAgent),
        reason: String(enrichedAgent.fallbackReason || '').trim(),
        stage: enrichedAgent.stageLabel || getAgentStage(enrichedAgent, index),
      })),
    [],
  );
  const recommendedHeroAgents = useMemo(
    () =>
      agents.filter(hasDisplayableRecommendedAgent).map((agent, index) => {
        const enrichedAgent = enrichDrawAgent(agent);
        const name = enrichedAgent.name || getAgentDisplayName(agent);
        const stage = enrichedAgent.stageLabel || getAgentStage(agent, index);
        const reason = String(agent.reason || enrichedAgent.fallbackReason || '').trim();
        const key = getHeroHallAgentKey(agent, enrichedAgent);

        return {
          agent,
          enrichedAgent,
          key,
          name,
          reason,
          stage,
        };
      }),
    [agents],
  );
  const heroAgents = catalogHeroAgents;
  const lineupAgents = useMemo(() => {
    const seen = new Set<string>();

    return [...recommendedHeroAgents, ...catalogHeroAgents].filter((agent) => {
      if (seen.has(agent.key)) {
        return false;
      }

      seen.add(agent.key);
      return true;
    });
  }, [catalogHeroAgents, recommendedHeroAgents]);
  const agentByKey = useMemo(() => new Map(lineupAgents.map((agent) => [agent.key, agent])), [lineupAgents]);
  const recommendationKey = recommendedHeroAgents
    .map((agent) => `${agent.key}:${normalizeHeroHallLineupId(agent.agent.lineup ?? agent.agent.lineup_id ?? agent.agent.lineupId ?? agent.agent.LINEUP) || ''}`)
    .join('|');
  const [recommendationOverrides, setRecommendationOverrides] = useState<Record<number, string>>({});
  const displayedRecommendedHeroAgents = useMemo(
    () => recommendedHeroAgents.map((agent, index) => agentByKey.get(recommendationOverrides[index]) || agent),
    [agentByKey, recommendationOverrides, recommendedHeroAgents],
  );
  const recommendedLaunchTargets = useMemo(
    () => getAgentLaunchTargets(displayedRecommendedHeroAgents.map((agent) => agent.enrichedAgent)),
    [displayedRecommendedHeroAgents],
  );
  const heroGridRef = useRef<HTMLDivElement | null>(null);
  const [draggingKey, setDraggingKey] = useState('');
  const [pointerDrag, setPointerDrag] = useState<{ agentKey: string; sourceIndex?: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const incomingLineups = createHeroHallLineupsFromAgents(recommendedHeroAgents);
    onLineupsChange((current) => mergeHeroHallLineups(current, incomingLineups));

    setDraggingKey('');
    setPointerDrag(null);
    setRecommendationOverrides({});
  }, [onLineupsChange, recommendationKey, recommendedHeroAgents]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    heroGridRef.current?.scrollTo({ left: 0, top: 0 });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const resetRecommendationCards = useCallback(() => {
    setRecommendationOverrides({});
  }, []);

  const replaceRecommendationCard = useCallback(
    (targetIndex: number, agentKey: string, sourceIndex?: number) => {
      if (!agentByKey.has(agentKey) || targetIndex < 0 || targetIndex >= recommendedHeroAgents.length) {
        return;
      }

      setRecommendationOverrides((current) => {
        const nextKeys = recommendedHeroAgents.map((agent, index) => current[index] || agent.key);

        if (sourceIndex !== undefined && sourceIndex >= 0 && sourceIndex < nextKeys.length) {
          const sourceKey = nextKeys[sourceIndex];
          nextKeys[sourceIndex] = nextKeys[targetIndex];
          nextKeys[targetIndex] = sourceKey;
        } else {
          nextKeys[targetIndex] = agentKey;
        }

        return nextKeys.reduce<Record<number, string>>((next, key, index) => {
          if (key !== recommendedHeroAgents[index]?.key) {
            next[index] = key;
          }

          return next;
        }, {});
      });
    },
    [agentByKey, recommendedHeroAgents],
  );

  const handleDragStart = (event: DragEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => {
    setDraggingKey(agentKey);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-hero-agent', JSON.stringify({ agentKey, sourceIndex }));
    event.dataTransfer.setData('text/plain', agentKey);
  };

  useEffect(() => {
    if (!pointerDrag) {
      return undefined;
    }

    const agentKey = pointerDrag.agentKey;
    const handlePointerMove = (event: PointerEvent) => {
      setPointerDrag((current) => (current?.agentKey === agentKey ? { ...current, x: event.clientX, y: event.clientY } : current));
    };
    const handlePointerUp = (event: PointerEvent) => {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.hero-recommendation-card[data-recommendation-index]');
      const targetIndex = Number(dropTarget?.dataset.recommendationIndex);

      if (Number.isFinite(targetIndex)) {
        replaceRecommendationCard(targetIndex, agentKey, pointerDrag.sourceIndex);
      }

      setPointerDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pointerDrag, replaceRecommendationCard]);

  const handlePointerDragStart = (event: ReactPointerEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) {
      return;
    }

    setPointerDrag({ agentKey, sourceIndex, x: event.clientX, y: event.clientY });
  };

  const handleRecommendationDrop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const transferPayload = event.dataTransfer.getData('application/x-hero-agent');
    const parsedPayload = safeParseDragPayload(transferPayload);
    const agentKey = parsedPayload?.agentKey || event.dataTransfer.getData('text/plain') || draggingKey;

    replaceRecommendationCard(targetIndex, agentKey, parsedPayload?.sourceIndex);
    setDraggingKey('');
  };

  const pointerDragAgent = pointerDrag ? agentByKey.get(pointerDrag.agentKey) : null;
  const activeRoute = routeSegments.at(-1) || '推荐完成';
  const canOpenRecommended = recommendedLaunchTargets.length > 0;

  if (!open || heroAgents.length === 0) {
    return null;
  }

  return (
    <section className="agent-hero-hall" aria-label="智能体英雄殿堂">
      <div className="hero-hall-shell">
        <header className="hero-hall-header">
          <div className="hero-hall-title">
            <span>
              <Crown size={16} />
              智能体英雄殿堂
            </span>
            <h1>智能体英雄殿堂</h1>
          </div>
          <div className="hero-hall-header-actions">
            <button disabled={!canOpenRecommended} onClick={() => openAgentLaunchTargets(recommendedLaunchTargets)} type="button">
              <PackageOpen size={16} />
              <span>打开推荐</span>
            </button>
            <button onClick={resetRecommendationCards} type="button">
              <RotateCcw size={16} />
              <span>重置卡牌</span>
            </button>
            <button aria-label="关闭智能体英雄殿堂" className="hero-hall-icon-button" onClick={onClose} type="button">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="hero-hall-body">
          <section className="hero-hall-roster" aria-label="智能体英雄墙">
            <div className="hero-hall-section-title">
              <Sparkles size={15} />
              <strong>智能体英雄墙</strong>
              <span>{heroAgents.length}</span>
            </div>
            <div className="hero-hall-card-grid" ref={heroGridRef}>
              {heroAgents.map((agent, index) => (
                <article
                  aria-label={agent.stage ? `${agent.name} ${agent.stage}` : agent.name}
                  className="hero-agent-card"
                  draggable
                  key={agent.key}
                  onDragEnd={() => setDraggingKey('')}
                  onDragStart={(event) => handleDragStart(event, agent.key)}
                  onPointerDown={(event) => handlePointerDragStart(event, agent.key)}
                >
                  <span className="hero-agent-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`hero-agent-avatar ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                    {agent.enrichedAgent.avatar ? <img alt="" loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={24} />}
                  </span>
                  <strong title={agent.name}>{agent.name}</strong>
                  <em title={agent.stage}>{agent.stage}</em>
                  <button aria-label={`用${agent.name}替换第一张推荐卡牌`} disabled={recommendedHeroAgents.length === 0} onClick={() => replaceRecommendationCard(0, agent.key)} type="button">
                    <Plus size={14} />
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="hero-hall-ranking hero-hall-recommendations" aria-label="智能体推荐卡牌">
            <div className="hero-hall-section-title">
              <GripVertical size={15} />
              <strong>智能体推荐卡牌</strong>
              <span>{activeRoute}</span>
            </div>
            <ol className="hero-recommendation-deck">
              {displayedRecommendedHeroAgents.map((agent, index) => (
                <li
                  className="hero-recommendation-card"
                  data-recommendation-index={index}
                  draggable
                  key={agent.key}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDragEnd={() => setDraggingKey('')}
                  onDragStart={(event) => handleDragStart(event, agent.key, index)}
                  onDrop={(event) => handleRecommendationDrop(event, index)}
                  onPointerDown={(event) => handlePointerDragStart(event, agent.key, index)}
                >
                  <span className="hero-ranking-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`hero-ranking-avatar ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                    {agent.enrichedAgent.avatar ? <img alt="" loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={15} />}
                  </span>
                  <div>
                    <strong title={agent.name}>{agent.name}</strong>
                    <em title={agent.stage}>{agent.stage}</em>
                    {agent.reason ? <p>{agent.reason}</p> : null}
                  </div>
                  {agent.enrichedAgent.launchTarget ? (
                    <a aria-label={`打开${agent.name}`} href={agent.enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <button aria-label={`替换${agent.name}`} type="button">
                      <Plus size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
        {pointerDrag && pointerDragAgent ? (
          <div className="hero-drag-ghost" style={{ left: pointerDrag.x, top: pointerDrag.y }}>
            <span className={`hero-drag-ghost-avatar ${pointerDragAgent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
              {pointerDragAgent.enrichedAgent.avatar ? <img alt="" src={pointerDragAgent.enrichedAgent.avatar} /> : <Sparkles size={14} />}
            </span>
            <strong>{pointerDragAgent.name}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TypingLine() {
  return (
    <div className="agent-typing-line" aria-label="Agent 正在生成">
      <span />
      <span />
      <span />
    </div>
  );
}
