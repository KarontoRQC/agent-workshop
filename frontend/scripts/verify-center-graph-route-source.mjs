import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/App.tsx', 'utf8');

assert.doesNotMatch(
  appSource,
  /recommendedAgentFocusNodes/,
  'Center ParticleField graph must not derive labels from recommended agents.',
);
assert.doesNotMatch(
  appSource,
  /graphFocusKey[\s\S]*?agents:/,
  'Center ParticleField graph focus key must not switch into an agents mode.',
);
assert.match(
  appSource,
  /const graphFocusKey =\s+graphRoute\.length > 0 \? `\$\{lastAction\?\.type === 'focus_graph_path' \? lastAction\.label : graphRoute\.at\(-1\)\}:\$\{graphRoute\.join\('\/'\)\}` : '';/,
  'Center ParticleField graph focus key must be based on the knowledge path route.',
);
assert.match(
  appSource,
  /<ParticleField[\s\S]*?graphRoute=\{graphRoute\}/,
  'ParticleField must receive graphRoute directly, not recommendation-agent names.',
);

console.log('Center graph uses knowledge-path route source only.');
