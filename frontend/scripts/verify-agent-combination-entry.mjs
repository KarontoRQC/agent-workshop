import assert from 'node:assert/strict';
import fs from 'node:fs';

const entryPath = 'src/features/heroHall/AgentCombinationEntryPage.tsx';
const appPath = 'src/App.tsx';
const catalogPath = 'src/lib/agentLaunchCatalog.ts';
const heroHallPath = 'src/features/heroHall/AgentHeroHall.tsx';
const workflowDockPath = 'src/features/workflow/WorkflowDock.tsx';

assert.ok(fs.existsSync(entryPath), 'Agent combination entry page component must exist.');

const entrySource = fs.readFileSync(entryPath, 'utf8');
assert.match(entrySource, /fetchRecommendationSnapshot/, 'Entry page must fetch recommendation snapshot by id.');
assert.match(entrySource, /snapshotToRecommendedAgents/, 'Entry page must map snapshot agents through snapshot model.');
assert.match(entrySource, /getAgentLaunchTargets/, 'Entry page must derive launch targets from fetched agents.');

const appSource = fs.readFileSync(appPath, 'utf8');
assert.match(appSource, /AgentCombinationEntryPage/, 'App must render the entry page for agent_combination URLs.');
assert.match(appSource, /getAgentCombinationEntryIdFromUrl/, 'App must parse id for agent_combination entry URLs.');
assert.doesNotMatch(appSource, /searchParams\.set\('recommendation_id'/, 'Main chat must not write recommendation_id into the home URL.');
assert.doesNotMatch(appSource, /getRecommendationIdFromUrl/, 'Main chat must not initialize recommendation state from home URL parameters.');
assert.match(
  appSource,
  /url\.searchParams\.delete\('recommendation_id'\)/,
  'Main chat should clean legacy recommendation_id parameters from the home URL.',
);

const catalogSource = fs.readFileSync(catalogPath, 'utf8');
assert.match(catalogSource, /agent_combination=1/, 'Launch fallback URL must identify the combination entry route.');
assert.match(catalogSource, /[?&]id=/, 'Launch fallback URL must include a shareable id parameter.');
assert.match(catalogSource, /recommendationId/, 'Launch fallback must receive the current recommendation id.');
assert.doesNotMatch(catalogSource, /getCurrentRecommendationIdFromUrl/, 'Launch helper must not read recommendation ids from the home URL.');
assert.doesNotMatch(catalogSource, /searchParams\.get\('recommendation_id'\)/, 'Launch helper must not use recommendation_id URL fallback.');
assert.doesNotMatch(catalogSource, /writeLaunchHub|document\.write/, 'Launch fallback must not create a static about:blank hub page.');
assert.doesNotMatch(catalogSource, /createRecommendationSnapshot/, 'Launch helper must not create ids on click; ids come from the chat stream.');
assert.doesNotMatch(
  catalogSource,
  /window\.location\.(?:href\s*=|assign\s*\(|replace\s*\()/,
  'Launch helper must not navigate the current page; recommendation entry must open in a separate page.',
);

const combinationEntryBranchIndex = catalogSource.indexOf('if (combinationEntryUrl)');
const individualTabBranchIndex = catalogSource.indexOf('const openedTabs');
assert.ok(
  combinationEntryBranchIndex >= 0 && combinationEntryBranchIndex < individualTabBranchIndex,
  'When a recommendation id exists, launch helper must open the combination entry before any individual GPT tabs.',
);

const heroHallSource = fs.readFileSync(heroHallPath, 'utf8');
assert.match(heroHallSource, /recommendationId/, 'Hero Hall open recommendation action must pass the recommendation id.');
assert.match(heroHallSource, /getAgentCombinationEntryUrl/, 'Hero Hall must build the recommendation entry URL from the id.');
assert.match(heroHallSource, /target="_blank"/, 'Hero Hall must open the recommendation entry in a separate tab.');
assert.match(heroHallSource, /href=\{combinationEntryUrl\}/, 'Hero Hall must use the generated recommendation entry URL.');
assert.doesNotMatch(heroHallSource, /openAgentLaunchTargets/, 'Hero Hall must not route recommendation entry through the multi-agent launcher.');

const workflowDockSource = fs.readFileSync(workflowDockPath, 'utf8');
assert.match(workflowDockSource, /recommendationId/, 'Workflow Dock open combination action must pass the recommendation id.');
assert.match(workflowDockSource, /getAgentCombinationEntryUrl/, 'Workflow Dock must build the recommendation entry URL from the id.');
assert.match(workflowDockSource, /target="_blank"/, 'Workflow Dock must open the recommendation entry in a separate tab.');
assert.match(workflowDockSource, /href=\{combinationEntryUrl\}/, 'Workflow Dock must use the generated recommendation entry URL.');
assert.doesNotMatch(workflowDockSource, /openAgentLaunchTargets/, 'Workflow Dock must not route recommendation entry through the multi-agent launcher.');

console.log('Agent combination entry verified.');
