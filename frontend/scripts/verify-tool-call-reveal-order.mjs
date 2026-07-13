import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
const fallbackStart = appSource.indexOf('const applyLineupFallbackAgents');
const fallbackEnd = appSource.indexOf('const closeCardsReady', fallbackStart);
const fallbackSource = appSource.slice(fallbackStart, fallbackEnd);
const submitStart = appSource.indexOf('const submitMessage');
const submitResetEnd = appSource.indexOf('if (shouldReserveHeroHallLaunch', submitStart);
const submitResetSource = appSource.slice(submitStart, submitResetEnd);

assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart, 'Lineup fallback presentation block must remain discoverable.');

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
  /const showRecommendationSurface = \(\) => {[\s\S]*?recommendationSurfaceUnlockedRef\.current = true;[\s\S]*?setRecommendationDockVisible\(true\);[\s\S]*?setWorkflowHighlight\('agents'\);[\s\S]*?};[\s\S]*?agentRevealCount = 1;\s+revealWorkflow\({ recommendationAgents: true }\);\s+const mainSurfaceVisible = await revealMainSurfaceAfterToolCall\(showRecommendationSurface\);/,
  'Recommended-agent dock must wait until after the left recommendation tool call is rendered.',
);
assert.match(
  appSource,
  /await playSpeechSegment\('knowledgeExplanation'\);[\s\S]*?await playSpeechSegment\('recommendationAck'\);[\s\S]*?runCardAnimation\(\)/,
  'Recommendation presentation must start only after the knowledge-path explanation has settled.',
);
assert.doesNotMatch(
  appSource,
  /revealCompletedWorkflowSurfaces/,
  'Stream completion must not bypass the ordered knowledge-path and recommendation presentation.',
);
assert.doesNotMatch(
  fallbackSource,
  /revealWorkflow\({ recommendationAgents: true }\)|setRecommendationDockVisible\(true\)/,
  'Lineup fallback data must not reveal recommendation cards before the knowledge-path explanation.',
);
assert.match(
  appSource,
  /if \(snapshot\.agents\.length > 0 && recommendationSurfaceUnlockedRef\.current\) {\s+setRecommendationDockVisible\(true\);\s+}/,
  'Recommendation snapshots must not auto-open the right dock before ordered presentation unlocks it.',
);
assert.doesNotMatch(
  submitResetSource,
  /setRouteDockVisible\(false\)|setRecommendationDockVisible\(false\)|setCurrentRecommendationId\(''\)|setLastAction\(null\)/,
  'A new message must preserve the last route and recommendation surfaces until their matching tool calls replace them.',
);
assert.match(
  appSource,
  /const showRecommendationSurface = \(\) => \{[\s\S]*?setPinnedRecommendedAgents\(nextRecommendedAgents\);[\s\S]*?setCurrentRecommendationId\(recommendationIdForResponse\);[\s\S]*?recommendationSurfaceUnlockedRef\.current = true;/,
  'A recommendation tool call must atomically pin the completed agents and recommendation id before replacing the visible surface.',
);
assert.match(
  appSource,
  /snapshotHasManualAgents && snapshotRecommendedAgents\.length > 0[\s\S]*?: pinnedRecommendedAgents\.length > 0[\s\S]*?\? pinnedRecommendedAgents[\s\S]*?: latestDisplayableRecommendedAgents/,
  'The visible recommendation dock must prefer its pinned snapshot over uncommitted streaming agents.',
);
assert.match(
  appSource,
  /const showRecommendationSurface = \(\) => {[\s\S]*?recommendationSurfaceUnlockedRef\.current = true;[\s\S]*?schedulePendingHeroHallJump\(\);[\s\S]*?};/,
  'Hero Hall navigation must unlock at the same ordered point as recommendation-card presentation.',
);
assert.match(
  appSource,
  /pendingHeroHallJump = {[\s\S]*?agents: finalRecommendedAgents,[\s\S]*?recommendationId: recommendationIdForResponse,[\s\S]*?};\s+schedulePendingHeroHallJump\(\);/,
  'Completed recommendation metadata must wait behind the presentation gate before navigation.',
);

console.log('Tool-call reveal order verified.');
