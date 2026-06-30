import type { CSSProperties } from 'react';
import type { DialogueMode } from '../types';

type ParticleWordmarkProps = {
  graphActive: boolean;
  mode: DialogueMode;
};

type ParticleStyle = CSSProperties & {
  [key: `--${string}`]: string;
};

const ambientDots = Array.from({ length: 88 }, (_, index) => {
  const lane = index % 11;
  const row = Math.floor(index / 11);
  const wave = Math.sin(index * 1.72) * 8;
  const x = 5 + lane * 9 + Math.sin(index * 2.1) * 2.4;
  const y = 18 + row * 8.8 + wave * 0.16;

  return {
    amp: `${(Math.sin(index * 1.37) * 7.5).toFixed(2)}px`,
    delay: `${(-index * 28).toFixed(0)}ms`,
    drift: `${(Math.cos(index * 0.91) * 4.8).toFixed(2)}px`,
    size: `${(1.2 + (index % 4) * 0.32).toFixed(2)}px`,
    x: `${x.toFixed(2)}%`,
    y: `${y.toFixed(2)}%`,
  };
});

export default function ParticleWordmark({ graphActive, mode }: ParticleWordmarkProps) {
  return (
    <div className="core-label particle-wordmark" data-graph-active={graphActive} data-mode={mode}>
      <svg aria-hidden="true" className="particle-wordmark-svg" viewBox="0 0 560 132">
        <defs>
          <mask id="jarvisWordMask" maskUnits="userSpaceOnUse">
            <rect width="560" height="132" fill="black" />
            <text
              fill="white"
              fontFamily="Inter, Arial, Helvetica, sans-serif"
              fontSize="78"
              fontWeight="900"
              letterSpacing="12"
              textAnchor="middle"
              x="280"
              y="91"
            >
              JARVIS
            </text>
          </mask>
          <pattern id="jarvisDotPatternA" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.35" cy="1.55" fill="#ffffff" opacity="0.98" r="1.02" />
            <circle cx="4.45" cy="4.25" fill="#82e7ff" opacity="0.86" r="0.66" />
          </pattern>
          <pattern id="jarvisDotPatternB" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2.15" cy="2.25" fill="#8cecff" opacity="0.84" r="0.78" />
            <circle cx="6.85" cy="6.45" fill="#ffffff" opacity="0.72" r="0.54" />
          </pattern>
          <linearGradient id="jarvisScanGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgba(0,0,0,0)" />
            <stop offset="0.34" stopColor="rgba(120,229,255,0.08)" />
            <stop offset="0.5" stopColor="rgba(255,255,255,1)" />
            <stop offset="0.66" stopColor="rgba(120,229,255,0.16)" />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <g className="particle-wordmark-glyph">
          <text
            className="particle-wordmark-glyph-text"
            fill="url(#jarvisDotPatternA)"
            fontFamily="Inter, Arial, Helvetica, sans-serif"
            fontSize="78"
            fontWeight="900"
            letterSpacing="12"
            stroke="rgba(226, 247, 255, 0.28)"
            strokeDasharray="1.2 5.6"
            strokeLinecap="round"
            strokeWidth="1.15"
            textAnchor="middle"
            x="280"
            y="91"
          >
            JARVIS
          </text>
        </g>
        <rect className="particle-wordmark-scan" fill="url(#jarvisScanGradient)" height="132" mask="url(#jarvisWordMask)" width="260" x="-300" y="0" />
      </svg>
      <div className="particle-wordmark-field" aria-hidden="true">
        {ambientDots.map((dot, index) => (
          <i
            key={index}
            style={
              {
                '--amp': dot.amp,
                '--delay': dot.delay,
                '--drift': dot.drift,
                '--size': dot.size,
                '--x': dot.x,
                '--y': dot.y,
              } as ParticleStyle
            }
          />
        ))}
      </div>
    </div>
  );
}
