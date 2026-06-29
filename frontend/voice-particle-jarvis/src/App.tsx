import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUpRight, BrainCircuit, ExternalLink, GitBranch, Keyboard, Mic, MicOff, PackageOpen, Send, Sparkles, UserRound } from 'lucide-react';
import AgentDrawOverlay from './components/AgentDrawOverlay';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { API_BASE_URL, streamAgentChat, type AgentStreamEvent } from './lib/agentStreamClient';
import { requestAIReply } from './lib/aiClient';
import { enrichDrawAgent, getAgentLaunchTargets, type AgentLaunchTarget } from './lib/agentLaunchCatalog';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from './lib/language';
import type {
  AgentAction,
  AgentGraphPath,
  AgentStatus,
  AgentTurn,
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
const CARD_DRAW_ACTIVE_MS = 3200;
const SPEECH_SEGMENT_WAIT_MS = 45000;

type SpeechSegmentKey = 'knowledgeAck' | 'knowledgeExplanation' | 'recommendationAck' | 'recommendationSummary';

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

type SubmitMessageOptions = {
  resumeListening?: boolean;
};

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
    throw new Error(await formatTtsResponseError(response));
  }

  const audio = await response.blob();

  if (!audio.size) {
    throw new Error('TTS interface returned empty audio.');
  }

  return audio;
}

async function formatTtsResponseError(response: Response) {
  const payload = await response.json().catch(() => null);

  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }

  if (typeof payload?.error === 'string') {
    return payload.error;
  }

  return `TTS interface failed: ${response.status}`;
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

