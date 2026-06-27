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

export function useVoiceControl(onCommand: (command: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const onCommandRef = useRef(onCommand);
  const Recognition = useMemo(getSpeechRecognition, []);
  const supported = Boolean(Recognition);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Recognition) {
      setError('SpeechRecognition unavailable');
      return;
    }

    if (recognitionRef.current) {
      stop();
    }

    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setError('');
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setError(event.error);
      setListening(false);
    };

    recognition.onresult = (event) => {
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
      recognition.start();
      recognitionRef.current = recognition;
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : 'Speech start failed';
      setError(message);
      setListening(false);
    }
  }, [Recognition, stop]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    error,
    listening,
    start,
    stop,
    supported,
    transcript,
  };
}
