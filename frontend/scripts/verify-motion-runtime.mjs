import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = String(process.argv[2] || 'http://127.0.0.1:5196').replace(/\/+$/, '');
const browser = await chromium.launch({ headless: true });

function normalizeAngleDelta(start, end) {
  return ((end - start + 540) % 360) - 180;
}

async function readPrismMotion(page) {
  return page.evaluate(() => {
    const dock = document.querySelector('.workflow-dock');
    const style = dock ? getComputedStyle(dock, '::before') : null;
    const transform = style?.transform || 'none';
    const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/);
    const values = matrixMatch ? matrixMatch[1].split(',').map(Number) : [];
    const angle = values.length >= 2 ? (Math.atan2(values[1], values[0]) * 180) / Math.PI : 0;

    return {
      angle,
      delay: style?.animationDelay || '',
      duration: style?.animationDuration || '',
      iterationCount: style?.animationIterationCount || '',
      name: style?.animationName || '',
      opacity: style?.opacity || '',
    };
  });
}

async function waitForPrismTimeline(page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            animation.animationName === 'workflow-prism-spin' &&
            animation.playState === 'running' &&
            Number(animation.currentTime || 0) >= 250,
        ),
    null,
    { timeout: 5000 },
  );
}

async function installAndReadTypingProbe(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.id = 'motion-typing-probe';
    probe.className = 'agent-typing-line';

    for (let index = 0; index < 3; index += 1) {
      probe.append(document.createElement('span'));
    }

    document.body.append(probe);

    return Array.from(probe.children).map((dot) => {
      const style = getComputedStyle(dot);
      return {
        delay: style.animationDelay,
        duration: style.animationDuration,
        iterationCount: style.animationIterationCount,
        name: style.animationName,
      };
    });
  });
}

async function installAndReadWaveProbe(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.id = 'motion-wave-probe';
    probe.className = 'assistant-subtitle-wave';

    for (let index = 0; index < 7; index += 1) {
      probe.append(document.createElement('i'));
    }

    document.body.append(probe);

    return Array.from(probe.querySelectorAll('i')).map((bar) => {
      const style = getComputedStyle(bar);
      return {
        delay: style.animationDelay,
        duration: style.animationDuration,
        iterationCount: style.animationIterationCount,
        name: style.animationName,
      };
    });
  });
}

async function sampleWaveMotion(page) {
  const readFrame = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('#motion-wave-probe i')).map((bar) => {
        const style = getComputedStyle(bar);
        return `${style.transform}|${style.opacity}`;
      }),
    );

  await page.waitForFunction(
    () => {
      const probeBars = Array.from(document.querySelectorAll('#motion-wave-probe i'));
      return (
        probeBars.length === 7 &&
        probeBars.every((bar) => {
          const animation = bar.getAnimations()[0];
          const delayMs = Number.parseFloat(getComputedStyle(bar).animationDelay || '0') * 1000;
          return animation?.playState === 'running' && Number(animation.currentTime || 0) >= delayMs + 80;
        })
      );
    },
    null,
    { timeout: 5000 },
  );
  const start = await readFrame();
  await page.waitForTimeout(83);
  const middle = await readFrame();
  await page.waitForTimeout(127);
  const end = await readFrame();

  return start.filter((frame, index) => frame !== middle[index] || frame !== end[index]).length;
}

