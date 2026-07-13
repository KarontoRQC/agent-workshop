export type ParticleIndexRange = {
  end: number;
  start: number;
};

export type ParticleUpdateRange = ParticleIndexRange & {
  count: number;
};

export type ParticlePerformanceTier = 'full' | 'balanced' | 'constrained';

export type InitialParticlePerformance = {
  drawRatio: number;
  renderQualityScale: number;
  tier: ParticlePerformanceTier;
};

const MIN_SIMULATION_SLICES = 2;
const MAX_SIMULATION_SLICES = 10;
const MIN_RENDER_QUALITY_SCALE = 0.5;
const MIN_PARTICLE_DRAW_RATIO = 0.3;

export function isSoftwareWebGLRenderer(rendererName: string) {
  return /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(rendererName);
}

export function frameAdjustedLerp(amount: number, frameUnits = 1) {
  const normalizedAmount = Math.min(1, Math.max(0, amount));
  const normalizedFrameUnits = Math.max(0, frameUnits);

  return 1 - Math.pow(1 - normalizedAmount, normalizedFrameUnits);
}

export function getBaseSimulationSlices(width: number, hardwareConcurrency = 8) {
  const compactBase = width < 720 ? 3 : 4;
  return Math.min(MAX_SIMULATION_SLICES, compactBase + (hardwareConcurrency <= 4 ? 2 : 0));
}

export function adaptSimulationSlices(current: number, base: number, averageCostMs: number) {
  const normalizedBase = Math.min(MAX_SIMULATION_SLICES, Math.max(MIN_SIMULATION_SLICES, base));
  const normalizedCurrent = Math.min(MAX_SIMULATION_SLICES, Math.max(normalizedBase, current));

  if (averageCostMs > 13) {
    return Math.min(MAX_SIMULATION_SLICES, normalizedCurrent + 2);
  }

  if (averageCostMs > 7.5) {
    return Math.min(MAX_SIMULATION_SLICES, normalizedCurrent + 1);
  }

  if (averageCostMs < 3.8 && normalizedCurrent > normalizedBase) {
    return normalizedCurrent - 1;
  }

  return normalizedCurrent;
}

export function adaptRenderQualityScale(
  current: number,
  averageWorkCostMs: number,
  frameBudgetMs: number,
  observedFrameIntervalMs = 0,
) {
  const normalizedCurrent = Math.min(1, Math.max(MIN_RENDER_QUALITY_SCALE, current));
  const normalizedFrameBudget = Math.max(1, frameBudgetMs);
  const intervalPressure = observedFrameIntervalMs > 0 ? observedFrameIntervalMs / normalizedFrameBudget : 0;

  if (intervalPressure > 2.2) {
    return Math.max(MIN_RENDER_QUALITY_SCALE, normalizedCurrent - 0.12);
  }

  if (intervalPressure > 1.65) {
    return Math.max(MIN_RENDER_QUALITY_SCALE, normalizedCurrent - 0.08);
  }

  if (intervalPressure > 1.28) {
    return Math.max(MIN_RENDER_QUALITY_SCALE, normalizedCurrent - 0.05);
  }

  if (averageWorkCostMs > normalizedFrameBudget * 0.82) {
    return Math.max(MIN_RENDER_QUALITY_SCALE, normalizedCurrent - 0.05);
  }

  if (
    averageWorkCostMs > 0 &&
    averageWorkCostMs < normalizedFrameBudget * 0.45 &&
    (intervalPressure === 0 || intervalPressure < 1.08)
  ) {
    return Math.min(1, normalizedCurrent + 0.025);
  }

  return normalizedCurrent;
}

export function adaptParticleDrawRatio(current: number, actualFrameRate: number, targetFrameRate: number) {
  const normalizedCurrent = Math.min(1, Math.max(MIN_PARTICLE_DRAW_RATIO, current));

  if (actualFrameRate <= 0 || targetFrameRate <= 0) {
    return normalizedCurrent;
  }

  const frameRateRatio = actualFrameRate / targetFrameRate;

  if (frameRateRatio < 0.42) {
    return Math.max(MIN_PARTICLE_DRAW_RATIO, normalizedCurrent - 0.14);
  }

  if (frameRateRatio < 0.62) {
    return Math.max(MIN_PARTICLE_DRAW_RATIO, normalizedCurrent - 0.09);
  }

  if (frameRateRatio < 0.78) {
    return Math.max(MIN_PARTICLE_DRAW_RATIO, normalizedCurrent - 0.06);
  }

  if (frameRateRatio < 0.9) {
    return Math.max(MIN_PARTICLE_DRAW_RATIO, normalizedCurrent - 0.03);
  }

  if (frameRateRatio > 0.96) {
    return Math.min(1, normalizedCurrent + 0.02);
  }

  return normalizedCurrent;
}

