import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorLike = {
  error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const COMMAND_SILENCE_MS = 2800;
const NON_SECURE_VOICE_MESSAGE = '语音识别在非安全连接下不可用，请使用 HTTPS 或 localhost / 127.0.0.1 访问。';

function isSecureForVoice() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function useVoiceControl(onCommand: (command: string) => void, language = 'zh-CN') {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const keepAliveRef = useRef(false);
  const languageRef = useRef(language);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const commandTimerRef = useRef(0);
  const finalTranscriptRef = useRef('');
  const restartTimerRef = useRef(0);
  const sessionRef = useRef(0);
  const onCommandRef = useRef(onCommand);
  const Recognition = useMemo(getSpeechRecognition, []);
  const canUseVoice = isSecureForVoice();
  const supported = Boolean(Recognition && canUseVoice);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = 0;
    }
  }, []);

  const clearCommandTimer = useCallback(() => {
    if (commandTimerRef.current) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = 0;
    }
  }, []);

  const resetTranscriptState = useCallback(() => {
    clearCommandTimer();
    finalTranscriptRef.current = '';
    setTranscript('');
  }, [clearCommandTimer]);

  const scheduleCommandEmit = useCallback(
    (sessionId: number) => {
      clearCommandTimer();
      commandTimerRef.current = window.setTimeout(() => {
        if (sessionId !== sessionRef.current) {
          return;
        }

        const command = finalTranscriptRef.current.trim();
        commandTimerRef.current = 0;
        finalTranscriptRef.current = '';

        if (command) {
          setTranscript(command);
          onCommandRef.current(command);
        }
      }, COMMAND_SILENCE_MS);
    },
    [clearCommandTimer],
  );

  const pause = useCallback(() => {
    sessionRef.current += 1;
    clearRestartTimer();
    clearCommandTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
    }

    setListening(false);
  }, [clearCommandTimer, clearRestartTimer]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    pause();
    setError('');
    resetTranscriptState();
    setListening(false);
  }, [pause, resetTranscriptState]);

  const start = useCallback(() => {
    if (!canUseVoice) {
      setError(NON_SECURE_VOICE_MESSAGE);
      return;
    }

    if (!Recognition) {
      setError('SpeechRecognition unavailable');
      return;
    }

    keepAliveRef.current = true;
    clearRestartTimer();

    if (recognitionRef.current) {
      return;
    }

    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    const beginRecognition = () => {
      if (sessionId !== sessionRef.current || !keepAliveRef.current || recognitionRef.current) {
        return;
      }

      const recognition = new Recognition();
      recognition.lang = languageRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (sessionId !== sessionRef.current || recognitionRef.current !== recognition) {
          return;
        }

        setError('');
        setListening(true);
      };

      recognition.onend = () => {
        if (sessionId !== sessionRef.current || recognitionRef.current !== recognition) {
          return;
        }

        recognitionRef.current = null;
        setListening(false);

        if (keepAliveRef.current) {
          restartTimerRef.current = window.setTimeout(beginRecognition, 220);
        }
      };

      recognition.onerror = (event) => {
        if (sessionId !== sessionRef.current || recognitionRef.current !== recognition) {
          return;
        }

        if (event.error !== 'no-speech') {
          setError(event.error);
        }
        setListening(false);
      };

      recognition.onresult = (event) => {
        if (sessionId !== sessionRef.current || recognitionRef.current !== recognition) {
          return;
        }

        let finalText = '';
        let interimText = '';

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const piece = result[0]?.transcript ?? '';

          if (result.isFinal) {
            finalText += piece;
          } else {
            interimText += piece;
          }
        }

        const nextTranscript = (finalText || interimText).trim();
        const finalTextForBuffer = finalText.trim();
        const interimTextForDisplay = interimText.trim();

        if (finalTextForBuffer) {
          finalTranscriptRef.current = [finalTranscriptRef.current, finalTextForBuffer].filter(Boolean).join(' ');
        }

        const displayTranscript = [finalTranscriptRef.current, interimTextForDisplay].filter(Boolean).join(' ').trim();

        if (displayTranscript || nextTranscript) {
          setTranscript(displayTranscript || nextTranscript);
        }

        if (interimTextForDisplay) {
          clearCommandTimer();
          return;
        }

        if (finalTranscriptRef.current.trim()) {
          scheduleCommandEmit(sessionId);
        }
      };

      try {
        recognitionRef.current = recognition;
        recognition.start();
      } catch (startError) {
        if (sessionId !== sessionRef.current) {
          return;
        }

        recognitionRef.current = null;
        const message = startError instanceof Error ? startError.message : 'Speech start failed';
        setError(message);
        setListening(false);

        if (keepAliveRef.current) {
          restartTimerRef.current = window.setTimeout(beginRecognition, 420);
        }
      }
    };

    beginRecognition();
  }, [Recognition, canUseVoice, clearCommandTimer, clearRestartTimer, scheduleCommandEmit]);

  useEffect(() => {
    if (!canUseVoice) {
      setError(NON_SECURE_VOICE_MESSAGE);
    }

    return () => {
      keepAliveRef.current = false;
      clearRestartTimer();
      clearCommandTimer();
      recognitionRef.current?.abort();
    };
  }, [canUseVoice, clearCommandTimer, clearRestartTimer]);

  return {
    error,
    listening,
    pause,
    resume: start,
    start,
    stop,
    supported,
    transcript,
  };
}
