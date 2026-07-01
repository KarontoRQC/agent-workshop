import { API_BASE_URL } from '../../lib/agentStreamClient';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from '../../lib/language';

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
const wakeWords = ['jarvis', '贾维斯', '贾维丝', '加维斯', '甲维斯', '嘉维斯'];

export type SpeechCallbacks = {
  onEnd?: () => void;
  onError?: (reason: string) => void;
  onPulse?: () => void;
  onStart?: () => void;
};

export type SpeechOutputOptions = {
  audioBlob?: Blob;
  displayText?: string;
  minimumVisualDurationMs?: number;
  onSettled?: () => void;
  resumeListening?: boolean;
};

class TtsRequestError extends Error {
  fallbackToBrowser: boolean;

  constructor(message: string, fallbackToBrowser = false) {
    super(message);
    this.name = 'TtsRequestError';
    this.fallbackToBrowser = fallbackToBrowser;
  }
}

export function extractWakeCommand(raw: string) {
  const text = raw.trim();
  const lowered = text.toLowerCase();
  const matchedWord = wakeWords.find((word) => lowered.includes(word.toLowerCase()));

  if (!matchedWord) {
    return null;
  }

  const startIndex = lowered.indexOf(matchedWord.toLowerCase());
  const command = text
    .slice(startIndex + matchedWord.length)
    .replace(/^[\s,，。；;！!？?]+/, '')
    .trim();

  return { command, wakeWord: matchedWord };
}

export function wantsSleep(raw: string) {
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

export function primeSpeechOutput() {
  if (!('speechSynthesis' in window)) {
    return;
  }

  window.speechSynthesis.getVoices();
  window.speechSynthesis.resume();
}

let activeSpeechAudio: HTMLAudioElement | null = null;
let activeSpeechObjectUrl = '';
let fallbackAudioContext: AudioContext | null = null;
let fallbackToneTimer: number | null = null;
let fallbackPulseTimer: number | null = null;
let fallbackToneOscillators: OscillatorNode[] = [];

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function getTtsMode() {
  const rawMode = String(import.meta.env.VITE_TTS_BROWSER_FALLBACK ?? 'browser')
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

export function isFallbackableTtsError(error: unknown) {
  if (error instanceof TtsRequestError) {
    return error.fallbackToBrowser;
  }

  return getTtsMode() === 'auto' && error instanceof TypeError;
}

export function cancelSpeechPlayback() {
  clearCommsFallbackTone();

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

function clearCommsFallbackTone() {
  if (fallbackToneTimer !== null) {
    window.clearTimeout(fallbackToneTimer);
    fallbackToneTimer = null;
  }

  if (fallbackPulseTimer !== null) {
    window.clearInterval(fallbackPulseTimer);
    fallbackPulseTimer = null;
  }

  fallbackToneOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // Oscillator may already have ended.
    }

    oscillator.disconnect();
  });
  fallbackToneOscillators = [];
}

function getFallbackAudioContext() {
  const audioWindow = window as AudioWindow;
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  if (!fallbackAudioContext || fallbackAudioContext.state === 'closed') {
    fallbackAudioContext = new AudioContextConstructor();
  }

  return fallbackAudioContext;
}

