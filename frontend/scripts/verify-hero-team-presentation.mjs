import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/features/heroHall/heroTeamPresentation.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
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

console.log('Hero team presentation uses streamed recommendation fields.');
