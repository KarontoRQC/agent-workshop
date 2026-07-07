import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/App.tsx', 'utf8');

assert.match(
  appSource,
  /const TOOL_CALL_TO_MAIN_SURFACE_REVEAL_MS = \d+;/,
  'App must define a delay between left tool-call reveal and right-side surface reveal.',
);
assert.match(
  appSource,
  /const revealMainSurfaceAfterToolCall = async \(showMainSurface: \(\) => void\) => {[\s\S]*?await wait\(TOOL_CALL_TO_MAIN_SURFACE_REVEAL_MS\);[\s\S]*?showMainSurface\(\);[\s\S]*?return true;/,
  'Main surfaces must be revealed only after the left tool-call marker has had time to render.',
);
assert.match(
  appSource,
  /revealWorkflow\({ knowledgePath: true }\);\s+return revealMainSurfaceAfterToolCall\(\(\) => {[\s\S]*?setLastAction\(routeAction\);[\s\S]*?setRouteDockVisible\(true\);[\s\S]*?setWorkflowHighlight\('route'\);[\s\S]*?}\);/,
  'Knowledge path dock and graph focus must wait until after the left knowledge-path tool call is rendered.',
);
assert.match(
  appSource,
  /agentRevealCount = 1;\s+revealWorkflow\({ recommendationAgents: true }\);\s+const mainSurfaceVisible = await revealMainSurfaceAfterToolCall\(\(\) => {[\s\S]*?setRecommendationDockVisible\(true\);[\s\S]*?setWorkflowHighlight\('agents'\);[\s\S]*?}\);/,
  'Recommended-agent dock must wait until after the left recommendation tool call is rendered.',
);
assert.match(
  appSource,
  /if \(snapshot\.agents\.length > 0 && agentStatus !== 'streaming'\) {\s+setRecommendationDockVisible\(true\);\s+}/,
  'Recommendation snapshots must not auto-open the right dock while a stream is still presenting left-side tool calls.',
);

console.log('Tool-call reveal order verified.');
