import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Bot, Keyboard, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import AgentDialoguePanel from './components/AgentDialoguePanel';
import AgentDrawOverlay from './components/AgentDrawOverlay';
import ParticleWordmark from './components/ParticleWordmark';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { API_BASE_URL } from './lib/agentStreamClient';
import { requestAIReply } from './lib/aiClient';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from './lib/language';
import type { AgentAction, Message, ParticleSettings, RecommendedAgent, ReplySource } from './types';
import './App.css';

const baseSettings: ParticleSettings = {
  energy: 0.34,
  mode: 'idle',
  pulseSeed: 0,
};

const TTS_SPEECH_URL = `${API_BASE_URL}/tts/speech`;

type InputMode = 'voice' | 'text';

const demoGraphAction: AgentAction = {
  confidence: 1,
  label: 'knowledge graph preview',
  route: ['Agent Workshop', 'Knowledge Graph', 'Path selection', 'Graph controller'],
  type: 'focus_graph_path',
};

const demoRecommendedAgents: RecommendedAgent[] = [
  {
    agent_index: 0,
    agent_name: '路径规划智能体',
    reason: '把自然语言任务拆成知识图谱路径和控制动作。',
    score: 96,
    stage: 'LOCAL PREVIEW',
    streamStatus: 'completed',
  },
  {
    agent_index: 1,
    agent_name: '知识图谱导航员',
    reason: '负责节点聚焦、边高亮和局部放大视角。',
    score: 92,
    stage: 'LOCAL PREVIEW',
    streamStatus: 'completed',
  },
  {
    agent_index: 2,
    agent_name: '业务标签分析师',
    reason: '补全标签、语义分类和下一步建议。',
    score: 88,
    stage: 'LOCAL PREVIEW',
    streamStatus: 'completed',
  },
];

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
type SpeechCallbacks = {
  onEnd?: () => void;
  onError?: (reason: string) => void;
  onPulse?: () => void;
  onStart?: () => void;
};

type SpeechOutputOptions = {
  audioBlob?: Blob;
  displayText?: string;
  resumeListening?: boolean;
};

let speechOutputUnlocked = false;
let activeSpeechAudio: HTMLAudioElement | null = null;
let activeSpeechObjectUrl = '';
let serverTtsUnavailable = false;

class TtsRequestError extends Error {
  fallbackToBrowser: boolean;

