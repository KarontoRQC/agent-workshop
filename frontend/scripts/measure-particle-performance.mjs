import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = String(process.argv[2] || 'http://127.0.0.1:5200').replace(/\/+$/, '');
const cpuRate = Math.max(1, Number(process.env.CPU_RATE || 4));
const sampleMs = Math.max(2000, Number(process.env.SAMPLE_MS || 5000));
const warmupMs = Math.max(500, Number(process.env.WARMUP_MS || 3000));
const outputPath = process.env.PERF_OUTPUT ? path.resolve(process.env.PERF_OUTPUT) : '';
const cases = [
  { height: 900, name: 'desktop-idle', query: 'skipIntro=1', width: 1440 },
  { height: 900, name: 'desktop-graph', query: 'skipIntro=1&demoGraph=1', width: 1440 },
  { height: 844, name: 'mobile-idle', query: 'skipIntro=1', width: 390 },
  { height: 844, name: 'mobile-graph', query: 'skipIntro=1&demoGraph=1', width: 390 },
];

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const results = [];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { height: testCase.height, width: testCase.width } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await page.goto(`${baseUrl}/?${testCase.query}&particle_perf=${Date.now()}`, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-testid="particle-field"] canvas', { timeout: 15000 });
    await page.waitForTimeout(warmupMs);

    const metrics = await page.evaluate(async ({ duration }) => {
      const longTasks = [];
      let observer;

      if ('PerformanceObserver' in window) {
        try {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              longTasks.push(entry.duration);
            }
          });
          observer.observe({ buffered: false, type: 'longtask' });
        } catch {
          observer = undefined;
        }
      }

      const intervals = [];
      let previous = 0;
      const started = performance.now();
      await new Promise((resolve) => {
        const tick = (now) => {
          if (previous) {
            intervals.push(now - previous);
          }
          previous = now;
          if (now - started >= duration) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      });
      observer?.disconnect();
      intervals.sort((left, right) => left - right);
      const percentile = (ratio) =>
        intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * ratio))] || 0;
      const field = document.querySelector('[data-testid="particle-field"]');
      const canvas = field?.querySelector('canvas');

      return {
        canvas: canvas
          ? {
              backingHeight: canvas.height,
              backingWidth: canvas.width,
              cssHeight: canvas.clientHeight,
              cssWidth: canvas.clientWidth,
            }
          : null,
        fps: Number(((intervals.length * 1000) / duration).toFixed(1)),
        actualFrameRate: Number(field?.getAttribute('data-actual-frame-rate') || 0),
        frameIntervalMs: Number(field?.getAttribute('data-frame-interval') || 0),
        longTaskCount: longTasks.length,
        longTaskMs: Number(longTasks.reduce((sum, value) => sum + value, 0).toFixed(1)),
        over34Ms: intervals.filter((value) => value > 34).length,
        p50FrameMs: Number(percentile(0.5).toFixed(2)),
        p95FrameMs: Number(percentile(0.95).toFixed(2)),
        particleCount: Number(field?.getAttribute('data-particle-count') || 0),
        particleDrawRatio: Number(field?.getAttribute('data-particle-draw-ratio') || 0),
        performanceTier: field?.getAttribute('data-performance-tier') || '',
        renderPixelRatio: Number(field?.getAttribute('data-render-pixel-ratio') || 0),
        renderQualityScale: Number(field?.getAttribute('data-render-quality-scale') || 0),
        renderedParticleCount: Number(field?.getAttribute('data-rendered-particle-count') || 0),
        rendererClass: field?.getAttribute('data-renderer-class') || '',
        rootPerformanceTier: document.documentElement.getAttribute('data-visual-performance') || '',
        frameWorkCostMs: Number(field?.getAttribute('data-frame-work-cost') || 0),
        simulationSlices: Number(field?.getAttribute('data-simulation-slices') || 0),
        targetFrameRate: Number(field?.getAttribute('data-target-frame-rate') || 0),
      };
    }, { duration: sampleMs });

    results.push({ ...testCase, ...metrics, consoleErrors: errors });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  baseUrl,
  cpuRate,
  generatedAt: new Date().toISOString(),
  results,
  sampleMs,
  warmupMs,
};
const output = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

process.stdout.write(output);
