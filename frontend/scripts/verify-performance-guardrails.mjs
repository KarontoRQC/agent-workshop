import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const particleSource = fs.readFileSync('src/components/ParticleField.tsx', 'utf8');
const frameBudgetSource = fs.readFileSync('src/components/particleFrameBudget.ts', 'utf8');
const appSource = fs.readFileSync('src/App.tsx', 'utf8');
const appCss = fs.readFileSync('src/App.css', 'utf8');
const frameBudgetModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(frameBudgetSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString('base64')}`
);

assert.match(
  particleSource,
  /performanceMode\?: 'active' \| 'background';/,
  'ParticleField must expose a performance mode for heavy overlay states.',
);
assert.match(
  particleSource,
  /const ACTIVE_RENDER_PIXEL_RATIO_CAP = 1\.5;[\s\S]*?const BACKGROUND_RENDER_PIXEL_RATIO_CAP = 1\.1;/,
  'ParticleField must cap high-DPR canvas backing resolution without changing the visual design.',
);
assert.match(
  particleSource,
  /const ACTIVE_RENDER_PIXEL_BUDGET = 2_500_000;[\s\S]*?const BACKGROUND_RENDER_PIXEL_BUDGET = 1_100_000;/,
  'ParticleField must cap total backing pixels on large displays.',
);
assert.match(
  particleSource,
  /preserveDrawingBuffer: false,/,
  'ParticleField should not preserve the drawing buffer during normal rendering.',
);
assert.match(
  particleSource,
  /antialias: false,/,
  'Soft point sprites should avoid redundant full-canvas MSAA work.',
);
assert.match(
  particleSource,
  /adaptRenderQualityScale\([\s\S]*?frameWorkCostAverage[\s\S]*?minFrameInterval[\s\S]*?renderFrameIntervalAverage/,
  'ParticleField must adapt backing resolution from real frame cadence as well as CPU work.',
);
assert.match(
  particleSource,
  /adaptParticleDrawRatio\([\s\S]*?particleDrawRatio[\s\S]*?actualFrameRate[\s\S]*?ACTIVE_FRAME_RATE/,
  'ParticleField must reduce actual GPU draw count when observed frame rate is low.',
);
assert.match(
  particleSource,
  /host\.dataset\.actualFrameRate/,
  'ParticleField must expose observed render rate for hardware-browser verification.',
);
assert.match(
  particleSource,
  /const targetFrameRate = document\.hidden[\s\S]*?HIDDEN_FRAME_RATE[\s\S]*?BACKGROUND_FRAME_RATE[\s\S]*?IDLE_FRAME_RATE[\s\S]*?ACTIVE_FRAME_RATE;/,
  'ParticleField must throttle hidden, background, and idle frame rates.',
);
assert.match(
  particleSource,
  /buildParticleUpdateRanges\(activeParticleRoleRanges, simulationSliceIndex, simulationSlices, particleUpdateRanges\)/,
  'ParticleField must split CPU particle simulation into role-balanced slices.',
);
assert.match(
  particleSource,
  /positionAttribute\.addUpdateRange\(updateRange\.start \* 3, updateRange\.count \* 3\)/,
  'ParticleField must upload only the particle ranges changed in the current frame.',
);
assert.match(
  particleSource,
  /buildProgressiveParticleIndices\(particleRoleRanges, progressiveParticleIndices\)[\s\S]*?geometry\.setIndex\(renderIndexAttribute\)/,
  'Adaptive draw reduction must use a role-balanced progressive index buffer.',
);
assert.match(
  particleSource,
  /scaleParticleRanges\(particleRoleRanges, particleDrawRatio, activeParticleRoleRanges\)[\s\S]*?geometry\.setDrawRange\(0, renderedParticleCount\)/,
  'CPU simulation ranges and GPU draw range must shrink together.',
);
assert.match(
  particleSource,
  /rootElement\.dataset\.visualPerformance = tier/,
  'Runtime performance tier must be exposed to CSS compositing safeguards.',
);
assert.match(
  particleSource,
  /WEBGL_debug_renderer_info[\s\S]*?isSoftwareWebGLRenderer\(rendererName\)[\s\S]*?setPerformanceTier\('constrained'\)/,
  'Software WebGL renderers must start in constrained mode instead of stalling before adaptation.',
);
assert.match(
  particleSource,
  /if \(graphEffectsActive\) \{[\s\S]*?focusDistanceSq/,
  'Expensive graph focus math must stay disabled while no graph route is visible.',
);
assert.match(
  particleSource,
  /pendingGraphFocusKey[\s\S]*?!simulationWarmupPending[\s\S]*?frameNow - lastGraphFocusAttemptAt >= 120[\s\S]*?if \(chooseGraphFocus\(\)\) \{[\s\S]*?pendingGraphFocusKey = ''/,
  'Lazy production startup must retry graph-node locking until particle warmup produces usable candidates.',
);
assert.doesNotMatch(
  particleSource,
  /const labelBounds = label\.getBoundingClientRect\(\);/,
  'Graph label layout must not be measured for every label on every frame.',
);
assert.match(
  particleSource,
  /data-performance-mode=\{performanceMode\}/,
  'ParticleField DOM should expose the current performance mode for browser verification.',
);
assert.match(
  appSource,
  /performanceMode="active"/,
  'App should keep the particle field active now that the legacy Hero Hall popup is not mounted.',
);
assert.match(
  appSource,
  /const ParticleField = lazy\(\(\) => import\('\.\/components\/ParticleField'\)\);/,
  'Three.js particle rendering must be split from the initial application bundle.',
);
assert.match(
  appSource,
  /<Suspense fallback=\{<div className="particle-field" aria-hidden="true" \/>\}>[\s\S]*?<ParticleField/,
  'Lazy particle loading must preserve the full-screen field layout while its chunk loads.',
);
assert.doesNotMatch(
  appSource,
  /import ParticleField from '\.\/components\/ParticleField';/,
  'ParticleField must not return to the eager entry bundle.',
);
assert.doesNotMatch(
  appSource,
  /<AgentHeroHall/,
  'The legacy Hero Hall popup must not be mounted on the main page.',
);
assert.match(
  appCss,
  /html\[data-visual-performance='constrained'\][\s\S]*?\.space-cruise-backdrop::before[\s\S]*?animation: none;/,
  'Constrained devices must stop the full-screen blend animations while preserving the static visual layer.',
);

const ranges = frameBudgetModule.buildParticleUpdateRanges(
  [
    { start: 0, end: 100 },
    { start: 100, end: 160 },
  ],
  2,
  4,
  [],
);
assert.deepEqual(ranges, [
  { start: 50, end: 75, count: 25 },
  { start: 130, end: 145, count: 15 },
]);
assert.equal(frameBudgetModule.getBaseSimulationSlices(390, 8), 3);
assert.equal(frameBudgetModule.getBaseSimulationSlices(1440, 8), 4);
assert.equal(frameBudgetModule.adaptSimulationSlices(4, 4, 18), 6);
assert.equal(frameBudgetModule.adaptRenderQualityScale(1, 20, 20), 0.95);
assert.equal(frameBudgetModule.adaptRenderQualityScale(0.5, 20, 20), 0.5);
assert.equal(frameBudgetModule.adaptRenderQualityScale(0.9, 4, 20), 0.925);
assert.equal(frameBudgetModule.adaptRenderQualityScale(1, 4, 20, 50), 0.88);
assert.equal(frameBudgetModule.adaptParticleDrawRatio(1, 20, 60), 0.86);
assert.equal(frameBudgetModule.adaptParticleDrawRatio(0.3, 20, 60), 0.3);
assert.deepEqual(frameBudgetModule.getInitialParticlePerformance(1440, 8, 8, 1), {
  drawRatio: 1,
  renderQualityScale: 1,
  tier: 'full',
});
assert.equal(frameBudgetModule.getInitialParticlePerformance(390, 4, 4, 3).tier, 'balanced');
assert.equal(frameBudgetModule.getInitialParticlePerformance(1440, 2, 2, 1).tier, 'constrained');
assert.equal(frameBudgetModule.resolveParticlePerformanceTier(0.5, 0.65, 20, 60), 'constrained');
assert.equal(frameBudgetModule.isSoftwareWebGLRenderer('ANGLE (Google, Vulkan SwiftShader Device)'), true);
assert.equal(frameBudgetModule.isSoftwareWebGLRenderer('llvmpipe (LLVM 17.0.6, 256 bits)'), true);
assert.equal(frameBudgetModule.isSoftwareWebGLRenderer('ANGLE (NVIDIA GeForce RTX 4060 Direct3D11)'), false);
assert.ok(frameBudgetModule.frameAdjustedLerp(0.1, 4) > 0.3);

const progressiveIndices = frameBudgetModule.buildProgressiveParticleIndices(
  [
    { start: 0, end: 100 },
    { start: 100, end: 160 },
  ],
  new Uint16Array(160),
);
assert.equal(new Set(progressiveIndices).size, 160);
assert.equal([...progressiveIndices.slice(0, 80)].filter((index) => index < 100).length, 50);
assert.equal([...progressiveIndices.slice(0, 80)].filter((index) => index >= 100).length, 30);
assert.deepEqual(
  frameBudgetModule.scaleParticleRanges(
    [
      { start: 0, end: 100 },
      { start: 100, end: 160 },
    ],
    0.5,
    [],
  ),
  [
    { start: 0, end: 50 },
    { start: 100, end: 130 },
  ],
);

console.log('Performance guardrails verified.');
