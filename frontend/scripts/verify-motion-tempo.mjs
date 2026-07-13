import assert from 'node:assert/strict';
import fs from 'node:fs';

const appCss = fs.readFileSync('src/App.css', 'utf8');
const mechaCss = fs.readFileSync('src/components/MechaCockpitFrame.css', 'utf8');
const pendingCss = fs.readFileSync('src/features/heroHall/AgentCombinationPendingPage.css', 'utf8');

assert.match(appCss, /workflow-prism-spin 12s linear infinite/, 'Workflow prism must complete a smooth visible cycle every 12 seconds.');
assert.match(
  appCss,
  /typing-pulse 2s cubic-bezier\(0\.4, 0, 0\.2, 1\) infinite/,
  'Thinking dots must use the faster smooth loading tempo.',
);
assert.match(appCss, /filter: blur\(7px\);\s+opacity: 0\.64;/, 'The outer workflow prism must remain visibly bright.');
assert.match(appCss, /opacity: 0\.58;\s+pointer-events: none;\s+will-change: transform;/, 'The inner workflow prism must remain visibly bright.');
assert.match(appCss, /assistant-subtitle-wave 575ms ease-in-out infinite/, 'Assistant subtitle waveform must run at the requested second double-speed tempo.');
assert.match(appCss, /voice-ai-wave 2\.3s ease-in-out infinite/, 'Voice waveform must keep the balanced classroom tempo.');
assert.match(appCss, /helmet-telemetry-load 4\.6s ease-in-out infinite/, 'Helmet telemetry must use low-frequency breathing.');
assert.match(mechaCss, /mecha-energy-breathe 4\.6s ease-in-out infinite/, 'Mecha energy seams must breathe slowly.');
assert.match(pendingCss, /agent-combination-pending-spin 4\.2s linear infinite/, 'Hero Hall pending icon must rotate at the balanced tempo.');
assert.match(
  appCss,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 1ms !important;[\s\S]*?animation-iteration-count: 1 !important;/,
  'Reduced-motion mode must collapse infinite animations to one iteration instead of a 1ms infinite flicker.',
);
assert.match(
  appCss,
  /\.workflow-dock\[data-highlight='route'\]::before,[\s\S]*?\.workflow-dock-section\.is-prism::before \{[\s\S]*?animation-duration: 20s !important;[\s\S]*?animation-iteration-count: infinite !important;/,
  'Reduced-motion mode must keep both workflow prism layers moving instead of freezing the inner layer.',
);
assert.match(
  appCss,
  /\.agent-typing-line span,[\s\S]*?animation-duration: 2\.8s !important;[\s\S]*?animation-iteration-count: infinite !important;/,
  'Reduced-motion mode must preserve a smooth visible thinking indicator.',
);
assert.match(
  appCss,
  /\.assistant-subtitle-wave i \{[\s\S]*?animation-duration: 900ms !important;[\s\S]*?animation-iteration-count: infinite !important;/,
  'Reduced-motion mode must preserve the subtitle waveform at a visible tempo.',
);
assert.match(appCss, /\.assistant-subtitle-wave i:nth-child\(7\) \{\s*animation-delay: 330ms;/, 'Subtitle bars must use double-speed sequential phase offsets.');
assert.match(appCss, /backface-visibility: hidden;[\s\S]*?will-change: transform, opacity;/, 'Subtitle bars must stay compositor-friendly.');
assert.doesNotMatch(
  appCss,
  /\.assistant-subtitle-wave i,\s*\.voice-ai-wave i \{\s*animation: none;/,
  'A later reduced-motion rule must not freeze the subtitle and voice waveforms.',
);
assert.match(
  pendingCss,
  /agent-combination-pending-spin 7s linear infinite !important/,
  'Reduced-motion mode must preserve a slow pending indicator instead of freezing it.',
);

assert.doesNotMatch(appCss, /workflow-prism-spin (?:2\.1|8\.8|15|18|36)s/, 'The previous rapid or slower rainbow cycles must not return.');
assert.doesNotMatch(pendingCss, /agent-combination-pending-spin (?:1\.2|2\.8|4\.8|6)s linear infinite;/, 'The previous pending tempos must not return.');

console.log('Motion tempo guardrails verified.');
