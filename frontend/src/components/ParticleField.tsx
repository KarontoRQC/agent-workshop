import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { DialogueMode, ParticleSettings } from '../types';
import {
  adaptParticleDrawRatio,
  adaptRenderQualityScale,
  adaptSimulationSlices,
  buildProgressiveParticleIndices,
  buildParticleUpdateRanges,
  frameAdjustedLerp,
  getBaseSimulationSlices,
  getInitialParticlePerformance,
  isSoftwareWebGLRenderer,
  resolveParticlePerformanceTier,
  scaleParticleRanges,
  type ParticleIndexRange,
  type ParticleUpdateRange,
} from './particleFrameBudget';

type ParticleFieldProps = {
  audioLevel: number;
  graphFocusKey?: string;
  graphRoute?: string[];
  performanceMode?: 'active' | 'background';
  settings: ParticleSettings;
};

const TAU = Math.PI * 2;
const SEED_STRIDE = 10;
const S_A = 0;
const S_B = 1;
const S_C = 2;
const S_D = 3;
const S_E = 4;
const S_ROLE = 5;
const S_BAND = 6;
const S_WIDTH = 7;
const S_FLOW = 8;
const S_SHADE = 9;

const ROLE_CORE = 0;
const ROLE_SHELL = 1;
const ROLE_RIBBON = 2;
const ROLE_HALO = 3;
const ROLE_METEOR = 4;
// A coarse six-sided ring visibly changes width while yawing. More radial facets
// keep the diamond's silhouette full without scaling or touching its Y axis.
const SHELL_RADIAL_FACET_COUNT = 18;
const SHELL_FACET_ANGLE = TAU / SHELL_RADIAL_FACET_COUNT;
const SHELL_FACET_LOOKUP = Array.from({ length: SHELL_RADIAL_FACET_COUNT }, (_, side) => {
  const sideAngle = side * SHELL_FACET_ANGLE + SHELL_FACET_ANGLE * 0.5;
  const nextAngle = sideAngle + SHELL_FACET_ANGLE;
  const oppositeAngle = sideAngle + Math.PI;

  return {
    baseAx: Math.cos(sideAngle) * 0.84,
    baseAz: Math.sin(sideAngle) * 0.84,
    baseBx: Math.cos(nextAngle) * 0.84,
    baseBz: Math.sin(nextAngle) * 0.84,
    baseOx: Math.cos(oppositeAngle) * 0.64,
    baseOz: Math.sin(oppositeAngle) * 0.64,
  };
});
const STAR_SCALE_BOOST = 1.3;
const STAR_BRIGHTNESS_BOOST = 1.36;
const STAR_SPIN_SPEED = 0.2;
const STAR_TILT_Z = 0;
const INNER_DIAMOND_SPIN_SPEED = 0.58;
const GRAPH_LOCKED_ROTATION = 0;
const GRAPH_DIAMOND_YAW_SPEED = 0.18;
const ACTIVE_RENDER_PIXEL_RATIO_CAP = 1.5;
const COMPACT_RENDER_PIXEL_RATIO_CAP = 1.3;
const BACKGROUND_RENDER_PIXEL_RATIO_CAP = 1.1;
const ACTIVE_RENDER_PIXEL_BUDGET = 2_500_000;
const COMPACT_RENDER_PIXEL_BUDGET = 1_350_000;
const BACKGROUND_RENDER_PIXEL_BUDGET = 1_100_000;
const ACTIVE_DESKTOP_MIN_RENDER_PIXEL_RATIO = 0.58;
const ACTIVE_COMPACT_MIN_RENDER_PIXEL_RATIO = 0.68;
const BACKGROUND_MIN_RENDER_PIXEL_RATIO = 0.6;
const SOFTWARE_RENDER_QUALITY_SCALE = 0.5;
const SOFTWARE_DESKTOP_MIN_RENDER_PIXEL_RATIO = 0.5;
const SOFTWARE_COMPACT_MIN_RENDER_PIXEL_RATIO = 0.6;
const SOFTWARE_DESKTOP_PARTICLE_DRAW_RATIO = 0.3;
const SOFTWARE_COMPACT_PARTICLE_DRAW_RATIO = 0.4;
const DESKTOP_MIN_PARTICLE_DRAW_RATIO = 0.4;
const COMPACT_MIN_PARTICLE_DRAW_RATIO = 0.5;
const IDLE_FRAME_RATE = 60;
const ACTIVE_FRAME_RATE = 60;
const BACKGROUND_FRAME_RATE = 30;
const HIDDEN_FRAME_RATE = 2;
const RENDER_FRAME_TOLERANCE_MS = 1;
const GRAPH_LABEL_FRAME_RATE = 30;
const PIXEL_RATIO_RECHECK_MS = 1000;
const SIMULATION_BUDGET_RECHECK_MS = 520;
const HALO_RING_COUNT = 9;
const HALO_RING_SCALE_BOOST = 1.12;
const METEOR_STREAM_COUNT = 4;
const METEOR_CLUSTER_COUNT = 3;
const METEOR_LINES_PER_CLUSTER = 9;
const METEOR_HEAD_POINTS_PER_CLUSTER = 4;
const OUTER_PARTICLE_BRIGHTNESS_BOOST = 0.92;

