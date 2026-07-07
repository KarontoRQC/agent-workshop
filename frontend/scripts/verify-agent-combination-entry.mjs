import assert from 'node:assert/strict';
import fs from 'node:fs';

const entryPath = 'src/features/heroHall/AgentCombinationEntryPage.tsx';
const entrySectionsPath = 'src/features/heroHall/AgentCombinationEntrySections.tsx';
const entryModelPath = 'src/features/heroHall/agentCombinationEntryModel.ts';
const entryStylePath = 'src/features/heroHall/AgentCombinationEntryPage.css';
const appPath = 'src/App.tsx';
const catalogPath = 'src/lib/agentLaunchCatalog.ts';
const heroHallPath = 'src/features/heroHall/AgentHeroHall.tsx';
const workflowDockPath = 'src/features/workflow/WorkflowDock.tsx';

assert.ok(fs.existsSync(entryPath), 'Agent combination entry page component must exist.');
assert.ok(fs.existsSync(entrySectionsPath), 'Agent combination entry sections module must exist.');
assert.ok(fs.existsSync(entryModelPath), 'Agent combination entry model module must exist.');
assert.ok(fs.existsSync(entryStylePath), 'Agent combination entry stylesheet must exist.');

const entrySource = fs.readFileSync(entryPath, 'utf8');
const entrySectionsSource = fs.readFileSync(entrySectionsPath, 'utf8');
const entryModelSource = fs.readFileSync(entryModelPath, 'utf8');
const entryStyleSource = fs.readFileSync(entryStylePath, 'utf8');
const entryModuleSource = [entrySource, entrySectionsSource, entryModelSource].join('\n');
const forbiddenBackupLabel = ['后备', '智能体'].join('');
const forbiddenOptionalHeroStat = ['位可选', '英雄'].join('');
const forbiddenEntryIdLabel = ['殿堂', '编号'].join('');
const forbiddenOpenAllLabel = ['打开全部', '智能体'].join('');
assert.match(entrySource, /fetchRecommendationSnapshot/, 'Entry page must fetch recommendation snapshot by id.');
assert.match(entrySource, /snapshotToRecommendedAgents/, 'Entry page must map snapshot agents through snapshot model.');
assert.match(entryModuleSource, /entry_title/, 'Entry page must render the dynamic entry title from the recommendation snapshot.');
assert.match(entrySource, /getEntryTitle/, 'Entry page must keep a fallback for snapshots without a generated entry title.');
assert.match(entrySource, /visibleCatalogAgents/, 'Entry page must keep the catalog hero pool visible below the recommended lineup.');
assert.match(entrySource, /更多智能体/, 'Entry page must keep the lower catalog hero section.');
assert.match(entrySource, /getAgentLaunchTargets/, 'Entry page must derive launch targets from the current recommended agents.');
assert.match(entrySource, /openAgentLaunchTargets/, 'Entry page must reuse the shared multi-agent launcher for recommended agents.');
assert.match(entryModuleSource, /AgentLineupBuilder/, 'Entry page must render the editable combination lineup builder.');
assert.match(entryModuleSource, /calculateAgentLineupScore/, 'Entry page must derive a live combination score table.');
assert.match(entryModuleSource, /AGENT_LINEUP_SLOT_COUNT/, 'Entry page must keep a fixed lineup slot contract.');
assert.match(entryModuleSource, /agent-combination-entry-frame/, 'Entry page content must scroll inside a clipped hero-hall frame.');
assert.match(entryModuleSource, /agent-combination-open-recommended/, 'Entry page must render a one-click button below the recommended section.');
assert.match(entryModuleSource, /一键打开推荐智能体/, 'Recommended section batch button must use the expected label.');
assert.match(entryModuleSource, /agent-combination-lineup-open/, 'Lineup builder must render a one-click button for the composed lineup.');
assert.match(entryModuleSource, /一键打开阵容/, 'Lineup batch button must use the expected label.');
assert.match(entryStyleSource, /agent-combination-entry-hero/, 'Entry page visual shell must live in its colocated stylesheet.');
assert.match(entryStyleSource, /agent-combination-lineup-builder/, 'Entry page must style the combination lineup builder in the colocated stylesheet.');
assert.match(entryStyleSource, /agent-combination-candidate-copy/, 'Optional lineup agent cards must keep readable name and stage copy.');
assert.match(entryStyleSource, /hero-hall-bg\.webp/, 'Entry page must keep the hero hall palace background asset.');
assert.doesNotMatch(entrySource, /entryPageCss|<style>/, 'Entry page must keep visual CSS out of the TSX module.');
assert.doesNotMatch(entryModuleSource, new RegExp(forbiddenBackupLabel), 'Entry page must not use backup-agent wording in the hall.');
assert.doesNotMatch(entryModuleSource, new RegExp(forbiddenOptionalHeroStat), 'Entry page must not show an optional-hero count in the hero stats.');
assert.doesNotMatch(entryModuleSource, new RegExp(`${forbiddenEntryIdLabel}|${forbiddenOpenAllLabel}`), 'Entry page hero must not show the id badge or open-all action.');
assert.doesNotMatch(entryModuleSource, /openAllTargets|agent-combination-entry-kicker|agent-combination-hero-actions/, 'Entry page must remove old top-hero open-all/id-badge implementation leftovers.');

