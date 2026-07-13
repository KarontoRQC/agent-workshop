import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = String(process.argv[2] || 'https://agent.xtznai.com').replace(/\/+$/, '');
const baseHostname = new URL(baseUrl).hostname;
const localDevelopmentRun = ['127.0.0.1', 'localhost', '::1'].includes(baseHostname);
const browser = await chromium.launch({ headless: true });
const results = {
  baseUrl,
  desktop: {},
  generatedAt: new Date().toISOString(),
  mobile: {},
};

function captureErrors(page, bucket, expectedAborts) {
  page.on('pageerror', (error) => bucket.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      bucket.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('/api/')) {
      const errorText = request.failure()?.errorText || '';
      if (errorText === 'net::ERR_ABORTED') {
        expectedAborts.push(url);
        return;
      }
      bucket.push(`requestfailed: ${url} ${errorText}`);
    }
  });
}

async function switchToTextMode(page) {
  const tab = page.getByRole('tab', { exact: true, name: '打字' });
  assert.equal(await tab.count(), 1, 'Text mode tab must be unique');
  await tab.click();
  await page.getByPlaceholder('问你的 agent...').waitFor({ state: 'visible', timeout: 5000 });
}

async function waitForCompleted(page, timeout = 45000) {
  await page.waitForFunction(
    () => document.querySelector('.agent-console')?.getAttribute('data-status') !== 'streaming',
    undefined,
    { timeout },
  );
  return page.evaluate(() => ({
    action: document.querySelector('.agent-composer button[data-action]')?.getAttribute('data-action') || '',
    articleCount: document.querySelectorAll('.agent-turn').length,
    status: document.querySelector('.agent-console')?.getAttribute('data-status') || '',
    textareaDisabled: document.querySelector('.agent-composer textarea')?.disabled ?? true,
  }));
}

async function sendMessage(page, message) {
  const textarea = page.getByPlaceholder('问你的 agent...');
  assert.equal(await textarea.count(), 1, 'Message textarea must be unique');
  await textarea.fill(message);
  const send = page.locator('button[data-action="send"]');
  assert.equal(await send.count(), 1, `Send button must be available for: ${message}`);
  assert.ok(await send.isEnabled(), `Send button must be enabled for: ${message}`);
  await send.click();
  await page.waitForFunction(
    () => document.querySelector('.agent-console')?.getAttribute('data-status') === 'streaming',
    undefined,
    { timeout: 5000 },
  );
}

async function readWorkflowSnapshot(page) {
  return page.evaluate(() => ({
    agentNames: [...document.querySelectorAll('.recommended-agent-head strong')]
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean),
    routeSegments: [...document.querySelectorAll('.workflow-route-chain > span')]
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean),
  }));
}