  constructor(message: string, fallbackToBrowser = false) {
    super(message);
    this.name = 'TtsRequestError';
    this.fallbackToBrowser = fallbackToBrowser;
  }
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

function unlockSpeechOutput() {
  if (speechOutputUnlocked || !('speechSynthesis' in window)) {
    return;
  }

  primeSpeechOutput();

  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  utterance.rate = 1;
  utterance.onend = () => {
    speechOutputUnlocked = true;
  };
  utterance.onerror = () => {
    speechOutputUnlocked = false;
  };

  speechOutputUnlocked = true;
  window.speechSynthesis.speak(utterance);
}

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

function shouldUseBrowserSpeechOnly() {
  const ttsMode = getTtsMode();
  return ttsMode === 'browser' || (ttsMode === 'auto' && serverTtsUnavailable);
}

function markServerTtsUnavailable(error: unknown) {
  if (getTtsMode() === 'auto' && isFallbackableTtsError(error)) {
    serverTtsUnavailable = true;
  }
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
  if (shouldUseBrowserSpeechOnly()) {
    throw new TtsRequestError('Browser speech fallback is active.', true);
  }

  try {
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
  } catch (error) {
    markServerTtsUnavailable(error);
    throw error;
  }
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
      markServerTtsUnavailable(error);
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
    if (reason !== 'not-allowed' && reason !== 'interrupted' && reason !== 'canceled') {
      console.warn(reason);
    }
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

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const demoGraphEnabled = searchParams.has('demoGraph');
  const demoRecommendEnabled = searchParams.has('demoRecommend');
  const demoSpeakingEnabled = searchParams.has('demoSpeaking');
  const agentUiVisible = searchParams.has('agentUi') || searchParams.has('debugAgent');
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const speechSessionRef = useRef(0);
  const drawSettleTimerRef = useRef<number | null>(null);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ stop: () => void } | null>(null);
  const lastSpeechPulseAtRef = useRef(0);
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [replySource, setReplySource] = useState<ReplySource>('local-mock');
  const [interfaceLanguage, setInterfaceLanguage] = useState<ConversationLanguage>('zh-CN');
  const [lastAction, setLastAction] = useState<AgentAction | null>(demoGraphEnabled ? demoGraphAction : null);
  const [lastHeard, setLastHeard] = useState('');
  const [manualVoiceSession, setManualVoiceSession] = useState(false);
  const recognitionLanguage: ConversationLanguage = 'zh-CN';
  const [currentSpeechText, setCurrentSpeechText] = useState('');
  const [agentLiveText, setAgentLiveText] = useState('');
  const [drawActive, setDrawActive] = useState(false);
  const [drawAgents, setDrawAgents] = useState<RecommendedAgent[]>([]);
  const [latestRecommendedAgents, setLatestRecommendedAgents] = useState<RecommendedAgent[]>([]);
  const [drawPulseKey, setDrawPulseKey] = useState(0);
  const [drawReplyText, setDrawReplyText] = useState('');
  const [draft, setDraft] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [speechError, setSpeechError] = useState('');
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, speaker: 'ai', text: '晚上好，先生。系统已上线，正在待命。' },
  ]);

  useEffect(() => {
    if (!demoSpeakingEnabled) {
      return;
    }

    setCurrentSpeechText('Particle voice preview online.');
    setSettings((current) => ({ ...current, energy: 1, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
  }, [demoSpeakingEnabled]);

  const clearSpeechEndTimer = useCallback(() => {
    if (speechEndTimerRef.current !== null) {
      window.clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
  }, []);

  const clearDrawSettleTimer = useCallback(() => {
    if (drawSettleTimerRef.current !== null) {
      window.clearTimeout(drawSettleTimerRef.current);
      drawSettleTimerRef.current = null;
    }
  }, []);

  const showAgentDraw = useCallback(
    (agents: RecommendedAgent[] | undefined, replyText: string) => {
      if (!agents || agents.length === 0) {
        return;
      }

      clearDrawSettleTimer();
      setDrawAgents(agents);
      setDrawReplyText(replyText);
      setDrawActive(true);
      setDrawPulseKey((current) => current + 1);
      drawSettleTimerRef.current = window.setTimeout(() => setDrawActive(false), 1200);
    },
    [clearDrawSettleTimer],
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
          window.setTimeout(() => voiceControlRef.current?.resume(), 260);
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
      const queued = speak(
        text,
        {
          onEnd: finishAfterMinimum,
          onError: (reason) => {
            if (speechSessionId === speechSessionRef.current) {
              if (reason !== 'not-allowed' && reason !== 'interrupted' && reason !== 'canceled') {
                setSpeechError(reason);
              }
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

      speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, queued ? estimatedDuration : 5200);
    },
    [beginSpeechOutput, clearSpeechEndTimer, finishSpeechOutput, pulseSpeechOutput],
  );

  const submitMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();

      if (!text) {
        return;
      }

      const now = Date.now();
      const streamingMessageId = now + 1;
      const nextUserMessage: Message = { id: now, speaker: 'you', text };

      setMessages((current) => [
        ...current.slice(-3),
        nextUserMessage,
        { id: streamingMessageId, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));
      setAgentLiveText(isChineseLanguage(interfaceLanguage) ? '正在等待后端响应...' : 'Waiting for the agent stream...');

      try {
        const response = await requestAIReply(text, [...messages, nextUserMessage], {
          onGraphAction: (action) => setLastAction(action),
          onRecommendedAgents: (agents) => {
            setLatestRecommendedAgents(agents);
          },
          onStreamText: (streamText) => {
            setAgentLiveText(streamText);
            setMessages((current) => {
              const withoutThinking = current.filter((message) => message.text !== 'Processing...');
              const nextAiMessage: Message = { id: streamingMessageId, speaker: 'ai', text: streamText };
              const lastMessage = withoutThinking.at(-1);

              if (lastMessage?.id === nextAiMessage.id) {
                return [...withoutThinking.slice(0, -1), nextAiMessage];
              }

              return [...withoutThinking.slice(-4), nextAiMessage];
            });
          },
        });
        setReplySource(response.source);
        setLastAction(response.actions[0] ?? null);
        setLatestRecommendedAgents(response.recommendedAgents ?? []);
        setAgentLiveText(response.text);
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...' && message.id !== streamingMessageId);
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: response.text }];
        });
        showAgentDraw(response.recommendedAgents, response.text);
        speakWithParticleOutput(response.spokenText ?? response.text, { displayText: response.text });
      } catch {
        const fallback = 'The reasoning end point is not connected yet, sir. Local operations remain online.';
        setReplySource('local-mock');
        setLastAction({ type: 'chat' });
        setLatestRecommendedAgents([]);
        setAgentLiveText(fallback);
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...' && message.id !== streamingMessageId);
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: fallback }];
        });
        speakWithParticleOutput(fallback);
      }
    },
    [messages, showAgentDraw, speakWithParticleOutput],
  );

  useEffect(() => {
    if (!demoRecommendEnabled) {
      return;
    }

    const demoTimer = window.setTimeout(() => {
      setLatestRecommendedAgents(demoRecommendedAgents);
      showAgentDraw(demoRecommendedAgents, '本地预览：推荐卡片动画已接入，但不会改变主视觉粒子。');
    }, 900);

    return () => window.clearTimeout(demoTimer);
  }, [demoRecommendEnabled, showAgentDraw]);

  const sendDraftMessage = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const text = draft.trim();

      if (!text) {
        return;
      }

      unlockSpeechOutput();
      setDraft('');
      void submitMessage(text);
    },
    [draft, submitMessage],
  );

  const handleDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      sendDraftMessage();
    },
    [sendDraftMessage],
  );

  const handleVoiceCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();

      if (!text || speechOutputActiveRef.current) {
        return;
      }

      if (!manualVoiceSession && !voiceAwake) {
        return;
      }

      setLastHeard(text);
      const inputLanguage = detectConversationLanguage(text);
      setInterfaceLanguage(inputLanguage);

      if (wantsSleep(text)) {
        setManualVoiceSession(false);
        setVoiceAwake(false);
        setLastAction(null);
        setLastHeard('');
        voiceControlRef.current?.stop();
        micLevelRef.current?.stop();
        speakWithParticleOutput('Standing by, sir.', { resumeListening: false });
        return;
      }

      void submitMessage(text);
    },
    [manualVoiceSession, speakWithParticleOutput, submitMessage, voiceAwake],
  );

  const voice = useVoiceControl(handleVoiceCommand, recognitionLanguage);
  voiceControlRef.current = { pause: voice.pause, resume: voice.resume, stop: voice.stop };
  const micLevel = useMicLevel();
  micLevelRef.current = { stop: micLevel.stop };

  useEffect(() => {
    primeSpeechOutput();
    return () => {
      clearSpeechEndTimer();
      clearDrawSettleTimer();
    };
  }, [clearDrawSettleTimer, clearSpeechEndTimer]);

  const statusText = useMemo(() => {
    if (!voice.supported) {
      return isChineseLanguage(interfaceLanguage) ? '语音不可用' : 'Speech unavailable';
    }

    if (voice.listening && (voiceAwake || manualVoiceSession)) {
      return isChineseLanguage(interfaceLanguage) ? '语音模式已激活' : 'Voice mode active';
    }

    if (settings.mode === 'thinking') {
      return isChineseLanguage(interfaceLanguage) ? '思考中' : 'Thinking';
    }

    if (settings.mode === 'speaking') {
      return isChineseLanguage(interfaceLanguage) ? '回应中' : 'Speaking';
    }

    return isChineseLanguage(interfaceLanguage) ? '就绪' : 'Ready';
  }, [interfaceLanguage, manualVoiceSession, settings.mode, voice.listening, voice.supported, voiceAwake]);

  const toggleManualVoiceSession = useCallback(() => {
    if (!voice.supported) {
      return;
    }

    setInputMode('voice');
    unlockSpeechOutput();
    primeSpeechOutput();

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
    setSettings((current) => ({ ...current, energy: 0.82, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    void micLevel.start();
    voice.start();

    speakWithParticleOutput(
      demoGraphEnabled
        ? 'Graph preview online, sir. Voice link is live.'
        : 'At your service, sir. Voice mode is online.',
    );
  }, [clearSpeechEndTimer, demoGraphEnabled, manualVoiceSession, micLevel, speakWithParticleOutput, voice, voiceAwake]);

  const switchInputMode = useCallback(
    (mode: InputMode) => {
      setInputMode(mode);

      if (mode === 'text') {
        speechSessionRef.current += 1;
        clearSpeechEndTimer();
        speechOutputActiveRef.current = false;
        cancelSpeechPlayback();
        window.speechSynthesis?.cancel();
        setManualVoiceSession(false);
        setVoiceAwake(false);
        setLastHeard('');
        setCurrentSpeechText('');
        setAgentLiveText('');
        setSpeechError('');
        voice.stop();
        micLevel.stop();
        setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
      }
    },
    [clearSpeechEndTimer, micLevel, voice],
  );

  const latestAiMessage = [...messages].reverse().find((message) => message.speaker === 'ai' && message.text !== 'Processing...');
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : [];
  const agentPanelVisible =
    agentUiVisible ||
    latestRecommendedAgents.length > 0 ||
    graphRoute.length > 0 ||
    messages.some((message) => message.speaker === 'you');
  const graphFocusKey =
    lastAction?.type === 'focus_graph_path'
      ? `${lastAction.label}:${lastAction.route.join('/')}:${latestAiMessage?.id ?? 0}`
      : '';
  const readoutText =
    settings.mode === 'thinking'
      ? agentLiveText || (isChineseLanguage(interfaceLanguage) ? '思考中...' : 'Thinking...')
      : settings.mode === 'speaking'
        ? agentLiveText || currentSpeechText
        : agentLiveText;
  const voiceSessionActive = voiceAwake || manualVoiceSession;
  const captionText =
    speechError ||
    voice.error ||
    micLevel.error ||
    (lastAction?.type === 'focus_graph_path'
      ? isChineseLanguage(interfaceLanguage)
        ? `本地图谱动作：${lastAction.route.join(' / ')}`
        : `Local graph action: ${lastAction.route.join(' / ')}`
      : voice.listening && voiceSessionActive
        ? lastHeard
          ? isChineseLanguage(interfaceLanguage)
            ? `语音模式已激活。听到：${lastHeard}`
            : `Voice mode active. Heard: ${lastHeard}`
          : isChineseLanguage(interfaceLanguage)
            ? '语音模式已激活，可以直接说。'
            : 'Voice mode active. Speak naturally.'
        : '');

  return (
    <main className="app-shell">
      <ParticleField audioLevel={micLevel.level} graphFocusKey={graphFocusKey} graphRoute={graphRoute} settings={settings} />
      <div className="scene-vignette" />
      <AgentDrawOverlay
        active={drawActive}
        agents={drawAgents}
        onSettled={() => setDrawActive(false)}
        pulseKey={drawPulseKey}
        replyText={drawReplyText}
      />
      <AgentDialoguePanel
        disabled={settings.mode === 'thinking'}
        draft={draft}
        graphRoute={graphRoute}
        messages={messages}
        onDraftChange={setDraft}
        onDraftKeyDown={handleDraftKeyDown}
        onSendDraft={sendDraftMessage}
        recommendedAgents={latestRecommendedAgents}
        source={replySource}
        visible={agentPanelVisible}
      />

      <section className="dialogue-stage" aria-label="AI particle dialogue">
        <div className="title-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Bot size={18} />
          </div>
          <div>
            <h1>JARVIS</h1>
            <p>{statusText}</p>
          </div>
        </div>

        {captionText ? (
          <div className="orb-caption" data-testid="conversation-state">
            <Sparkles size={16} />
            <span>{captionText}</span>
          </div>
        ) : null}

        <ParticleWordmark graphActive={graphRoute.length > 0} mode={settings.mode} />

        {readoutText ? (
          <div className="voice-readout" aria-live="polite">
            <span>{readoutText}</span>
          </div>
        ) : null}

        <div className="main-input-hub" data-input-mode={inputMode} onPointerDown={(event) => event.stopPropagation()}>
          <div className="agent-mode-switch" role="tablist" aria-label="Input mode">
            <button
              aria-selected={inputMode === 'voice'}
              className={inputMode === 'voice' ? 'active' : ''}
              onClick={() => switchInputMode('voice')}
              role="tab"
              type="button"
            >
              <Mic size={15} />
              <span>语音</span>
            </button>
            <button
              aria-selected={inputMode === 'text'}
              className={inputMode === 'text' ? 'active' : ''}
              onClick={() => switchInputMode('text')}
              role="tab"
              type="button"
            >
              <Keyboard size={15} />
              <span>打字</span>
            </button>
          </div>

          {inputMode === 'voice' ? (
            <button
              aria-label={voiceSessionActive ? 'Stand down voice mode' : 'Wake voice mode'}
              aria-pressed={voiceSessionActive}
              className="agent-voice-module"
              data-active={voiceSessionActive}
              disabled={!voice.supported || settings.mode === 'thinking'}
              onClick={(event) => {
                event.stopPropagation();
                toggleManualVoiceSession();
              }}
              title={voiceSessionActive ? 'Stand down' : 'Wake voice'}
              type="button"
            >
              <div className="voice-presence" aria-hidden="true" data-active={voice.listening} data-awake={voiceSessionActive} />
              <span className="voice-module-center">
                {voiceSessionActive ? <MicOff size={17} /> : <Mic size={17} />}
                <em>{voice.supported ? (voiceSessionActive ? '语音已激活' : '语音待命') : '语音不可用'}</em>
              </span>
            </button>
          ) : (
            <form className="agent-composer" onSubmit={sendDraftMessage}>
              <textarea
                aria-label="Type to Jarvis"
                disabled={settings.mode === 'thinking'}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                placeholder={settings.mode === 'thinking' ? 'Agent 正在生成...' : '问你的 agent...'}
                rows={1}
                value={draft}
              />
              <button aria-label="Send to agent" disabled={!draft.trim() || settings.mode === 'thinking'} type="submit">
                <Send size={16} />
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
