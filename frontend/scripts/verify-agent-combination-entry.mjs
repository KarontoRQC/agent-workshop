import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const entryPath = 'src/features/heroHall/AgentCombinationEntryPage.tsx';
const entrySectionsPath = 'src/features/heroHall/AgentCombinationEntrySections.tsx';
const entryModelPath = 'src/features/heroHall/agentCombinationEntryModel.ts';
const entryStylePath = 'src/features/heroHall/AgentCombinationEntryPage.css';
const pendingPath = 'src/features/heroHall/AgentCombinationPendingPage.tsx';
const pendingStylePath = 'src/features/heroHall/AgentCombinationPendingPage.css';
const reservationPath = 'src/features/heroHall/heroHallLaunchReservation.ts';
const launchIntentPath = 'src/features/heroHall/heroHallLaunchIntent.ts';
const sharePath = 'src/features/heroHall/AgentCombinationShare.tsx';
const shareStylePath = 'src/features/heroHall/AgentCombinationShare.css';
const appPath = 'src/App.tsx';
const catalogPath = 'src/lib/agentLaunchCatalog.ts';
const heroHallPath = 'src/features/heroHall/AgentHeroHall.tsx';
const workflowDockPath = 'src/features/workflow/WorkflowDock.tsx';

assert.ok(fs.existsSync(entryPath), 'Agent combination entry page component must exist.');
assert.ok(fs.existsSync(entrySectionsPath), 'Agent combination entry sections module must exist.');
assert.ok(fs.existsSync(entryModelPath), 'Agent combination entry model module must exist.');
assert.ok(fs.existsSync(entryStylePath), 'Agent combination entry stylesheet must exist.');
assert.ok(fs.existsSync(pendingPath), 'Intent-gated Hero Hall pending page must exist.');
assert.ok(fs.existsSync(pendingStylePath), 'Hero Hall pending page stylesheet must exist.');
assert.ok(fs.existsSync(reservationPath), 'Hero Hall launch reservation module must exist.');
assert.ok(fs.existsSync(launchIntentPath), 'Hero Hall launch intent classifier must exist.');
assert.ok(fs.existsSync(sharePath), 'Agent combination share component must exist.');
assert.ok(fs.existsSync(shareStylePath), 'Agent combination share stylesheet must exist.');

const entrySource = fs.readFileSync(entryPath, 'utf8');
const entrySectionsSource = fs.readFileSync(entrySectionsPath, 'utf8');
const entryModelSource = fs.readFileSync(entryModelPath, 'utf8');
const entryStyleSource = fs.readFileSync(entryStylePath, 'utf8');
const pendingSource = fs.readFileSync(pendingPath, 'utf8');
const pendingStyleSource = fs.readFileSync(pendingStylePath, 'utf8');
const reservationSource = fs.readFileSync(reservationPath, 'utf8');
const launchIntentSource = fs.readFileSync(launchIntentPath, 'utf8');
const shareSource = fs.readFileSync(sharePath, 'utf8');
const shareStyleSource = fs.readFileSync(shareStylePath, 'utf8');
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
assert.match(entrySource, /getAgentCombinationEntryUrl/, 'Entry page must build a canonical share URL from the recommendation id.');
assert.match(entrySource, /AgentCombinationShare/, 'Entry page hero must render the modular share control.');
assert.match(entrySectionsSource, /shareControl/, 'Entry hero must expose a top-title share control slot.');
assert.match(shareSource, /QRCodeCanvas/, 'Share dialog must render a local QR code without a remote image service.');
assert.match(shareSource, /navigator\.clipboard/, 'Share dialog must support copying the hall URL.');
assert.match(shareSource, /canvas\.toDataURL\('image\/png'\)/, 'Share dialog must export the QR code as a PNG.');
assert.match(shareSource, /download=\{getQrFileName\(recommendationId\)\}/, 'Share dialog must expose a native QR image download link.');
assert.match(shareSource, /createPortal/, 'Share dialog must render above the clipped hall frame.');
assert.match(shareStyleSource, /agent-combination-share-backdrop/, 'Share dialog styling must remain in its colocated stylesheet.');
assert.match(shareStyleSource, /@media \(max-width: 520px\)/, 'Share dialog must keep a mobile layout.');
assert.doesNotMatch(entrySource, /entryPageCss|<style>/, 'Entry page must keep visual CSS out of the TSX module.');
assert.doesNotMatch(entryModuleSource, new RegExp(forbiddenBackupLabel), 'Entry page must not use backup-agent wording in the hall.');
assert.doesNotMatch(entryModuleSource, new RegExp(forbiddenOptionalHeroStat), 'Entry page must not show an optional-hero count in the hero stats.');
assert.doesNotMatch(entryModuleSource, new RegExp(`${forbiddenEntryIdLabel}|${forbiddenOpenAllLabel}`), 'Entry page hero must not show the id badge or open-all action.');
assert.doesNotMatch(entryModuleSource, /openAllTargets|agent-combination-entry-kicker|agent-combination-hero-actions/, 'Entry page must remove old top-hero open-all/id-badge implementation leftovers.');

