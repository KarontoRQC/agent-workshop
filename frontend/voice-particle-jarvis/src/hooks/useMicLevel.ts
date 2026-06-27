import { useCallback, useEffect, useRef, useState } from 'react';

export function useMicLevel() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);

  const stop = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
    setActive(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone unavailable');
      return;
    }

    stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const AudioContextCtor = window.AudioContext;
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataRef.current = new Float32Array(analyser.fftSize);
      streamRef.current = stream;
      setError('');
      setActive(true);

      const tick = () => {
        const currentAnalyser = analyserRef.current;
        const data = dataRef.current;

        if (!currentAnalyser || !data) {
          return;
        }

        currentAnalyser.getFloatTimeDomainData(data);
        let sum = 0;

        for (let index = 0; index < data.length; index += 1) {
          const sample = data[index];
          sum += sample * sample;
        }

        const rms = Math.sqrt(sum / data.length);
        const normalized = Math.min(1, Math.max(0, (rms - 0.015) * 9.5));
        setLevel((current) => current + (normalized - current) * 0.34);
        frameRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch {
      setError('Microphone permission needed');
      setActive(false);
      setLevel(0);
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    active,
    error,
    level,
    start,
    stop,
  };
}
