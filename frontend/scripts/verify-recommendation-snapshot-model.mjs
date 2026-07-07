import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const sourcePath = path.resolve('src/features/workflow/recommendationSnapshotModel.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.outputText).toString('base64')}`;
const {
  getAgentCombinationEntryIdFromUrl,
  shouldPollRecommendationSnapshot,
  snapshotToRecommendedAgents,
} = await import(moduleUrl);

assert.equal(getAgentCombinationEntryIdFromUrl('http://127.0.0.1:5188/?agent_combination=1&id=rec_combo123'), 'rec_combo123');
assert.equal(
  getAgentCombinationEntryIdFromUrl('http://127.0.0.1:5188/?agent_combination=1&recommendation_id=rec_legacy'),
  '',
);
assert.equal(getAgentCombinationEntryIdFromUrl('http://127.0.0.1:5188/?id=not_entry'), '');
assert.equal(getAgentCombinationEntryIdFromUrl('not a url'), '');
assert.equal(shouldPollRecommendationSnapshot({ status: 'streaming' }), true);
assert.equal(shouldPollRecommendationSnapshot({ status: 'completed' }), false);
assert.equal(shouldPollRecommendationSnapshot({ status: 'failed' }), false);

const agents = snapshotToRecommendedAgents({
  agents: [{ agent_index: 0, agent_name: 'Planner', stage: 'Planning' }],
  conversation_ids: {},
  created_at: '',
  error: '',
  graph_path: null,
  id: 'rec_abc123',
  message: 'message',
  status: 'completed',
  summary: '',
  updated_at: '',
});

assert.deepEqual(agents, [
  { agent_index: 0, agent_name: 'Planner', stage: 'Planning', streamStatus: 'completed' },
]);

const streamingAgents = snapshotToRecommendedAgents({
  agents: [
    { agent_index: 0, agent_name: 'Planner' },
    { agent_index: 1, agent_name: 'Writer', streamStatus: 'completed' },
  ],
  conversation_ids: {},
  created_at: '',
  error: '',
  graph_path: null,
  id: 'rec_streaming',
  message: 'message',
  status: 'streaming',
  summary: '',
  updated_at: '',
});

assert.deepEqual(streamingAgents, [
  { agent_index: 0, agent_name: 'Planner', streamStatus: 'streaming' },
  { agent_index: 1, agent_name: 'Writer', streamStatus: 'completed' },
]);

console.log('Recommendation snapshot model verified.');