function writeWavString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function createCommsToneWavBlob() {
  const sampleRate = 24000;
  const durationSeconds = 1.16;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const dataSize = sampleCount * 2;

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const progress = time / durationSeconds;
    const attack = Math.min(1, time / 0.05);
    const release = Math.min(1, (durationSeconds - time) / 0.34);
    const envelope = Math.max(0, Math.min(1, attack, release));
    const sweepFrequency = 170 + progress * 430;
    const carrier =
      Math.sin(2 * Math.PI * sweepFrequency * time) * 0.42 +
      Math.sin(2 * Math.PI * sweepFrequency * 1.51 * time) * 0.18 +
      Math.sin(2 * Math.PI * 56 * time) * 0.08;
    const stepPulse = (Math.sin(2 * Math.PI * 9 * time) > 0 ? 0.72 : 0.46) + progress * 0.16;
    const sample = Math.max(-1, Math.min(1, carrier * envelope * stepPulse));

    view.setInt16(44 + index * 2, sample * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function playGeneratedCommsWav(callbacks: SpeechCallbacks = {}) {
  cancelSpeechPlayback();

  try {
    const objectUrl = URL.createObjectURL(createCommsToneWavBlob());
    const audio = typeof Audio === 'function' ? new Audio(objectUrl) : document.createElement('audio');
    let pulseTimer: number | null = null;
    const clearPulse = () => {
      if (pulseTimer !== null) {
        window.clearInterval(pulseTimer);
        pulseTimer = null;
      }
    };
    const finish = () => {
      clearPulse();
      cancelSpeechPlayback();
      callbacks.onEnd?.();
    };

    audio.src = objectUrl;
    activeSpeechAudio = audio;
    activeSpeechObjectUrl = objectUrl;
    audio.onplaying = () => {
      callbacks.onStart?.();
      callbacks.onPulse?.();
      pulseTimer = window.setInterval(() => callbacks.onPulse?.(), 150);
    };
    audio.onended = finish;
    audio.onerror = () => {
      clearPulse();
      cancelSpeechPlayback();
      callbacks.onError?.('Audio playback is not available in this browser.');
      callbacks.onEnd?.();
    };
    void audio.play().catch((error: unknown) => {
      clearPulse();
      cancelSpeechPlayback();
      callbacks.onError?.(error instanceof Error ? error.message : 'Audio playback failed.');
      callbacks.onEnd?.();
    });

    return true;
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : 'Audio playback failed.');
    callbacks.onEnd?.();
    return false;
  }
}

function playCommsFallbackTone(callbacks: SpeechCallbacks = {}) {
  cancelSpeechPlayback();

  const audioContext = getFallbackAudioContext();

  if (!audioContext) {
    return playGeneratedCommsWav(callbacks);
  }

  void audioContext.resume().catch(() => null);

  const startAt = audioContext.currentTime + 0.03;
  const masterGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const tones: Array<{ duration: number; frequency: number; start: number; type: OscillatorType }> = [
    { duration: 0.3, frequency: 164.81, start: 0, type: 'sine' },
    { duration: 0.36, frequency: 246.94, start: 0.08, type: 'triangle' },
    { duration: 0.4, frequency: 369.99, start: 0.18, type: 'sine' },
    { duration: 0.36, frequency: 554.37, start: 0.31, type: 'triangle' },
  ];

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, startAt);
  filter.frequency.exponentialRampToValueAtTime(4200, startAt + 0.7);
  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.04);
  masterGain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.82);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.18);
  filter.connect(masterGain);
  masterGain.connect(audioContext.destination);

  tones.forEach((tone, index) => {
    const oscillator = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    const toneStart = startAt + tone.start;
    const toneEnd = toneStart + tone.duration;

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
    oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * 1.22, toneEnd);
    toneGain.gain.setValueAtTime(0.0001, toneStart);
    toneGain.gain.exponentialRampToValueAtTime(0.32 / (index + 1), toneStart + 0.03);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    oscillator.connect(toneGain);
    toneGain.connect(filter);
    oscillator.onended = () => {
      oscillator.disconnect();
      toneGain.disconnect();
    };
    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.03);
    fallbackToneOscillators.push(oscillator);
  });

  callbacks.onStart?.();
  callbacks.onPulse?.();
  fallbackPulseTimer = window.setInterval(() => callbacks.onPulse?.(), 150);
  fallbackToneTimer = window.setTimeout(() => {
    clearCommsFallbackTone();
    filter.disconnect();
    masterGain.disconnect();
    callbacks.onEnd?.();
  }, 1220);

  return true;
}

export async function requestTtsAudio(text: string) {
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
      playBrowserSpeech(text, callbacks);
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
    playCommsFallbackTone(callbacks);
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
    if (!playCommsFallbackTone(callbacks)) {
      callbacks.onError?.(reason);
      callbacks.onEnd?.();
    }
  };

  try {
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
  } catch (error) {
    stopResumeTimer();
    console.warn(error);
    if (!playCommsFallbackTone(callbacks)) {
      callbacks.onError?.(error instanceof Error ? error.message : 'Speech synthesis failed.');
      callbacks.onEnd?.();
    }
  }
}

function playBrowserSpeech(text: string, callbacks: SpeechCallbacks = {}) {
  if (!('speechSynthesis' in window)) {
    return playCommsFallbackTone(callbacks);
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

export function speak(text: string, callbacks: SpeechCallbacks = {}, preparedAudio?: Blob) {
  const ttsMode = getTtsMode();

  if (ttsMode === 'browser') {
    return playBrowserSpeech(text, callbacks);
  }

  void playTtsSpeech(polishSpokenLine(text), callbacks, preparedAudio);
  return true;
}