const appSource = fs.readFileSync(appPath, 'utf8');
assert.match(appSource, /AgentCombinationEntryPage/, 'App must render the entry page for agent_combination URLs.');
assert.match(appSource, /getAgentCombinationEntryIdFromUrl/, 'App must parse id for agent_combination entry URLs.');
assert.match(appSource, /getAgentCombinationEntryUrl/, 'Main chat must build the matching combination entry URL after a completed recommendation reply.');
assert.match(appSource, /setAgentCatalogVersion/, 'Main chat must re-render after the agent catalog cache is populated.');
assert.match(appSource, /setAgentCatalogAgents\(agents\);\s*setAgentCatalogVersion\(\(version\) => version \+ 1\);/s, 'Main chat must refresh visible recommendation cards after catalog avatars load.');
assert.match(appSource, /scheduleHeroHallJump/, 'Main chat must schedule an automatic jump into the generated hero hall.');
assert.match(appSource, /window\.open\(getAgentCombinationEntryUrl\(id\), '_blank', 'noopener,noreferrer'\)/, 'Main chat must open the matching hero hall entry in a new page.');
assert.doesNotMatch(appSource, /window\.location\.assign\(getAgentCombinationEntryUrl\(id\)\)/, 'Main chat must not replace the homepage when opening the hero hall entry.');
assert.doesNotMatch(appSource, /<AgentHeroHall/, 'Main page must not render the legacy Hero Hall popup.');
assert.doesNotMatch(appSource, /setHeroHallOpen\(true\)/, 'Main page must not auto-open the legacy Hero Hall popup.');
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
assert.match(catalogSource, /LEGACY_AGENT_AVATAR_PATTERN/, 'Catalog enrichment must detect legacy API avatar URLs.');
assert.match(catalogSource, /isLegacyAgentAvatarUrl\(directAvatar\)/, 'Catalog enrichment must prefer static catalog avatars over legacy API avatar URLs.');
assert.match(catalogSource, /IMAGE_FILE_EXTENSION_PATTERN/, 'Catalog enrichment must only treat image-like URLs as avatar sources.');
assert.match(catalogSource, /STATIC_AGENT_AVATAR_PATTERN/, 'Catalog enrichment must always allow static agent avatar URLs.');
assert.match(catalogSource, /pathWithoutQuery/, 'Catalog enrichment must ignore query strings when checking image URL extensions.');
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
assert.match(workflowDockSource, /打开你的殿堂/, 'Workflow Dock hall action must be labeled as opening the user hall.');
assert.doesNotMatch(workflowDockSource, /onOpenHeroHall/, 'Workflow Dock hall action must not open the legacy Hero Hall popup.');
assert.doesNotMatch(workflowDockSource, /openAgentLaunchTargets/, 'Workflow Dock must not route recommendation entry through the multi-agent launcher.');

console.log('Agent combination entry verified.');