function speak(text: string, callbacks: SpeechCallbacks = {}, preparedAudio?: Blob) {
  if (import.meta.env.VITE_TTS_BROWSER_FALLBACK !== '1') {
    void playTtsSpeech(polishSpokenLine(text), callbacks, preparedAudio);
    return true;
  }

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
    .slice(0, 6);
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
    .replace(/<\/?ACK\b[^>]*>/gi, '')
    .trim();
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

export default function App() {
  const demoGraphEnabled = new URLSearchParams(window.location.search).has('demoGraph');
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const speechSessionRef = useRef(0);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ start: () => Promise<void>; stop: () => void } | null>(null);
  const cardAnimationSettledResolversRef = useRef<Array<() => void>>([]);
  const lastSpeechPulseAtRef = useRef(0);
  const agentRequestRef = useRef<AbortController | null>(null);
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [drawOverlayPulse, setDrawOverlayPulse] = useState(0);
  const [recommendationAnimationReady, setRecommendationAnimationReady] = useState(false);
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

  const clearSpeechEndTimer = useCallback(() => {
    if (speechEndTimerRef.current !== null) {
      window.clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
  }, []);

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
    speechOutputActiveRef.current = false;
    setCurrentSpeechText('');
    setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
  }, [clearSpeechEndTimer]);

  const speakWithParticleOutput = useCallback(
    (text: string, options: SpeechOutputOptions = {}) => {
      const shouldResumeListening = options.resumeListening ?? true;
      const speechSessionId = speechSessionRef.current + 1;
      speechSessionRef.current = speechSessionId;

      setSpeechError('');
      setCurrentSpeechText(options.displayText ?? text);
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
    [beginSpeechOutput, clearSpeechEndTimer, finishSpeechOutput, pulseSpeechOutput],
  );

  const finishReplyWithoutSpeech = useCallback(
    (shouldResumeListening: boolean) => {
      clearSpeechEndTimer();
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
    [clearSpeechEndTimer],
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

      agentRequestRef.current = controller;
      voiceControlRef.current?.pause();
      micLevelRef.current?.stop();
      setDraft('');
      setReplySource('coze-stream');
      setAgentStatus('streaming');
      setLastAction(null);
      setLastHeard('');
      setRecommendationAnimationReady(false);
      setAgentTurns((current) => [...current.slice(-3), createAgentTurn(turnId, text)]);
      setMessages((current) => [
        ...current.slice(-3),
        nextUserMessage,
        { id: now + 1, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));

      let accumulatedWorkflow = createEmptyAgentWorkflow();
      let cardsCompleted = false;
      let routeActionReady = false;
      let committedRouteAction: AgentAction | null = null;
      let routeKey = '';
      let hasSeenKnowledgePath = false;
      let streamError = '';
      let speechSegmentsClosed = false;
      const cardReadyWaiters: Array<(ready: boolean) => void> = [];
      const routeActionWaiters: Array<(action: AgentAction | null) => void> = [];
      const speechAssets = new Map<SpeechSegmentKey, PreloadedSpeechAsset>();
      const speechWaiters = new Map<SpeechSegmentKey, Array<(asset: PreloadedSpeechAsset | null) => void>>();
      const commitWorkflow = (workflow: AgentWorkflow) => {
        accumulatedWorkflow = workflow;
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, workflow })));
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

        if (!asset) {
          return;
        }

        const audioBlob = await asset.audioPromise.catch((error) => {
          setSpeechError(error instanceof Error ? error.message : 'TTS preload failed.');
          return null;
        });

        if (!audioBlob) {
          return;
        }

        await new Promise<void>((resolve) => {
          speakWithParticleOutput(asset.text, {
            audioBlob,
            displayText: asset.text,
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
      const waitForCardAnimationSettled = () =>
        new Promise<void>((resolve) => {
          cardAnimationSettledResolversRef.current.push(resolve);
        });
      const runPathAnimation = async () => {
        const routeAction = await waitForRouteAction();

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return;
        }

        setLastAction(routeAction);
        await wait(PATH_MATCH_ANIMATION_MS);
      };
      const runCardAnimation = async () => {
        const hasCards = await waitForCardsReady();

        if (!hasCards) {
          return;
        }

        const settled = waitForCardAnimationSettled();
        setRecommendationAnimationReady(true);
        setDrawOverlayPulse((pulse) => pulse + 1);
        window.setTimeout(() => setRecommendationAnimationReady(false), CARD_DRAW_ACTIVE_MS);
        await settled;
      };
      const orchestrationPromise = (async () => {
        await playSpeechSegment('knowledgeAck');
        await runPathAnimation();
        await playSpeechSegment('knowledgeExplanation');
        await playSpeechSegment('recommendationAck');
        await runCardAnimation();
        await playSpeechSegment('recommendationSummary');
      })();

      try {
        await streamAgentChat(text, {
          signal: controller.signal,
          onEvent(event) {
            const speechSegment = getCompletedSpeechSegment(event);

            if (speechSegment) {
              preloadSpeechSegment(speechSegment);
              return;
            }
          },
          onCompleted() {
            commitKnowledgePathIfReady();
          },
          onContentDelta(event) {
            const section = getWorkflowSection(event);

            if (!section) {
              return;
            }

            const nextWorkflow = appendWorkflowContent(accumulatedWorkflow, section, event.type, event.content || '');
            commitWorkflow(nextWorkflow);

            if (section === 'agentRecommendation') {
              setDrawOverlayPulse((pulse) => pulse + 1);
            }

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
            setDrawOverlayPulse((pulse) => pulse + 1);
          },
          onRecommendedAgent(agent, event) {
            commitKnowledgePathIfReady();
            const delta = event.delta as { field?: string } | undefined;
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: typeof delta?.field === 'string' ? delta.field : null,
              streamStatus: 'streaming',
            });
            commitWorkflow(nextWorkflow);
            setDrawOverlayPulse((pulse) => pulse + 1);
          },
          onRecommendedAgentCompleted(agent) {
            commitKnowledgePathIfReady();
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: null,
              streamStatus: 'completed',
            });
            commitWorkflow(nextWorkflow);
            setDrawOverlayPulse((pulse) => pulse + 1);
          },
          onRecommendedAgentsCompleted(agents) {
            commitKnowledgePathIfReady();
            commitWorkflow(replaceRecommendedAgents(accumulatedWorkflow, agents));
            markCardsReady();
            setDrawOverlayPulse((pulse) => pulse + 1);
          },
          onWorkflowError(event) {
            commitKnowledgePathIfReady();
            commitTurnError(formatWorkflowError(event));
          },
        });

        if (!routeActionReady) {
          commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
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
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: finalText }];
        });
        void orchestrationPromise.finally(() => {
          setAgentStatus(finalStatus);
          setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, status: finalStatus })));
          finishReplyWithoutSpeech(shouldResumeListening);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          closeSpeechSegments();
          closeRouteAction();
          closeCardsReady();
          return;
        }

        closeSpeechSegments();
        closeRouteAction();
        closeCardsReady();

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
            return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: response.text }];
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
            return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: fallback }];
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
    [agentStatus, finishReplyWithoutSpeech, inputMode, manualVoiceSession, messages, speakWithParticleOutput, voiceAwake],
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
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
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

  const handleDrawOverlaySettled = useCallback(() => {
    cardAnimationSettledResolversRef.current.splice(0).forEach((resolve) => resolve());
  }, []);

  const latestAgentTurn = agentTurns.at(-1) ?? null;
  const latestRecommendation = latestAgentTurn?.workflow.agentRecommendation;
  const recommendedAgents = latestRecommendation?.agents ?? [];
  const drawOverlayReplyText = latestRecommendation?.SUMMARY.trim() || latestAgentTurn?.fallbackText.trim() || '';
  const drawOverlayActive = Boolean(
    recommendationAnimationReady &&
      agentStatus === 'streaming' &&
      latestRecommendation &&
      (latestRecommendation.THINKING_PROCESS ||
        latestRecommendation.ACK ||
        latestRecommendation.SUMMARY ||
        latestRecommendation.agents.length),
  );
  const drawOverlayPulseKey = recommendationAnimationReady ? drawOverlayPulse : 0;
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : [];
  const graphFocusKey =
    lastAction?.type === 'focus_graph_path'
      ? `${lastAction.label}:${lastAction.route.join('/')}`
      : '';
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
    (lastAction?.type === 'focus_graph_path'
      ? isChineseLanguage(interfaceLanguage)
        ? `本地图谱动作：${lastAction.route.join(' / ')}`
        : `Local graph action: ${lastAction.route.join(' / ')}`
      : inputMode === 'text'
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

  return (
    <main className="app-shell">
      <ParticleField audioLevel={micLevel.level} graphFocusKey={graphFocusKey} graphRoute={graphRoute} settings={settings} />
      <div className="scene-vignette" />

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

      <AgentConsole
        draft={draft}
        inputMode={inputMode}
        onDraftKeyDown={handleDraftKeyDown}
        onModeChange={switchInputMode}
        onSend={sendDraftMessage}
        onToggleVoice={toggleManualVoiceSession}
        setDraft={setDraft}
        status={agentStatus}
        turn={latestAgentTurn}
        voiceHeardText={lastHeard}
        voiceAwake={voiceAwake}
        voiceListening={voice.listening}
        voiceTranscript={voice.transcript}
        voiceSupported={voice.supported}
      />
      <AgentDrawOverlay
        active={drawOverlayActive}
        agents={recommendedAgents}
        onSettled={handleDrawOverlaySettled}
        pulseKey={drawOverlayPulseKey}
        replyText={drawOverlayReplyText}
      />
    </main>
  );
}