try {
  const normalContext = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { height: 900, width: 1440 },
  });
  const normalPage = await normalContext.newPage();
  await normalPage.goto(`${baseUrl}/?skipIntro=1&demoGraph=1&motion_runtime=normal`, { waitUntil: 'domcontentloaded' });
  await normalPage.locator('.workflow-dock').waitFor({ state: 'visible', timeout: 15000 });
  await normalPage.evaluate(() => document.querySelector('.workflow-dock')?.setAttribute('data-highlight', 'route'));
  await waitForPrismTimeline(normalPage);

  const normalStart = await readPrismMotion(normalPage);
  await normalPage.waitForTimeout(1000);
  const normalEnd = await readPrismMotion(normalPage);
  const angleDelta = Math.abs(normalizeAngleDelta(normalStart.angle, normalEnd.angle));

  assert.equal(normalStart.duration, '12s');
  assert.equal(normalStart.iterationCount, 'infinite');
  assert.equal(normalStart.name, 'workflow-prism-spin');
  assert.equal(normalStart.opacity, '0.64');
  assert.ok(angleDelta >= 18 && angleDelta <= 42, `Expected a live prism near 30 degrees per second, received ${angleDelta.toFixed(2)}.`);
  const normalTyping = await installAndReadTypingProbe(normalPage);
  assert.equal(normalTyping.length, 3);
  assert.equal(normalTyping[0].name, 'typing-pulse');
  assert.equal(normalTyping[0].duration, '2s');
  assert.equal(normalTyping[0].iterationCount, 'infinite');
  assert.equal(normalTyping[1].delay, '0.32s');
  assert.equal(normalTyping[2].delay, '0.64s');
  const normalWave = await installAndReadWaveProbe(normalPage);
  assert.equal(normalWave.length, 7);
  assert.equal(normalWave[0].name, 'assistant-subtitle-wave');
  assert.equal(normalWave[0].duration, '0.575s');
  assert.equal(normalWave[0].iterationCount, 'infinite');
  assert.equal(normalWave[1].delay, '0.055s');
  assert.equal(normalWave[6].delay, '0.33s');
  const normalWaveChangedBars = await sampleWaveMotion(normalPage);
  assert.equal(normalWaveChangedBars, 7, `Normal subtitle wave froze: only ${normalWaveChangedBars}/7 bars changed.`);
  await normalContext.close();

  const reducedContext = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { height: 900, width: 1440 },
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/?skipIntro=1&demoGraph=1&motion_runtime=reduced`, { waitUntil: 'domcontentloaded' });
  await reducedPage.locator('.workflow-dock').waitFor({ state: 'visible', timeout: 15000 });
  await reducedPage.evaluate(() => document.querySelector('.workflow-dock')?.setAttribute('data-highlight', 'route'));
  await waitForPrismTimeline(reducedPage);
  const reducedStart = await readPrismMotion(reducedPage);
  await reducedPage.waitForTimeout(1000);
  const reducedEnd = await readPrismMotion(reducedPage);
  const reducedAngleDelta = Math.abs(normalizeAngleDelta(reducedStart.angle, reducedEnd.angle));

  assert.equal(reducedStart.duration, '20s');
  assert.equal(reducedStart.iterationCount, 'infinite');
  assert.equal(reducedStart.delay, '0s');
  assert.ok(reducedAngleDelta >= 8 && reducedAngleDelta <= 28, `Reduced-motion prism stopped or jumped: ${reducedAngleDelta.toFixed(2)}deg/s.`);
  const reducedTelemetryIterationCount = await reducedPage
    .locator('.helmet-status-meter i')
    .first()
    .evaluate((element) => getComputedStyle(element).animationIterationCount);
  assert.equal(reducedTelemetryIterationCount, '1');
  const reducedTyping = await installAndReadTypingProbe(reducedPage);
  assert.equal(reducedTyping.length, 3);
  assert.equal(reducedTyping[0].name, 'typing-pulse');
  assert.equal(reducedTyping[0].duration, '2.8s');
  assert.equal(reducedTyping[0].iterationCount, 'infinite');
  assert.equal(reducedTyping[1].delay, '0.45s');
  assert.equal(reducedTyping[2].delay, '0.9s');
  const reducedWave = await installAndReadWaveProbe(reducedPage);
  assert.equal(reducedWave.length, 7);
  assert.equal(reducedWave[0].name, 'assistant-subtitle-wave');
  assert.equal(reducedWave[0].duration, '0.9s');
  assert.equal(reducedWave[0].iterationCount, 'infinite');
  assert.equal(reducedWave[1].delay, '0.08s');
  assert.equal(reducedWave[6].delay, '0.48s');
  const reducedWaveChangedBars = await sampleWaveMotion(reducedPage);
  assert.equal(reducedWaveChangedBars, 7, `Reduced-motion subtitle wave froze: only ${reducedWaveChangedBars}/7 bars changed.`);
  await reducedContext.close();

  console.log(
    `Motion runtime verified: prism ${angleDelta.toFixed(2)}deg/s, reduced ${reducedAngleDelta.toFixed(2)}deg/s; subtitle bars changed ${normalWaveChangedBars}/7 normal and ${reducedWaveChangedBars}/7 reduced.`,
  );
} finally {
  await browser.close();
}
