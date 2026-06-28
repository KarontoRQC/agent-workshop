import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUpRight, BrainCircuit, ExternalLink, GitBranch, Keyboard, Mic, MicOff, PackageOpen, Send, Sparkles, UserRound } from 'lucide-react';
import AgentDrawOverlay from './components/AgentDrawOverlay';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { streamAgentChat, type AgentStreamEvent } from './lib/agentStreamClient';
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

type SpeechCallbacks = {
  onEnd?: () => void;
  onError?: (reason: string) => void;
  onPulse?: () => void;
  onStart?: () => void;
};

type SpeechOutputOptions = {
  displayText?: string;
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

function speak(text: string, callbacks: SpeechCallbacks = {}) {
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
    ['THINKING_PROCESS', 'ACK', 'DIRECT_REPLY', 'KG_PATH', 'EXPLANATION'].includes(event.type || '')
  ) {
    return 'knowledgeGraph';
  }

  if (event.stage === 'agent_recommendation' && ['THINKING_PROCESS', 'ACK', 'SUMMARY'].includes(event.type || '')) {
    return 'agentRecommendation';
  }

  return null;
}

function appendWorkflowContent(workflow: AgentWorkflow, section: keyof AgentWorkflow, type: string | undefined, content: string) {
  if (!type || !content) {
    return workflow;
  }

  if (section === 'knowledgeGraph') {
    if (!['THINKING_PROCESS', 'ACK', 'DIRECT_REPLY', 'KG_PATH', 'EXPLANATION'].includes(type)) {
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

  if (!['THINKING_PROCESS', 'ACK', 'SUMMARY'].includes(type)) {
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
  const lastSpeechPulseAtRef = useRef(0);
  const agentRequestRef = useRef<AbortController | null>(null);
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [drawOverlayPulse, setDrawOverlayPulse] = useState(0);
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
      };
      const finishAfterMinimum = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        const elapsed = performance.now() - startedAt;
        const minimumVisualDuration = Math.min(estimatedDuration, 5200);
        const remaining = Math.max(0, minimumVisualDuration - elapsed);

        clearSpeechEndTimer();
        speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, remaining);
      };
      const queued = speak(text, {
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
      });

      speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, queued ? estimatedDuration : 5200);
    },
    [beginSpeechOutput, clearSpeechEndTimer, finishSpeechOutput, pulseSpeechOutput],
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
      setAgentTurns((current) => [...current.slice(-3), createAgentTurn(turnId, text)]);
      setMessages((current) => [
        ...current.slice(-3),
        nextUserMessage,
        { id: now + 1, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));

      let accumulatedWorkflow = createEmptyAgentWorkflow();
      let committedRouteKey = '';
      let hasSeenKnowledgePath = false;
      let streamError = '';
      const commitWorkflow = (workflow: AgentWorkflow) => {
        accumulatedWorkflow = workflow;
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, workflow })));
      };
      const commitRouteAction = (routeText: string) => {
        const routeAction = getActionFromRoute(routeText);

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return;
        }

        const routeKey = routeAction.route.join('/');

        if (routeKey === committedRouteKey) {
          return;
        }

        committedRouteKey = routeKey;
        setLastAction(routeAction);
      };
      const commitKnowledgePathIfReady = () => {
        if (!hasSeenKnowledgePath || committedRouteKey) {
          return;
        }

        commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
      };
      const commitTurnError = (error: string) => {
        streamError = error;
        setAgentStatus('error');
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, error, status: 'error' })));
      };

      try {
        await streamAgentChat(text, {
          signal: controller.signal,
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
            setDrawOverlayPulse((pulse) => pulse + 1);
          },
          onCompleted() {
            commitKnowledgePathIfReady();
          },
          onWorkflowError(event) {
            commitKnowledgePathIfReady();
            commitTurnError(formatWorkflowError(event));
          },
        });

        if (!committedRouteKey) {
          commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
        }

        const finalText = buildAgentReplyText(accumulatedWorkflow, streamError || 'Agent 已完成，但没有返回可展示内容。');
        const finalStatus: AgentStatus = streamError ? 'error' : 'completed';
        setAgentStatus(finalStatus);
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, status: finalStatus })));
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: finalText }];
        });
        speakWithParticleOutput(finalText, { displayText: finalText, resumeListening: shouldResumeListening });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

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
          speakWithParticleOutput(response.spokenText ?? response.text, {
            displayText: response.text,
            resumeListening: shouldResumeListening,
          });
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
          speakWithParticleOutput(fallback, { resumeListening: shouldResumeListening });
        }
      } finally {
        if (agentRequestRef.current === controller) {
          agentRequestRef.current = null;
        }
      }
    },
    [agentStatus, inputMode, manualVoiceSession, messages, speakWithParticleOutput, voiceAwake],
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

  const latestAgentTurn = agentTurns.at(-1) ?? null;
  const latestRecommendation = latestAgentTurn?.workflow.agentRecommendation;
  const recommendedAgents = latestRecommendation?.agents ?? [];
  const drawOverlayReplyText = latestRecommendation?.SUMMARY.trim() || latestAgentTurn?.fallbackText.trim() || '';
  const drawOverlayActive = Boolean(
    agentStatus === 'streaming' &&
      latestRecommendation &&
      (latestRecommendation.THINKING_PROCESS ||
        latestRecommendation.ACK ||
        latestRecommendation.SUMMARY ||
        latestRecommendation.agents.length),
  );
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
      <AgentDrawOverlay active={drawOverlayActive} agents={recommendedAgents} pulseKey={drawOverlayPulse} replyText={drawOverlayReplyText} />
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
      {knowledgeGraph.DIRECT_REPLY && <p className="agent-answer-text">{knowledgeGraph.DIRECT_REPLY}</p>}
      {knowledgeGraph.THINKING_PROCESS && (
        <section className="agent-section agent-thinking-section" data-collapsed={collapseKnowledgeThinking} aria-expanded={!collapseKnowledgeThinking}>
          <div className="agent-section-title">
            <BrainCircuit size={14} />
            <strong>深度思考</strong>
          </div>
          {!collapseKnowledgeThinking && <p>{knowledgeGraph.THINKING_PROCESS}</p>}
        </section>
      )}
      {knowledgeGraph.ACK && <p className="agent-answer-text">{knowledgeGraph.ACK}</p>}
      {routeSegments.length > 0 && <RouteResult routeSegments={routeSegments} active={active && !knowledgeGraph.EXPLANATION} />}
      {knowledgeGraph.EXPLANATION && <p className="agent-answer-text">{knowledgeGraph.EXPLANATION}</p>}
      {recommendation.THINKING_PROCESS && (
        <section className="agent-section agent-thinking-section" data-collapsed={collapseRecommendationThinking} aria-expanded={!collapseRecommendationThinking}>
          <div className="agent-section-title">
            <BrainCircuit size={14} />
            <strong>推荐推理</strong>
          </div>
          {!collapseRecommendationThinking && <p>{recommendation.THINKING_PROCESS}</p>}
        </section>
      )}
      {recommendation.ACK && <p className="agent-answer-text">{recommendation.ACK}</p>}
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
      {recommendation.SUMMARY && <p className="agent-answer-text">{recommendation.SUMMARY}</p>}
      {turn.fallbackText && <p className="agent-answer-text">{turn.fallbackText}</p>}
      {turn.error && <p className="agent-error-text">{turn.error}</p>}
      {active && <TypingLine />}
    </article>
  );
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
