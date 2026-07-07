import assert from 'node:assert/strict';
import fs from 'node:fs';

const particleSource = fs.readFileSync('src/components/ParticleField.tsx', 'utf8');
const appSource = fs.readFileSync('src/App.tsx', 'utf8');

assert.match(
  particleSource,
  /performanceMode\?: 'active' \| 'background';/,
  'ParticleField must expose a performance mode for heavy overlay states.',
);
assert.match(
  particleSource,
  /const ACTIVE_RENDER_PIXEL_RATIO_CAP = 1\.5;[\s\S]*?const BACKGROUND_RENDER_PIXEL_RATIO_CAP = 1\.1;/,
  'ParticleField must cap high-DPR canvas backing resolution without changing the visual design.',
);
assert.match(
  particleSource,
  /preserveDrawingBuffer: false,/,
  'ParticleField should not preserve the drawing buffer during normal rendering.',
);
assert.match(
  particleSource,
  /const targetFrameRate = document\.hidden[\s\S]*?HIDDEN_FRAME_RATE[\s\S]*?BACKGROUND_FRAME_RATE[\s\S]*?IDLE_FRAME_RATE[\s\S]*?: 60;/,
  'ParticleField must throttle hidden, background, and idle frame rates.',
);
assert.match(
  particleSource,
  /data-performance-mode=\{performanceMode\}/,
  'ParticleField DOM should expose the current performance mode for browser verification.',
);
assert.match(
  appSource,
  /performanceMode="active"/,
  'App should keep the particle field active now that the legacy Hero Hall popup is not mounted.',
);
assert.doesNotMatch(
  appSource,
  /<AgentHeroHall/,
  'The legacy Hero Hall popup must not be mounted on the main page.',
);

console.log('Performance guardrails verified.');
