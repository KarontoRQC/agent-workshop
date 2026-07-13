import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createNodeApiSession, fetchWithNodeApiSession } from './api-session.mjs';

const apiBaseUrl = String(process.argv[2] || 'https://agent.xtznai.com/api').replace(/\/+$/, '');
const streamUrl = `${apiBaseUrl}/coze/chat/stream`;
const maxFirstContentMs = Number(process.env.MAX_FIRST_CONTENT_MS || 15000);
const apiSession = await createNodeApiSession(apiBaseUrl);

function createStreamResult(label) {
  return {
    agents: [],
    completed: false,
    content: {},
    contentOrder: [],
    conversationIds: {},
    durationMs: 0,
    errors: [],
    eventNames: [],
    firstContentMs: 0,
    graphResolved: false,
    headersMs: 0,
    label,
    recommendationId: '',
    recommendationEditToken: '',
    requestId: '',
    selectedRoute: '',
    status: 0,
  };
}

function applyEvent(result, event, startedAt) {
  const eventName = String(event?.event || '');
  result.eventNames.push(eventName);

  if (eventName === 'workflow.started') {
    result.recommendationId = String(event.recommendation_id || result.recommendationId);
    result.recommendationEditToken = String(event.recommendation_edit_token || result.recommendationEditToken);
  }

  if (eventName === 'conversation.updated') {
    result.conversationIds = {
      ...result.conversationIds,
      ...(event.conversation_ids && typeof event.conversation_ids === 'object' ? event.conversation_ids : {}),
    };
  }

  if (eventName === 'content.delta' && event.content) {
    const contentType = String(event.type || 'UNKNOWN');
    if (!result.firstContentMs) {
      result.firstContentMs = performance.now() - startedAt;
    }
    if (result.contentOrder.at(-1) !== contentType) {
      result.contentOrder.push(contentType);
    }
    result.content[contentType] = `${result.content[contentType] || ''}${String(event.content)}`;
  }

  if (eventName === 'graph.path.resolved') {
    result.graphResolved = true;
    result.selectedRoute = String(event.route || result.selectedRoute);
  }

  if (eventName === 'workflow.stage.completed' && event.stage === 'knowledge_graph') {
    result.selectedRoute = String(event.selected_route || event.route || result.selectedRoute);
  }

  if (eventName === 'recommended_agents.completed') {
    result.agents = Array.isArray(event.agents) ? event.agents : [];
  }

  if (eventName === 'workflow.completed' || eventName === 'chat.completed') {
    result.completed = true;
    result.recommendationId = String(event.recommendation_id || result.recommendationId);
    result.conversationIds = {
      ...result.conversationIds,
      ...(event.conversation_ids && typeof event.conversation_ids === 'object' ? event.conversation_ids : {}),
    };
  }

  if (eventName === 'workflow.error' || eventName === 'workflow.failed') {
    result.errors.push(String(event.error || event.detail || eventName));
  }
}

