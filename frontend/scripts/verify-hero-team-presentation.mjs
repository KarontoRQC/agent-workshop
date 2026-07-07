import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/features/heroHall/heroTeamPresentation.ts');
const heroHallPath = path.resolve('src/features/heroHall/AgentHeroHall.tsx');
const carouselPath = path.resolve('src/features/heroHall/HeroTeamCarousel.tsx');
const carouselCssPath = path.resolve('src/features/heroHall/HeroTeamCarousel.css');
const source = fs.readFileSync(sourcePath, 'utf8');
const heroHallSource = fs.readFileSync(heroHallPath, 'utf8');
const carouselSource = fs.readFileSync(carouselPath, 'utf8');
const carouselCssSource = fs.readFileSync(carouselCssPath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputText).toString('base64')}`;
const { getHeroTeamPresentation } = await import(moduleUrl);

const completedPresentation = getHeroTeamPresentation(
  {
    agent: {
      agent_index: 0,
      agent_name: '销售之神',
      lineup: 'conversion',
      rank: 1,
      reason: '直接提升销售人员的成单转化能力，解决临门一脚的犹豫。',
      stage: '异议处理与临门促单',
    },
    enrichedAgent: {
      fallbackReason: '目录里的兜底介绍不应该覆盖真实推荐理由',
      stageLabel: '目录阶段不应该覆盖真实推荐阶段',
    },
    key: 'agent-0',
    name: '销售之神',
  },
  0,
);

assert.equal(completedPresentation.stage, '异议处理与临门促单');
assert.equal(completedPresentation.reason, '直接提升销售人员的成单转化能力，解决临门一脚的犹豫。');
assert.equal(completedPresentation.rankLabel, '01');
assert.equal(completedPresentation.metricLabel, '推荐序位');
assert.equal(completedPresentation.lineupLabel, '成交阵容');

const streamingPresentation = getHeroTeamPresentation(
  {
    agent: {
      agent_index: 2,
      agent_name: '销售之神',
    },
    enrichedAgent: {
      fallbackReason: '目录里的兜底介绍不应该提前显示',
      stageLabel: '目录阶段不应该提前显示',
    },
    key: 'agent-2',
    name: '销售之神',
  },
  2,
);

assert.equal(streamingPresentation.stage, '推荐生成中');
assert.equal(streamingPresentation.reason, '推荐理由生成中');
assert.equal(streamingPresentation.rankLabel, '03');
assert.equal(streamingPresentation.dotCount, 3);

assert.match(
  heroHallSource,
  /const recommendedAgentByKey = useMemo\(\(\) => new Map\(recommendedHeroAgents\.map/,
  'Hero Hall carousel must build its replacement lookup from recommended agents only.',
);
assert.match(
  heroHallSource,
  /recommendedHeroAgents\.map\(\(agent, index\) => recommendedAgentByKey\.get\(recommendationOverrides\[index\]\) \|\| agent\)/,
  'Hero Hall carousel cards must render from the current recommended-agent list.',
);
assert.match(
  heroHallSource,
  /if \(!recommendedAgentByKey\.has\(agentKey\)\) {\s+void appendHeroToRecommendation\(agentKey\);\s+return;\s+}/,
  'Hero Hall carousel must append catalog-only hero pool cards into the recommendation source instead of locally replacing recommended-agent cards.',
);
assert.doesNotMatch(
  carouselSource,
  /getCarouselPosition|is-hidden|is-far-left|is-far-right|is-left|is-right/,
  'Hero Team carousel must not hide recommended agents behind a three-card coverflow position model.',
);
assert.match(
  carouselSource,
  /hero-team-carousel-track is-all-visible/,
  'Hero Team carousel must render the full recommended-agent strip.',
);
assert.match(
  carouselCssSource,
  /hero-team-carousel-track\.is-all-visible[\s\S]*display: flex/,
  'Hero Team carousel CSS must lay out all recommended cards in a visible row.',
);
assert.match(
  carouselCssSource,
  /hero-team-card\.is-all-visible-card[\s\S]*opacity: 0\.9/,
  'Hero Team card CSS must keep non-focused recommended cards visible.',
);

console.log('Hero team presentation uses streamed recommendation fields and recommended-agent card sources.');
