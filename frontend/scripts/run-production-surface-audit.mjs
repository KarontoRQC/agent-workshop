import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createNodeApiSession, fetchWithNodeApiSession, nodeApiHeaders } from './api-session.mjs';

const baseUrl = String(process.argv[2] || 'https://agent.xtznai.com').replace(/\/+$/, '');
const recommendationId = String(process.env.AUDIT_RECOMMENDATION_ID || '').trim();
const recommendationEditToken = String(process.env.AUDIT_RECOMMENDATION_EDIT_TOKEN || '').trim();
const outputPath = process.env.PRODUCTION_SURFACE_OUTPUT
  ? path.resolve(process.env.PRODUCTION_SURFACE_OUTPUT)
  : '';

const report = {
  baseUrl,
  checks: [],
  generatedAt: new Date().toISOString(),
  recommendationId,
  summaries: {},
};
const apiSession = await createNodeApiSession(baseUrl);

function round(value) {
  return Math.round(value * 10) / 10;
}

async function runCheck(name, check) {
  const startedAt = performance.now();

  try {
    const details = await check();
    report.checks.push({ details, durationMs: round(performance.now() - startedAt), name, status: 'passed' });
  } catch (error) {
    report.checks.push({
      durationMs: round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      name,
      status: 'failed',
    });
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${url} returned invalid JSON: ${text.slice(0, 160)}`);
    }
  }

  return { data, response, text };
}

function extractAssetUrls(html) {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value.startsWith('/assets/') || value.startsWith('/favicon.png'));
}

function assertSecurityHeaders(headers) {
  assert.match(headers.get('strict-transport-security') || '', /max-age=\d+/i, 'HSTS header is missing');
  assert.match(headers.get('content-security-policy') || '', /default-src\s+'self'/i, 'CSP header is missing');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.ok(headers.get('referrer-policy'), 'Referrer-Policy header is missing');
  assert.ok(headers.get('permissions-policy'), 'Permissions-Policy header is missing');
}

function applyStreamEvent(result, event, startedAt) {
  const eventName = String(event?.event || '');
  result.eventNames.push(eventName);

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

  if (eventName === 'recommended_agents.completed') {
    result.agents = Array.isArray(event.agents) ? event.agents : [];
  }

  if (eventName === 'workflow.completed' || eventName === 'chat.completed') {
    result.completed = true;
    result.recommendationId = String(event.recommendation_id || result.recommendationId);
  }

  if (eventName === 'workflow.error' || eventName === 'workflow.failed') {
    result.errors.push(String(event.error || event.detail || eventName));
  }
}

async function consumeChat(label, payload) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${label} timed out`)), 90000);
  const result = {
    agents: [],
    completed: false,
    content: {},
    contentOrder: [],
    durationMs: 0,
    errors: [],
    eventNames: [],
    firstContentMs: 0,
    headersMs: 0,
    label,
    recommendationId: '',
    requestId: '',
    status: 0,
  };

  try {
    const response = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/coze/chat/stream`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json', 'x-request-id': `extreme-${label}-${Date.now()}` },
      method: 'POST',
      signal: controller.signal,
    });
    result.headersMs = performance.now() - startedAt;
    result.requestId = response.headers.get('x-request-id') || '';
    result.status = response.status;
    assert.equal(response.status, 200, `${label} returned HTTP ${response.status}`);
    assert.match(response.headers.get('content-type') || '', /^text\/event-stream/i);
    assert.ok(response.body, `${label} returned no response body`);

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
        if (data && data !== '[DONE]') {
          applyStreamEvent(result, JSON.parse(data), startedAt);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    result.durationMs = performance.now() - startedAt;
  }

  return result;
}

function assertGreetingContract(result) {
  assert.equal(result.status, 200);
  assert.equal(result.errors.length, 0, `${result.label} emitted stream errors`);
  assert.ok(result.completed, `${result.label} missed completion`);
  assert.deepEqual(result.contentOrder.slice(0, 2), ['THINKING_PROCESS', 'ACK']);
  assert.ok(result.firstContentMs > 0 && result.firstContentMs <= 20000, `${result.label} first content was too slow`);
  assert.equal(result.agents.length, 0, `${result.label} fabricated recommended agents`);
  assert.doesNotMatch(Object.values(result.content).join('\n'), /<\/?(?:THINKING_PROCESS|ACK|KG_PATH)>/);
}

await runCheck('https-home-and-assets', async () => {
  const response = await fetch(`${baseUrl}/`, { headers: { 'accept-encoding': 'br, gzip' } });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/html/i);
  assert.doesNotMatch(html, /http:\/\/agent\.xtznai\.com/i);
  assertSecurityHeaders(response.headers);
  const assetUrls = [...new Set(extractAssetUrls(html))];
  assert.ok(assetUrls.length >= 3, 'Home page did not reference the expected production assets');
  const assets = await Promise.all(
    assetUrls.map(async (assetUrl) => {
      const assetResponse = await fetch(new URL(assetUrl, baseUrl), { headers: { 'accept-encoding': 'br, gzip' } });
      const bytes = (await assetResponse.arrayBuffer()).byteLength;
      return {
        bytes,
        cacheControl: assetResponse.headers.get('cache-control') || '',
        contentEncoding: assetResponse.headers.get('content-encoding') || '',
        contentType: assetResponse.headers.get('content-type') || '',
        status: assetResponse.status,
        url: assetUrl,
      };
    }),
  );
  const broken = assets.filter((asset) => asset.status !== 200 || asset.bytes === 0);
  assert.deepEqual(broken, []);
  const compressibleAssets = assets.filter((asset) => /\.(?:css|js)(?:$|\?)/i.test(asset.url) && asset.bytes >= 1024);
  assert.ok(compressibleAssets.length > 0, 'No compressible JS/CSS asset was found');
  assert.ok(
    compressibleAssets.every((asset) => /^(?:br|gzip)$/i.test(asset.contentEncoding)),
    `Uncompressed assets: ${JSON.stringify(compressibleAssets.filter((asset) => !asset.contentEncoding))}`,
  );
  assert.ok(
    assets.filter((asset) => asset.url.startsWith('/assets/')).every((asset) => /immutable/i.test(asset.cacheControl)),
    'Hashed assets are missing immutable cache headers',
  );
  report.summaries.homeHeaders = Object.fromEntries(
    ['cache-control', 'content-encoding', 'content-security-policy', 'referrer-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options']
      .map((name) => [name, response.headers.get(name) || '']),
  );
  report.summaries.assets = assets;
  return { assetCount: assets.length, htmlBytes: Buffer.byteLength(html), status: response.status };
});

await runCheck('http-redirect', async () => {
  const response = await fetch(baseUrl.replace(/^https:/, 'http:'), { redirect: 'manual' });
  assert.ok([301, 302, 307, 308].includes(response.status), `Unexpected redirect status ${response.status}`);
  assert.match(response.headers.get('location') || '', /^https:\/\/agent\.xtznai\.com\/?/);
  return { location: response.headers.get('location'), status: response.status };
});

await runCheck('spa-deep-link', async () => {
  const response = await fetch(`${baseUrl}/?agent_combination=audit-missing-${Date.now()}`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<div id="root"><\/div>/);
  return { status: response.status };
});

await runCheck('health', async () => {
  const { data, response } = await fetchJson(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(data?.status, 'ok');
  assert.equal(data?.service, 'flask-backend');
  return data;
});

await runCheck('echo-disabled', async () => {
  const { response } = await fetchJson(`${baseUrl}/api/echo`, {
    body: JSON.stringify({ message: 'production-audit' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 404);
  return { status: response.status };
});

let catalogAgents = [];
await runCheck('agent-catalog', async () => {
  const { data, response } = await fetchJson(`${baseUrl}/api/agents`);
  assert.equal(response.status, 200);
  catalogAgents = Array.isArray(data?.agents) ? data.agents : [];
  assert.ok(catalogAgents.length > 0, 'Agent catalog is empty');
  const ids = catalogAgents.map((agent) => String(agent.id || ''));
  assert.equal(new Set(ids).size, ids.length, 'Agent catalog contains duplicate ids');
  assert.ok(catalogAgents.every((agent) => agent.id && agent.name), 'Agent catalog contains unnamed agents');
  const launchUrls = catalogAgents.filter((agent) => agent.launch_url).map((agent) => agent.launch_url);
  const nonLaunchableAgents = catalogAgents.filter((agent) => !String(agent.launch_url || '').trim());
  const unexpectedNonLaunchable = nonLaunchableAgents.filter((agent) => String(agent.type || '').trim() !== '项目');
  const launchGroups = new Map();
  catalogAgents.forEach((agent) => {
    const launchUrl = String(agent.launch_url || '').trim();
    if (launchUrl) {
      launchGroups.set(launchUrl, [...(launchGroups.get(launchUrl) || []), agent]);
    }
  });
  const unexpectedDuplicateGroups = [...launchGroups.entries()].filter(
    ([, agents]) => agents.length > 1 && !agents.some((agent) => String(agent.type || '').includes('别名')),
  );
  const invalidLaunchUrls = launchUrls.filter((value) => {
    try {
      return !['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return true;
    }
  });
  assert.deepEqual(invalidLaunchUrls, []);
  assert.deepEqual(unexpectedNonLaunchable, [], 'Non-project catalog entries are missing launch URLs');
  assert.deepEqual(unexpectedDuplicateGroups, [], 'Duplicate launch URLs are not declared aliases');
  report.summaries.agentCatalog = {
    agentCount: catalogAgents.length,
    avatarCount: catalogAgents.filter((agent) => agent.avatar_url).length,
    declaredAliasGroupCount: [...launchGroups.values()].filter((agents) => agents.length > 1).length,
    launchUrlCount: launchUrls.length,
    projectCount: nonLaunchableAgents.length,
  };
  return report.summaries.agentCatalog;
});

await runCheck('all-agent-avatars', async () => {
  assert.ok(catalogAgents.length > 0, 'Agent catalog must be loaded first');
  const avatarAgents = catalogAgents.filter((agent) => agent.avatar_url);
  const results = [];

  for (let index = 0; index < avatarAgents.length; index += 8) {
    const batch = avatarAgents.slice(index, index + 8);
    results.push(
      ...(await Promise.all(
        batch.map(async (agent) => {
          const response = await fetch(new URL(agent.avatar_url, baseUrl));
          const bytes = (await response.arrayBuffer()).byteLength;
          return {
            agentId: agent.id,
            bytes,
            cacheControl: response.headers.get('cache-control') || '',
            contentType: response.headers.get('content-type') || '',
            status: response.status,
            url: agent.avatar_url,
          };
        }),
      )),
    );
  }

  const broken = results.filter(
    (item) => item.status !== 200 || item.bytes === 0 || !item.contentType.startsWith('image/'),
  );
  assert.equal(broken.length, 0, `Broken avatars: ${JSON.stringify(broken.slice(0, 8))}`);
  report.summaries.avatars = {
    count: results.length,
    immutableCount: results.filter((item) => /immutable/i.test(item.cacheControl)).length,
    totalBytes: results.reduce((total, item) => total + item.bytes, 0),
  };
  return report.summaries.avatars;
});

await runCheck('missing-avatar', async () => {
  const response = await fetch(`${baseUrl}/api/agents/audit-missing/avatar`);
  assert.equal(response.status, 404);
  return { status: response.status };
});

await runCheck('tts-valid-and-validation', async () => {
  const anonymous = await fetch(`${baseUrl}/api/tts/speech`, {
    body: JSON.stringify({ text: 'anonymous' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(anonymous.status, 401);
  const valid = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/tts/speech`, {
    body: JSON.stringify({ mood: 'neutral', text: '生产极限测试，语音链路正常。' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const audioBytes = (await valid.arrayBuffer()).byteLength;
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get('content-type') || '', /^audio\//i);
  assert.match(valid.headers.get('cache-control') || '', /no-store/i);
  assert.ok(audioBytes > 1000, `TTS returned only ${audioBytes} bytes`);

  const empty = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/tts/speech`, {
    body: JSON.stringify({ text: '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(empty.status, 400);
  const long = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/tts/speech`, {
    body: JSON.stringify({ text: '测'.repeat(801) }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(long.status, 400);
  return { anonymousStatus: anonymous.status, audioBytes, contentType: valid.headers.get('content-type'), emptyStatus: empty.status, longStatus: long.status };
});

await runCheck('cors-policy', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: {
      'access-control-request-method': 'GET',
      origin: baseUrl,
    },
    method: 'OPTIONS',
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), baseUrl);
  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: {
      'access-control-request-method': 'GET',
      origin: 'https://audit.invalid',
    },
    method: 'OPTIONS',
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  return {
    allowedOrigin: allowed.headers.get('access-control-allow-origin'),
    deniedOrigin: denied.headers.get('access-control-allow-origin'),
  };
});

await runCheck('chat-method-and-body-validation', async () => {
  const getResponse = await fetch(`${baseUrl}/api/coze/chat/stream`);
  assert.equal(getResponse.status, 405);
  const anonymous = await fetch(`${baseUrl}/api/coze/chat/stream`, {
    body: JSON.stringify({ message: 'anonymous' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(anonymous.status, 401);
  const malformed = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/coze/chat/stream`, {
    body: '{not-json',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(malformed.status, 400);
  const empty = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/coze/chat/stream`, {
    body: JSON.stringify({ message: '' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(empty.status, 400);
  const oversized = await fetchWithNodeApiSession(apiSession, `${baseUrl}/api/coze/chat/stream`, {
    body: JSON.stringify({ message: '测'.repeat(8001) }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(oversized.status, 413);
  return { anonymousStatus: anonymous.status, emptyStatus: empty.status, getStatus: getResponse.status, malformedStatus: malformed.status, oversizedStatus: oversized.status };
});

await runCheck('parallel-chat-and-identity', async () => {
  const results = await Promise.all([
    consumeChat('guest-a', { message: '生产极限测试：你好，请自然回应。', participant_identity: 'guest' }),
    consumeChat('guest-b', { message: '生产极限测试：今天状态怎么样？', participant_identity: 'guest' }),
    consumeChat('changzhang', { message: '生产极限测试：今天状态怎么样？', participant_identity: 'changzhang' }),
    consumeChat('unknown-identity', { message: '生产极限测试：你好，请自然回应。', participant_identity: 'admin<script>' }),
  ]);
  results.forEach(assertGreetingContract);
  assert.equal(new Set(results.map((result) => result.requestId)).size, results.length, 'Request IDs must be unique');
  const unknownText = Object.values(results.find((result) => result.label === 'unknown-identity')?.content || {}).join('\n');
  assert.doesNotMatch(unknownText, /admin<script>|PARTICIPANT_PERSONA|白名单|身份参数/i);
  report.summaries.parallelChat = results.map((result) => ({
    contentOrder: result.contentOrder,
    durationMs: round(result.durationMs),
    firstContentMs: round(result.firstContentMs),
    headersMs: round(result.headersMs),
    label: result.label,
    requestId: result.requestId,
  }));
  return report.summaries.parallelChat;
});

await runCheck('recommendation-missing-states', async () => {
  const missingId = `audit-missing-${Date.now()}`;
  const snapshot = await fetch(`${baseUrl}/api/recommendations/${missingId}`);
  assert.equal(snapshot.status, 404);
  const optional = await fetch(`${baseUrl}/api/combination-agents/by-recommendation/${missingId}?optional=1`);
  assert.equal(optional.status, 200);
  assert.equal(await optional.text(), 'null\n');
  const anonymousSave = await fetch(`${baseUrl}/api/combination-agents/by-recommendation/${missingId}`, {
    body: JSON.stringify({ lineup: 'invalid' }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
  assert.equal(anonymousSave.status, 401);
  const readOnlySave = await fetchWithNodeApiSession(
    apiSession,
    `${baseUrl}/api/combination-agents/by-recommendation/${missingId}`,
    {
      body: JSON.stringify({ lineup: [] }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    },
  );
  assert.equal(readOnlySave.status, 403);
  return {
    anonymousSaveStatus: anonymousSave.status,
    optionalStatus: optional.status,
    readOnlySaveStatus: readOnlySave.status,
    snapshotStatus: snapshot.status,
  };
});

if (recommendationId && recommendationEditToken) {
  await runCheck('recommendation-save-and-combination-roundtrip', async () => {
    const snapshotResult = await fetchJson(`${baseUrl}/api/recommendations/${recommendationId}`);
    assert.equal(snapshotResult.response.status, 200);
    const agents = Array.isArray(snapshotResult.data?.agents) ? snapshotResult.data.agents : [];
    assert.ok(agents.length > 0, 'Generated recommendation snapshot has no agents');
    const lineup = agents.slice(0, 5).map((agent, index) => ({
      ...agent,
      agent_name: agent.agent_name || agent.name,
      name: agent.agent_name || agent.name,
      rank: index + 1,
    }));
    const score = { audit: true, total: 73 };
    const savedSnapshot = await fetchJson(`${baseUrl}/api/recommendations/${recommendationId}/lineup`, {
      body: JSON.stringify({ lineup, score }),
      headers: nodeApiHeaders(apiSession, { 'content-type': 'application/json' }, recommendationEditToken),
      method: 'PUT',
    });
    assert.equal(savedSnapshot.response.status, 200);
    assert.equal(savedSnapshot.data?.saved_lineup?.length, 5);

    const savedCombination = await fetchJson(
      `${baseUrl}/api/combination-agents/by-recommendation/${recommendationId}`,
      {
        body: JSON.stringify({ lineup, score, title: '生产极限测试组合' }),
        headers: nodeApiHeaders(apiSession, { 'content-type': 'application/json' }, recommendationEditToken),
        method: 'PUT',
      },
    );
    assert.equal(savedCombination.response.status, 200);
    assert.equal(savedCombination.data?.recommendation_id, recommendationId);
    assert.ok(savedCombination.data?.id, 'Combination save returned no id');
    const byRecommendation = await fetchJson(
      `${baseUrl}/api/combination-agents/by-recommendation/${recommendationId}`,
    );
    assert.equal(byRecommendation.response.status, 200);
    assert.equal(byRecommendation.data?.id, savedCombination.data.id);
    const byId = await fetchJson(`${baseUrl}/api/combination-agents/${savedCombination.data.id}`);
    assert.equal(byId.response.status, 200);
    assert.equal(byId.data?.recommendation_id, recommendationId);
    return {
      agentCount: agents.length,
      combinationAgentId: savedCombination.data.id,
      lineupCount: byId.data?.lineup?.filter(Boolean).length || 0,
      recommendationId,
    };
  });
}

report.summary = {
  failed: report.checks.filter((check) => check.status === 'failed').length,
  passed: report.checks.filter((check) => check.status === 'passed').length,
  total: report.checks.length,
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}
process.stdout.write(output);
if (report.summary.failed > 0) {
  process.exitCode = 1;
}