const appSource = fs.readFileSync(appPath, 'utf8');
assert.match(appSource, /AgentCombinationEntryPage/, 'App must render the entry page for agent_combination URLs.');
assert.match(appSource, /getAgentCombinationEntryIdFromUrl/, 'App must parse id for agent_combination entry URLs.');
assert.match(appSource, /openAgentCombinationEntryPage/, 'Main chat must open the hero hall after a completed recommendation reply.');
assert.match(appSource, /shouldReserveHeroHallLaunch\(text\)/, 'Main chat must pre-authorize a new page only after intent classification.');
assert.match(appSource, /reserveHeroHallLaunch\(\)/, 'Recommendation-intent sends must reserve a real same-origin page during the user gesture.');
assert.match(appSource, /navigateHeroHallReservation\(reservation, id\)/, 'Completed recommendations must navigate the reserved page to the real id.');
assert.match(appSource, /releaseHeroHallReservation\(\)/, 'Pause, failure, and no-recommendation paths must release the reserved page.');
assert.match(appSource, /setAgentCatalogVersion/, 'Main chat must re-render after the agent catalog cache is populated.');
assert.match(appSource, /setAgentCatalogAgents\(agents\);\s*setAgentCatalogVersion\(\(version\) => version \+ 1\);/s, 'Main chat must refresh visible recommendation cards after catalog avatars load.');
assert.match(appSource, /scheduleHeroHallJump/, 'Main chat must schedule an automatic jump into the generated hero hall.');
assert.match(appSource, /heroHallSpeechSettled/, 'Main chat must keep the reserved Hero Hall pending until response speech settles.');
assert.match(appSource, /hasGeneratedRecommendedAgents\(agents\)/, 'Main chat must require generated recommendation agents before opening the hero hall.');
assert.match(appSource, /openAgentCombinationEntryPage\(id\)/, 'Main chat must open the matching hero hall entry only after validation.');
assert.match(pendingSource, /agent-combination-pending-page/, 'Reserved page must render a real same-origin pending state.');
assert.match(pendingStyleSource, /prefers-reduced-motion/, 'Pending state must respect reduced-motion preferences.');
assert.match(launchIntentSource, /EXPLICIT_HERO_HALL_TERMS/, 'Launch reservation must be gated by explicit recommendation intent.');
assert.match(launchIntentSource, /PLANNING_INTENT_TERMS/, 'Launch reservation must recognize concise business-planning requests.');
assert.match(launchIntentSource, /BUSINESS_CONTEXT_TERMS/, 'Launch reservation must keep business context separate from generic chatter.');
assert.match(reservationSource, /export \{ shouldReserveHeroHallLaunch \}/, 'Reservation module must expose the shared launch intent classifier.');
assert.match(reservationSource, /agent_combination=1&pending=1/, 'Reserved page must use a real same-origin pending URL.');
assert.doesNotMatch(reservationSource, /about:blank|document\.write/, 'Launch reservation must never create an about:blank shell.');
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
assert.match(catalogSource, /openAgentCombinationEntryPage/, 'Launch helper must expose a navigator for validated recommendation entry pages.');
assert.match(catalogSource, /openDetachedPage\(href\)/, 'Launch helper must open the real hero hall URL directly in a separate page.');
assert.doesNotMatch(catalogSource, /reserveAgentCombinationEntryPage|closeReservedAgentCombinationEntryPage|paintReservedAgentCombinationEntryPage/, 'Launch helper must not create or manage a placeholder hero hall page.');
assert.doesNotMatch(catalogSource, /英雄殿堂生成中|正在同步推荐智能体组合/, 'Launch helper must not render an about:blank loading shell.');
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

const launchIntentModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(launchIntentSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString('base64')}`
);
assert.equal(launchIntentModule.shouldReserveHeroHallLaunch('你好啊'), false, 'Greeting must not reserve a Hero Hall page.');
assert.equal(launchIntentModule.shouldReserveHeroHallLaunch('今天天气怎么样'), false, 'Generic chat must not reserve a Hero Hall page.');
assert.equal(
  launchIntentModule.shouldReserveHeroHallLaunch('白酒招商怎么提高线索跟进和成交转化？'),
  true,
  'Concise business planning must reserve the Hero Hall page during the send gesture.',
);
assert.equal(
  launchIntentModule.shouldReserveHeroHallLaunch('餐饮门店短视频获客方案'),
  true,
  'Business plan wording must reserve the Hero Hall page even without explicit agent wording.',
);
assert.equal(
  launchIntentModule.shouldReserveHeroHallLaunch('请推荐智能体组合'),
  true,
  'Explicit recommendation intent must reserve the Hero Hall page.',
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