type AgentConsoleProps = {
  draft: string;
  inputMode: InputMode;
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (mode: InputMode) => void;
  onSend: (event?: FormEvent<HTMLFormElement>) => void;
  onToggleVoice: () => void;
  setDraft: (value: string) => void;
  status: AgentStatus;
  turn: AgentTurn | null;
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
  status,
  turn,
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
  const pendingVoiceText = inputMode === 'voice' && !turn ? visibleVoiceText : '';
  const turnId = turn?.id ?? '';

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
  }, [scrollThreadToBottom, turnId]);

  useLayoutEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollThreadToBottom();
    }
  }, [pendingVoiceText, scrollThreadToBottom, status, turn]);

  return (
    <aside
      className="agent-console"
      data-has-turn={Boolean(turn)}
      data-input-mode={inputMode}
      data-status={status}
      aria-label="Agent response panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {turn || pendingVoiceText ? (
        <div className="agent-console-thread" aria-live="polite" onScroll={handleThreadScroll} ref={threadRef}>
          {turn ? (
            <>
              <article className="agent-user-line">
                <span aria-hidden="true">
                  <UserRound size={14} />
                </span>
                <p>{turn.user}</p>
              </article>
              <AgentResponse turn={turn} active={isStreaming} />
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
          <form className="agent-composer" onSubmit={onSend}>
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

function AgentResponse({ active, turn }: { active: boolean; turn: AgentTurn }) {
  const workflow = turn.workflow;
  const knowledgeGraph = workflow.knowledgeGraph;
  const recommendation = workflow.agentRecommendation;
  const routeSegments = splitRouteText(knowledgeGraph.KG_PATH);
  const showOutput = hasAgentOutput(turn);
  const collapseKnowledgeThinking =
    !active ||
    Boolean(
      knowledgeGraph.ACK ||
        routeSegments.length ||
        knowledgeGraph.EXPLANATION ||
        recommendation.THINKING_PROCESS ||
        recommendation.ACK ||
        recommendation.agents.length ||
        recommendation.SUMMARY ||
        turn.fallbackText ||
        turn.error,
    );
  const collapseRecommendationThinking =
    !active || Boolean(recommendation.ACK || recommendation.agents.length || recommendation.SUMMARY || turn.fallbackText || turn.error);

  if (!showOutput && active) {
    return <TypingLine />;
  }

  return (
    <article className="agent-response">
      {renderAgentAnswerText(knowledgeGraph.DIRECT_REPLY)}
      {knowledgeGraph.THINKING_PROCESS && (
        <section className="agent-section agent-thinking-section" data-collapsed={collapseKnowledgeThinking} aria-expanded={!collapseKnowledgeThinking}>
          <div className="agent-section-title">
            <BrainCircuit size={14} />
            <strong>深度思考</strong>
          </div>
          {!collapseKnowledgeThinking && <p>{knowledgeGraph.THINKING_PROCESS}</p>}
        </section>
      )}
      {renderAgentAnswerText(knowledgeGraph.ACK)}
      {routeSegments.length > 0 && <RouteResult routeSegments={routeSegments} active={active && !knowledgeGraph.EXPLANATION} />}
      {renderAgentAnswerText(knowledgeGraph.EXPLANATION)}
      {recommendation.THINKING_PROCESS && (
        <section className="agent-section agent-thinking-section" data-collapsed={collapseRecommendationThinking} aria-expanded={!collapseRecommendationThinking}>
          <div className="agent-section-title">
            <BrainCircuit size={14} />
            <strong>推荐推理</strong>
          </div>
          {!collapseRecommendationThinking && <p>{recommendation.THINKING_PROCESS}</p>}
        </section>
      )}
      {renderAgentAnswerText(recommendation.ACK)}
      {recommendation.agents.length > 0 && (
        <section className="agent-section recommended-agent-section">
          <div className="agent-section-title">
            <Sparkles size={14} />
            <strong>推荐智能体</strong>
            <small className="recommended-agent-section-subtitle">点击卡片跳转对应智能体</small>
          </div>
          <div className="recommended-agent-list">
            {recommendation.agents.map((agent, index) => (
              <RecommendedAgentCard agent={agent} index={index} key={getRecommendedAgentKey(agent)} />
            ))}
          </div>
          <RecommendedAgentLaunchBar agents={recommendation.agents} />
        </section>
      )}
      {renderAgentAnswerText(recommendation.SUMMARY)}
      {renderAgentAnswerText(turn.fallbackText)}
      {turn.error && <p className="agent-error-text">{turn.error}</p>}
      {active && <TypingLine />}
    </article>
  );
}

function renderAgentAnswerText(text: string) {
  const visibleText = stripSpeechTagSyntax(text);

  return visibleText ? <p className="agent-answer-text">{visibleText}</p> : null;
}

function RouteResult({ active, routeSegments }: { active: boolean; routeSegments: string[] }) {
  return (
    <section className={`agent-route-result ${active ? 'is-running' : ''}`}>
      <div className="agent-section-title">
        <GitBranch size={14} />
        <strong>知识路径</strong>
      </div>
      <div className="route-segment-row">
        {routeSegments.map((segment) => (
          <span key={segment}>{segment}</span>
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
  const statusLabel = active ? '匹配中' : enrichedAgent.canOpen ? '可跳转' : '已匹配';
  const cardClassName = `recommended-agent-card recommended-agent-${variant} ${enrichedAgent.canOpen ? 'is-clickable' : 'is-static'}`;
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
        {enrichedAgent.canOpen ? (
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

  if (enrichedAgent.launchTarget) {
    return (
      <a className={cardClassName} data-active={active} href={enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
        {cardBody}
      </a>
    );
  }

  return (
    <article aria-disabled="true" className={cardClassName} data-active={active}>
      {cardBody}
    </article>
  );
}

function RecommendedAgentLaunchBar({ agents }: { agents: RecommendedAgent[] }) {
  const enrichedAgents = agents.map(enrichDrawAgent);
  const launchTargets = getAgentLaunchTargets(enrichedAgents);
  const canOpen = launchTargets.length > 0;

  return (
    <div className="recommended-agent-package">
      <div>
        <span>智能体组合包</span>
        <strong>{agents.length} 个智能体已生成</strong>
      </div>
      <button disabled={!canOpen} onClick={() => openAgentLaunchTargets(launchTargets)} type="button">
        <PackageOpen size={15} />
        <span>{canOpen ? '一键打开组合' : '暂无可跳转链接'}</span>
        {canOpen ? (
          <em>
            {launchTargets.length}
            <ArrowUpRight size={12} />
          </em>
        ) : null}
      </button>
    </div>
  );
}

function openAgentLaunchTargets(launchTargets: AgentLaunchTarget[]) {
  const openedTabs = launchTargets.map((target) => ({
    target,
    tab: window.open('about:blank', '_blank'),
  }));

  openedTabs.forEach(({ target, tab }) => {
    if (tab) {
      tab.opener = null;
      tab.location.replace(target.href);

      return;
    }

    window.open(target.href, '_blank', 'noopener,noreferrer');
  });
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
