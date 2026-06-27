import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
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
  onPulse?: () => void;
  onStart?: () => void;
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

  utterance.onstart = () => callbacks.onStart?.();
  utterance.onboundary = () => callbacks.onPulse?.();
  utterance.onend = () => callbacks.onEnd?.();
  utterance.onerror = () => callbacks.onEnd?.();

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 120);
}

function speak(text: string, callbacks: SpeechCallbacks = {}) {
  if (!('speechSynthesis' in window)) {
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
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void } | null>(null);
  const lastSpeechPulseAtRef = useRef(0);
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
  const [interfaceLanguage, setInterfaceLanguage] = useState<ConversationLanguage>('zh-CN');
  const [lastAction, setLastAction] = useState<AgentAction | null>(null);
  const [lastHeard, setLastHeard] = useState('');
  const [recognitionLanguage, setRecognitionLanguage] = useState<ConversationLanguage>('zh-CN');
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
    setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
  }, [clearSpeechEndTimer]);

  const speakWithParticleOutput = useCallback(
    (text: string) => {
      voiceControlRef.current?.pause();
      beginSpeechOutput();

      const estimatedDuration = Math.min(15000, Math.max(5600, text.length * 92));
      const startedAt = performance.now();
      const settleSpeechOutput = () => {
        finishSpeechOutput();
        window.setTimeout(() => voiceControlRef.current?.resume(), 260);
      };
      const finishAfterMinimum = () => {
        const elapsed = performance.now() - startedAt;
        const minimumVisualDuration = Math.min(estimatedDuration, 5200);
        const remaining = Math.max(0, minimumVisualDuration - elapsed);

        clearSpeechEndTimer();
        speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, remaining);
      };
      const queued = speak(text, {
        onEnd: finishAfterMinimum,
        onPulse: pulseSpeechOutput,
        onStart: beginSpeechOutput,
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
        speakWithParticleOutput(response.text);
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
      setRecognitionLanguage(inputLanguage);

      if (voiceAwake && wantsSleep(text)) {
        setVoiceAwake(false);
        setLastAction(null);
        speakWithParticleOutput(isChineseLanguage(inputLanguage) ? '进入待命，先生。' : 'Standing by, sir.');
        return;
      }

      const wakeCommand = extractWakeCommand(text);

      if (!voiceAwake) {
        if (!wakeCommand) {
          return;
        }

        setVoiceAwake(true);

        if (wakeCommand.command) {
          void submitMessage(wakeCommand.command);
          return;
        }

        speakWithParticleOutput(isChineseLanguage(inputLanguage) ? '我在，先生。' : 'At your service, sir.');
        return;
      }

      void submitMessage(wakeCommand?.command || text);
    },
    [speakWithParticleOutput, submitMessage, voiceAwake],
  );

  const voice = useVoiceControl(handleVoiceCommand, recognitionLanguage);
  voiceControlRef.current = { pause: voice.pause, resume: voice.resume };
  const micLevel = useMicLevel();

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

  const latestAiMessage = [...messages].reverse().find((message) => message.speaker === 'ai' && message.text !== 'Processing...');
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : [];
  const readoutText =
    settings.mode === 'thinking'
      ? isChineseLanguage(interfaceLanguage)
        ? '思考中...'
        : 'Thinking...'
      : latestAiMessage?.text ?? (isChineseLanguage(interfaceLanguage) ? '晚上好，先生。系统已上线。' : 'Good evening, sir. Systems are online.');
  const captionText =
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
      <ParticleField audioLevel={micLevel.level} graphRoute={graphRoute} settings={settings} />
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

        <div className="core-label" aria-hidden="true">
          <span>JARVIS</span>
        </div>

        {graphRoute.length > 0 ? (
          <div className="graph-label-cloud" aria-label="Selected graph path">
            {graphRoute.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        ) : null}

        <div className="voice-readout" aria-live="polite">
          <span>{readoutText}</span>
        </div>

        <div className="voice-presence" aria-hidden="true" data-active={voice.listening} data-awake={voiceAwake} />
      </section>
    </main>
  );
}
