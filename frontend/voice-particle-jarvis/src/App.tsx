import { FormEvent, useCallback, useMemo, useState } from 'react';
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

const matureEnglishVoiceHints = [
  'daniel',
  'george',
  'guy',
  'david',
  'mark',
  'alex',
  'english male',
  'uk english male',
  'us english male',
];

function selectMatureEnglishVoice() {
  const voices = window.speechSynthesis.getVoices();

  return (
    voices.find((voice) => {
      const name = voice.name.toLowerCase();
      return voice.lang.toLowerCase().startsWith('en') && matureEnglishVoiceHints.some((hint) => name.includes(hint));
    }) ??
    voices.find((voice) => voice.lang.toLowerCase() === 'en-gb') ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('en-us')) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ??
    null
  );
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = selectMatureEnglishVoice();

  utterance.lang = voice?.lang ?? 'en-GB';
  utterance.rate = 0.82;
  utterance.pitch = 0.68;
  utterance.volume = 0.96;
  utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export default function App() {
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [typedMessage, setTypedMessage] = useState('');
  const [replySource, setReplySource] = useState<'placeholder' | 'endpoint'>('placeholder');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, speaker: 'ai', text: 'I am listening. The model endpoint can stay empty; the particle core is online.' },
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
        const fallback = 'The reasoning endpoint is not connected yet. I will keep the local dialogue loop alive.';
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

    void submitMessage(typedMessage);
    setTypedMessage('');
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
    setMessages([{ id: Date.now(), speaker: 'ai', text: 'Online. We are starting again. The model slot is still open.' }]);
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
          <div className="voice-hint">
            <Volume2 size={15} />
            <span>
              {micLevel.active
                ? `Voice energy ${(micLevel.level * 100).toFixed(0)}%`
                : replySource === 'endpoint'
                  ? 'Model endpoint connected'
                  : 'Model slot empty -> local placeholder'}
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}
