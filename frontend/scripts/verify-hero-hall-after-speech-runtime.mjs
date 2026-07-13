import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = String(process.argv[2] || 'http://127.0.0.1:5188').replace(/\/+$/, '');
const outputPath = process.env.HERO_HALL_SPEECH_OUTPUT
  ? path.resolve(process.env.HERO_HALL_SPEECH_OUTPUT)
  : path.resolve('outputs/hero-hall-after-speech-runtime.json');
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
  headless: true,
});
const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
const page = await context.newPage();
const errors = [];

page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(`console: ${message.text()}`);
  }
});

const waitForPageCount = async (count, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;

  while (context.pages().length !== count && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }

  return context.pages().length;
};

const waitForRealHeroHallUrl = async (hallPage, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = new URL(hallPage.url());

    if (url.searchParams.get('agent_combination') === '1' && url.searchParams.get('id')) {
      return url;
    }

    await page.waitForTimeout(100);
  }

  return new URL(hallPage.url());
};

try {
  await page.goto(`${baseUrl}/?skipIntro=1&hero_hall_speech_audit=${Date.now()}`, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-testid="particle-field"] canvas').waitFor({ state: 'visible', timeout: 15000 });

  const textTab = page.getByRole('tab', { exact: true, name: '打字' });
  assert.equal(await textTab.count(), 1, 'Text mode tab must be unique.');
  await textTab.click();

  const textarea = page.getByPlaceholder('问你的 agent...');
  assert.equal(await textarea.count(), 1, 'Message textarea must be unique.');
  await textarea.fill('白酒招商怎么提高成交，给我完整知识路径并推荐五个智能体组合');

  const send = page.locator('button[data-action="send"]');
  assert.equal(await send.count(), 1, 'Send button must be unique.');
  assert.equal(await send.isEnabled(), true, 'Send button must be enabled.');
  await send.click();

  assert.equal(await waitForPageCount(2, 5000), 2, 'Business planning must reserve exactly one Hero Hall page.');
  const hallPage = context.pages().find((candidate) => candidate !== page);
  assert.ok(hallPage, 'Reserved Hero Hall page was not found.');

  const initialHallUrl = new URL(hallPage.url());
  assert.equal(initialHallUrl.searchParams.get('pending'), '1', `Reserved page was not pending: ${hallPage.url()}`);

  const finalSpeech = page.locator('[data-segment="recommendation-summary"][data-speaking="true"]');
  await finalSpeech.waitFor({ state: 'visible', timeout: 90000 });
  const speechStartedAt = Date.now();
  const hallUrlDuringSpeech = new URL(hallPage.url());
  let recommendationCardsDuringSpeech = 0;
  let prematureHallUrl = '';
  const speechDeadline = Date.now() + 90000;

  assert.equal(
    hallUrlDuringSpeech.searchParams.get('pending'),
    '1',
    `Hero Hall navigated before the final speech settled: ${hallPage.url()}`,
  );

  while ((await finalSpeech.isVisible()) && Date.now() < speechDeadline) {
    const currentHallUrl = new URL(hallPage.url());
    recommendationCardsDuringSpeech = Math.max(
      recommendationCardsDuringSpeech,
      await page.locator('.workflow-dock .recommended-agent-card').count(),
    );

    if (currentHallUrl.searchParams.get('agent_combination') === '1' && currentHallUrl.searchParams.get('id')) {
      prematureHallUrl = currentHallUrl.toString();
      break;
    }

    await page.waitForTimeout(100);
  }

  assert.equal(prematureHallUrl, '', `Hero Hall navigated during the final speech: ${prematureHallUrl}`);
  assert.equal(await finalSpeech.isVisible(), false, 'The final recommendation speech did not settle within 90 seconds.');
  const speechSettledAt = Date.now();
  const realHallUrl = await waitForRealHeroHallUrl(hallPage, 30000);
  const heroHallNavigatedAt = Date.now();

  assert.equal(realHallUrl.searchParams.get('agent_combination'), '1', `Hero Hall did not navigate: ${hallPage.url()}`);
  assert.ok(realHallUrl.searchParams.get('id'), `Hero Hall URL missed recommendation id: ${hallPage.url()}`);
  assert.ok(heroHallNavigatedAt >= speechSettledAt, 'Hero Hall navigation happened before speech settlement.');
  await hallPage.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 25000 });
  assert.deepEqual(errors, [], 'The speech-gated Hero Hall flow emitted browser errors.');

  const report = {
    baseUrl,
    errors,
    generatedAt: new Date().toISOString(),
    hallUrlDuringSpeech: hallUrlDuringSpeech.toString(),
    heroHallUrl: realHallUrl.toString(),
    recommendationCardsDuringSpeech,
    speechDurationMs: speechSettledAt - speechStartedAt,
    status: 'passed',
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