async function runBusinessScenario({ context, label, message, page, previousRecommendationId = '', previousRoute = '' }) {
  assert.equal(context.pages().length, 1, `${label} started with a stale popup`);
  const previousWorkflow = await readWorkflowSnapshot(page);
  await sendMessage(page, message);
  await page
    .locator('[data-segment="knowledge-explanation"][data-speaking="true"]')
    .waitFor({ state: 'visible', timeout: 60000 });
  const orderedPresentationState = await page.evaluate(() => ({
    agentNames: [...document.querySelectorAll('.recommended-agent-head strong')]
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean),
    recommendationCards: document.querySelectorAll('.workflow-dock .recommended-agent-card').length,
    recommendationToolCalls: document.querySelectorAll(
      '.agent-turn:last-child .agent-tool-call-agents, .agent-turn:last-child .agent-tool-call-lineup',
    ).length,
  }));
  assert.equal(
    orderedPresentationState.recommendationToolCalls,
    0,
    `${label} exposed the recommendation tool call while knowledge-path speech was active`,
  );
  assert.deepEqual(
    orderedPresentationState.agentNames,
    previousWorkflow.agentNames,
    `${label} replaced the previous recommendation cards before the new recommendation tool call`,
  );
  const completedState = await waitForCompleted(page, 90000);
  assert.equal(completedState.status, 'completed', `${label} did not complete`);
  assert.equal(completedState.textareaDisabled, false, `${label} left the composer disabled`);

  const hallDeadline = Date.now() + 90000;
  while (context.pages().length < 2 && Date.now() < hallDeadline) {
    await page.waitForTimeout(250);
  }

  assert.equal(context.pages().length, 2, `${label} must open exactly one Hero Hall page`);
  const hallPage = context.pages().find((candidate) => candidate !== page);
  assert.ok(hallPage, `${label} Hero Hall page was not found`);
  const hallErrors = [];
  const hallExpectedAborts = [];
  captureErrors(hallPage, hallErrors, hallExpectedAborts);
  const realHallDeadline = Date.now() + 90000;
  let hallUrl = new URL(hallPage.url());

  while (
    (hallUrl.searchParams.get('agent_combination') !== '1' || !hallUrl.searchParams.get('id')) &&
    Date.now() < realHallDeadline
  ) {
    await page.waitForTimeout(250);
    hallUrl = new URL(hallPage.url());
  }

  assert.equal(
    hallUrl.searchParams.get('agent_combination'),
    '1',
    `${label} pending Hero Hall did not navigate to a real entry: ${hallPage.url()}`,
  );
  assert.ok(hallUrl.searchParams.get('id'), `${label} real Hero Hall URL missed recommendation ID: ${hallPage.url()}`);
  assert.notEqual(hallPage.url(), 'about:blank', `${label} Hero Hall remained about:blank`);
  await hallPage.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 25000 });
  await hallPage.waitForTimeout(800);
  hallUrl = new URL(hallPage.url());
  const recommendationId = hallUrl.searchParams.get('id') || '';
  assert.ok(recommendationId, `${label} Hero Hall URL missed recommendation ID`);
  assert.notEqual(recommendationId, previousRecommendationId, `${label} reused the previous recommendation ID`);
  assert.deepEqual(hallErrors, [], `${label} Hero Hall emitted browser or API errors`);
  if (localDevelopmentRun) {
    assert.ok(
      hallExpectedAborts.every((url) =>
        ['/api/agents', '/api/recommendations/', '/api/combination-agents/by-recommendation/'].some((path) => url.includes(path)),
      ),
      `${label} Hero Hall emitted an unexpected development-mode abort`,
    );
  } else {
    assert.deepEqual(hallExpectedAborts, [], `${label} Hero Hall emitted aborted API requests`);
  }

  await page.waitForFunction(
    () =>
      document.querySelectorAll('.workflow-route-chain > span').length >= 3 &&
      document.querySelectorAll('.recommended-agent-head strong').length === 5,
    undefined,
    { timeout: 8000 },
  );

  const workflow = await readWorkflowSnapshot(page);
  assert.ok(workflow.routeSegments.length >= 3, `${label} rendered an incomplete knowledge path`);
  assert.equal(workflow.agentNames.length, 5, `${label} rendered an incomplete five-agent lineup`);
  assert.equal(new Set(workflow.agentNames).size, workflow.agentNames.length, `${label} rendered duplicate agents`);
  const route = workflow.routeSegments.join(' > ');
  assert.notEqual(route, previousRoute, `${label} left the previous scenario route on screen`);

  await hallPage.close();
  await page.bringToFront();
  assert.equal(context.pages().length, 1, `${label} left a stale Hero Hall page behind`);

  return {
    agentNames: workflow.agentNames,
    completedState,
    hallErrors,
    hallExpectedAborts,
    orderedPresentationState,
    recommendationId,
    route,
  };
}

