import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { createNodeApiSession, fetchWithNodeApiSession } from './api-session.mjs';

const baseUrl = String(process.argv[2] || 'https://agent.xtznai.com').replace(/\/+$/, '');
const recommendationId = String(process.env.UI_AUDIT_RECOMMENDATION_ID || '').trim();
const recommendationEditToken = String(process.env.UI_AUDIT_EDIT_TOKEN || '').trim();
const outputPath = process.env.PRODUCTION_UI_OUTPUT ? path.resolve(process.env.PRODUCTION_UI_OUTPUT) : '';
const evidenceDir = process.env.PRODUCTION_UI_EVIDENCE_DIR
  ? path.resolve(process.env.PRODUCTION_UI_EVIDENCE_DIR)
  : path.resolve('outputs/production-ui-audit');

fs.mkdirSync(evidenceDir, { recursive: true });

const report = {
  baseUrl,
  checks: [],
  generatedAt: new Date().toISOString(),
  recommendationId,
};

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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function grantRecommendationEditAccess(context) {
  if (!recommendationId || !recommendationEditToken) {
    return;
  }

  await context.addInitScript(
    ({ key, token }) => {
      try {
        window.localStorage.setItem(key, token);
      } catch {
        // Storage is unavailable on the initial blank document and will be retried after navigation.
      }
    },
    {
      key: `jarvis:recommendation-edit:${recommendationId}`,
      token: recommendationEditToken,
    },
  );
}

function attachRuntimeSignals(page) {
  const signals = {
    abortedRequests: [],
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    mixedContentRequests: [],
    pageErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      signals.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => signals.pageErrors.push(String(error)));
  page.on('request', (request) => {
    if (baseUrl.startsWith('https://') && request.url().startsWith('http://')) {
      signals.mixedContentRequests.push(request.url());
    }
  });
  page.on('requestfailed', (request) => {
    const failure = `${request.url()} ${request.failure()?.errorText || ''}`.trim();
    if (/net::ERR_ABORTED/i.test(failure)) {
      signals.abortedRequests.push(failure);
    } else {
      signals.failedRequests.push(failure);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      signals.httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return signals;
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button, a[href], input, textarea, select')].filter(isVisible);
    const unlabeledControls = controls
      .filter((element) => {
        const label = [
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('placeholder'),
          element.textContent,
          element.querySelector('img')?.getAttribute('alt'),
        ]
          .filter(Boolean)
          .join('')
          .trim();
        return !label;
      })
      .map((element) => element.outerHTML.slice(0, 180));
    const duplicateIds = [...document.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id, index, values) => id && values.indexOf(id) !== index);
    const brokenImages = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const undersizedControls = controls
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: Math.round(rect.height), label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 80), width: Math.round(rect.width) };
      })
      .filter((item) => item.width < 40 || item.height < 40)
      .slice(0, 30);

    return {
      brokenImages,
      canvas: canvasRect ? { height: Math.round(canvasRect.height), width: Math.round(canvasRect.width) } : null,
      controlCount: controls.length,
      duplicateIds: [...new Set(duplicateIds)],
      imageCount: document.images.length,
      nodeCount: document.querySelectorAll('*').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      undersizedControls,
      unlabeledControls,
      viewport: { height: innerHeight, width: innerWidth },
    };
  });
}

const browser = await chromium.launch({ headless: true });