const modePalettes: Record<DialogueMode, THREE.Color[]> = {
  idle: ['#f7fbff', '#b6e8ff', '#5fb8ff', '#776dff', '#173571'].map((color) => new THREE.Color(color)),
  listening: ['#ffffff', '#c8f6ff', '#6ad7ff', '#6f8cff', '#1f62d8'].map((color) => new THREE.Color(color)),
  thinking: ['#f4fbff', '#8ee8ff', '#8f7cff', '#5b8cff', '#16306b'].map((color) => new THREE.Color(color)),
  speaking: ['#ffffff', '#e7f5ff', '#78efff', '#9a8dff', '#2f7aff'].map((color) => new THREE.Color(color)),
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const nextValue = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return nextValue * nextValue * (3 - 2 * nextValue);
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function seededUnit(seed: number) {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967295;
}

function seededSigned(seed: number) {
  return seededUnit(seed) * 2 - 1;
}

function sphericalToPoint(theta: number, latitude: number, radius: number, target: THREE.Vector3) {
  const horizontal = Math.cos(latitude);

  target.set(
    Math.cos(theta) * horizontal * radius,
    Math.sin(latitude) * radius,
    Math.sin(theta) * horizontal * radius,
  );
}

function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.22, 'rgba(255, 255, 255, 0.92)');
  gradient.addColorStop(0.56, 'rgba(255, 255, 255, 0.22)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function ParticleField({ audioLevel, graphFocusKey = '', graphRoute = [], performanceMode = 'active', settings }: ParticleFieldProps) {
  const audioLevelRef = useRef(audioLevel);
  const graphFocusKeyRef = useRef(graphFocusKey);
  const graphRouteRef = useRef(graphRoute);
  const hostRef = useRef<HTMLDivElement>(null);
  const performanceModeRef = useRef(performanceMode);
  const settingsRef = useRef(settings);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    graphFocusKeyRef.current = graphFocusKey;
  }, [graphFocusKey]);

  useEffect(() => {
    graphRouteRef.current = graphRoute;
  }, [graphRoute]);

  useEffect(() => {
    performanceModeRef.current = performanceMode;
  }, [performanceMode]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020614, 0.055);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0.08, 6.72);
    const width = host.clientWidth || window.innerWidth;
    const hardwareConcurrency = navigator.hardwareConcurrency || 8;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
    const initialPerformance = getInitialParticlePerformance(
      width,
      hardwareConcurrency,
      deviceMemory,
      window.devicePixelRatio || 1,
    );
    let renderQualityScale = initialPerformance.renderQualityScale;
    let particleDrawRatio = initialPerformance.drawRatio;
    let performanceTier = initialPerformance.tier;
    let softwareRenderer = false;
    const rootElement = document.documentElement;
    const previousRootPerformanceTier = rootElement.dataset.visualPerformance;
    const setPerformanceTier = (tier: typeof performanceTier) => {
      performanceTier = tier;
      host.dataset.performanceTier = tier;
      rootElement.dataset.visualPerformance = tier;
    };
    setPerformanceTier(performanceTier);
    const getRenderPixelRatio = (
      nextWidth = host.clientWidth || window.innerWidth,
      nextHeight = host.clientHeight || window.innerHeight,
    ) => {
      const pixelRatio = window.devicePixelRatio || 1;
      const isBackground = performanceModeRef.current === 'background';
      const isCompact = nextWidth < 720;
      const cap =
        isBackground
          ? BACKGROUND_RENDER_PIXEL_RATIO_CAP
          : isCompact
            ? COMPACT_RENDER_PIXEL_RATIO_CAP
            : ACTIVE_RENDER_PIXEL_RATIO_CAP;
      const pixelBudget = isBackground
        ? BACKGROUND_RENDER_PIXEL_BUDGET
        : isCompact
          ? COMPACT_RENDER_PIXEL_BUDGET
          : ACTIVE_RENDER_PIXEL_BUDGET;
      const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, nextWidth * nextHeight));
      const minimumPixelRatio = softwareRenderer
        ? isCompact
          ? SOFTWARE_COMPACT_MIN_RENDER_PIXEL_RATIO
          : SOFTWARE_DESKTOP_MIN_RENDER_PIXEL_RATIO
        : isBackground
          ? BACKGROUND_MIN_RENDER_PIXEL_RATIO
          : isCompact
            ? ACTIVE_COMPACT_MIN_RENDER_PIXEL_RATIO
            : ACTIVE_DESKTOP_MIN_RENDER_PIXEL_RATIO;

      return Math.max(minimumPixelRatio, Math.min(pixelRatio, cap, budgetRatio) * renderQualityScale);
    };

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      // Point sprites already carry a soft alpha texture; MSAA only multiplies
      // fragment work here and does not improve their visible edge quality.
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x020614, 0);
    const gl = renderer.getContext();
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = String(
      rendererInfo
        ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    );
    softwareRenderer = isSoftwareWebGLRenderer(rendererName);
    host.dataset.rendererClass = softwareRenderer ? 'software' : 'hardware-or-unknown';

    if (softwareRenderer) {
      renderQualityScale = Math.min(renderQualityScale, SOFTWARE_RENDER_QUALITY_SCALE);
      particleDrawRatio = Math.min(
        particleDrawRatio,
        width < 720 ? SOFTWARE_COMPACT_PARTICLE_DRAW_RATIO : SOFTWARE_DESKTOP_PARTICLE_DRAW_RATIO,
      );
      setPerformanceTier('constrained');
    }

    let renderPixelRatio = getRenderPixelRatio(width, host.clientHeight || window.innerHeight);
    renderer.setPixelRatio(renderPixelRatio);
    host.appendChild(renderer.domElement);

    const labelLayer = document.createElement('div');
    labelLayer.className = 'graph-node-label-layer';
    host.appendChild(labelLayer);

    const particleCount = width < 720 ? 15000 : 28000;
    const defaultGraphFocus = new THREE.Vector3(width < 720 ? 0.22 : 0.36, width < 720 ? 0.3 : 0.22, 0.16);
    const graphFocus = defaultGraphFocus.clone();
    const graphFocusTarget = defaultGraphFocus.clone();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * SEED_STRIDE);
    const particlePhases = new Float32Array(particleCount);
    const paletteSlots = new Uint8Array(particleCount);
    const shellRoots = new Float32Array(particleCount);
    const meteorTailOffsets = new Float32Array(particleCount);
    const particleRoleRanges: ParticleIndexRange[] = [];
    let activeRoleRangeStart = 0;
    let activeRole = ROLE_CORE;
    const target = new THREE.Vector3();
    const labelProjection = new THREE.Vector3();
    const cameraLookAt = new THREE.Vector3();
    const cameraLookAtTarget = new THREE.Vector3();

    for (let index = 0; index < particleCount; index += 1) {
      const seedOffset = index * SEED_STRIDE;
      const mix = index / particleCount;
      const role =
        mix < 0.055
          ? ROLE_CORE
          : mix < 0.775
            ? ROLE_SHELL
            : mix < 0.932
              ? ROLE_RIBBON
              : mix < 0.955
                ? ROLE_HALO
                : ROLE_METEOR;

      if (role !== activeRole) {
        particleRoleRanges.push({ end: index, start: activeRoleRangeStart });
        activeRole = role;
        activeRoleRangeStart = index;
      }
      const randomA = Math.random();
      const randomB = Math.random();
      const randomC = Math.random();
      const randomD = Math.random();
      const randomE = Math.random();

      seeds[seedOffset + S_A] = randomA;
      seeds[seedOffset + S_B] = randomB;
      seeds[seedOffset + S_C] = randomC;
      seeds[seedOffset + S_D] = randomD;
      seeds[seedOffset + S_E] = randomE;
      seeds[seedOffset + S_ROLE] = role;
      seeds[seedOffset + S_BAND] = Math.floor(randomA * 5);
      seeds[seedOffset + S_WIDTH] = (randomB - 0.5) * 0.13;
      seeds[seedOffset + S_FLOW] = randomC * 0.38 + 0.72;
      seeds[seedOffset + S_SHADE] = randomD;
      particlePhases[index] = randomE * TAU;
      paletteSlots[index] = (index + Math.floor(randomD * modePalettes.idle.length)) % modePalettes.idle.length;

      if (role === ROLE_SHELL) {
        shellRoots[index] = Math.sqrt(randomA);
      } else if (role === ROLE_METEOR) {
        meteorTailOffsets[index] = Math.pow(randomA, 2.15) * 0.84;
      }

      positions[index * 3] = (randomA - 0.5) * 0.35;
      positions[index * 3 + 1] = (randomB - 0.5) * 0.35;
      positions[index * 3 + 2] = (randomC - 0.5) * 0.35;
    }
    particleRoleRanges.push({ end: particleCount, start: activeRoleRangeStart });
    const progressiveParticleIndices = new Uint16Array(particleCount);
    buildProgressiveParticleIndices(particleRoleRanges, progressiveParticleIndices);
    const activeParticleRoleRanges: ParticleIndexRange[] = [];
    const activeParticleRoleEnds = new Uint32Array(particleRoleRanges.length);

    const geometry = new THREE.BufferGeometry();
    const renderIndexAttribute = new THREE.BufferAttribute(progressiveParticleIndices, 1);
    renderIndexAttribute.setUsage(THREE.StaticDrawUsage);
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(renderIndexAttribute);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', colorAttribute);
    let renderedParticleCount = particleCount;
    const syncParticleDrawBudget = () => {
      scaleParticleRanges(particleRoleRanges, particleDrawRatio, activeParticleRoleRanges);
      activeParticleRoleEnds.fill(0);
      activeParticleRoleRanges.forEach((range, roleIndex) => {
        activeParticleRoleEnds[roleIndex] = range.end;
      });
      renderedParticleCount = Math.max(particleRoleRanges.length, Math.floor(particleCount * particleDrawRatio));
      geometry.setDrawRange(0, renderedParticleCount);
      host.dataset.particleDrawRatio = particleDrawRatio.toFixed(2);
      host.dataset.renderedParticleCount = String(renderedParticleCount);
    };
    syncParticleDrawBudget();
    const maxLockPoints = 10;
    const maxLockEdges = maxLockPoints;
    const lockLinePositions = new Float32Array(maxLockEdges * 6);
    const lockLineGeometry = new THREE.BufferGeometry();
    const lockLinePositionAttribute = new THREE.BufferAttribute(lockLinePositions, 3);
    lockLinePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    lockLineGeometry.setAttribute('position', lockLinePositionAttribute);
    const lockPointPositions = new Float32Array(maxLockPoints * 3);
    const lockPointGeometry = new THREE.BufferGeometry();
    const lockPointPositionAttribute = new THREE.BufferAttribute(lockPointPositions, 3);
    lockPointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    lockPointGeometry.setAttribute('position', lockPointPositionAttribute);
    const warpLineCount = width < 720 ? 56 : 112;
    const warpLinePositions = new Float32Array(warpLineCount * 6);
    const warpSeedA = new Float32Array(warpLineCount);
    const warpSeedB = new Float32Array(warpLineCount);
    const warpSeedC = new Float32Array(warpLineCount);
    for (let warpIndex = 0; warpIndex < warpLineCount; warpIndex += 1) {
      warpSeedA[warpIndex] = seededUnit(warpIndex * 2654435761 + 31);
      warpSeedB[warpIndex] = seededUnit(warpIndex * 2246822519 + 73);
      warpSeedC[warpIndex] = seededUnit(warpIndex * 3266489917 + 109);
    }
    const warpLineGeometry = new THREE.BufferGeometry();
    const warpLinePositionAttribute = new THREE.BufferAttribute(warpLinePositions, 3);
    warpLinePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    warpLineGeometry.setAttribute('position', warpLinePositionAttribute);
    const meteorLineCount = METEOR_STREAM_COUNT * METEOR_CLUSTER_COUNT * METEOR_LINES_PER_CLUSTER;
    const meteorLinePositions = new Float32Array(meteorLineCount * 6);
    const meteorLineGeometry = new THREE.BufferGeometry();
    const meteorLinePositionAttribute = new THREE.BufferAttribute(meteorLinePositions, 3);
    meteorLinePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    meteorLineGeometry.setAttribute('position', meteorLinePositionAttribute);
    const meteorHeadCount = METEOR_STREAM_COUNT * METEOR_CLUSTER_COUNT * METEOR_HEAD_POINTS_PER_CLUSTER;
    const meteorHeadPositions = new Float32Array(meteorHeadCount * 3);
    meteorHeadPositions.fill(999);
    const meteorHeadGeometry = new THREE.BufferGeometry();
    const meteorHeadPositionAttribute = new THREE.BufferAttribute(meteorHeadPositions, 3);
    meteorHeadPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    meteorHeadGeometry.setAttribute('position', meteorHeadPositionAttribute);

    const material = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      depthWrite: false,
      map: createParticleTexture(),
      opacity: 1,
      size: width < 720 ? 0.035 : 0.031,
      sizeAttenuation: true,
      transparent: true,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    points.scale.setScalar((width < 720 ? 1.22 : 1.56) * STAR_SCALE_BOOST);
    scene.add(points);

    const lockLineMaterial = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0x8bdcff,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    const lockLines = new THREE.LineSegments(lockLineGeometry, lockLineMaterial);
    lockLines.scale.copy(points.scale);
    scene.add(lockLines);

    const lockPointMaterial = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xdaf8ff,
      depthTest: false,
      depthWrite: false,
      map: material.map,
      opacity: 0,
      size: width < 720 ? 0.11 : 0.096,
      sizeAttenuation: true,
      transparent: true,
    });
    const lockPoints = new THREE.Points(lockPointGeometry, lockPointMaterial);
    lockPoints.scale.copy(points.scale);
    scene.add(lockPoints);

    const warpLineMaterial = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xbbefff,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    const warpLines = new THREE.LineSegments(warpLineGeometry, warpLineMaterial);
    scene.add(warpLines);

    const meteorLineMaterial = new THREE.LineBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffc48a,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
    const meteorLines = new THREE.LineSegments(meteorLineGeometry, meteorLineMaterial);
    scene.add(meteorLines);

    const meteorHeadMaterial = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xfff0bd,
      depthTest: false,
      depthWrite: false,
      map: material.map,
      opacity: 0,
      size: width < 720 ? 0.17 : 0.145,
      sizeAttenuation: true,
      transparent: true,
    });
    const meteorHeads = new THREE.Points(meteorHeadGeometry, meteorHeadMaterial);
    scene.add(meteorHeads);

    const meteorHeadColor = new THREE.Color('#fff3bf');
    const meteorTailColor = new THREE.Color('#80d6ff');
    const meteorAshColor = new THREE.Color('#5f7fa3');
    const meteorColorScratch = new THREE.Color();

    const startTime = performance.now();
    let lastFrameTime = startTime;
    let lastRenderTime = startTime;
    let lastPixelRatioCheckAt = startTime;
    let lastLabelUpdateAt = -Infinity;
    let lastSimulationBudgetCheckAt = startTime;
    let animationId = 0;
    let pulsePower = 0;
    let renderPulsePower = 0;
    let sceneSpin = 0.16;
    let visibleSceneSpin = sceneSpin;
    let graphLayerSpin = sceneSpin;
    let innerDiamondSpin = sceneSpin;
    let graphDiamondYaw = 0;
    let voiceEnvelope = 0;
    let voiceBeatEnvelope = 0;
    let graphProgress = 0;
    let audioGestureUnlocked = false;
    let warpSfxContext: AudioContext | null = null;
    let lastWarpSfxKey = '';
    let lastWarpSfxAt = -Infinity;
    let lastGraphFocusKey = '';
    let pendingGraphFocusKey = '';
    let lastGraphFocusAttemptAt = -Infinity;
    let lastPulseSeed = settingsRef.current.pulseSeed;
    let hasLockedParticleTargets = false;
    let simulationWarmupPending = true;
    let simulationSliceIndex = 0;
    const baseSimulationSlices = getBaseSimulationSlices(width, hardwareConcurrency);
    let simulationSlices = baseSimulationSlices;
    let simulationCostAverage = 0;
    let frameWorkCostAverage = 0;
    let renderFrameIntervalAverage = 0;
    let actualFrameRate = 0;
    let actualFrameRateWindowStarted = startTime;
    let actualFrameRateFrameCount = 0;
    let reportedFrameRate = 0;
    let reportedSimulationSlices = 0;
    let webglContextLost = false;
    const particleUpdateRanges: ParticleUpdateRange[] = [];
    host.dataset.particleCount = String(particleCount);
    host.dataset.renderPixelRatio = renderPixelRatio.toFixed(2);
    host.dataset.renderQualityScale = renderQualityScale.toFixed(2);
    host.dataset.actualFrameRate = '0';
    host.dataset.frameInterval = '0';
    host.dataset.graphDiamondRotation = '0';
    host.dataset.graphDiamondRotationAxis = 'y';
    host.dataset.graphDiamondRotationSpeed = String(GRAPH_DIAMOND_YAW_SPEED);
    host.dataset.particleDrawRatio = particleDrawRatio.toFixed(2);
    host.dataset.performanceTier = performanceTier;
    host.dataset.renderedParticleCount = String(renderedParticleCount);
    host.dataset.rendererState = 'active';
    type LockedGraphNode = { label: string; particleIndex: number; phase: number; routeIndex: number; x: number; y: number; z: number };
    let lockedGraphNodes: LockedGraphNode[] = [];
    let lockedGraphEdges: [number, number][] = [];
    const lockedParticleTargetActive = new Uint8Array(particleCount);
    const lockedParticleTargetX = new Float32Array(particleCount);
    const lockedParticleTargetY = new Float32Array(particleCount);
    const lockedParticleTargetZ = new Float32Array(particleCount);
    let lockedGraphLabels: HTMLSpanElement[] = [];
    let lockedGraphLabelSizes: { height: number; width: number }[] = [];
    const defaultGraphDisplayCenter = new THREE.Vector3(0, width < 720 ? 0.03 : 0.06, 0.34);
    const graphDisplayCenter = defaultGraphDisplayCenter.clone();
    const graphDisplayCenterTarget = defaultGraphDisplayCenter.clone();

    const clearLockedParticleTargets = () => {
      if (!hasLockedParticleTargets) {
        return;
      }

      lockedParticleTargetActive.fill(0);
      hasLockedParticleTargets = false;
    };

    const clearGraphLabels = () => {
      if (lockedGraphLabels.length === 0) {
        return;
      }

      labelLayer.replaceChildren();
      lockedGraphLabels = [];
      lockedGraphLabelSizes = [];
    };

    const measureGraphLabels = () => {
      lockedGraphLabelSizes = lockedGraphLabels.map((label) => {
        const bounds = label.getBoundingClientRect();
        return {
          height: bounds.height || label.offsetHeight || 0,
          width: bounds.width || label.offsetWidth || 0,
        };
      });
    };

    const syncGraphLabels = (labels: string[]) => {
      labelLayer.replaceChildren();
      lockedGraphLabels = labels.map((label, index) => {
        const element = document.createElement('span');
        element.className = 'graph-node-label';
        element.dataset.index = String(index + 1);
        element.textContent = label;
        element.title = label;
        labelLayer.appendChild(element);
        return element;
      });
      measureGraphLabels();
    };

    const updateGraphLabels = (
      localGraphReveal: number,
      deepCollapse: number,
      innerDiamondCos: number,
      innerDiamondSin: number,
    ) => {
      if (lockedGraphLabels.length === 0) {
        return;
      }

      const hostWidth = host.clientWidth || window.innerWidth;
      const hostHeight = host.clientHeight || window.innerHeight;
      const labelOpacity = clamp(localGraphReveal, 0, 1);

      lockPoints.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);

      lockedGraphLabels.forEach((label, index) => {
        const node = lockedGraphNodes[index];

        if (!node) {
          label.style.opacity = '0';
          return;
        }

        const orbitX = node.x * innerDiamondCos - node.z * innerDiamondSin;
        const orbitZ = node.x * innerDiamondSin + node.z * innerDiamondCos;

        labelProjection.set(
          graphDisplayCenter.x + orbitX,
          graphDisplayCenter.y + node.y,
          graphDisplayCenter.z + deepCollapse * 0.12 + orbitZ,
        );
        lockPoints.localToWorld(labelProjection);
        labelProjection.project(camera);

        const isVisible =
          labelProjection.z >= -1 &&
          labelProjection.z <= 1 &&
          labelProjection.x > -1.18 &&
          labelProjection.x < 1.18 &&
          labelProjection.y > -1.18 &&
          labelProjection.y < 1.18;
        const labelSafePadding = hostWidth < 720 ? 18 : 28;
        const labelSize = lockedGraphLabelSizes[index];
        const labelWidth = labelSize?.width || 0;
        const labelHeight = labelSize?.height || 0;
        const minScreenX = Math.min(hostWidth / 2, labelSafePadding + labelWidth / 2);
        const maxScreenX = Math.max(minScreenX, hostWidth - labelSafePadding - labelWidth / 2);
        const minScreenY = Math.min(hostHeight / 2, labelSafePadding + labelHeight * 1.5);
        const maxScreenY = Math.max(minScreenY, hostHeight - labelSafePadding + labelHeight * 0.5);
        const screenX = clamp((labelProjection.x * 0.5 + 0.5) * hostWidth, minScreenX, maxScreenX);
        const screenY = clamp((-labelProjection.y * 0.5 + 0.5) * hostHeight, minScreenY, maxScreenY);

        label.style.opacity = isVisible ? String(labelOpacity) : '0';
        label.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -150%)`;
      });
    };

    const chooseGraphFocus = () => {
      const routeNodes = graphRouteRef.current.map((node) => node.trim()).filter(Boolean).slice(0, maxLockPoints);
      const routeCount = routeNodes.length;
      const routeKey = routeNodes.join('/');
      let routeHash = 0;

      if (routeCount === 0) {
        graphFocusTarget.copy(defaultGraphFocus);
        graphDisplayCenterTarget.copy(defaultGraphDisplayCenter);
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        clearLockedParticleTargets();
        clearGraphLabels();
        return true;
      }

      for (let index = 0; index < routeKey.length; index += 1) {
        routeHash = (routeHash * 31 + routeKey.charCodeAt(index)) >>> 0;
      }

      const isAgentOrbitFocus = graphFocusKeyRef.current.startsWith('agents:');
      const candidatePool: { index: number; score: number; x: number; y: number; z: number }[] = [];

      for (let index = 0; index < particleCount; index += 1) {
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
        const activeRoleEnd = activeParticleRoleEnds[Math.trunc(role)] || 0;

        if (index >= activeRoleEnd) {
          continue;
        }

        const offset = index * 3;
        const x = positions[offset];
        const y = positions[offset + 1];
        const z = positions[offset + 2];
        const radialDistance = Math.hypot(x, y);
        const comfortablyVisible =
          Math.abs(x) < 2.34 &&
          Math.abs(y) < 1.76 &&
          z > -1 &&
          z < 1.04 &&
          radialDistance > 0.28;
        const canBecomeRouteNode = role === ROLE_SHELL || role === ROLE_RIBBON || role === ROLE_HALO;

        if (canBecomeRouteNode && comfortablyVisible) {
          candidatePool.push({
            index,
            score: seededUnit(routeHash + index * 2654435761) + seeds[seedOffset + S_A] * 0.22 + seeds[seedOffset + S_E] * 0.08,
            x,
            y,
            z,
          });
        }
      }

      const selectedCandidates = candidatePool.sort((left, right) => left.score - right.score).slice(0, routeCount);

      if (selectedCandidates.length === 0) {
        graphFocusTarget.copy(defaultGraphFocus);
        graphDisplayCenterTarget.copy(defaultGraphDisplayCenter);
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        clearLockedParticleTargets();
        clearGraphLabels();
        return false;
      }

      const isCompact = width < 720;
      const agentAnchorAngle = seededUnit(routeHash + 211) * TAU;
      let agentAnchorY = seededSigned(routeHash + 307) * (isCompact ? 0.34 : 0.46);

      if (Math.abs(agentAnchorY) < (isCompact ? 0.12 : 0.16)) {
        agentAnchorY += (agentAnchorY < 0 ? -1 : 1) * (isCompact ? 0.18 : 0.24);
      }

      const agentAnchorX = Math.cos(agentAnchorAngle) * (isCompact ? 0.12 : 0.18);
      const agentAnchorZ = 0.12 + Math.sin(agentAnchorAngle) * (isCompact ? 0.08 : 0.12);

      if (isAgentOrbitFocus) {
        graphFocusTarget.set(agentAnchorX, agentAnchorY, agentAnchorZ);
      } else {
        const focusSum = selectedCandidates.reduce(
          (sum, candidate) => {
            sum.x += candidate.x;
            sum.y += candidate.y;
            sum.z += candidate.z;
            return sum;
          },
          { x: 0, y: 0, z: 0 },
        );
        graphFocusTarget.set(
          focusSum.x / selectedCandidates.length,
          focusSum.y / selectedCandidates.length,
          focusSum.z / selectedCandidates.length,
        );
      }

      if (!Number.isFinite(graphFocusTarget.x) || graphFocusTarget.lengthSq() < 0.08) {
        graphFocusTarget.copy(defaultGraphFocus);
      }

      const driftAngle = ((routeHash % 360) / 360) * TAU;
      const centerDrift = isAgentOrbitFocus ? 0 : width < 720 ? 0.035 : 0.07;
      if (isAgentOrbitFocus) {
        graphDisplayCenterTarget.set(
          agentAnchorX * 0.54,
          defaultGraphDisplayCenter.y + agentAnchorY * 0.78,
          0.42 + agentAnchorZ * 0.34,
        );
      } else {
        graphDisplayCenterTarget.set(
          Math.cos(driftAngle) * centerDrift,
          defaultGraphDisplayCenter.y + Math.sin(driftAngle) * centerDrift * 0.45,
          0.34 + ((routeHash % 17) / 17) * 0.035,
        );
      }

      const pathWidth = routeCount <= 2 ? (isCompact ? 0.6 : 0.84) : isCompact ? 0.88 : 1.18;
      const pathHeight = isCompact ? 0.44 : 0.62;
      const depthSpread = isCompact ? 0.18 : 0.28;
      const routeTilt = seededSigned(routeHash + 53) * (isCompact ? 0.1 : 0.16);
      const routeWaveCount = 1.35 + seededUnit(routeHash + 71) * 1.2;
      const horizontalJitter = isCompact ? 0.05 : 0.08;
      const verticalJitter = isCompact ? 0.1 : 0.15;
      const routePhase = routeHash * 0.0007;

      lockedGraphNodes = selectedCandidates.map((candidate, routeIndex) => {
        const progress = routeCount === 1 ? 0.5 : routeIndex / (routeCount - 1);
        const centeredProgress = progress - 0.5;
        const pathBend = Math.sin(progress * Math.PI);
        const nodeSeed = routeHash + routeIndex * 19349663;
        const edgeDamping = routeIndex === 0 || routeIndex === routeCount - 1 ? 0.42 : 1;

        if (isAgentOrbitFocus) {
          const orbitProgress = routeCount === 1 ? 0 : routeIndex / routeCount;
          const orbitAngle = agentAnchorAngle + routePhase * 0.22 + orbitProgress * TAU;
          const orbitRadius = isCompact ? 0.56 : 0.72;
          const orbitDepth = isCompact ? 0.16 : 0.24;
          const latitudeTilt = seededSigned(routeHash + 349) * (isCompact ? 0.16 : 0.24);
          const nodeY =
            Math.sin(orbitAngle * 1.15 + routePhase) * (isCompact ? 0.13 : 0.17) +
            Math.cos(orbitAngle) * latitudeTilt +
            centeredProgress * (isCompact ? 0.09 : 0.12) +
            seededSigned(nodeSeed + 37) * (isCompact ? 0.035 : 0.045);

          return {
            particleIndex: candidate.index,
            label: routeNodes[routeIndex],
            phase: seeds[candidate.index * SEED_STRIDE + S_E] * TAU,
            routeIndex,
            x: Math.cos(orbitAngle) * orbitRadius,
            y: nodeY,
            z: Math.sin(orbitAngle) * orbitDepth,
          };
        }

        const nodeX =
          centeredProgress * pathWidth +
          seededSigned(nodeSeed + 17) * horizontalJitter * edgeDamping +
          pathBend * routeTilt;
        const nodeY =
          Math.sin((progress - 0.5) * Math.PI) * pathHeight * 0.62 +
          Math.sin(progress * Math.PI * routeWaveCount + routePhase) * pathHeight * 0.42 +
          (routeIndex % 2 === 0 ? -1 : 1) * (0.07 + seededUnit(nodeSeed + 29) * 0.06) * (0.76 + pathBend * 0.24) +
          seededSigned(nodeSeed + 37) * verticalJitter;
        const nodeZ =
          Math.cos(progress * Math.PI * (1.05 + seededUnit(routeHash + 97) * 0.75) + routePhase) * depthSpread +
          seededSigned(nodeSeed + 43) * depthSpread * 0.58;

        return {
          particleIndex: candidate.index,
          label: routeNodes[routeIndex],
          phase: seeds[candidate.index * SEED_STRIDE + S_E] * TAU,
          routeIndex,
          x: nodeX,
          y: nodeY,
          z: nodeZ,
        };
      });

      const minNodeDistance = isAgentOrbitFocus ? (isCompact ? 0.26 : 0.32) : isCompact ? 0.22 : 0.28;
      lockedGraphNodes.forEach((node, nodeIndex) => {
        for (let previousIndex = 0; previousIndex < nodeIndex; previousIndex += 1) {
          const previousNode = lockedGraphNodes[previousIndex];
          const dx = node.x - previousNode.x;
          const dy = node.y - previousNode.y;
          const distance = Math.hypot(dx, dy);

          if (distance >= minNodeDistance) {
            continue;
          }

          const push = minNodeDistance - distance;
          const pushAngle = routePhase + nodeIndex * 1.37 + previousIndex * 0.61;
          node.x += Math.cos(pushAngle) * push * 0.72;
          node.y += Math.sin(pushAngle) * push * 0.9 + (nodeIndex % 2 === 0 ? -push : push) * 0.36;
        }

        if (isAgentOrbitFocus) {
          node.x = clamp(node.x, isCompact ? -0.64 : -0.8, isCompact ? 0.64 : 0.8);
          node.y = clamp(node.y, isCompact ? -0.32 : -0.42, isCompact ? 0.32 : 0.42);
          node.z = clamp(node.z, isCompact ? -0.22 : -0.32, isCompact ? 0.22 : 0.32);
        } else {
          node.x = clamp(node.x, -pathWidth * 0.68, pathWidth * 0.68);
          node.y = clamp(node.y, -pathHeight * 1.08, pathHeight * 1.08);
          node.z = clamp(node.z, -depthSpread * 1.42, depthSpread * 1.42);
        }
      });

      lockedGraphEdges =
        isAgentOrbitFocus && lockedGraphNodes.length > 2
          ? lockedGraphNodes.map((_, index) => [index, (index + 1) % lockedGraphNodes.length])
          : lockedGraphNodes.slice(1).map((_, index) => [index, index + 1]);
      clearLockedParticleTargets();
      syncGraphLabels(lockedGraphNodes.map((node) => node.label));
      const particlePathScale = isAgentOrbitFocus ? (isCompact ? 0.52 : 0.6) : isCompact ? 0.54 : 0.66;

      lockedGraphNodes.forEach((node) => {
        lockedParticleTargetActive[node.particleIndex] = 1;
        hasLockedParticleTargets = true;
        lockedParticleTargetX[node.particleIndex] = node.x * particlePathScale;
        lockedParticleTargetY[node.particleIndex] = node.y * particlePathScale;
        lockedParticleTargetZ[node.particleIndex] = node.z * particlePathScale;
      });

      return true;
    };

    const resize = () => {
      const nextWidth = Math.max(1, host.clientWidth || window.innerWidth);
      const nextHeight = Math.max(1, host.clientHeight || window.innerHeight);
      const nextRenderPixelRatio = getRenderPixelRatio(nextWidth, nextHeight);
      if (Math.abs(nextRenderPixelRatio - renderPixelRatio) > 0.01) {
        renderPixelRatio = nextRenderPixelRatio;
        renderer.setPixelRatio(renderPixelRatio);
      }
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      measureGraphLabels();
      lastPixelRatioCheckAt = performance.now();
    };

    const triggerPulse = () => {
      pulsePower = Math.max(pulsePower, 1);
    };

    const handleWebglContextLost = (event: Event) => {
      event.preventDefault();
      webglContextLost = true;
      host.dataset.rendererState = 'lost';
    };

    const handleWebglContextRestored = () => {
      webglContextLost = false;
      host.dataset.rendererState = 'active';
      simulationWarmupPending = true;
      resize();
    };

    const unlockAudioGesture = () => {
      audioGestureUnlocked = true;

      if (warpSfxContext?.state === 'suspended') {
        void warpSfxContext.resume().catch(() => undefined);
      }
    };

    const playMechanicalWarpSfx = (intensity: number) => {
      const userActivation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;

      if (!audioGestureUnlocked && !userActivation?.hasBeenActive) {
        return false;
      }

      try {
        const audioContext = warpSfxContext ?? new AudioContext();
        warpSfxContext = audioContext;

        if (audioContext.state === 'suspended') {
          void audioContext.resume().catch(() => undefined);
        }

        const now = audioContext.currentTime;
        const amount = clamp(intensity, 0.65, 1.18);
        const master = audioContext.createGain();
        const masterFilter = audioContext.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.setValueAtTime(1600, now);
        masterFilter.frequency.exponentialRampToValueAtTime(4200, now + 0.34);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.08 * amount, now + 0.055);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        masterFilter.connect(master);
        master.connect(audioContext.destination);

        const rumble = audioContext.createOscillator();
        const rumbleGain = audioContext.createGain();
        rumble.type = 'sawtooth';
        rumble.frequency.setValueAtTime(92, now);
        rumble.frequency.exponentialRampToValueAtTime(38, now + 0.82);
        rumbleGain.gain.setValueAtTime(0.0001, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.06 * amount, now + 0.08);
        rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
        rumble.connect(rumbleGain);
        rumbleGain.connect(masterFilter);
        rumble.start(now);
        rumble.stop(now + 0.9);

        const noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * 0.62), audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseData.length; index += 1) {
          const decay = 1 - index / noiseData.length;
          noiseData[index] = (Math.random() * 2 - 1) * decay * decay;
        }

        const noise = audioContext.createBufferSource();
        const noiseFilter = audioContext.createBiquadFilter();
        const noiseGain = audioContext.createGain();
        noise.buffer = noiseBuffer;
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(520, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(2600, now + 0.42);
        noiseFilter.Q.setValueAtTime(1.4, now);
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.038 * amount, now + 0.04);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterFilter);
        noise.start(now);
        noise.stop(now + 0.64);

        [0, 0.075, 0.16].forEach((delay, index) => {
          const tick = audioContext.createOscillator();
          const tickGain = audioContext.createGain();
          tick.type = index === 1 ? 'triangle' : 'square';
          tick.frequency.setValueAtTime(180 + index * 82, now + delay);
          tick.frequency.exponentialRampToValueAtTime(92 + index * 34, now + delay + 0.12);
          tickGain.gain.setValueAtTime(0.0001, now + delay);
          tickGain.gain.exponentialRampToValueAtTime(0.026 * amount, now + delay + 0.012);
          tickGain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.13);
          tick.connect(tickGain);
          tickGain.connect(masterFilter);
          tick.start(now + delay);
          tick.stop(now + delay + 0.15);
        });

        window.setTimeout(() => {
          master.disconnect();
          masterFilter.disconnect();
        }, 1100);

        return true;
      } catch {
        return false;
      }
    };

    const setMeteorLine = (
      lineIndex: number,
      startX: number,
      startY: number,
      startZ: number,
      endX: number,
      endY: number,
      endZ: number,
    ) => {
      const lineOffset = lineIndex * 6;
      meteorLinePositions[lineOffset] = startX;
      meteorLinePositions[lineOffset + 1] = startY;
      meteorLinePositions[lineOffset + 2] = startZ;
      meteorLinePositions[lineOffset + 3] = endX;
      meteorLinePositions[lineOffset + 4] = endY;
      meteorLinePositions[lineOffset + 5] = endZ;
    };

    const setMeteorHead = (pointIndex: number, x: number, y: number, z: number) => {
      const pointOffset = pointIndex * 3;
      meteorHeadPositions[pointOffset] = x;
      meteorHeadPositions[pointOffset + 1] = y;
      meteorHeadPositions[pointOffset + 2] = z;
    };

    const writeTarget = (
      index: number,
      time: number,
      currentSettings: ParticleSettings,
      voiceEnergy: number,
      voiceBeat: number,
      innerDiamondCos: number,
      innerDiamondSin: number,
    ) => {
      const seedOffset = index * SEED_STRIDE;
      const role = seeds[seedOffset + S_ROLE];
      const shade = seeds[seedOffset + S_SHADE];
      const phase = particlePhases[index];
      const statePressure =
        currentSettings.mode === 'speaking'
          ? 0.18
          : currentSettings.mode === 'listening'
            ? 0.13
            : currentSettings.mode === 'thinking'
              ? 0.09
              : 0.04;
      const breath = Math.sin(time * 1.1 + phase) * 0.025;
      const restrainedPulse =
        (voiceEnergy * 0.16 + voiceBeat * 0.2 + renderPulsePower * 0.08 + statePressure) * (0.7 + shade * 0.3);
      if (role === ROLE_CORE) {
        const theta = seeds[seedOffset + S_A] * TAU + time * 0.035;
        const latitude = Math.asin(clamp(seeds[seedOffset + S_B] * 2 - 1, -0.92, 0.92));
        const radius = 0.3 + seeds[seedOffset + S_C] * 0.62 + breath * 0.8 + restrainedPulse * 0.28;

        sphericalToPoint(theta, latitude, radius, target);
        return 0.62 + voiceEnergy * 0.16 + voiceBeat * 0.18;
      }

      if (role === ROLE_RIBBON) {
        const bandCount = 6;
        const band = Math.floor(seeds[seedOffset + S_C] * bandCount);
        const direction = band % 2 === 0 ? 1 : -1;
        const theta =
          seeds[seedOffset + S_A] * TAU +
          direction * time * (0.072 + band * 0.005 + seeds[seedOffset + S_FLOW] * 0.008);
        const bandCenter = band - (bandCount - 1) / 2;
        const tube = seeds[seedOffset + S_B] * 2 - 1;
        const twist = theta * 0.5 + phase * 0.18 + bandCenter * 0.56;
        const tubeWidth = 0.092 + Math.abs(bandCenter) * 0.012;
        const mobiusTube = tube * tubeWidth;
        const radius = 1.12 + band * 0.062 + seeds[seedOffset + S_D] * 0.03 + mobiusTube * Math.cos(twist);
        const baseX = Math.cos(theta) * radius;
        const baseY = bandCenter * 0.058 + mobiusTube * Math.sin(twist) * 0.84;
        const baseZ = Math.sin(theta) * (0.43 + band * 0.016) + mobiusTube * Math.cos(twist + Math.PI / 2) * 0.11;
        const tilt = -0.24 + bandCenter * 0.038;
        const cosTilt = Math.cos(tilt);
        const sinTilt = Math.sin(tilt);
        const rotatedY = baseY * cosTilt - baseZ * sinTilt;
        const rotatedZ = baseY * sinTilt + baseZ * cosTilt;
        const sideDimming = 1 - smoothstep(0.72, 0.98, Math.abs(Math.cos(theta))) * 0.4;
        const orbitPulse =
          Math.pow(Math.max(0, Math.cos(theta * 4 - time * (1.1 + voiceBeat * 0.8) * direction + phase)), 6) *
          (0.38 + voiceEnergy * 0.34) *
          sideDimming;

        target.set(baseX, rotatedY * 0.92, rotatedZ - 0.06 + orbitPulse * 0.03);

        const frontArc = smoothstep(-0.42, 0.78, rotatedZ);
        return (0.052 + frontArc * 0.22 + orbitPulse * 1.22 + voiceBeat * 0.035) * sideDimming;
      }

      if (role === ROLE_HALO) {
        const level = seeds[seedOffset + S_B] * 2 - 1;
        const ring = Math.floor(seeds[seedOffset + S_C] * HALO_RING_COUNT);
        const direction = ring % 2 === 0 ? 1 : -1;
        const ringProgress = ring / Math.max(1, HALO_RING_COUNT - 1);
        const ringCenter = ringProgress * 2 - 1;
        const theta =
          seeds[seedOffset + S_A] * TAU +
          direction * time * (0.058 + ring * 0.004 + seeds[seedOffset + S_FLOW] * 0.007);
        const radius = (1.02 + Math.abs(ringCenter) * 0.15 + seeds[seedOffset + S_D] * 0.024) * HALO_RING_SCALE_BOOST;
        const tube = level * 0.026 + seeds[seedOffset + S_WIDTH] * 0.052;
        const baseX = Math.cos(theta) * radius;
        const baseY = ringCenter * 0.29 + tube;
        const baseZ = Math.sin(theta) * (0.34 + Math.abs(ringCenter) * 0.048);
        const tilt = -0.32 + ringCenter * 0.075;
        const cosTilt = Math.cos(tilt);
        const sinTilt = Math.sin(tilt);
        const rotatedY = baseY * cosTilt - baseZ * sinTilt;
        const rotatedZ = baseY * sinTilt + baseZ * cosTilt;
        const sideDimming = 1 - smoothstep(0.68, 0.98, Math.abs(Math.cos(theta))) * 0.62;
        const streamPulse =
          Math.pow(Math.max(0, Math.sin(theta * 3.2 - time * (1.4 + voiceBeat * 1.1) * direction + phase)), 5.4) *
          (0.42 + voiceEnergy * 0.38) *
          sideDimming;
        const ridgeLight =
          Math.pow(0.5 + Math.cos(theta * 1.8 - time * 0.32 * direction + ring * 0.7 + phase) * 0.5, 2.4) *
          (0.22 + voiceEnergy * 0.16) *
          sideDimming;
        const frontArc = smoothstep(-0.56, 0.78, rotatedZ);

        target.set(baseX, rotatedY * 0.92, rotatedZ - 0.05 + streamPulse * 0.036);
        return (0.035 + ridgeLight * 0.58 + frontArc * 0.1 + streamPulse * 0.78 + voiceBeat * 0.045) * sideDimming;
      }

      if (role === ROLE_METEOR) {
        const lane = Math.floor(seeds[seedOffset + S_C] * METEOR_STREAM_COUNT);
        const cluster = Math.floor(seeds[seedOffset + S_D] * METEOR_CLUSTER_COUNT);
        const clusterSeed = lane * 92821 + cluster * 68917;
        const lanePhase = lane * 1.74 + cluster * 0.82;
        const showerPulse = Math.pow(Math.max(0, Math.sin(time * 0.46 + lanePhase)), 2.4);
        const showerGate = smoothstep(0.04, 0.72, showerPulse);
        const headTravel =
          (time * (0.112 + lane * 0.006 + cluster * 0.004) + seededUnit(clusterSeed + 19) * 0.94) % 1;
        const tailOffset = meteorTailOffsets[index];
        const rawTravel = headTravel - tailOffset;
        const travel = clamp(rawTravel, 0, 1);
        const pathGate = smoothstep(0.02, 0.11, travel) * (1 - smoothstep(0.9, 0.99, travel));
        const activeTrail = rawTravel >= -0.02 && rawTravel <= 1.03 ? pathGate : 0;
        const trailLife = 1 - smoothstep(0.08, 0.82, tailOffset);
        const headBody = 1 - smoothstep(0.025, 0.18, tailOffset);
        const headCore = 1 - smoothstep(0.006, 0.07, tailOffset);
        const tailShape = Math.pow(trailLife, 1.82);
        const localAngle = seededUnit(index * 1103515245 + clusterSeed + 97) * TAU;
        const rockFacet =
          0.76 +
          Math.sin(localAngle * 3 + clusterSeed * 0.001) * 0.18 +
          Math.cos(localAngle * 5 + seeds[seedOffset + S_E] * TAU) * 0.1;
        const localRadius =
          Math.sqrt(seededUnit(index * 1664525 + clusterSeed + 131)) *
          (0.012 + headBody * 0.094 * rockFacet + tailShape * 0.028);
        const localX = Math.cos(localAngle) * localRadius;
        const localY = Math.sin(localAngle) * localRadius * (0.46 + headBody * 0.3);
        const tailLateral = (seeds[seedOffset + S_B] * 2 - 1) * (0.008 + tailShape * 0.018);
        const laneDirection = lane % 2 === 0 ? 1 : -1;
        const arcLift = Math.sin(travel * Math.PI);
        const headGlow = Math.exp(-tailOffset * 8.2);
        const sweepWidth = 5.05 + seededUnit(clusterSeed + 87) * 0.62;
        const entryX = laneDirection * (-2.55 - seededUnit(clusterSeed + 41) * 0.26);
        const baseX = entryX + laneDirection * sweepWidth * travel + laneDirection * (localX + tailLateral);
        const baseY = 1.24 - travel * 2.34 + arcLift * 0.36 + (lane - 1.5) * 0.15 + localY;
        const baseZ =
          -0.3 +
          arcLift * 0.64 +
          seededSigned(index * 8191 + clusterSeed + 91) * (0.012 + headBody * 0.034 + tailShape * 0.024) -
          travel * 0.04;
        const tailLight = Math.pow(trailLife, 2.05);
        const fragmentSpark =
          seeds[seedOffset + S_E] > 0.78 && tailOffset > 0.09 && tailOffset < 0.42
            ? Math.pow(Math.max(0, Math.sin(time * 2.6 + index * 0.017)), 5) * 0.9
            : 0;

        target.set(baseX, baseY, baseZ);
        return (
          0.002 +
          activeTrail * showerGate * (headGlow * 8.8 + headCore * 3.2 + tailLight * 0.96 + fragmentSpark + voiceBeat * 0.2)
        ) * (0.86 + voiceEnergy * 0.26);
      }

      const facetEdge = seeds[seedOffset + S_D] > 0.58;
      const side = Math.min(
        SHELL_RADIAL_FACET_COUNT - 1,
        Math.floor(seeds[seedOffset + S_C] * SHELL_RADIAL_FACET_COUNT),
      );
      const topFacet = seeds[seedOffset + S_E] > 0.5;
      const apexY = topFacet ? 1.46 : -1.46;
      const { baseAx, baseAz, baseBx, baseBz, baseOx, baseOz } = SHELL_FACET_LOOKUP[side];
      const ax = baseAx * innerDiamondCos - baseAz * innerDiamondSin;
      const az = baseAx * innerDiamondSin + baseAz * innerDiamondCos;
      const bx = baseBx * innerDiamondCos - baseBz * innerDiamondSin;
      const bz = baseBx * innerDiamondSin + baseBz * innerDiamondCos;
      const ox = baseOx * innerDiamondCos - baseOz * innerDiamondSin;
      const oz = baseOx * innerDiamondSin + baseOz * innerDiamondCos;
      const crystalWaveSpeed = currentSettings.mode === 'speaking' ? 2.2 + voiceBeat * 1.5 : 0.86 + voiceEnergy * 0.48;

      if (facetEdge) {
        const progress = seeds[seedOffset + S_A];
        const edgeKind = Math.floor(seeds[seedOffset + S_B] * 7);
        const edgePulse = Math.pow(Math.max(0, Math.sin(progress * TAU * 2.4 - time * crystalWaveSpeed + phase)), 5.4);

        if (edgeKind === 0) {
          target.set(ax * progress, apexY * (1 - progress), az * progress);
        } else if (edgeKind === 1) {
          target.set(bx * progress, apexY * (1 - progress), bz * progress);
        } else if (edgeKind === 2) {
          target.set(ax + (bx - ax) * progress, 0, az + (bz - az) * progress);
        } else if (edgeKind === 3) {
          const centerY = -1.36 + progress * 2.72;
          target.set(seeds[seedOffset + S_WIDTH] * 0.18, centerY, seeds[seedOffset + S_WIDTH] * 0.22);
        } else if (edgeKind === 4) {
          target.set(ax + (ox - ax) * progress, (progress - 0.5) * 0.22, az + (oz - az) * progress);
        } else if (edgeKind === 5) {
          const midX = (ax + bx) * 0.5;
          const midZ = (az + bz) * 0.5;
          target.set(midX * progress, apexY * (1 - progress) * 0.72, midZ * progress);
        } else {
          const inner = Math.sin(progress * Math.PI);
          target.set(
            (ax * (1 - progress) + bx * progress) * (0.46 + inner * 0.18),
            apexY * (0.42 - Math.abs(progress - 0.5) * 0.84),
            (az * (1 - progress) + bz * progress) * (0.46 + inner * 0.14),
          );
        }

        target.y += seeds[seedOffset + S_WIDTH] * 0.03;
        return 0.38 + edgePulse * 1.58 + voiceEnergy * 0.12 + voiceBeat * 0.28;
      }

      const root = shellRoots[index];
      const baryMix = seeds[seedOffset + S_B];
      const apexWeight = 1 - root;
      const sideWeightA = root * (1 - baryMix);
      const sideWeightB = root * baryMix;
      const facetPulse = Math.pow(
        Math.max(0, Math.sin((sideWeightA + sideWeightB) * TAU * 2.8 - time * crystalWaveSpeed + phase)),
        5,
      );
      const facetBreath = 1;
      const inset = 0.94 + seeds[seedOffset + S_SHADE] * 0.04;

      target.set(
        (sideWeightA * ax + sideWeightB * bx) * inset * facetBreath,
        apexWeight * apexY * facetBreath,
        (sideWeightA * az + sideWeightB * bz) * inset * facetBreath,
      );

      const facetDepth = smoothstep(-0.18, 0.62, target.z);
      const apexLight = smoothstep(0.1, 1.4, Math.abs(target.y)) * 0.26;
      const innerRidge =
        Math.pow(Math.max(0, Math.cos((sideWeightA - sideWeightB) * TAU * 2.2 + time * 0.72 + phase)), 7) * 0.29;
      return 0.27 + facetDepth * 0.56 + apexLight * 1.18 + innerRidge * 1.24 + facetPulse * 0.58 + voiceEnergy * 0.09 + voiceBeat * 0.18;
    };

    const animate = () => {
      const currentSettings = settingsRef.current;
      const frameNow = performance.now();
      const currentPerformanceMode = performanceModeRef.current;
      const hasGraphRoute = graphRouteRef.current.length > 0;
      const targetFrameRate = document.hidden
        ? HIDDEN_FRAME_RATE
        : currentPerformanceMode === 'background'
          ? BACKGROUND_FRAME_RATE
          : currentSettings.mode === 'idle' && !hasGraphRoute
            ? IDLE_FRAME_RATE
            : ACTIVE_FRAME_RATE;
      const minFrameInterval = 1000 / targetFrameRate;

      if (reportedFrameRate !== targetFrameRate) {
        reportedFrameRate = targetFrameRate;
        host.dataset.targetFrameRate = String(targetFrameRate);
      }

      if (frameNow - lastRenderTime < minFrameInterval - RENDER_FRAME_TOLERANCE_MS) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      lastRenderTime = frameNow;

      if (webglContextLost) {
        lastFrameTime = frameNow;
        animationId = requestAnimationFrame(animate);
        return;
      }

      const rawDelta = Math.max(0, (frameNow - lastFrameTime) / 1000);
      const frameIntervalMs = rawDelta * 1000;
      if (!document.hidden && frameIntervalMs > 0 && frameIntervalMs < 1000) {
        renderFrameIntervalAverage =
          renderFrameIntervalAverage === 0
            ? frameIntervalMs
            : renderFrameIntervalAverage * 0.82 + frameIntervalMs * 0.18;
      }

      if (frameNow - lastPixelRatioCheckAt >= PIXEL_RATIO_RECHECK_MS) {
        lastPixelRatioCheckAt = frameNow;
        if (!document.hidden && currentPerformanceMode === 'active') {
          renderQualityScale = adaptRenderQualityScale(
            renderQualityScale,
            frameWorkCostAverage,
            minFrameInterval,
            renderFrameIntervalAverage,
          );
          const minimumParticleDrawRatio = softwareRenderer
            ? width < 720
              ? SOFTWARE_COMPACT_PARTICLE_DRAW_RATIO
              : SOFTWARE_DESKTOP_PARTICLE_DRAW_RATIO
            : width < 720
              ? COMPACT_MIN_PARTICLE_DRAW_RATIO
              : DESKTOP_MIN_PARTICLE_DRAW_RATIO;
          const nextParticleDrawRatio = Math.max(
            minimumParticleDrawRatio,
            adaptParticleDrawRatio(particleDrawRatio, actualFrameRate, ACTIVE_FRAME_RATE),
          );

          if (Math.abs(nextParticleDrawRatio - particleDrawRatio) > 0.001) {
            particleDrawRatio = nextParticleDrawRatio;
            syncParticleDrawBudget();
          }

          const nextPerformanceTier = resolveParticlePerformanceTier(
            particleDrawRatio,
            renderQualityScale,
            actualFrameRate,
            ACTIVE_FRAME_RATE,
          );
          if (nextPerformanceTier !== performanceTier) {
            setPerformanceTier(nextPerformanceTier);
          }
        } else if (currentPerformanceMode === 'background' && performanceTier === 'full') {
          setPerformanceTier('balanced');
        }
        const nextWidth = Math.max(1, host.clientWidth || window.innerWidth);
        const nextHeight = Math.max(1, host.clientHeight || window.innerHeight);
        const nextRenderPixelRatio = getRenderPixelRatio(nextWidth, nextHeight);

        if (Math.abs(nextRenderPixelRatio - renderPixelRatio) > 0.01) {
          renderPixelRatio = nextRenderPixelRatio;
          renderer.setPixelRatio(renderPixelRatio);
          renderer.setSize(nextWidth, nextHeight, false);
          host.dataset.renderPixelRatio = renderPixelRatio.toFixed(2);
        }
        host.dataset.renderQualityScale = renderQualityScale.toFixed(2);
        host.dataset.frameInterval = renderFrameIntervalAverage.toFixed(1);
      }

      const delta = Math.min(rawDelta, 0.05);
      const rotationDelta = Math.min(rawDelta, 0.2);
      const frameUnits = clamp(delta * 60, 0.25, 3);
      const transitionFrameUnits = clamp(rawDelta * 60, 0.25, 30);
      const elapsed = (frameNow - startTime) / 1000;
      const liveMicEnergy = audioLevelRef.current;
      const speechBase = 0.5 + Math.sin(elapsed * 3.35) * 0.5;
      const speechAccent = Math.pow(0.5 + Math.sin(elapsed * 5.05 + 0.75) * 0.5, 2.35);
      const speechSwell = 0.5 + Math.sin(elapsed * 1.15 - 0.4) * 0.5;
      const syntheticSpeech =
        currentSettings.mode === 'speaking'
          ? 0.42 + speechBase * 0.24 + speechAccent * 0.18 + speechSwell * 0.1
          : 0;
      const targetVoiceEnvelope = Math.min(1, Math.max(liveMicEnergy, syntheticSpeech));
      const envelopeEase = targetVoiceEnvelope > voiceEnvelope ? 0.14 : 0.045;
      voiceEnvelope += (targetVoiceEnvelope - voiceEnvelope) * frameAdjustedLerp(envelopeEase, frameUnits);
      const voiceEnergy = clamp(voiceEnvelope, 0, 1);
      const targetVoiceBeat =
        currentSettings.mode === 'speaking' ? speechBase * 0.58 + speechAccent * 0.27 + speechSwell * 0.15 : 0;
      const beatEase = targetVoiceBeat > voiceBeatEnvelope ? 0.11 : 0.06;
      voiceBeatEnvelope += (targetVoiceBeat - voiceBeatEnvelope) * frameAdjustedLerp(beatEase, frameUnits);
      const voiceBeat = clamp(voiceBeatEnvelope, 0, 1);
      const palette = modePalettes[currentSettings.mode];
      const graphTargetProgress = graphRouteRef.current.length > 0 ? 1 : 0;
      graphProgress +=
        (graphTargetProgress - graphProgress) *
        frameAdjustedLerp(graphTargetProgress > graphProgress ? 0.036 : 0.045, transitionFrameUnits);
      host.dataset.graphProgress = graphProgress.toFixed(4);
      const graphBlend = smoothstep(0, 1, graphProgress);
      const graphEffectsActive = graphTargetProgress > 0 || graphProgress > 0.001;
      const galaxyTravel = smoothstep(0.02, 0.58, graphProgress);
      const solarReveal = smoothstep(0.38, 0.78, graphProgress);
      const earthLock = smoothstep(0.72, 0.96, graphProgress);
      const deepCollapse = smoothstep(0.84, 0.995, graphProgress);
      const localGraphReveal = smoothstep(0.68, 0.95, graphProgress);
      const graphSpeechMotionDamping = 1 - graphBlend * 0.92;
      const graphSpeechGlowDamping = 1 - graphBlend * 0.58;
      const motionVoiceEnergy = voiceEnergy * graphSpeechMotionDamping;
      const motionVoiceBeat = voiceBeat * graphSpeechMotionDamping;
      const glowVoiceEnergy = voiceEnergy * graphSpeechGlowDamping;
      const glowVoiceBeat = voiceBeat * graphSpeechGlowDamping;
      const motionPulsePower = pulsePower * graphSpeechMotionDamping;
      renderPulsePower = motionPulsePower;
      const activeGraphFocusKey =
        graphTargetProgress > 0 ? graphFocusKeyRef.current || graphRouteRef.current.join(' / ') : '';
      const activeIsAgentOrbitFocus = activeGraphFocusKey.startsWith('agents:');
      const routeBodyPersistence = activeIsAgentOrbitFocus ? 0.72 : 0.54;

      if (graphTargetProgress > 0 && activeGraphFocusKey && graphProgress > 0.16 && lastWarpSfxKey !== activeGraphFocusKey) {
        const sfxPlayed = playMechanicalWarpSfx(activeIsAgentOrbitFocus ? 1.08 : 0.92);

        if (sfxPlayed) {
          lastWarpSfxKey = activeGraphFocusKey;
          lastWarpSfxAt = frameNow;
        }
      } else if (graphTargetProgress === 0 && frameNow - lastWarpSfxAt > 900) {
        lastWarpSfxKey = '';
      }

      lastFrameTime = frameNow;

      if (activeGraphFocusKey && activeGraphFocusKey !== lastGraphFocusKey) {
        lastGraphFocusKey = activeGraphFocusKey;
        pendingGraphFocusKey = activeGraphFocusKey;
        lastGraphFocusAttemptAt = -Infinity;
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        clearLockedParticleTargets();
        clearGraphLabels();
      }

      if (
        !activeGraphFocusKey &&
        (lastGraphFocusKey || pendingGraphFocusKey || lockedGraphNodes.length > 0 || lockedGraphLabels.length > 0)
      ) {
        lastGraphFocusKey = '';
        pendingGraphFocusKey = '';
        lastGraphFocusAttemptAt = -Infinity;
        graphFocusTarget.copy(defaultGraphFocus);
        graphDisplayCenterTarget.copy(defaultGraphDisplayCenter);
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        clearLockedParticleTargets();
        clearGraphLabels();
      }

      if (
        pendingGraphFocusKey &&
        graphProgress > 0.34 &&
        !simulationWarmupPending &&
        frameNow - lastGraphFocusAttemptAt >= 120
      ) {
        lastGraphFocusAttemptAt = frameNow;
        if (chooseGraphFocus()) {
          pendingGraphFocusKey = '';
        }
      }

      graphFocus.lerp(
        graphTargetProgress > 0 ? graphFocusTarget : defaultGraphFocus,
        frameAdjustedLerp(graphTargetProgress > 0 ? 0.055 : 0.035, transitionFrameUnits),
      );
      graphDisplayCenter.lerp(
        graphTargetProgress > 0 ? graphDisplayCenterTarget : defaultGraphDisplayCenter,
        frameAdjustedLerp(0.055, transitionFrameUnits),
      );

      if (lastPulseSeed !== currentSettings.pulseSeed) {
        lastPulseSeed = currentSettings.pulseSeed;
        triggerPulse();
      }

      const graphRotationActive = graphTargetProgress > 0 || graphProgress > 0.015;

      if (graphRotationActive) {
        innerDiamondSpin = GRAPH_LOCKED_ROTATION;
        graphDiamondYaw = wrapAngle(
          graphDiamondYaw + rotationDelta * GRAPH_DIAMOND_YAW_SPEED * smoothstep(0.12, 0.72, graphProgress),
        );
      } else {
        innerDiamondSpin = wrapAngle(innerDiamondSpin + delta * INNER_DIAMOND_SPIN_SPEED);
      }
      const innerDiamondCos = Math.cos(innerDiamondSpin);
      const innerDiamondSin = Math.sin(innerDiamondSpin);
      const graphDiamondYawCos = Math.cos(graphDiamondYaw);
      const graphDiamondYawSin = Math.sin(graphDiamondYaw);
      host.dataset.graphDiamondRotation = graphDiamondYaw.toFixed(4);
      const minimumSimulationSlices =
        document.hidden || currentPerformanceMode === 'background' ? Math.max(baseSimulationSlices, 6) : baseSimulationSlices;

      if (simulationSlices < minimumSimulationSlices) {
        simulationSlices = minimumSimulationSlices;
        simulationSliceIndex %= simulationSlices;
      }

      if (simulationWarmupPending) {
        particleUpdateRanges.length = 0;
        activeParticleRoleRanges.forEach((range) => {
          particleUpdateRanges.push({ count: range.end - range.start, end: range.end, start: range.start });
        });
      } else {
        buildParticleUpdateRanges(activeParticleRoleRanges, simulationSliceIndex, simulationSlices, particleUpdateRanges);
      }

      if (reportedSimulationSlices !== simulationSlices) {
        reportedSimulationSlices = simulationSlices;
        host.dataset.simulationSlices = String(simulationSlices);
      }
      const simulationStartedAt = performance.now();
      const simulationFrameUnits = frameUnits * (simulationWarmupPending ? 1 : simulationSlices);
      positionAttribute.clearUpdateRanges();
      colorAttribute.clearUpdateRanges();

      for (const updateRange of particleUpdateRanges) {
        for (let index = updateRange.start; index < updateRange.end; index += 1) {
        const offset = index * 3;
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
        let shapeLight = writeTarget(index, elapsed, currentSettings, glowVoiceEnergy, glowVoiceBeat, innerDiamondCos, innerDiamondSin);
        const hasLockedParticleTarget = lockedParticleTargetActive[index] === 1;
        const baseLerpAmount = role === ROLE_RIBBON ? 0.092 : role === ROLE_HALO ? 0.046 : role === ROLE_METEOR ? 0.16 : 0.07;
        const lerpAmount = frameAdjustedLerp(baseLerpAmount, simulationFrameUnits);

        if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
          target.set(0, 0, 0);
        }

        if (graphRotationActive && role === ROLE_SHELL && !hasLockedParticleTarget) {
          const targetX = target.x;
          const targetZ = target.z;
          target.x = targetX * graphDiamondYawCos - targetZ * graphDiamondYawSin;
          target.z = targetX * graphDiamondYawSin + targetZ * graphDiamondYawCos;
        }

        let focusWeight = 0;
        let focusCore = 0;
        let focusNeedle = 0;
        let solarBand = 0;
        let localLock = 0;

        if (graphEffectsActive) {
          const focusDx = target.x - graphFocus.x;
          const focusDy = target.y - graphFocus.y;
          const focusDz = target.z - graphFocus.z;
          const focusDistance = Math.sqrt(focusDx * focusDx * 1.06 + focusDy * focusDy * 1.42 + focusDz * focusDz * 0.72);
          const focusDistanceSq = focusDistance * focusDistance;
          focusWeight = Math.exp(-focusDistanceSq);
          focusCore = Math.exp(-focusDistanceSq * 4.8);
          focusNeedle = Math.exp(-focusDistanceSq * 12);
          solarBand = Math.pow(Math.max(0, Math.cos(focusDistance * 8.2 - elapsed * 0.42 + seeds[seedOffset + S_E] * TAU)), 5.4);
          const travelSpark = Math.pow(Math.max(0, Math.sin(focusDistance * 9.5 - elapsed * 2.2 + seeds[seedOffset + S_A] * TAU)), 6);
          localLock = earthLock * smoothstep(0.18, 0.82, focusCore);
          shapeLight +=
            focusWeight * galaxyTravel * (0.46 + glowVoiceEnergy * 0.16) +
            solarBand * solarReveal * focusCore * 0.82 +
            travelSpark * galaxyTravel * smoothstep(1.6, 0.22, focusDistance) * 0.32 +
            focusNeedle * earthLock * (1.2 + glowVoiceEnergy * 0.12) +
            localLock * (1.1 + glowVoiceBeat * 0.22);
        }

        const speechExpansion =
          currentSettings.mode === 'speaking'
            ? role === ROLE_SHELL
              ? 1 + motionVoiceEnergy * 0.004
              : role === ROLE_HALO
                ? 1 + motionVoiceEnergy * 0.006 + motionVoiceBeat * 0.008 + motionPulsePower * 0.003
                : role === ROLE_METEOR
                  ? 1 + motionVoiceEnergy * 0.01 + motionVoiceBeat * 0.014 + motionPulsePower * 0.004
                  : 1 + motionVoiceEnergy * 0.024 + motionVoiceBeat * 0.022 + motionPulsePower * 0.008
            : role === ROLE_SHELL
              ? 1
              : 1 + motionVoiceEnergy * 0.014;
        target.multiplyScalar(speechExpansion);

        const responseWave =
          currentSettings.mode === 'speaking'
            ? Math.pow(Math.max(0, Math.sin(target.length() * 6.4 - elapsed * 4.6 + seeds[seedOffset + S_A] * TAU)), 5.2) *
              (0.36 + motionVoiceBeat * 0.64) *
              graphSpeechMotionDamping
            : 0;

        if (responseWave > 0) {
          target.multiplyScalar(
            1 +
              responseWave *
                (role === ROLE_SHELL
                  ? 0.008
                  : role === ROLE_CORE
                    ? 0.018
                    : role === ROLE_HALO
                      ? 0.024
                      : role === ROLE_METEOR
                        ? 0.018
                        : 0.038),
          );
        }

        if (hasLockedParticleTarget) {
          const routeNodeBlend = smoothstep(0.16, 0.86, graphProgress);
          const lockedParticleTargetLocalX = lockedParticleTargetX[index];
          const lockedParticleTargetLocalY = lockedParticleTargetY[index];
          const lockedParticleTargetLocalZ = lockedParticleTargetZ[index];
          const orbitX = lockedParticleTargetLocalX * innerDiamondCos - lockedParticleTargetLocalZ * innerDiamondSin;
          const orbitZ = lockedParticleTargetLocalX * innerDiamondSin + lockedParticleTargetLocalZ * innerDiamondCos;
          const lockTargetX = graphFocus.x + orbitX;
          const lockTargetY = graphFocus.y + lockedParticleTargetLocalY;
          const lockTargetZ = graphFocus.z + orbitZ;

          target.x += (lockTargetX - target.x) * routeNodeBlend;
          target.y += (lockTargetY - target.y) * routeNodeBlend;
          target.z += (lockTargetZ - target.z) * routeNodeBlend;
          shapeLight += routeNodeBlend * 1.7;
        }

        positions[offset] += (target.x - positions[offset]) * lerpAmount;
        positions[offset + 1] += (target.y - positions[offset + 1]) * lerpAmount;
        positions[offset + 2] += (target.z - positions[offset + 2]) * lerpAmount;

        if (
          !Number.isFinite(positions[offset]) ||
          !Number.isFinite(positions[offset + 1]) ||
          !Number.isFinite(positions[offset + 2])
        ) {
          positions[offset] = 0;
          positions[offset + 1] = 0;
          positions[offset + 2] = 0;
        }

        let color = palette[paletteSlots[index]];
        let meteorHeadColorWeight = 0;

        if (role === ROLE_METEOR) {
          const meteorTailOffset = meteorTailOffsets[index];
          meteorHeadColorWeight = 1 - smoothstep(0.018, 0.22, meteorTailOffset);
          const meteorAshWeight = smoothstep(0.48, 0.84, meteorTailOffset) * 0.36;
          meteorColorScratch.copy(meteorTailColor).lerp(meteorHeadColor, meteorHeadColorWeight).lerp(meteorAshColor, meteorAshWeight);
          color = meteorColorScratch;
        }
        const px = positions[offset];
        const py = positions[offset + 1];
        const pz = positions[offset + 2];
        const radius = Math.max(0.001, Math.hypot(px, py, pz));
        const nx = px / radius;
        const ny = py / radius;
        const nz = pz / radius;
        const listeningGlow =
          currentSettings.mode === 'listening'
            ? Math.exp(-(px * px + (py - 0.22) * (py - 0.22)) * 0.32) * (0.24 + glowVoiceEnergy * 0.38)
            : 0;
        const scanAngle = Math.atan2(py, px);
        const scanMeridian = Math.pow(Math.max(0, Math.cos(scanAngle * 2.4 - elapsed * 0.74 + nz * 1.25)), 7.2);
        const scanBand =
          role === ROLE_SHELL
            ? scanMeridian * smoothstep(-0.42, 0.92, nz) * 0.12
            : role === ROLE_RIBBON
              ? scanMeridian * 0.22
              : role === ROLE_HALO
                ? scanMeridian * 0.1
                : role === ROLE_METEOR
                  ? scanMeridian * 0.16
                  : 0;
        const frontLight = clamp(0.68 + pz * 0.18, 0.28, 1.46);
        const keyLight = clamp(nx * -0.36 + ny * 0.52 + nz * 0.78, 0, 1);
        const fillLight = clamp(nx * 0.12 + ny * 0.12 + nz * 0.32 + 0.24, 0, 0.72);
        const rimLight = Math.pow(clamp(1 - Math.abs(nz), 0, 1), 2.2) * (0.34 + keyLight * 0.44);
        const lowerShadow = smoothstep(0.1, 0.88, -ny * 0.72 - nx * 0.24 - nz * 0.18 + 0.28);
        const densityNoise = seeds[seedOffset + S_SHADE] * 0.2;
        const densityLight = clamp(keyLight * 0.86 + fillLight * 0.38 + rimLight * 0.58 + densityNoise - lowerShadow * 0.48, 0.04, 1.34);
        const sphereWeight =
          role === ROLE_HALO
            ? clamp(0.58 + rimLight * 0.3 + keyLight * 0.48 + frontLight * 0.25, 0.28, 1.46)
            : role === ROLE_CORE
              ? clamp(0.72 + keyLight * 0.34 + frontLight * 0.14, 0.5, 1.28)
            : role === ROLE_RIBBON
              ? clamp(0.48 + densityLight * 1.16 + rimLight * 0.5, 0.22, 1.72)
              : role === ROLE_METEOR
                ? clamp(0.44 + densityLight * 1.28 + rimLight * 0.62 + frontLight * 0.25, 0.16, 1.96)
              : clamp(0.22 + densityLight * 1.06 + rimLight * 0.2, 0.08, 1.28);
        const specular = Math.pow(keyLight, 5.2) * (role === ROLE_HALO ? 0.24 : role === ROLE_METEOR ? 0.48 : 0.62);
        const meteorHeadBoost = role === ROLE_METEOR ? 1 + meteorHeadColorWeight * 0.62 : 1;
        const shimmer =
          (shapeLight +
            Math.sin(elapsed * 1.05 + seeds[seedOffset + S_E] * TAU) * 0.036 +
            glowVoiceEnergy * 0.15 +
            glowVoiceBeat * 0.14 +
            scanBand +
            responseWave * (role === ROLE_SHELL ? 0.18 : role === ROLE_HALO ? 0.36 : 0.34) +
            listeningGlow * (role === ROLE_SHELL ? 0.18 : role === ROLE_HALO ? 0.42 : 0.34)) *
            frontLight *
            sphereWeight +
          specular;
        const baseGlow =
          role === ROLE_CORE ? 0.08 : role === ROLE_HALO ? 0.012 : role === ROLE_RIBBON ? 0.032 : role === ROLE_METEOR ? 0.004 : 0.032;

        const lockedNodeVisibility = hasLockedParticleTarget ? localGraphReveal * (1.08 + deepCollapse * 0.32) : 0;
        const prismPersistence =
          role === ROLE_SHELL
            ? deepCollapse * (activeIsAgentOrbitFocus ? 0.42 : 0.22)
            : role === ROLE_CORE
              ? deepCollapse * (activeIsAgentOrbitFocus ? 0.24 : 0.14)
              : 0;
        const finalVisibility = graphEffectsActive
          ? (1 - earthLock * 0.66) * (1 - deepCollapse * routeBodyPersistence) +
            earthLock * focusWeight * 0.16 * (1 - deepCollapse) +
            deepCollapse * (focusNeedle * 0.24 + localLock * 0.42) +
            solarBand * solarReveal * focusCore * 0.16 +
            lockedNodeVisibility +
            prismPersistence
          : 1;
        const roleBrightness =
          role === ROLE_HALO
            ? OUTER_PARTICLE_BRIGHTNESS_BOOST
            : role === ROLE_RIBBON
              ? 1.42
              : role === ROLE_METEOR
                ? 2.08 * meteorHeadBoost
                : 1;
        const finalGlow =
          (shimmer + baseGlow) *
          clamp(finalVisibility, 0.012 + 0.04 * (1 - deepCollapse), 3.8) *
          STAR_BRIGHTNESS_BOOST *
          roleBrightness;
        colors[offset] = color.r * finalGlow;
        colors[offset + 1] = color.g * finalGlow;
        colors[offset + 2] = color.b * finalGlow;
        }

        positionAttribute.addUpdateRange(updateRange.start * 3, updateRange.count * 3);
        colorAttribute.addUpdateRange(updateRange.start * 3, updateRange.count * 3);
      }

      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      const simulationCost = performance.now() - simulationStartedAt;

      if (simulationWarmupPending) {
        simulationWarmupPending = false;
        lastSimulationBudgetCheckAt = frameNow;
      } else {
        simulationCostAverage = simulationCostAverage === 0 ? simulationCost : simulationCostAverage * 0.78 + simulationCost * 0.22;
        simulationSliceIndex = (simulationSliceIndex + 1) % simulationSlices;

        if (frameNow - lastSimulationBudgetCheckAt >= SIMULATION_BUDGET_RECHECK_MS) {
          lastSimulationBudgetCheckAt = frameNow;
          const nextSimulationSlices = adaptSimulationSlices(
            simulationSlices,
            minimumSimulationSlices,
            simulationCostAverage,
          );

          if (nextSimulationSlices !== simulationSlices) {
            simulationSlices = nextSimulationSlices;
            simulationSliceIndex %= simulationSlices;
          }
        }
      }

      lockLinePositions.fill(0);
      lockPointPositions.fill(0);
      const lockedCount = lockedGraphNodes.length;
      const pointAlpha = localGraphReveal * (lockedCount > 0 ? 1 : 0);
      const lineAlpha = localGraphReveal * (lockedCount > 1 ? 1 : 0);
      const projectedLockPoints = lockedGraphNodes.map((node) => {
        const orbitX = node.x * innerDiamondCos - node.z * innerDiamondSin;
        const orbitZ = node.x * innerDiamondSin + node.z * innerDiamondCos;

        return {
          x: graphDisplayCenter.x + orbitX,
          y: graphDisplayCenter.y + node.y,
          z: graphDisplayCenter.z + deepCollapse * 0.12 + orbitZ,
        };
      });

      projectedLockPoints.forEach((candidate, pointIndex) => {
        const pointOffset = pointIndex * 3;
        lockPointPositions[pointOffset] = candidate.x;
        lockPointPositions[pointOffset + 1] = candidate.y;
        lockPointPositions[pointOffset + 2] = candidate.z;
      });

      lockedGraphEdges.forEach(([fromIndex, toIndex], edgeIndex) => {
        if (edgeIndex >= maxLockEdges || fromIndex >= lockedCount || toIndex >= lockedCount) {
          return;
        }

          const from = projectedLockPoints[fromIndex];
          const to = projectedLockPoints[toIndex];
          const lineOffset = edgeIndex * 6;
          lockLinePositions[lineOffset] = from.x;
          lockLinePositions[lineOffset + 1] = from.y;
          lockLinePositions[lineOffset + 2] = from.z;
          lockLinePositions[lineOffset + 3] = to.x;
          lockLinePositions[lineOffset + 4] = to.y;
          lockLinePositions[lineOffset + 5] = to.z;
      });

      lockLineGeometry.attributes.position.needsUpdate = true;
      lockPointGeometry.attributes.position.needsUpdate = true;
      const lineOpacityTarget = lineAlpha * (activeIsAgentOrbitFocus ? 0.42 : 0.78);
      lockLineMaterial.opacity += (lineOpacityTarget - lockLineMaterial.opacity) * 0.08;
      lockPointMaterial.opacity += (pointAlpha * 1 - lockPointMaterial.opacity) * 0.1;
      meteorLinePositions.fill(0);
      meteorHeadPositions.fill(999);
      let meteorLineStrength = 0;
      const meteorFocusFade = 1 - deepCollapse * (activeIsAgentOrbitFocus ? 0.72 : 0.56);

      for (let lane = 0; lane < METEOR_STREAM_COUNT; lane += 1) {
        for (let cluster = 0; cluster < METEOR_CLUSTER_COUNT; cluster += 1) {
          const clusterIndex = lane * METEOR_CLUSTER_COUNT + cluster;
          const lineBase = clusterIndex * METEOR_LINES_PER_CLUSTER;
          const clusterSeed = lane * 92821 + cluster * 68917;
          const lanePhase = lane * 1.74 + cluster * 0.82;
          const showerPulse = Math.pow(Math.max(0, Math.sin(elapsed * 0.46 + lanePhase)), 2.4);
          const headTravel =
            (elapsed * (0.112 + lane * 0.006 + cluster * 0.004) + seededUnit(clusterSeed + 19) * 0.94) % 1;
          const pathVisibility = smoothstep(0.02, 0.11, headTravel) * (1 - smoothstep(0.9, 0.99, headTravel));
          const eventVisibility = smoothstep(0.04, 0.72, showerPulse) * pathVisibility * meteorFocusFade;

          if (eventVisibility < 0.1) {
            continue;
          }

          meteorLineStrength = Math.max(meteorLineStrength, eventVisibility);

          const laneDirection = lane % 2 === 0 ? 1 : -1;
          const arcLift = Math.sin(headTravel * Math.PI);
          const sweepWidth = 5.05 + seededUnit(clusterSeed + 87) * 0.62;
          const entryX = laneDirection * (-2.55 - seededUnit(clusterSeed + 41) * 0.26);
          const headX = entryX + laneDirection * sweepWidth * headTravel;
          const headY = 1.24 - headTravel * 2.34 + arcLift * 0.36 + (lane - 1.5) * 0.15;
          const headZ = -0.3 + arcLift * 0.64 + seededSigned(clusterSeed + 91) * 0.026 - headTravel * 0.04;
          const tangentX = laneDirection * sweepWidth;
          const tangentY = -2.34 + Math.cos(headTravel * Math.PI) * Math.PI * 0.36;
          const tangentZ = Math.cos(headTravel * Math.PI) * Math.PI * 0.64 - 0.04;
          const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY, tangentZ));
          const dirX = tangentX / tangentLength;
          const dirY = tangentY / tangentLength;
          const dirZ = tangentZ / tangentLength;
          const perpLength = Math.max(0.001, Math.hypot(dirX, dirY));
          const perpX = -dirY / perpLength;
          const perpY = dirX / perpLength;
          const trailLength = (0.34 + seededUnit(clusterSeed + 137) * 0.2 + eventVisibility * 0.16) * (0.92 + graphBlend * 0.12);
          const headSize = (0.04 + seededUnit(clusterSeed + 173) * 0.026) * (0.64 + eventVisibility * 0.56);
          const tailX = headX - dirX * trailLength;
          const tailY = headY - dirY * trailLength;
          const tailZ = headZ - dirZ * trailLength;
          const headPointBase = clusterIndex * METEOR_HEAD_POINTS_PER_CLUSTER;

          setMeteorHead(headPointBase, headX + dirX * headSize * 0.48, headY + dirY * headSize * 0.48, headZ + dirZ * headSize * 0.48);
          setMeteorHead(
            headPointBase + 1,
            headX - dirX * headSize * 0.2 + perpX * headSize * 0.32,
            headY - dirY * headSize * 0.2 + perpY * headSize * 0.32,
            headZ - dirZ * headSize * 0.2 + headSize * 0.16,
          );
          setMeteorHead(
            headPointBase + 2,
            headX - dirX * headSize * 0.3 - perpX * headSize * 0.25,
            headY - dirY * headSize * 0.3 - perpY * headSize * 0.25,
            headZ - dirZ * headSize * 0.3 - headSize * 0.12,
          );
          setMeteorHead(
            headPointBase + 3,
            headX - dirX * headSize * 0.64 + perpX * headSize * seededSigned(clusterSeed + 277) * 0.18,
            headY - dirY * headSize * 0.64 + perpY * headSize * seededSigned(clusterSeed + 281) * 0.18,
            headZ - dirZ * headSize * 0.64 + seededSigned(clusterSeed + 283) * headSize * 0.18,
          );

          setMeteorLine(
            lineBase,
            headX - dirX * headSize * 0.1,
            headY - dirY * headSize * 0.1,
            headZ - dirZ * headSize * 0.1,
            tailX,
            tailY,
            tailZ,
          );

          for (let filament = 0; filament < 4; filament += 1) {
            const filamentSeed = seededSigned(clusterSeed + filament * 53 + 211);
            const side = (filament - 1.5) * headSize * (0.26 + Math.abs(filamentSeed) * 0.22);
            const lengthScale = 0.62 + seededUnit(clusterSeed + filament * 71 + 229) * 0.34;
            const endSpread = 1.3 + seededUnit(clusterSeed + filament * 97 + 251) * 1.2;
            const startX = headX + perpX * side * 0.45 - dirX * headSize * 0.2;
            const startY = headY + perpY * side * 0.45 - dirY * headSize * 0.2;
            const startZ = headZ + filamentSeed * headSize * 0.22 - dirZ * headSize * 0.2;
            const endX = headX - dirX * trailLength * lengthScale + perpX * side * endSpread;
            const endY = headY - dirY * trailLength * lengthScale + perpY * side * endSpread;
            const endZ = headZ - dirZ * trailLength * lengthScale + filamentSeed * headSize * 0.5;

            setMeteorLine(lineBase + 1 + filament, startX, startY, startZ, endX, endY, endZ);
          }

          for (let spark = 0; spark < 4; spark += 1) {
            const sparkSide = seededSigned(clusterSeed + spark * 79 + 311) * headSize * 0.5;
            const sparkDepth = seededSigned(clusterSeed + spark * 83 + 337) * headSize * 0.24;
            const sparkStart = 0.18 + seededUnit(clusterSeed + spark * 89 + 353) * 0.22;
            const sparkLength = 0.24 + seededUnit(clusterSeed + spark * 97 + 379) * 0.34;
            const startX = headX - dirX * headSize * sparkStart + perpX * sparkSide * 0.42;
            const startY = headY - dirY * headSize * sparkStart + perpY * sparkSide * 0.42;
            const startZ = headZ - dirZ * headSize * sparkStart + sparkDepth * 0.42;
            const endX = headX - dirX * headSize * (sparkStart + sparkLength) + perpX * sparkSide;
            const endY = headY - dirY * headSize * (sparkStart + sparkLength) + perpY * sparkSide;
            const endZ = headZ - dirZ * headSize * (sparkStart + sparkLength) + sparkDepth;

            setMeteorLine(lineBase + 5 + spark, startX, startY, startZ, endX, endY, endZ);
          }
        }
      }

      meteorLineGeometry.attributes.position.needsUpdate = true;
      meteorHeadGeometry.attributes.position.needsUpdate = true;
      const meteorLineOpacityTarget = clamp(meteorLineStrength * (width < 720 ? 0.34 : 0.28) * (1 + glowVoiceEnergy * 0.1), 0, 0.44);
      const meteorHeadOpacityTarget = clamp(meteorLineStrength * (width < 720 ? 0.92 : 0.78) * (1 + glowVoiceEnergy * 0.12), 0, 0.96);
      meteorLineMaterial.opacity += (meteorLineOpacityTarget - meteorLineMaterial.opacity) * 0.12;
      meteorHeadMaterial.opacity += (meteorHeadOpacityTarget - meteorHeadMaterial.opacity) * 0.14;
      meteorLines.visible = meteorLineMaterial.opacity > 0.004;
      meteorHeads.visible = meteorHeadMaterial.opacity > 0.004;
      const openingWarpSpeechLift =
        graphTargetProgress > 0 ? 0 : currentSettings.mode === 'speaking' ? voiceEnergy * 0.08 + voiceBeat * 0.04 : voiceEnergy * 0.025;
      const openingWarpLengthBoost =
        graphTargetProgress > 0 ? 1 : 1.42 + voiceEnergy * 0.42 + (currentSettings.mode === 'speaking' ? voiceBeat * 0.18 : 0);
      const warpFinalFade = graphTargetProgress > 0 ? 1 - smoothstep(0.62, 0.84, graphProgress) : 1;
      const warpCruise = graphTargetProgress > 0 ? 0.18 * (1 - smoothstep(0.58, 0.76, graphProgress)) : 0.24 + openingWarpSpeechLift;
      const warpSurge =
        graphTargetProgress > 0
          ? smoothstep(0.08, 0.48, graphProgress) * (1 - smoothstep(0.54, 0.78, graphProgress))
          : 0;
      const warpEnergy = graphTargetProgress > 0 ? (0.46 + warpSurge * 1.28) * warpFinalFade : 0.54 + voiceEnergy * 0.16 + voiceBeat * 0.08;
      const warpAlphaTarget = clamp(
        (warpCruise + warpSurge * (activeIsAgentOrbitFocus ? 0.72 : 0.56)) * warpFinalFade,
        0,
        0.82,
      );

      for (let warpIndex = 0; warpIndex < warpLineCount; warpIndex += 1) {
        const warpOffset = warpIndex * 6;
        const seedA = warpSeedA[warpIndex];
        const seedB = warpSeedB[warpIndex];
        const seedC = warpSeedC[warpIndex];
        const tunnel = (elapsed * (0.74 + seedB * 0.52) + seedA) % 1;
        const angle = seedA * TAU + Math.sin(elapsed * 0.09 + seedB * TAU) * 0.05;
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);
        const radius = (0.18 + seedC * 1.34 + tunnel * 0.22) * (0.82 + graphBlend * 0.68);
        const lineLength = (0.055 + seedB * 0.16) * warpEnergy * openingWarpLengthBoost * (activeIsAgentOrbitFocus ? 1.24 : 1);
        const focusX = graphDisplayCenter.x * 0.42;
        const focusY = graphDisplayCenter.y * 0.58;
        const startX = focusX + directionX * radius;
        const startY = focusY + directionY * radius * 0.62;
        const startZ = graphDisplayCenter.z - 0.44 + tunnel * 0.76 + seedB * 0.08;

        warpLinePositions[warpOffset] = startX;
        warpLinePositions[warpOffset + 1] = startY;
        warpLinePositions[warpOffset + 2] = startZ;
        warpLinePositions[warpOffset + 3] = startX + directionX * lineLength;
        warpLinePositions[warpOffset + 4] = startY + directionY * lineLength * 0.62;
        warpLinePositions[warpOffset + 5] = startZ + lineLength * 0.36;
      }

      warpLineGeometry.attributes.position.needsUpdate = true;
      const warpOpacityLerp = warpAlphaTarget < warpLineMaterial.opacity ? 0.18 : 0.08;
      warpLineMaterial.opacity +=
        (warpAlphaTarget - warpLineMaterial.opacity) * frameAdjustedLerp(warpOpacityLerp, frameUnits);
      if (warpAlphaTarget <= 0.001 && warpLineMaterial.opacity < 0.012) {
        warpLineMaterial.opacity = 0;
      }
      warpLines.visible = warpAlphaTarget > 0.001 || warpLineMaterial.opacity > 0.001;

      sceneSpin += delta * STAR_SPIN_SPEED;
      if (graphRotationActive) {
        visibleSceneSpin = GRAPH_LOCKED_ROTATION;
        graphLayerSpin = GRAPH_LOCKED_ROTATION;
      } else {
        visibleSceneSpin = lerpAngle(visibleSceneSpin, sceneSpin, frameAdjustedLerp(0.08, frameUnits));
        graphLayerSpin = lerpAngle(graphLayerSpin, visibleSceneSpin, frameAdjustedLerp(0.14, frameUnits));
      }
      points.rotation.y = visibleSceneSpin;
      points.rotation.x = graphRotationActive ? GRAPH_LOCKED_ROTATION : Math.sin(elapsed * 0.07) * 0.012;
      points.rotation.z = graphRotationActive
        ? GRAPH_LOCKED_ROTATION
        : STAR_TILT_Z + Math.sin(elapsed * 0.055) * 0.006;
      lockLines.rotation.copy(points.rotation);
      lockPoints.rotation.copy(points.rotation);
      lockLines.rotation.y = graphLayerSpin;
      lockPoints.rotation.y = graphLayerSpin;
      meteorLines.rotation.copy(points.rotation);
      meteorHeads.rotation.copy(points.rotation);
      pulsePower = Math.max(0, pulsePower - delta * 1.35);

      const coreScale = (width < 720 ? 1.22 : 1.56) * STAR_SCALE_BOOST;
      const graphScale = (width < 720 ? (activeIsAgentOrbitFocus ? 2.22 : 2.02) : activeIsAgentOrbitFocus ? 2.56 : 2.38) * STAR_SCALE_BOOST;
      const baseScale = coreScale + (graphScale - coreScale) * graphBlend;
      const outputScale =
        currentSettings.mode === 'speaking'
          ? (0.03 + motionVoiceEnergy * 0.075 + motionVoiceBeat * 0.04) * graphSpeechMotionDamping
          : motionVoiceEnergy * 0.018;
      points.scale.setScalar(baseScale * (1 + outputScale + motionPulsePower * 0.018));
      meteorLines.scale.copy(points.scale);
      meteorHeads.scale.copy(points.scale);
      const focusLayerScale = (width < 720 ? 1.16 : 1.3) * STAR_SCALE_BOOST;
      lockLines.scale.setScalar(focusLayerScale);
      lockPoints.scale.setScalar(focusLayerScale);
      warpLines.scale.setScalar(focusLayerScale * (activeIsAgentOrbitFocus ? 1.04 : 1));
      const sceneLift = (width < 720 ? 0.62 : 0.42) + graphBlend * (width < 720 ? 0.08 : 0.12);
      points.position.y += (sceneLift - points.position.y) * frameAdjustedLerp(0.08, transitionFrameUnits);
      meteorLines.position.copy(points.position);
      meteorHeads.position.copy(points.position);
      const graphLayerY = width < 720 ? 0.02 : 0.03;
      lockLines.position.y += (graphLayerY - lockLines.position.y) * frameAdjustedLerp(0.12, transitionFrameUnits);
      lockPoints.position.y = lockLines.position.y;
      warpLines.position.y = lockLines.position.y;

      const particleDensityCompensation = 1 + (1 - particleDrawRatio) * 0.28;
      const targetSize =
        ((width < 720 ? 0.032 : 0.028) +
          motionVoiceEnergy * 0.016 +
          (currentSettings.mode === 'speaking' ? motionVoiceBeat * 0.012 : 0) +
          motionPulsePower * 0.004) *
        particleDensityCompensation;
      material.size += (targetSize - material.size) * frameAdjustedLerp(0.1, frameUnits);
      const lockPointTargetSize =
        (width < 720 ? 0.11 : 0.096) + localGraphReveal * (activeIsAgentOrbitFocus ? (width < 720 ? 0.092 : 0.082) : width < 720 ? 0.07 : 0.058);
      lockPointMaterial.size +=
        (lockPointTargetSize - lockPointMaterial.size) * frameAdjustedLerp(0.12, frameUnits);
      const cameraFocusBlend = graphBlend * (activeIsAgentOrbitFocus ? 0.68 : 0.28);
      const cameraFocusSource = activeIsAgentOrbitFocus ? graphDisplayCenter : graphFocus;
      const cameraX = cameraFocusBlend * cameraFocusSource.x * (activeIsAgentOrbitFocus ? 0.34 : 0.08);
      const cameraY =
        0.08 +
        cameraFocusBlend * cameraFocusSource.y * (activeIsAgentOrbitFocus ? 0.42 : 0.1);
      const cameraZ = 6.72 - graphBlend * (activeIsAgentOrbitFocus ? (width < 720 ? 1.06 : 1.34) : width < 720 ? 0.72 : 0.88);
      const lookAtX = cameraFocusSource.x * cameraFocusBlend * (activeIsAgentOrbitFocus ? 0.48 : 0.08);
      const lookAtY = cameraFocusSource.y * cameraFocusBlend * (activeIsAgentOrbitFocus ? 0.58 : 0.1);
      const lookAtZ = cameraFocusSource.z * cameraFocusBlend * (activeIsAgentOrbitFocus ? 0.34 : 0.08);
      const targetFov = 48 - graphBlend * (activeIsAgentOrbitFocus ? 8.4 : 4.8);
      const nextFov = camera.fov + (targetFov - camera.fov) * frameAdjustedLerp(0.04, transitionFrameUnits);

      if (Math.abs(nextFov - camera.fov) > 0.0005) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }

      const cameraPositionLerp = frameAdjustedLerp(0.04, transitionFrameUnits);
      camera.position.x += (cameraX - camera.position.x) * cameraPositionLerp;
      camera.position.y += (cameraY - camera.position.y) * cameraPositionLerp;
      camera.position.z += (cameraZ - camera.position.z) * cameraPositionLerp;
      cameraLookAtTarget.set(lookAtX, lookAtY, lookAtZ);
      cameraLookAt.lerp(cameraLookAtTarget, frameAdjustedLerp(0.05, transitionFrameUnits));
      camera.lookAt(cameraLookAt);

      if (frameNow - lastLabelUpdateAt >= 1000 / GRAPH_LABEL_FRAME_RATE) {
        lastLabelUpdateAt = frameNow;
        updateGraphLabels(localGraphReveal, deepCollapse, innerDiamondCos, innerDiamondSin);
      }
      renderer.render(scene, camera);
      actualFrameRateFrameCount += 1;
      const actualFrameRateWindowMs = frameNow - actualFrameRateWindowStarted;
      if (actualFrameRateWindowMs >= 1000) {
        actualFrameRate = (actualFrameRateFrameCount * 1000) / actualFrameRateWindowMs;
        host.dataset.actualFrameRate = actualFrameRate.toFixed(1);
        actualFrameRateWindowStarted = frameNow;
        actualFrameRateFrameCount = 0;
      }
      const frameWorkCost = performance.now() - frameNow;
      frameWorkCostAverage =
        frameWorkCostAverage === 0 ? frameWorkCost : frameWorkCostAverage * 0.82 + frameWorkCost * 0.18;
      host.dataset.frameWorkCost = frameWorkCostAverage.toFixed(1);
      animationId = requestAnimationFrame(animate);
    };

    resize();
    animate();

    window.addEventListener('resize', resize);
    window.addEventListener('keydown', unlockAudioGesture);
    document.addEventListener('pointerdown', unlockAudioGesture);
    host.addEventListener('pointerdown', triggerPulse);
    renderer.domElement.addEventListener('webglcontextlost', handleWebglContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleWebglContextRestored);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', unlockAudioGesture);
      document.removeEventListener('pointerdown', unlockAudioGesture);
      host.removeEventListener('pointerdown', triggerPulse);
      renderer.domElement.removeEventListener('webglcontextlost', handleWebglContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleWebglContextRestored);
      if (previousRootPerformanceTier) {
        rootElement.dataset.visualPerformance = previousRootPerformanceTier;
      } else {
        delete rootElement.dataset.visualPerformance;
      }
      geometry.dispose();
      lockLineGeometry.dispose();
      lockPointGeometry.dispose();
      warpLineGeometry.dispose();
      meteorLineGeometry.dispose();
      meteorHeadGeometry.dispose();
      material.map?.dispose();
      material.dispose();
      lockLineMaterial.dispose();
      lockPointMaterial.dispose();
      warpLineMaterial.dispose();
      meteorLineMaterial.dispose();
      meteorHeadMaterial.dispose();
      void warpSfxContext?.close().catch(() => undefined);
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.remove();
    };
  }, []);

  return (
    <div className="particle-field" ref={hostRef} data-performance-mode={performanceMode} data-testid="particle-field">
      <div className="cockpit-hud" aria-hidden="true">
        <span className="cockpit-hud__reticle" />
        <span className="cockpit-hud__horizon" />
        <span className="cockpit-hud__canopy cockpit-hud__canopy--left" />
        <span className="cockpit-hud__canopy cockpit-hud__canopy--right" />
        <span className="cockpit-hud__rail cockpit-hud__rail--left" />
        <span className="cockpit-hud__rail cockpit-hud__rail--right" />
        <span className="cockpit-hud__arc cockpit-hud__arc--top" />
        <span className="cockpit-hud__arc cockpit-hud__arc--bottom" />
        <span className="cockpit-hud__scan cockpit-hud__scan--top" />
        <span className="cockpit-hud__scan cockpit-hud__scan--bottom" />
        <span className="cockpit-hud__meter cockpit-hud__meter--left" />
        <span className="cockpit-hud__meter cockpit-hud__meter--right" />
        <span className="cockpit-hud__control cockpit-hud__control--left" />
        <span className="cockpit-hud__control cockpit-hud__control--right" />
        <span className="cockpit-hud__sight cockpit-hud__sight--left" />
        <span className="cockpit-hud__sight cockpit-hud__sight--right" />
        <span className="cockpit-hud__corner cockpit-hud__corner--tl" />
        <span className="cockpit-hud__corner cockpit-hud__corner--tr" />
        <span className="cockpit-hud__corner cockpit-hud__corner--bl" />
        <span className="cockpit-hud__corner cockpit-hud__corner--br" />
      </div>
    </div>
  );
}