async function consumeStream(label, payload) {
  const result = createStreamResult(label);
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${label} timed out`)), 180000);

  try {
    const response = await fetchWithNodeApiSession(apiSession, streamUrl, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });
    result.headersMs = performance.now() - startedAt;
    result.requestId = response.headers.get('x-request-id') || '';
    result.status = response.status;
    assert.equal(response.status, 200, `${label} returned HTTP ${response.status}`);
    assert.ok(response.body, `${label} returned no streaming body`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, ''))
          .join('\n');
        if (!data || data === '[DONE]') {
          continue;
        }
        applyEvent(result, JSON.parse(data), startedAt);
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) {
      const data = tail
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, ''))
        .join('\n');
      if (data && data !== '[DONE]') {
        applyEvent(result, JSON.parse(data), startedAt);
      }
    }
  } finally {
    clearTimeout(timeout);
    result.durationMs = performance.now() - startedAt;
  }

  return result;
}

function assertBaseContract(result) {
  assert.equal(result.status, 200);
  assert.equal(result.errors.length, 0, `${result.label} emitted workflow errors`);
  assert.ok(result.completed, `${result.label} did not emit a completion event`);
  assert.ok(result.content.THINKING_PROCESS?.trim(), `${result.label} missed THINKING_PROCESS`);
  assert.ok(result.content.ACK?.trim(), `${result.label} missed ACK`);
  assert.deepEqual(result.contentOrder.slice(0, 2), ['THINKING_PROCESS', 'ACK']);
  assert.ok(result.firstContentMs > 0, `${result.label} did not stream visible content`);
  assert.ok(
    result.firstContentMs <= maxFirstContentMs,
    `${result.label} first content took ${Math.round(result.firstContentMs)}ms`,
  );
  const combined = Object.values(result.content).join('\n');
  assert.doesNotMatch(combined, /<\/?(?:THINKING_PROCESS|ACK|KG_PATH|RECOMMENDED_AGENTS)>/);
  assert.doesNotMatch(combined, /当前状态为空|按\s*[ABC]\s*模式|内部模式提示|本轮属于/);
}

function assertBusinessContract(result, expectedSignals = []) {
  assertBaseContract(result);
  assert.ok(result.content.KG_PATH?.trim(), `${result.label} missed KG_PATH`);
  assert.ok(result.graphResolved, `${result.label} missed graph.path.resolved`);
  assert.ok(result.selectedRoute, `${result.label} returned an empty knowledge route`);
  assert.ok(result.recommendationId, `${result.label} returned no recommendation_id`);
  assert.ok(result.recommendationEditToken, `${result.label} returned no recommendation edit capability`);
  assert.equal(result.agents.length, 5, `${result.label} must return a complete five-agent lineup`);

  const agentNames = result.agents.map((agent) => String(agent.agent_name || agent.name || '').trim());
  assert.equal(new Set(agentNames).size, agentNames.length, `${result.label} returned duplicate agents`);

  for (const agent of result.agents) {
    assert.ok(String(agent.agent_name || agent.name || '').trim(), `${result.label} agent missed its name`);
    assert.ok(String(agent.stage || '').trim(), `${result.label} agent missed its stage`);
    assert.ok(String(agent.reason || '').trim(), `${result.label} agent missed its reason`);
  }

  if (expectedSignals.length > 0) {
    const combined = `${result.selectedRoute}\n${Object.values(result.content).join('\n')}`;
    assert.ok(
      expectedSignals.some((signal) => combined.includes(signal)),
      `${result.label} lost its scenario intent; expected one of ${expectedSignals.join(', ')}`,
    );
  }
}

function logScenarioDiagnostic(result) {
  process.stderr.write(
    `[agent-regression] ${JSON.stringify({
      ack: String(result.content.ACK || '').replace(/\s+/g, ' ').slice(0, 240),
      agents: result.agents.map((agent) => String(agent.agent_name || agent.name || '').trim()),
      conversationKeys: Object.keys(result.conversationIds),
      label: result.label,
      recommendationId: result.recommendationId,
      route: result.selectedRoute,
    })}\n`,
  );
}

const greeting = await consumeStream('greeting', { message: '你好啊' });
assertBaseContract(greeting);
assert.equal(greeting.agents.length, 0, 'Greeting must not fabricate a recommended lineup');
assert.doesNotMatch(
  Object.values(greeting.content).join('\n'),
  /已接入，正在解析需求并校准知识星图/,
  'Greeting must not return the removed fixed service ACK',
);

const business = await consumeStream('business-route', {
  message: '我经营一个白酒品牌，需要提升招商线索跟进效率和最终成交转化，请给出知识路径并推荐可执行的智能体组合。',
});
logScenarioDiagnostic(business);
assertBusinessContract(business, ['白酒', '招商', '成交', '线索']);

const scenarioDefinitions = [
  {
    expectedSignals: ['短视频', '内容', '私域', '复购', '餐饮'],
    label: 'scenario-short-video-private-domain',
    message: '现在切换到完全不同的场景：我经营本地餐饮连锁，需要从短视频内容获客、到店承接到私域复购，重新生成知识路径和五个智能体组合，不要沿用白酒招商路径。',
  },
  {
    expectedSignals: ['沉睡', '唤醒', '私域', '触达', '复购'],
    label: 'scenario-dormant-customer-reactivation',
    message: '再切换场景：现有三万名私域客户半年未购买，需要规划沉睡客户分层、个性化触达、活动唤醒和复购追踪路径，并重新推荐五个智能体。',
  },
  {
    expectedSignals: ['课程', '报名', '课堂', '课后', '转化'],
    label: 'scenario-classroom-conversion',
    message: '继续切换场景：我要举办千人大课，需要从预热报名、到课提醒、课堂互动到课后成交跟进的完整路径，并生成新的五智能体阵容。',
  },
];
const scenarioResults = [];
let previousScenario = business;

for (const definition of scenarioDefinitions) {
  const scenario = await consumeStream(definition.label, {
    conversation_ids: previousScenario.conversationIds,
    message: definition.message,
    user_state: {
      knowledge_path: previousScenario.selectedRoute,
      recommended_agents: previousScenario.agents,
    },
  });
  logScenarioDiagnostic(scenario);
  assertBusinessContract(scenario, definition.expectedSignals);
  assert.notEqual(scenario.selectedRoute, previousScenario.selectedRoute, `${definition.label} reused the previous scenario route`);
  assert.notEqual(scenario.recommendationId, previousScenario.recommendationId, `${definition.label} reused the previous recommendation ID`);

  for (const conversationKey of Object.keys(previousScenario.conversationIds)) {
    assert.ok(scenario.conversationIds[conversationKey], `${definition.label} dropped conversation ${conversationKey}`);
  }
  if (previousScenario.conversationIds.route_planner) {
    assert.notEqual(
      scenario.conversationIds.route_planner,
      previousScenario.conversationIds.route_planner,
      `${definition.label} reused the previous route-planner conversation after an explicit scenario switch`,
    );
  }

  scenarioResults.push(scenario);
  previousScenario = scenario;
}

assert.equal(
  new Set([business, ...scenarioResults].map((result) => result.recommendationId)).size,
  1 + scenarioResults.length,
  'Distinct classroom scenarios must create distinct recommendation snapshots',
);

const longKnowledgePath = [
  business.selectedRoute,
  ...Array.from({ length: 18 }, (_, index) => `历史压缩节点${index + 1}`),
].join('-');
const longStateAgents = business.agents.map((agent, index) => ({
  ...agent,
  reason: `${String(agent.reason || '')}${`；历史背景${index + 1}`.repeat(120)}`,
}));
const followUp = await consumeStream('long-context-lineup-update', {
  message: '只刷新增长阵容里的智能体，保持当前知识路径不变，不要执行其他任务。',
  requested_lineup: 'growth',
  user_state: {
    knowledge_path: longKnowledgePath,
    recommended_agents: longStateAgents,
  },
});
assertBaseContract(followUp);
assert.equal(followUp.selectedRoute, longKnowledgePath, 'Long-context follow-up changed the protected knowledge path');
assert.ok(followUp.agents.length > 0, 'Long-context follow-up returned no agents');
assert.ok(
  followUp.agents.every((agent) => agent.lineup === 'growth'),
  'Long-context follow-up did not enforce the requested growth lineup',
);

const unauthorizedResponse = await fetch(streamUrl, {
  body: JSON.stringify({ message: 'unauthorized' }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
assert.equal(unauthorizedResponse.status, 401, 'Anonymous chat must return HTTP 401');

const oversizedResponse = await fetchWithNodeApiSession(apiSession, streamUrl, {
  body: JSON.stringify({ message: '测'.repeat(8001) }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
assert.equal(oversizedResponse.status, 413, 'Oversized chat input must return HTTP 413');

const echoResponse = await fetch(`${apiBaseUrl}/echo`, {
  body: JSON.stringify({ message: 'audit' }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
assert.equal(echoResponse.status, 404, 'Production echo endpoint must be disabled');

const auditLineup = business.agents.slice(0, 5).map((agent, index) => ({
  ...agent,
  agent_name: String(agent.agent_name || agent.name || ''),
  name: String(agent.agent_name || agent.name || ''),
  rank: index + 1,
}));
const lineupUrl = `${apiBaseUrl}/recommendations/${business.recommendationId}/lineup`;
const readOnlySaveResponse = await fetchWithNodeApiSession(apiSession, lineupUrl, {
  body: JSON.stringify({ lineup: auditLineup, score: { audit: true, total: 80 } }),
  headers: { 'content-type': 'application/json' },
  method: 'PUT',
});
assert.equal(readOnlySaveResponse.status, 403, 'A session without the recommendation token must be read-only');
const ownerSaveResponse = await fetchWithNodeApiSession(
  apiSession,
  lineupUrl,
  {
    body: JSON.stringify({ lineup: auditLineup, score: { audit: true, total: 80 } }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  },
  business.recommendationEditToken,
);
assert.equal(ownerSaveResponse.status, 200, 'Recommendation owner token could not save the lineup');

const combinationSaveResponse = await fetchWithNodeApiSession(
  apiSession,
  `${apiBaseUrl}/combination-agents/by-recommendation/${business.recommendationId}`,
  {
    body: JSON.stringify({ lineup: auditLineup, score: { audit: true, total: 80 }, title: '回归测试组合' }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  },
  business.recommendationEditToken,
);
assert.equal(combinationSaveResponse.status, 200, 'Recommendation owner token could not save the combination');

const catalogResponse = await fetch(`${apiBaseUrl}/agents`);
const catalogPayload = await catalogResponse.json();
const catalogAgents = Array.isArray(catalogPayload?.agents) ? catalogPayload.agents : [];
assert.equal(catalogResponse.status, 200);
assert.match(catalogResponse.headers.get('cache-control') || '', /max-age=300/);
assert.ok(catalogAgents.length > 0, 'Agent catalog is empty');
assert.ok(
  catalogAgents.filter((agent) => !String(agent.launch_url || '').trim()).every((agent) => agent.type === '项目'),
  'A non-project catalog entry is missing its launch URL',
);
const launchGroups = new Map();
catalogAgents.forEach((agent) => {
  const launchUrl = String(agent.launch_url || '').trim();
  if (launchUrl) {
    launchGroups.set(launchUrl, [...(launchGroups.get(launchUrl) || []), agent]);
  }
});
assert.ok(
  [...launchGroups.values()]
    .filter((agents) => agents.length > 1)
    .every((agents) => agents.some((agent) => String(agent.type || '').includes('别名'))),
  'A duplicate catalog launch URL is not declared as an alias',
);

const anonymousTtsResponse = await fetch(`${apiBaseUrl}/tts/speech`, {
  body: JSON.stringify({ text: 'anonymous' }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
assert.equal(anonymousTtsResponse.status, 401, 'Anonymous TTS must return HTTP 401');
const ttsResponse = await fetchWithNodeApiSession(apiSession, `${apiBaseUrl}/tts/speech`, {
  body: JSON.stringify({ mood: 'neutral', text: '智能体课堂回归测试完成。' }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
const ttsBytes = (await ttsResponse.arrayBuffer()).byteLength;
assert.equal(ttsResponse.status, 200, 'Authenticated TTS request failed');
assert.match(ttsResponse.headers.get('content-type') || '', /^audio\//i);
assert.ok(ttsBytes > 1000, `TTS response was unexpectedly small: ${ttsBytes} bytes`);

const invalidStartedAt = performance.now();
const invalidResponse = await fetchWithNodeApiSession(apiSession, streamUrl, {
  body: JSON.stringify({ message: '' }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
});
const invalidDurationMs = performance.now() - invalidStartedAt;
assert.equal(invalidResponse.status, 400, 'Empty input must return HTTP 400');

const summarize = (result) => ({
  agentCount: result.agents.length,
  completed: result.completed,
  contentOrder: result.contentOrder,
  durationMs: Math.round(result.durationMs),
  firstContentMs: Math.round(result.firstContentMs),
  headersMs: Math.round(result.headersMs),
  label: result.label,
  recommendationId: result.recommendationId,
  requestId: result.requestId,
  route: result.selectedRoute,
});

const report = {
  apiBaseUrl,
  generatedAt: new Date().toISOString(),
  invalidInput: { durationMs: Math.round(invalidDurationMs), status: invalidResponse.status },
  results: [summarize(greeting), summarize(business), ...scenarioResults.map(summarize), summarize(followUp)],
  securityContract: {
    anonymousChatStatus: unauthorizedResponse.status,
    anonymousTtsStatus: anonymousTtsResponse.status,
    catalogAgentCount: catalogAgents.length,
    combinationSaveStatus: combinationSaveResponse.status,
    echoStatus: echoResponse.status,
    oversizedChatStatus: oversizedResponse.status,
    ownerSaveStatus: ownerSaveResponse.status,
    readOnlySaveStatus: readOnlySaveResponse.status,
    ttsBytes,
    ttsStatus: ttsResponse.status,
  },
};
const output = `${JSON.stringify(report, null, 2)}\n`;
const outputFile = process.env.AGENT_REPORT_OUTPUT || process.env.AGENT_API_REGRESSION_OUTPUT || '';
const outputPath = outputFile ? path.resolve(outputFile) : '';

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

process.stdout.write(output);
