import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CornerDownRight, MessageCircle, Mic, MicOff, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import ParticleField from './components/ParticleField';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { requestAIReply } from './lib/aiClient';
import type { Message, ParticleSettings } from './types';
import './App.css';

const baseSettings: ParticleSettings = {
  energy: 0.34,
  mode: 'idle',
  pulseSeed: 0,
};

const preferredVoiceHints = [
  'microsoft george',
  'google uk english male',
  'daniel',
  'george',
  'microsoft guy',
  'microsoft david',
  'microsoft mark',
  'microsoft ryan',
  'microsoft william',
  'microsoft brian',
  'alex',
  'english male',
  'uk english male',
  'us english male',
];

const avoidedVoiceHints = ['zira', 'hazel', 'susan', 'zira desktop', 'female', 'aria', 'jenny', 'emma'];

function voiceScore(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (!lang.startsWith('en')) {
    return -100;
  }

  if (avoidedVoiceHints.some((hint) => name.includes(hint))) {
    return -30;
  }

  const preferredIndex = preferredVoiceHints.findIndex((hint) => name.includes(hint));
  const preferredScore = preferredIndex >= 0 ? 80 - preferredIndex * 3 : 0;
  const accentScore = lang === 'en-gb' ? 18 : lang.startsWith('en-gb') ? 15 : lang.startsWith('en-us') ? 8 : 4;
  const localScore = voice.localService ? 4 : 0;

  return preferredScore + accentScore + localScore;
}

function selectMatureEnglishVoice() {
  const voices = window.speechSynthesis.getVoices();

  return voices
    .filter((voice) => voiceScore(voice) > 0)
    .sort((left, right) => voiceScore(right) - voiceScore(left))[0] ?? null;
}

function polishSpokenLine(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\bAI\b/g, 'A.I.')
    .replace(/\bendpoint\b/gi, 'end point')
    .replace(/\bJARVIS\b/g, 'Jarvis')
    .trim();
}

function primeSpeechOutput() {
  if (!('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.getVoices();
  window.speechSynthesis.resume();
}

function speakNow(text: string) {
  const voice = selectMatureEnglishVoice();
  const utterance = new SpeechSynthesisUtterance(polishSpokenLine(text));

  utterance.lang = voice?.lang ?? 'en-GB';
  utterance.rate = 0.74;
  utterance.pitch = 0.52;
  utterance.volume = 1;

  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 120);
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) {
    return;
  }

  primeSpeechOutput();

  if (window.speechSynthesis.getVoices().length > 0) {
    speakNow(text);
    return;
  }

  const speakAfterVoicesLoad = () => {
    window.speechSynthesis.removeEventListener('voiceschanged', speakAfterVoicesLoad);
    speakNow(text);
  };

  window.speechSynthesis.addEventListener('voiceschanged', speakAfterVoicesLoad);
  window.setTimeout(speakAfterVoicesLoad, 700);
}

export default function App() {
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [typedMessage, setTypedMessage] = useState('');
  const [replySource, setReplySource] = useState<'placeholder' | 'endpoint'>('placeholder');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, speaker: 'ai', text: 'Good evening, sir. Systems are online, and I am standing by.' },
  ]);

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
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: response.text }];
        });
        setSettings((current) => ({ ...current, energy: 0.96, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
        speak(response.text);
      } catch {
        const fallback = 'The reasoning end point is not connected yet, sir. Local operations remain online.';
        setReplySource('placeholder');
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-4), { id: Date.now(), speaker: 'ai', text: fallback }];
        });
        setSettings((current) => ({ ...current, energy: 0.88, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
        speak(fallback);
      }

      window.setTimeout(() => {
        setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
      }, 3600);
    },
    [messages],
  );

  const voice = useVoiceControl(submitMessage);
  const micLevel = useMicLevel();

  useEffect(() => {
    primeSpeechOutput();
  }, []);

  const statusText = useMemo(() => {
    if (!voice.supported) {
      return 'Speech unavailable';
    }

    if (voice.listening) {
      return 'Listening';
    }

    if (settings.mode === 'thinking') {
      return 'Thinking';
    }

    if (settings.mode === 'speaking') {
      return 'Speaking';
    }

    return 'Ready';
  }, [settings.mode, voice.listening, voice.supported]);

  const handleMessageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!typedMessage.trim()) {
      return;
    }

    primeSpeechOutput();
    void submitMessage(typedMessage);
    setTypedMessage('');
  };

  const previewVoice = () => {
    primeSpeechOutput();
    setSettings((current) => ({ ...current, energy: 0.9, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
    speak('Good evening, sir. Systems are online, and I am standing by.');
    window.setTimeout(() => {
      setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
    }, 3600);
  };

  const toggleListening = () => {
    if (voice.listening) {
      voice.stop();
      micLevel.stop();
      setSettings((current) => ({ ...current, energy: 0.36, mode: 'idle' }));
      return;
    }

    setSettings((current) => ({ ...current, energy: 0.72, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    void micLevel.start();
    voice.start();
  };

  const reset = () => {
    setSettings(baseSettings);
    setReplySource('placeholder');
    setMessages([{ id: Date.now(), speaker: 'ai', text: 'Systems reset. I am online and standing by, sir.' }]);
    window.speechSynthesis?.cancel();
    micLevel.stop();
  };

  return (
    <main className="app-shell">
      <ParticleField audioLevel={micLevel.level} settings={settings} />
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
          <span>{voice.transcript || voice.error || micLevel.error || '粒子核心正在组成动态图形，等待你的声音或输入。'}</span>
        </div>

        <div className="core-label" aria-hidden="true">
          <span>JARVIS</span>
        </div>

        <div className="message-stack" aria-live="polite">
          {messages.slice(-4).map((message) => (
            <div className="message-row" data-speaker={message.speaker} key={message.id}>
              {message.speaker === 'ai' ? <Bot size={15} /> : <MessageCircle size={15} />}
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <form className="dialogue-bar" onSubmit={handleMessageSubmit}>
          <button
            aria-label={voice.listening ? 'Stop listening' : 'Start listening'}
            className="icon-button"
            type="button"
            onClick={toggleListening}
          >
            {voice.listening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <input
            aria-label="Message"
            placeholder="说点什么，或者输入一句话"
            value={typedMessage}
            onChange={(event) => setTypedMessage(event.target.value)}
          />
          <button className="send-button" type="submit">
            <CornerDownRight size={17} />
            <span>Send</span>
          </button>
          <button aria-label="Reset dialogue" className="icon-button quiet" type="button" onClick={reset}>
            <RotateCcw size={18} />
          </button>
          <button className="voice-hint" type="button" onClick={previewVoice}>
            <Volume2 size={15} />
            <span>
              {micLevel.active
                ? `Voice energy ${(micLevel.level * 100).toFixed(0)}%`
                : replySource === 'endpoint'
                  ? 'Model endpoint connected'
                  : 'Preview voice profile'}
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}
