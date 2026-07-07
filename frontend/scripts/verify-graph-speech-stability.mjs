import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/ParticleField.tsx', 'utf8');

assert.match(
  source,
  /const graphSpeechMotionDamping = 1 - graphBlend \* 0\.92;/,
  'Graph mode must damp speech-driven motion so the knowledge graph does not pulse while the agent speaks.',
);
assert.match(
  source,
  /const graphSpeechGlowDamping = 1 - graphBlend \* 0\.58;/,
  'Graph mode may retain subtle speech glow without driving large motion.',
);
assert.match(
  source,
  /const motionVoiceEnergy = voiceEnergy \* graphSpeechMotionDamping;[\s\S]*?const motionVoiceBeat = voiceBeat \* graphSpeechMotionDamping;/,
  'Speech motion should use damped voice envelopes during graph mode.',
);
assert.match(
  source,
  /const motionPulsePower = pulsePower \* graphSpeechMotionDamping;[\s\S]*?renderPulsePower = motionPulsePower;/,
  'Pulse seed power should also be damped during graph mode.',
);
assert.match(
  source,
  /points\.scale\.setScalar\(baseScale \* \(1 \+ outputScale \+ motionPulsePower \* 0\.018\)\);/,
  'Global particle scale must not use raw pulsePower while the graph is visible.',
);
assert.doesNotMatch(
  source,
  /points\.scale\.setScalar\(baseScale \* \(1 \+ outputScale \+ pulsePower/,
  'Raw pulsePower must not drive the graph scale.',
);

console.log('Graph speech stability verified.');