try {
  await runCheck('intro-default-and-auto-exit', async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    const signals = attachRuntimeSignals(page);
    const navigationStartedAt = Date.now();
    await page.goto(`${baseUrl}/?intro_audit=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const intro = page.locator('.zhongyin-intro');
    await intro.waitFor({ state: 'visible', timeout: 3000 });
    const brand = page.locator('.zhongyin-intro__brand');
    await brand.waitFor({ state: 'visible', timeout: 1000 });
    const brandVisibleMs = Date.now() - navigationStartedAt;
    const brandOpacity = Number(await brand.evaluate((element) => getComputedStyle(element).opacity));
    assertCondition((await page.locator('main').getAttribute('data-intro')) === 'true', 'Default entry did not set data-intro=true');
    assertCondition((await intro.getAttribute('class'))?.includes('is-ready'), 'Intro brand never entered the ready state');
    assertCondition(brandOpacity >= 0.98, `Intro brand started at opacity ${brandOpacity} instead of being visible on first paint`);
    await page.screenshot({ path: path.join(evidenceDir, 'intro-desktop.png') });
    await intro.waitFor({ state: 'detached', timeout: 9000 });
    assertCondition((await page.locator('main').getAttribute('data-intro')) === 'false', 'Intro did not auto-exit');
    assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `Intro errors: ${JSON.stringify(signals)}`);
    await context.close();
    return { autoExited: true, brandOpacity, brandVisibleMs, ready: true, screenshot: path.join(evidenceDir, 'intro-desktop.png') };
  });

  await runCheck('intro-with-changzhang-param', async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?identity=changzhang&intro_audit=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.zhongyin-intro').waitFor({ state: 'visible', timeout: 3000 });
    assertCondition((await page.locator('main').getAttribute('data-intro')) === 'true', 'Identity parameter bypassed the intro');
    await context.close();
    return { introVisible: true };
  });

  await runCheck('skip-intro-contract', async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?skipIntro=1&intro_audit=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    assertCondition((await page.locator('.zhongyin-intro').count()) === 0, 'skipIntro did not bypass the intro');
    assertCondition((await page.locator('main').getAttribute('data-intro')) === 'false', 'skipIntro left data-intro enabled');
    await context.close();
    return { bypassed: true };
  });

  const viewports = [
    { height: 800, name: 'mobile-360', width: 360 },
    { height: 844, name: 'mobile-390', width: 390 },
    { height: 1024, name: 'tablet-768', width: 768 },
    { height: 720, name: 'desktop-1280', width: 1280 },
    { height: 900, name: 'desktop-1440', width: 1440 },
    { height: 1080, name: 'desktop-1920', width: 1920 },
  ];

  for (const viewport of viewports) {
    await runCheck(`home-layout-${viewport.name}`, async () => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const signals = attachRuntimeSignals(page);
      const consoleMessages = [];
      page.on('console', (message) => consoleMessages.push(message.text()));
      await page.goto(`${baseUrl}/?skipIntro=1&layout_audit=${viewport.name}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="particle-field"] canvas').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForTimeout(650);
      const layout = await inspectLayout(page);
      const nextHopProtocol = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        return navigation && 'nextHopProtocol' in navigation ? navigation.nextHopProtocol : '';
      });
      assertCondition(!layout.overflowX, `${viewport.name} has horizontal overflow: ${layout.scrollWidth}px`);
      assertCondition(layout.brokenImages.length === 0, `${viewport.name} has broken images: ${layout.brokenImages.join(', ')}`);
      assertCondition(layout.duplicateIds.length === 0, `${viewport.name} has duplicate ids: ${layout.duplicateIds.join(', ')}`);
      assertCondition(layout.unlabeledControls.length === 0, `${viewport.name} has unlabeled controls`);
      if (viewport.width < 768) {
        assertCondition(layout.undersizedControls.length === 0, `${viewport.name} has undersized controls: ${JSON.stringify(layout.undersizedControls)}`);
      }
      assertCondition(layout.canvas?.width === viewport.width && layout.canvas?.height === viewport.height, `${viewport.name} canvas does not cover the viewport`);
      assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `${viewport.name} runtime errors: ${JSON.stringify(signals)}`);
      assertCondition(signals.mixedContentRequests.length === 0, `${viewport.name} requested mixed content`);
      if (baseUrl.startsWith('https://')) {
        assertCondition(nextHopProtocol === 'h2', `${viewport.name} negotiated ${nextHopProtocol || 'no protocol'} instead of HTTP/2`);
      }
      if (viewport.name === 'mobile-390' || viewport.name === 'desktop-1440') {
        await page.screenshot({ path: path.join(evidenceDir, `home-${viewport.name}.png`) });
      }
      const brandingText = consoleMessages.join('\n');
      assertCondition(/技术总监-任总监/.test(brandingText), `${viewport.name} missed console branding`);
      assertCondition(/神兽保佑,代码无bug/.test(brandingText), `${viewport.name} missed console protection text`);
      assertCondition(!/note\.techstash|JARVIS CONSOLE ONLINE/i.test(brandingText), `${viewport.name} printed removed console text`);
      await context.close();
      return { ...layout, nextHopProtocol, runtimeSignals: signals };
    });
  }

  await runCheck('graph-stable-labels-and-horizontal-diamond-yaw', async () => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    const signals = attachRuntimeSignals(page);
    await page.goto(`${baseUrl}/?skipIntro=1&demoGraph=1&graph_audit=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.graph-node-label').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="particle-field"]')?.getAttribute('data-graph-progress') || 0) >= 0.999,
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(evidenceDir, 'graph-desktop.png') });
    const before = await page.locator('.graph-node-label').evaluateAll((labels) => labels.map((label) => label.style.transform));
    const diamondBefore = Number(
      (await page.locator('[data-testid="particle-field"]').getAttribute('data-graph-diamond-rotation')) || 0,
    );
    const diamondRotationAxis = await page
      .locator('[data-testid="particle-field"]')
      .getAttribute('data-graph-diamond-rotation-axis');
    await page.waitForTimeout(3000);
    const after = await page.locator('.graph-node-label').evaluateAll((labels) => labels.map((label) => label.style.transform));
    const diamondAfter = Number(
      (await page.locator('[data-testid="particle-field"]').getAttribute('data-graph-diamond-rotation')) || 0,
    );
    const diamondDelta = Math.abs(((diamondAfter - diamondBefore + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const maxDrift = before.reduce((maximum, transform, index) => {
      const values = transform.match(/translate3d\(([-0-9.]+)px, ([-0-9.]+)px/)?.slice(1).map(Number) || [0, 0];
      const nextValues = after[index]?.match(/translate3d\(([-0-9.]+)px, ([-0-9.]+)px/)?.slice(1).map(Number) || [0, 0];
      return Math.max(maximum, Math.hypot(values[0] - nextValues[0], values[1] - nextValues[1]));
    }, 0);
    assertCondition(maxDrift < 2, `Graph labels drifted ${maxDrift.toFixed(2)}px while the route layer was locked`);
    assertCondition(diamondRotationAxis === 'y', `Graph diamond used ${diamondRotationAxis || 'no'} rotation axis instead of Y`);
    assertCondition(
      diamondDelta >= 0.36 && diamondDelta <= 0.75,
      `Graph diamond did not yaw slowly and continuously: ${diamondDelta.toFixed(3)}rad in 3s`,
    );
    assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `Graph errors: ${JSON.stringify(signals)}`);
    await context.close();
    return {
      diamondDeltaRadians: round(diamondDelta),
      diamondRotationAxis,
      maxLabelDriftPx: round(maxDrift),
      screenshot: path.join(evidenceDir, 'graph-desktop.png'),
    };
  });

  if (recommendationId) {
    await runCheck('hero-hall-desktop-share-and-download', async () => {
      const context = await browser.newContext({
        acceptDownloads: true,
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { height: 900, width: 1440 },
      });
      const page = await context.newPage();
      const signals = attachRuntimeSignals(page);
      const url = `${baseUrl}/?agent_combination=1&id=${encodeURIComponent(recommendationId)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForFunction(() => [...document.images].every((image) => image.complete), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const layout = await inspectLayout(page);
      const recommendedCards = await page.locator('.agent-combination-card-section[data-variant="recommended"] .agent-combination-agent-card').count();
      const lineupSlots = await page.locator('.agent-combination-lineup-slot').count();
      const candidateCards = await page.locator('.agent-combination-candidate-card').count();
      assertCondition(recommendedCards === 5, `Hero Hall rendered ${recommendedCards} recommended cards`);
      assertCondition(lineupSlots === 5, `Hero Hall rendered ${lineupSlots} lineup slots`);
      assertCondition(candidateCards > 0, 'Hero Hall candidate pool is empty');
      assertCondition(layout.brokenImages.length === 0, `Hero Hall has broken images: ${layout.brokenImages.slice(0, 5).join(', ')}`);
      assertCondition(!layout.overflowX, 'Hero Hall overflows horizontally on desktop');
      assertCondition(layout.undersizedControls.length === 0, `Hero Hall has undersized controls: ${JSON.stringify(layout.undersizedControls)}`);
      const readOnlySave = page.getByRole('button', { exact: true, name: '分享只读' });
      assertCondition((await readOnlySave.count()) === 1 && (await readOnlySave.isDisabled()), 'Shared Hero Hall did not enter read-only mode');
      assertCondition((await page.locator('.agent-combination-candidate-card:not(:disabled)').count()) === 0, 'Shared Hero Hall still allows candidate edits');
      await page.screenshot({ path: path.join(evidenceDir, 'hero-hall-desktop.png'), fullPage: false });

      await page.getByRole('button', { exact: true, name: '分享殿堂' }).click();
      const dialog = page.getByRole('dialog', { name: '分享英雄殿堂' });
      await dialog.waitFor({ state: 'visible' });
      const qr = dialog.locator('canvas');
      assertCondition((await qr.count()) === 1, 'Share dialog missed its QR canvas');
      const qrData = await qr.evaluate((canvas) => canvas.toDataURL('image/png'));
      assertCondition(qrData.startsWith('data:image/png;base64,'), 'QR canvas did not produce PNG data');
      await dialog.getByRole('button', { exact: true, name: '复制链接' }).click();
      await dialog.getByRole('button', { exact: true, name: '已复制' }).waitFor({ state: 'visible', timeout: 3000 });
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      assertCondition(clipboardText === url, `Clipboard URL mismatch: ${clipboardText}`);
      const downloadLink = dialog.getByRole('link', { exact: true, name: '保存二维码' });
      const downloadPromise = page.waitForEvent('download');
      await downloadLink.click();
      const download = await downloadPromise;
      assertCondition(download.suggestedFilename() === `agent-hero-hall-${recommendationId}.png`, 'QR filename is incorrect');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.classList.contains('agent-combination-share-trigger'), null, { timeout: 2000 });
      assertCondition(await page.getByRole('button', { exact: true, name: '分享殿堂' }).evaluate((button) => button === document.activeElement), 'Focus did not return to the share trigger');

      const recommendedFilter = page.getByRole('button', { name: /^推荐优先\s+\d+$/ });
      await recommendedFilter.click();
      const filteredCards = await page.locator('.agent-combination-candidate-card').count();
      assertCondition(filteredCards === 5, `Recommended filter returned ${filteredCards} candidates`);
      assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `Hero Hall errors: ${JSON.stringify(signals)}`);
      assertCondition(signals.httpErrors.length === 0 && signals.failedRequests.length === 0, `Hero Hall network errors: ${JSON.stringify(signals)}`);
      await context.close();
      return {
        candidateCards,
        clipboardCopied: true,
        filteredCards,
        layout,
        lineupSlots,
        qrBytesEstimate: Math.round((qrData.length * 3) / 4),
        qrDownloaded: true,
        recommendedCards,
      };
    });

    if (recommendationEditToken) {
      await runCheck('hero-hall-lineup-ui-save-and-reload', async () => {
      const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
      await grantRecommendationEditAccess(context);
      const page = await context.newPage();
      const signals = attachRuntimeSignals(page);
      const entryUrl = `${baseUrl}/?agent_combination=1&id=${encodeURIComponent(recommendationId)}`;
      const combinationUrl = `${baseUrl}/api/combination-agents/by-recommendation/${encodeURIComponent(recommendationId)}`;
      const apiSession = await createNodeApiSession(baseUrl);
      const originalResponse = await fetch(`${combinationUrl}?optional=1`);
      const originalCombination = originalResponse.ok ? await originalResponse.json() : null;

      assertCondition(originalCombination?.lineup?.length > 0, 'UI persistence audit requires an existing test lineup to restore');

      try {
        await page.goto(entryUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 20000 });
        await page.locator('.agent-combination-candidate-card').first().waitFor({ state: 'visible', timeout: 20000 });
        await page.getByRole('button', { exact: true, name: '重置阵容' }).click();
        assertCondition((await page.locator('.agent-combination-lineup-slot.has-agent').count()) === 0, 'Reset did not empty the UI lineup');

        const candidates = page.locator('.agent-combination-candidate-card');
        assertCondition((await candidates.count()) >= 10, 'Not enough candidate agents for a distinct persistence test lineup');
        for (let index = 5; index < 10; index += 1) {
          await candidates.nth(index).click();
        }

        const composedNames = await page.locator('.agent-combination-lineup-slot.has-agent .agent-combination-slot-copy strong').allTextContents();
        assertCondition(composedNames.length === 5, `UI only composed ${composedNames.length} lineup agents`);
        await page.getByRole('button', { exact: true, name: '保存阵容' }).click();
        await page.getByRole('button', { exact: true, name: '已保存' }).waitFor({ state: 'visible', timeout: 10000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 20000 });
        await page.waitForFunction(
          () => document.querySelectorAll('.agent-combination-lineup-slot.has-agent').length === 5,
          null,
          { timeout: 10000 },
        );
        const persistedNames = await page.locator('.agent-combination-lineup-slot.has-agent .agent-combination-slot-copy strong').allTextContents();
        assertCondition(JSON.stringify(persistedNames) === JSON.stringify(composedNames), `Reloaded lineup mismatch: ${JSON.stringify(persistedNames)}`);
        assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `Lineup UI errors: ${JSON.stringify(signals)}`);
        assertCondition(signals.httpErrors.length === 0 && signals.failedRequests.length === 0, `Lineup UI network errors: ${JSON.stringify(signals)}`);

        return { composedNames, persistedNames, restoredOriginal: true };
      } finally {
        const restoreResponse = await fetchWithNodeApiSession(apiSession, combinationUrl, {
          body: JSON.stringify({
            lineup: originalCombination.lineup,
            score: originalCombination.score || {},
            title: originalCombination.title || '',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        }, recommendationEditToken);
        assertCondition(restoreResponse.ok, `Failed to restore original test lineup: ${restoreResponse.status}`);
        await context.close();
      }
      });
    }

    await runCheck('share-dialog-focus-trap', async () => {
      const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
      const page = await context.newPage();
      const url = `${baseUrl}/?agent_combination=1&id=${encodeURIComponent(recommendationId)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { exact: true, name: '分享殿堂' }).click();
      const dialog = page.getByRole('dialog', { name: '分享英雄殿堂' });
      await dialog.waitFor({ state: 'visible' });
      await page.keyboard.press('Shift+Tab');
      const focusInsideDialog = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
      const backgroundInert = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const main = document.querySelector('main');
        return Boolean(dialog && main && (main.hasAttribute('inert') || main.getAttribute('aria-hidden') === 'true'));
      });
      await context.close();
      assertCondition(focusInsideDialog && backgroundInert, `Modal accessibility failed: focusInside=${focusInsideDialog}, backgroundInert=${backgroundInert}`);
      return { backgroundInert, focusInsideDialog };
    });

    await runCheck('hero-hall-mobile-layout', async () => {
      const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
      const page = await context.newPage();
      const signals = attachRuntimeSignals(page);
      const url = `${baseUrl}/?agent_combination=1&id=${encodeURIComponent(recommendationId)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('.agent-combination-entry-page').waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForTimeout(700);
      const layout = await inspectLayout(page);
      assertCondition(!layout.overflowX, `Mobile Hero Hall has ${layout.scrollWidth}px horizontal overflow`);
      assertCondition(layout.brokenImages.length === 0, 'Mobile Hero Hall has broken images');
      assertCondition(layout.undersizedControls.length === 0, `Mobile Hero Hall has undersized controls: ${JSON.stringify(layout.undersizedControls)}`);
      await page.getByRole('button', { exact: true, name: '分享殿堂' }).click();
      const dialog = page.getByRole('dialog', { name: '分享英雄殿堂' });
      await dialog.waitFor({ state: 'visible' });
      const dialogRect = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      });
      assertCondition(dialogRect.left >= 0 && dialogRect.right <= 390 && dialogRect.top >= 0 && dialogRect.bottom <= 844, `Share dialog exceeds mobile viewport: ${JSON.stringify(dialogRect)}`);
      await page.screenshot({ path: path.join(evidenceDir, 'hero-hall-mobile-share.png'), fullPage: false });
      assertCondition(signals.consoleErrors.length === 0 && signals.pageErrors.length === 0, `Mobile Hero Hall errors: ${JSON.stringify(signals)}`);
      await context.close();
      return { dialogRect, layout, screenshot: path.join(evidenceDir, 'hero-hall-mobile-share.png') };
    });
  }
} finally {
  await browser.close();
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