try {
  const desktopContext = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const desktopPage = await desktopContext.newPage();
  const desktopErrors = [];
  const desktopExpectedAborts = [];
  captureErrors(desktopPage, desktopErrors, desktopExpectedAborts);
  await desktopPage.goto(`${baseUrl}/?skipIntro=1&classroom_e2e=${Date.now()}`, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
  await desktopPage.locator('[data-testid="particle-field"] canvas').waitFor({ state: 'visible', timeout: 15000 });
  await switchToTextMode(desktopPage);

  await sendMessage(desktopPage, '课堂回归测试：你好啊');
  const firstState = await waitForCompleted(desktopPage);
  assert.equal(firstState.status, 'completed');
  assert.equal(firstState.textareaDisabled, false);
  assert.equal(desktopContext.pages().length, 1, 'Greeting must not open about:blank or a Hero Hall page');
  const firstResponseOrder = await desktopPage.evaluate(() =>
    [...(document.querySelector('.agent-turn:last-child .agent-response')?.children || [])].map((element) => element.className),
  );
  assert.equal(firstResponseOrder[0], 'agent-thinking-stream', 'Thinking summary must render before ACK');
  assert.equal(firstResponseOrder[1], 'agent-subtitle-line', 'ACK must render directly after the thinking summary');

  const actionBeforeSecondDraft = firstState.action;
  const textarea = desktopPage.getByPlaceholder('问你的 agent...');
  await textarea.fill('课堂回归测试：这是第二条连续消息');
  const actionAfterSecondDraft = await desktopPage
    .locator('.agent-composer button[data-action]')
    .getAttribute('data-action');
  assert.equal(actionAfterSecondDraft, 'send', 'Typed text must override a residual pause action');
  const secondSend = desktopPage.locator('button[data-action="send"]');
  assert.equal(await secondSend.count(), 1);
  await secondSend.click();
  await desktopPage.waitForFunction(
    () => document.querySelector('.agent-console')?.getAttribute('data-status') === 'streaming',
    undefined,
    { timeout: 5000 },
  );
  const secondState = await waitForCompleted(desktopPage);
  assert.equal(secondState.articleCount, 2, 'Second message must create a second conversation turn');
  assert.equal(desktopContext.pages().length, 1, 'Second greeting must stay in the current page');

  await sendMessage(desktopPage, '请详细规划一个白酒品牌招商获客到成交转化的完整路径，并推荐智能体组合。');
  const pause = desktopPage.locator('button[data-action="pause"]');
  assert.equal(await pause.count(), 1, 'Streaming response must expose the pause action');
  await pause.click();
  const pausedState = await waitForCompleted(desktopPage, 5000);
  assert.equal(pausedState.textareaDisabled, false, 'Pause must immediately unlock the composer');
  assert.notEqual(pausedState.status, 'streaming', 'Pause must leave streaming state');
  assert.equal(desktopContext.pages().length, 1, 'Pause must close the preauthorized pending Hero Hall page');

  await sendMessage(desktopPage, '暂停后恢复测试：请回复收到');
  const recoveredState = await waitForCompleted(desktopPage);
  assert.equal(recoveredState.status, 'completed', 'A new request must work after pausing the previous one');

  const desktopScenarios = [
    {
      label: 'desktop-liquor招商',
      message: '白酒招商怎么提高线索跟进和成交转化？给我一个完整方案。',
    },
    {
      label: 'desktop-餐饮短视频私域',
      message: '切换新场景：本地餐饮连锁需要短视频获客、到店承接和私域复购，请重新规划路径并推荐新的五个智能体。',
    },
    {
      label: 'desktop-千人大课转化',
      message: '再次切换：我要举办千人大课，请规划预热报名、到课提醒、课堂互动和课后成交跟进路径，并推荐新的五智能体组合。',
    },
  ];
  const desktopScenarioResults = [];
  let previousRecommendationId = '';
  let previousRoute = '';

  for (const scenario of desktopScenarios) {
    const scenarioResult = await runBusinessScenario({
      context: desktopContext,
      label: scenario.label,
      message: scenario.message,
      page: desktopPage,
      previousRecommendationId,
      previousRoute,
    });
    desktopScenarioResults.push(scenarioResult);
    previousRecommendationId = scenarioResult.recommendationId;
    previousRoute = scenarioResult.route;
  }

  results.desktop = {
    actionBeforeSecondDraft,
    consoleErrors: desktopErrors,
    expectedAbortedRequests: desktopExpectedAborts,
    finalTurnCount: desktopScenarioResults.at(-1).completedState.articleCount,
    recommendationScenarios: desktopScenarioResults.map((scenario) => ({
      agentNames: scenario.agentNames,
      heroHallConsoleErrors: scenario.hallErrors,
      heroHallExpectedAbortedRequests: scenario.hallExpectedAborts,
      orderedPresentationState: scenario.orderedPresentationState,
      recommendationId: scenario.recommendationId,
      route: scenario.route,
    })),
    pauseRecovered: true,
    secondMessageCompleted: true,
    thinkingBeforeAck: true,
  };
  assert.deepEqual(desktopErrors, [], 'Desktop classroom flow emitted browser errors');
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  const mobileExpectedAborts = [];
  captureErrors(mobilePage, mobileErrors, mobileExpectedAborts);
  await mobilePage.goto(`${baseUrl}/?skipIntro=1&classroom_mobile=${Date.now()}`, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
  await switchToTextMode(mobilePage);
  const mobileLayout = await mobilePage.evaluate(() => {
    const textarea = document.querySelector('.agent-composer textarea')?.getBoundingClientRect();
    const button = document.querySelector('.agent-composer button[data-action]')?.getBoundingClientRect();
    return {
      buttonInsideViewport: Boolean(button && button.left >= 0 && button.right <= innerWidth && button.bottom <= innerHeight),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      textareaInsideViewport: Boolean(
        textarea && textarea.left >= 0 && textarea.right <= innerWidth && textarea.bottom <= innerHeight,
      ),
    };
  });
  assert.equal(mobileLayout.overflowX, false, 'Mobile layout must not overflow horizontally');
  assert.ok(mobileLayout.textareaInsideViewport, 'Mobile textarea must stay inside the viewport');
  assert.ok(mobileLayout.buttonInsideViewport, 'Mobile send button must stay inside the viewport');
  await sendMessage(mobilePage, '移动端课堂回归测试：请回复收到');
  const mobileState = await waitForCompleted(mobilePage);
  assert.equal(mobileState.status, 'completed');
  const mobileBusiness = await runBusinessScenario({
    context: mobileContext,
    label: 'mobile-local-store-conversion',
    message: '移动端新场景：本地生活门店要做热点内容引流、到店核销和会员复购，请规划知识路径并推荐五个智能体。',
    page: mobilePage,
  });
  const mobileWorkflowLayout = await mobilePage.evaluate(() => {
    const dock = document.querySelector('.workflow-dock')?.getBoundingClientRect();
    return {
      dockInsideHorizontalViewport: Boolean(dock && dock.left >= -1 && dock.right <= innerWidth + 1),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.equal(mobileWorkflowLayout.overflowX, false, 'Mobile workflow result caused horizontal overflow');
  assert.ok(mobileWorkflowLayout.dockInsideHorizontalViewport, 'Mobile workflow dock escaped the horizontal viewport');
  assert.deepEqual(mobileErrors, [], 'Mobile classroom flow emitted browser errors');
  results.mobile = {
    ...mobileLayout,
    consoleErrors: mobileErrors,
    expectedAbortedRequests: mobileExpectedAborts,
    messageCompleted: true,
    recommendationScenario: {
      agentNames: mobileBusiness.agentNames,
      orderedPresentationState: mobileBusiness.orderedPresentationState,
      recommendationId: mobileBusiness.recommendationId,
      route: mobileBusiness.route,
    },
    workflowLayout: mobileWorkflowLayout,
  };
  await mobileContext.close();
} finally {
  await browser.close();
}

const output = `${JSON.stringify(results, null, 2)}\n`;
const outputPath = process.env.CLASSROOM_E2E_OUTPUT ? path.resolve(process.env.CLASSROOM_E2E_OUTPUT) : '';

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

process.stdout.write(output);
