import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Sparkles } from 'lucide-react';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { requestAIReply } from './lib/aiClient';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from './lib/language';
import type { AgentAction, Message, ParticleSettings, ReplySource } from './types';
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

export default function App() {
  const demoGraphEnabled = new URLSearchParams(window.location.search).has('demoGraph');
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const speechSessionRef = useRef(0);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ stop: () => void } | null>(null);
  const lastSpeechPulseAtRef = useRef(0);
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
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
    async (raw: string) => {
      const text = raw.trim();

      if (!text) {
        return;
      }

      const now = Date.now();
      const nextUserMessage: Message = { id: now, speaker: 'you', text };

      setMessages((current) => [
        ...current.slice(-3),
        nextUserMessage,
        { id: now + 1, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));

      try {
        const response = await requestAIReply(text, [...messages, nextUserMessage]);
        setReplySource(response.source);
        setLastAction(response.actions[0] ?? null);
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: response.text }];
        });
        speakWithParticleOutput(response.spokenText ?? response.text, { displayText: response.text });
      } catch {
        const fallback = 'The reasoning end point is not connected yet, sir. Local operations remain online.';
        setReplySource('local-mock');
        setLastAction({ type: 'chat' });
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: fallback }];
        });
        speakWithParticleOutput(fallback);
      }
    },
    [messages, speakWithParticleOutput],
  );

  const handleVoiceCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();

      if (!text || speechOutputActiveRef.current) {
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

      const wakeCommand = extractWakeCommand(text);

      if (!voiceAwake) {
        setManualVoiceSession(false);
        setVoiceAwake(true);

        if (wakeCommand?.command) {
          void submitMessage(wakeCommand.command);
          return;
        }

        if (!wakeCommand) {
          void submitMessage(text);
          return;
        }

        speakWithParticleOutput('At your service, sir.');
        return;
      }

      void submitMessage(wakeCommand?.command || text);
    },
    [speakWithParticleOutput, submitMessage, voiceAwake],
  );

  const voice = useVoiceControl(handleVoiceCommand, recognitionLanguage);
  voiceControlRef.current = { pause: voice.pause, resume: voice.resume, stop: voice.stop };
  const micLevel = useMicLevel();
  micLevelRef.current = { stop: micLevel.stop };

  useEffect(() => {
    primeSpeechOutput();
    return () => clearSpeechEndTimer();
  }, [clearSpeechEndTimer]);

  const statusText = useMemo(() => {
    if (!voice.supported) {
      return isChineseLanguage(interfaceLanguage) ? '语音不可用' : 'Speech unavailable';
    }

    if (voice.listening && !voiceAwake) {
      return isChineseLanguage(interfaceLanguage) ? '等待唤醒词' : 'Awaiting wake word';
    }

    if (voice.listening && voiceAwake) {
      return isChineseLanguage(interfaceLanguage) ? '语音模式已激活' : 'Voice mode active';
    }

    if (settings.mode === 'thinking') {
      return isChineseLanguage(interfaceLanguage) ? '思考中' : 'Thinking';
    }

    if (settings.mode === 'speaking') {
      return isChineseLanguage(interfaceLanguage) ? '回应中' : 'Speaking';
    }

    return isChineseLanguage(interfaceLanguage) ? '就绪' : 'Ready';
  }, [interfaceLanguage, settings.mode, voice.listening, voice.supported, voiceAwake]);

  const armVoiceSession = useCallback(() => {
    if (voice.listening || !voice.supported) {
      return;
    }

    primeSpeechOutput();
    setSettings((current) => ({ ...current, energy: 0.72, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    void micLevel.start();
    voice.start();
  }, [micLevel, voice]);

  const toggleManualVoiceSession = useCallback(() => {
    if (!voice.supported) {
      return;
    }

    primeSpeechOutput();

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
    setSettings((current) => ({ ...current, energy: 0.82, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    void micLevel.start();
    voice.start();

    speakWithParticleOutput(
      demoGraphEnabled
        ? 'Graph preview online, sir. Voice link is live.'
        : 'At your service, sir. Voice mode is online.',
    );
  }, [clearSpeechEndTimer, demoGraphEnabled, manualVoiceSession, micLevel, speakWithParticleOutput, voice, voiceAwake]);

  const latestAiMessage = [...messages].reverse().find((message) => message.speaker === 'ai' && message.text !== 'Processing...');
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : [];
  const graphFocusKey =
    lastAction?.type === 'focus_graph_path'
      ? `${lastAction.label}:${lastAction.route.join('/')}:${latestAiMessage?.id ?? 0}`
      : '';
  const readoutText =
    settings.mode === 'thinking'
      ? isChineseLanguage(interfaceLanguage)
        ? '思考中...'
        : 'Thinking...'
      : settings.mode === 'speaking'
        ? currentSpeechText
        : '';
  const captionText =
    speechError ||
    voice.error ||
    micLevel.error ||
    (lastAction?.type === 'focus_graph_path'
      ? isChineseLanguage(interfaceLanguage)
        ? `本地图谱动作：${lastAction.route.join(' / ')}`
        : `Local graph action: ${lastAction.route.join(' / ')}`
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
          ? '点击画面一次，授权语音唤醒。'
          : 'Click anywhere once to arm wake word.');

  return (
    <main className="app-shell" onPointerDown={armVoiceSession}>
      <ParticleField audioLevel={micLevel.level} graphFocusKey={graphFocusKey} graphRoute={graphRoute} settings={settings} />
      <div className="scene-vignette" />

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

        <div className="orb-caption" data-testid="conversation-state">
          <Sparkles size={16} />
          <span>{captionText}</span>
        </div>

        <div className="core-label" aria-hidden="true" data-graph-active={graphRoute.length > 0}>
          <span>JARVIS</span>
        </div>

        {readoutText ? (
          <div className="voice-readout" aria-live="polite">
            <span>{readoutText}</span>
          </div>
        ) : null}

        <div className="voice-control-row">
          <div className="voice-presence" aria-hidden="true" data-active={voice.listening} data-awake={voiceAwake} />
          <button
            aria-label={voiceAwake ? 'Stand down voice mode' : 'Wake voice mode'}
            aria-pressed={voiceAwake}
            className="voice-toggle"
            data-active={voiceAwake}
            disabled={!voice.supported}
            onClick={(event) => {
              event.stopPropagation();
              toggleManualVoiceSession();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title={voiceAwake ? 'Stand down' : 'Wake voice'}
            type="button"
          >
            {voiceAwake ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
        </div>
      </section>
    </main>
  );
}
