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
  const restartTimerRef = useRef(0);
  const sessionRef = useRef(0);
  const onCommandRef = useRef(onCommand);
  const Recognition = useMemo(getSpeechRecognition, []);
  const supported = Boolean(Recognition);

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

  const pause = useCallback(() => {
    sessionRef.current += 1;
    clearRestartTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
    }

    setListening(false);
  }, [clearRestartTimer]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    pause();
    setError('');
    setTranscript('');
    setListening(false);
  }, [pause]);

  const start = useCallback(() => {
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

        if (nextTranscript) {
          setTranscript(nextTranscript);
        }

        if (finalText.trim()) {
          onCommandRef.current(finalText.trim());
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
  }, [Recognition, clearRestartTimer]);

  useEffect(() => {
    return () => {
      keepAliveRef.current = false;
      clearRestartTimer();
      recognitionRef.current?.abort();
    };
  }, [clearRestartTimer]);

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