export function getInitialParticlePerformance(
  width: number,
  hardwareConcurrency = 8,
  deviceMemory = 8,
  devicePixelRatio = 1,
): InitialParticlePerformance {
  const severelyLimited = hardwareConcurrency <= 2 || deviceMemory <= 2;
  const compactHighDensity = width < 720 && devicePixelRatio >= 2;
  const limited = hardwareConcurrency <= 4 || deviceMemory <= 4 || compactHighDensity || devicePixelRatio >= 2.5;

  if (severelyLimited) {
    return { drawRatio: 0.66, renderQualityScale: 0.74, tier: 'constrained' };
  }

  if (limited) {
    return { drawRatio: 0.82, renderQualityScale: 0.86, tier: 'balanced' };
  }

  return { drawRatio: 1, renderQualityScale: 1, tier: 'full' };
}

export function resolveParticlePerformanceTier(
  drawRatio: number,
  renderQualityScale: number,
  actualFrameRate: number,
  targetFrameRate: number,
): ParticlePerformanceTier {
  const frameRateRatio = actualFrameRate > 0 && targetFrameRate > 0 ? actualFrameRate / targetFrameRate : 1;

  if (drawRatio >= 0.92 && renderQualityScale >= 0.9 && frameRateRatio >= 0.86) {
    return 'full';
  }

  if (drawRatio >= 0.68 && renderQualityScale >= 0.74 && frameRateRatio >= 0.54) {
    return 'balanced';
  }

  return 'constrained';
}

export function buildProgressiveParticleIndices(
  roleRanges: ParticleIndexRange[],
  target: Uint16Array | Uint32Array,
) {
  const roleCounts = roleRanges.map((range) => Math.max(0, range.end - range.start));
  const roleCursors = roleCounts.map(() => 0);
  const particleCount = roleCounts.reduce((sum, count) => sum + count, 0);

  if (target.length < particleCount) {
    throw new RangeError(`Particle index target is too small: ${target.length} < ${particleCount}`);
  }

  for (let outputIndex = 0; outputIndex < particleCount; outputIndex += 1) {
    let selectedRole = -1;
    let selectedProgress = Number.POSITIVE_INFINITY;

    for (let roleIndex = 0; roleIndex < roleRanges.length; roleIndex += 1) {
      const roleCount = roleCounts[roleIndex];
      const roleCursor = roleCursors[roleIndex];

      if (roleCursor >= roleCount || roleCount === 0) {
        continue;
      }

      const nextProgress = (roleCursor + 1) / roleCount;
      if (nextProgress < selectedProgress) {
        selectedProgress = nextProgress;
        selectedRole = roleIndex;
      }
    }

    if (selectedRole < 0) {
      break;
    }

    target[outputIndex] = roleRanges[selectedRole].start + roleCursors[selectedRole];
    roleCursors[selectedRole] += 1;
  }

  return target;
}

export function scaleParticleRanges(
  roleRanges: ParticleIndexRange[],
  drawRatio: number,
  target: ParticleIndexRange[],
) {
  const normalizedDrawRatio = Math.min(1, Math.max(MIN_PARTICLE_DRAW_RATIO, drawRatio));
  target.length = 0;

  for (const roleRange of roleRanges) {
    const roleCount = Math.max(0, roleRange.end - roleRange.start);
    if (roleCount === 0) {
      continue;
    }

    const activeCount = Math.max(1, Math.floor(roleCount * normalizedDrawRatio));
    target.push({ start: roleRange.start, end: roleRange.start + activeCount });
  }

  return target;
}

export function buildParticleUpdateRanges(
  roleRanges: ParticleIndexRange[],
  sliceIndex: number,
  sliceCount: number,
  target: ParticleUpdateRange[],
) {
  const normalizedSliceCount = Math.max(1, Math.floor(sliceCount));
  const normalizedSliceIndex = ((Math.floor(sliceIndex) % normalizedSliceCount) + normalizedSliceCount) % normalizedSliceCount;
  target.length = 0;

  for (const roleRange of roleRanges) {
    const roleCount = Math.max(0, roleRange.end - roleRange.start);
    const start = roleRange.start + Math.floor((roleCount * normalizedSliceIndex) / normalizedSliceCount);
    const end = roleRange.start + Math.floor((roleCount * (normalizedSliceIndex + 1)) / normalizedSliceCount);

    if (end > start) {
      target.push({ count: end - start, end, start });
    }
  }

  return target;
}
