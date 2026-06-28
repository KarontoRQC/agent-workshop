import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { DialogueMode, ParticleSettings } from '../types';

type ParticleFieldProps = {
  audioLevel: number;
  graphFocusKey?: string;
  graphRoute?: string[];
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
const STAR_SCALE_BOOST = 1.3;
const STAR_BRIGHTNESS_BOOST = 1.36;
const STAR_SPIN_SPEED = 0.2;
const STAR_TILT_Z = 0;
const INNER_DIAMOND_SPIN_SPEED = 0.58;
const HALO_RING_COUNT = 9;
const HALO_RING_SCALE_BOOST = 1.18;
const OUTER_PARTICLE_BRIGHTNESS_BOOST = 1.2;

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

export default function ParticleField({ audioLevel, graphFocusKey = '', graphRoute = [], settings }: ParticleFieldProps) {
  const audioLevelRef = useRef(audioLevel);
  const graphFocusKeyRef = useRef(graphFocusKey);
  const graphRouteRef = useRef(graphRoute);
  const hostRef = useRef<HTMLDivElement>(null);
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
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020614, 0.055);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0.08, 6.72);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x020614, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const labelLayer = document.createElement('div');
    labelLayer.className = 'graph-node-label-layer';
    host.appendChild(labelLayer);

    const width = host.clientWidth || window.innerWidth;
    const particleCount = width < 720 ? 15000 : 28000;
    const defaultGraphFocus = new THREE.Vector3(width < 720 ? 0.22 : 0.36, width < 720 ? 0.3 : 0.22, 0.16);
    const graphFocus = defaultGraphFocus.clone();
    const graphFocusTarget = defaultGraphFocus.clone();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * SEED_STRIDE);
    const target = new THREE.Vector3();
    const labelProjection = new THREE.Vector3();

    for (let index = 0; index < particleCount; index += 1) {
      const seedOffset = index * SEED_STRIDE;
      const mix = index / particleCount;
      const role = mix < 0.045 ? ROLE_CORE : mix < 0.5 ? ROLE_SHELL : mix < 0.69 ? ROLE_RIBBON : ROLE_HALO;
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

      positions[index * 3] = (randomA - 0.5) * 0.35;
      positions[index * 3 + 1] = (randomB - 0.5) * 0.35;
      positions[index * 3 + 2] = (randomC - 0.5) * 0.35;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const maxLockPoints = 6;
    const maxLockEdges = 8;
    const lockLinePositions = new Float32Array(maxLockEdges * 6);
    const lockLineGeometry = new THREE.BufferGeometry();
    lockLineGeometry.setAttribute('position', new THREE.BufferAttribute(lockLinePositions, 3));
    const lockPointPositions = new Float32Array(maxLockPoints * 3);
    const lockPointGeometry = new THREE.BufferGeometry();
    lockPointGeometry.setAttribute('position', new THREE.BufferAttribute(lockPointPositions, 3));

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

    const pointer = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    const startTime = performance.now();
    let lastFrameTime = startTime;
    let animationId = 0;
    let pulsePower = 0;
    let pointerCharge = 0;
    let lastPointerMoveTime = -Infinity;
    let voiceEnvelope = 0;
    let voiceBeatEnvelope = 0;
    let graphProgress = 0;
    let lastGraphFocusKey = '';
    let pendingGraphFocusKey = '';
    let lastPulseSeed = settingsRef.current.pulseSeed;
    type LockedGraphNode = { label: string; particleIndex: number; phase: number; routeIndex: number; x: number; y: number; z: number };
    let lockedGraphNodes: LockedGraphNode[] = [];
    let lockedGraphEdges: [number, number][] = [];
    let lockedParticleTargets = new Map<number, { x: number; y: number; z: number }>();
    let lockedGraphLabels: HTMLSpanElement[] = [];
    const defaultGraphDisplayCenter = new THREE.Vector3(0, width < 720 ? 0.03 : 0.06, 0.34);
    const graphDisplayCenter = defaultGraphDisplayCenter.clone();
    const graphDisplayCenterTarget = defaultGraphDisplayCenter.clone();

    const clearGraphLabels = () => {
      if (lockedGraphLabels.length === 0) {
        return;
      }

      labelLayer.replaceChildren();
      lockedGraphLabels = [];
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
    };

    const updateGraphLabels = (localGraphReveal: number, deepCollapse: number) => {
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

        labelProjection.set(
          graphDisplayCenter.x + node.x,
          graphDisplayCenter.y + node.y,
          graphDisplayCenter.z + deepCollapse * 0.12 + node.z,
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
        const screenX = (labelProjection.x * 0.5 + 0.5) * hostWidth;
        const screenY = (-labelProjection.y * 0.5 + 0.5) * hostHeight;

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
        lockedParticleTargets = new Map();
        clearGraphLabels();
        return;
      }

      for (let index = 0; index < routeKey.length; index += 1) {
        routeHash = (routeHash * 31 + routeKey.charCodeAt(index)) >>> 0;
      }

      const candidatePool: { index: number; score: number; x: number; y: number; z: number }[] = [];

      for (let index = 0; index < particleCount; index += 1) {
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
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
            score: Math.random() + seeds[seedOffset + S_A] * 0.22 + seeds[seedOffset + S_E] * 0.08,
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
        lockedParticleTargets = new Map();
        clearGraphLabels();
        return;
      }

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

      if (!Number.isFinite(graphFocusTarget.x) || graphFocusTarget.lengthSq() < 0.08) {
        graphFocusTarget.copy(defaultGraphFocus);
      }

      const driftAngle = ((routeHash % 360) / 360) * TAU;
      const centerDrift = width < 720 ? 0.035 : 0.07;
      graphDisplayCenterTarget.set(
        Math.cos(driftAngle) * centerDrift,
        defaultGraphDisplayCenter.y + Math.sin(driftAngle) * centerDrift * 0.45,
        0.34 + ((routeHash % 17) / 17) * 0.035,
      );

      const pathWidth = routeCount <= 2 ? (width < 720 ? 0.46 : 0.62) : width < 720 ? 0.78 : 1.08;
      const pathHeight = width < 720 ? 0.16 : 0.22;
      const depthSpread = width < 720 ? 0.06 : 0.1;
      const routePhase = routeHash * 0.0007;

      lockedGraphNodes = selectedCandidates.map((candidate, routeIndex) => {
        const progress = routeCount === 1 ? 0.5 : routeIndex / (routeCount - 1);
        const centeredProgress = progress - 0.5;
        const pathBend = Math.sin(progress * Math.PI);
        const nodeX = centeredProgress * pathWidth;
        const nodeY =
          Math.sin((progress - 0.5) * Math.PI) * pathHeight +
          (routeIndex % 2 === 0 ? -0.035 : 0.045) * (1 - pathBend * 0.16);
        const nodeZ = Math.cos(progress * Math.PI * 1.25 + routePhase) * depthSpread;

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

      lockedGraphEdges = lockedGraphNodes.slice(1).map((_, index) => [index, index + 1]);
      lockedParticleTargets = new Map();
      syncGraphLabels(lockedGraphNodes.map((node) => node.label));
      const particlePathScale = width < 720 ? 0.42 : 0.5;

      lockedGraphNodes.forEach((node) => {
        lockedParticleTargets.set(node.particleIndex, {
          x: graphFocusTarget.x + node.x * particlePathScale,
          y: graphFocusTarget.y + node.y * particlePathScale,
          z: graphFocusTarget.z + node.z * particlePathScale,
        });
      });
    };

    const resize = () => {
      const nextWidth = Math.max(1, host.clientWidth || window.innerWidth);
      const nextHeight = Math.max(1, host.clientHeight || window.innerHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointerTarget.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointerTarget.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      lastPointerMoveTime = performance.now();
    };

    const clearPointer = () => {
      lastPointerMoveTime = -Infinity;
    };

    const triggerPulse = () => {
      pulsePower = Math.max(pulsePower, 1);
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
      const phase = seeds[seedOffset + S_E] * TAU;
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
        (voiceEnergy * 0.16 + voiceBeat * 0.2 + pulsePower * 0.08 + statePressure) * (0.7 + shade * 0.3);
      const listeningCharge = currentSettings.mode === 'listening' ? 0.52 + voiceEnergy * 0.42 : 0;
      const attentionCharge = Math.max(pointerCharge, listeningCharge);

      if (role === ROLE_CORE) {
        const theta = seeds[seedOffset + S_A] * TAU + time * 0.035;
        const latitude = Math.asin(clamp(seeds[seedOffset + S_B] * 2 - 1, -0.92, 0.92));
        const radius = 0.3 + seeds[seedOffset + S_C] * 0.62 + breath * 0.8 + restrainedPulse * 0.28;

        sphericalToPoint(theta, latitude, radius, target);
        return 0.62 + voiceEnergy * 0.16 + voiceBeat * 0.18;
      }

      if (role === ROLE_RIBBON) {
        const energyLine = seeds[seedOffset + S_D] > 0.72;
        const column = Math.floor(seeds[seedOffset + S_A] * 104);
        const columnProgress = column / 103;
        const x = (columnProgress - 0.5) * 4.1;
        const envelope = clamp(1 - Math.pow(Math.abs(x) / 2.3, 1.72), 0, 1);
        const verticalSeed = seeds[seedOffset + S_B] * 2 - 1;
        const sideFade = smoothstep(2.18, 0.2, Math.abs(x));
        const crossFade = smoothstep(2.1, 0.3, Math.abs(x));

        if (energyLine) {
          const travel = (seeds[seedOffset + S_B] + time * (0.028 + voiceBeat * 0.026)) % 1;
          const wave =
            Math.sin(x * 2.35 - time * (1.15 + voiceBeat * 1.1) + phase) * 0.12 +
            Math.sin(x * 4.35 + time * 0.58 + phase) * 0.045;
          const lineY = wave + (seeds[seedOffset + S_WIDTH] * 0.55);
          const linePulse =
            Math.pow(Math.max(0, Math.sin(travel * TAU * 2.2 + x * 1.35 - time * 2.2)), 5) *
            (0.48 + voiceEnergy * 0.58);

          target.set(
            x * (1.02 + linePulse * 0.025),
            lineY,
            0.1 + Math.sin(x * 1.4 + phase) * 0.08 + linePulse * 0.12,
          );

          return 0.12 + crossFade * 0.18 + linePulse * 1.24 + voiceBeat * 0.12;
        }

        const curtainHeight =
          0.28 +
          envelope * 1.08 +
          Math.sin(x * 2.1 + time * 0.34) * 0.06 +
          Math.sin(x * 3.8 - time * 0.24 + phase) * 0.04;
        const verticalFlow = (seeds[seedOffset + S_C] + time * (0.018 + seeds[seedOffset + S_FLOW] * 0.006)) % 1;
        const flowOffset = (verticalFlow - 0.5) * 0.1;
        const y = verticalSeed * curtainHeight + flowOffset;
        const voiceRidge =
          Math.pow(Math.max(0, Math.sin(x * 3.3 + y * 1.15 - time * (1.8 + voiceBeat * 1.4) + phase)), 5.6) *
          (0.38 + voiceEnergy * 0.42);
        const centerPull = Math.exp(-(x * x) * 0.46) * 0.12;
        const z =
          -0.36 +
          Math.sin(x * 1.4 + y * 0.8 + time * 0.2 + phase) * 0.1 +
          centerPull +
          voiceRidge * 0.11;

        target.set(x, y * 0.86, z);

        if (attentionCharge > 0.02) {
          const pointerX = pointer.x * 2.28;
          const pointerY = pointer.y * 1.48;
          const dx = x - pointerX;
          const dy = y - pointerY;
          const focus = attentionCharge * Math.exp(-(dx * dx + dy * dy) * 0.38);
          target.x += (pointerX - target.x) * focus * 0.18;
          target.y += (pointerY - target.y) * focus * 0.16;
          target.z += focus * 0.36;
        }

        return 0.045 + sideFade * 0.11 + voiceRidge * 0.92 + centerPull * 0.36 + voiceBeat * 0.055;
      }

      if (role === ROLE_HALO) {
        const basePad = seeds[seedOffset + S_E] < 0.1;
        const orbitWrap = !basePad && seeds[seedOffset + S_D] < 0.9;
        const frame = !basePad && !orbitWrap;
        const side = Math.floor(seeds[seedOffset + S_C] * 8);
        const lane = seeds[seedOffset + S_A] * 2 - 1;
        const level = seeds[seedOffset + S_B] * 2 - 1;

        if (basePad) {
          const ring = Math.floor(seeds[seedOffset + S_C] * 7);
          const theta = seeds[seedOffset + S_A] * TAU + time * (0.045 + ring * 0.008);
          const radius = (0.76 + ring * 0.24 + seeds[seedOffset + S_B] * 0.14) * HALO_RING_SCALE_BOOST;
          const basePulse =
            Math.pow(Math.max(0, Math.sin(theta * 3 + time * (1.2 + voiceBeat * 1.6) + phase)), 7) *
            (0.32 + voiceEnergy * 0.38);

          target.set(
            Math.cos(theta) * radius * 1.34,
            -1.64 + seeds[seedOffset + S_WIDTH] * 0.35,
            Math.sin(theta) * radius * 0.48 - 0.36 + basePulse * 0.08,
          );
          return 0.09 + basePulse * 0.86 + voiceBeat * 0.1;
        }

        if (orbitWrap) {
          const band = Math.floor(seeds[seedOffset + S_C] * HALO_RING_COUNT);
          const direction = band % 2 === 0 ? 1 : -1;
          const theta =
            seeds[seedOffset + S_A] * TAU +
            direction * time * (0.08 + band * 0.007 + seeds[seedOffset + S_FLOW] * 0.014);
          const radius = (2.02 + band * 0.082 + seeds[seedOffset + S_B] * 0.17) * HALO_RING_SCALE_BOOST;
          const tube = seeds[seedOffset + S_WIDTH] * (0.98 + band * 0.026);
          const bandLatitude =
            (band - (HALO_RING_COUNT - 1) / 2) * 0.13 + Math.sin(time * 0.05 + band * 1.6) * 0.062;
          const roll = Math.sin(theta * 1.5 + phase + time * 0.22 * direction);
          const grandSweep = 1 + seeds[seedOffset + S_E] * 0.1 + (band % 3 === 0 ? 0.08 : 0);
          const baseX = Math.cos(theta) * (radius + tube * 0.24 + roll * 0.042) * grandSweep;
          const baseY =
            bandLatitude +
            Math.sin(theta + phase) * (0.2 + band * 0.006) +
            Math.sin(theta * 2.4 - time * 0.46 * direction + phase) * 0.055 +
            tube * 0.72;
          const baseZ =
            Math.sin(theta) * (0.92 + band * 0.014) * grandSweep +
            Math.cos(theta * 0.68 + phase) * 0.06 +
            roll * 0.045;
          const tiltX = -0.5 + Math.sin(band * 1.42) * 0.24 + Math.sin(time * 0.045 + phase) * 0.06;
          const tiltZ = -0.26 + band * 0.1 + Math.sin(band * 1.13 + time * 0.034) * 0.28;
          const cosX = Math.cos(tiltX);
          const sinX = Math.sin(tiltX);
          const cosZ = Math.cos(tiltZ);
          const sinZ = Math.sin(tiltZ);
          const rotatedY = baseY * cosX - baseZ * sinX;
          const rotatedZ = baseY * sinX + baseZ * cosX;
          const rotatedX = baseX;
          const streamPulse =
            Math.pow(Math.max(0, Math.sin(theta * 3.1 - time * (1.85 + voiceBeat * 1.35) * direction + phase)), 5.2) *
            (0.48 + voiceEnergy * 0.5);
          const ridgeLight =
            Math.pow(0.5 + Math.cos(theta * 1.9 - time * 0.38 * direction + band * 0.8 + phase) * 0.5, 2.2) *
            (0.24 + voiceEnergy * 0.18);
          const frontArc = smoothstep(-0.58, 0.82, rotatedZ);
          const edgeRead = smoothstep(0.98, 2.24, Math.abs(rotatedX));
          const shellBreath = 1 + restrainedPulse * 0.014 + streamPulse * 0.02;

          target.set(
            (rotatedX * cosZ - rotatedY * sinZ) * shellBreath,
            (rotatedX * sinZ + rotatedY * cosZ) * shellBreath,
            rotatedZ - 0.12 + streamPulse * 0.12,
          );
          return 0.3 + ridgeLight * 1.12 + frontArc * 0.3 + edgeRead * 0.22 + streamPulse * 1.46 + voiceBeat * 0.14;
        }

        if (frame) {
          const layer = Math.floor(seeds[seedOffset + S_E] * 3);
          const orbitDrift = time * (0.026 + layer * 0.005) * (side % 2 === 0 ? 1 : -1);
          const angle = side * (TAU / 8) - Math.PI / 2 + orbitDrift;
          const nextAngle = angle + TAU / 8;
          const blend = (lane + 1) * 0.5;
          const shellScale = 1.02 + layer * 0.1;
          const cornerA = side % 2 === 0 ? 1 : 0.86;
          const cornerB = (side + 1) % 2 === 0 ? 1 : 0.86;
          const ax = Math.cos(angle) * (1.72 + Math.abs(Math.cos(angle)) * 0.28) * cornerA * shellScale;
          const ay = Math.sin(angle) * (1.54 + Math.abs(Math.sin(angle)) * 0.42) * shellScale;
          const bx = Math.cos(nextAngle) * (1.72 + Math.abs(Math.cos(nextAngle)) * 0.28) * cornerB * shellScale;
          const by = Math.sin(nextAngle) * (1.54 + Math.abs(Math.sin(nextAngle)) * 0.42) * shellScale;
          const wrap = Math.sin(blend * Math.PI);
          const pulse = Math.pow(Math.max(0, Math.sin(blend * TAU * 1.6 - time * 0.78 + phase)), 5);
          const localAngle = angle + (nextAngle - angle) * blend;
          const orbitDepth = Math.sin(localAngle - time * 0.12 + phase * 0.16);
          const rollHighlight = Math.pow(Math.max(0, Math.cos(localAngle * 1.4 - time * 0.86 + phase)), 5.8);
          const frontLayer = seeds[seedOffset + S_BAND] > 2 ? 1 : 0;
          const rib = seeds[seedOffset + S_A] > 0.82;
          const zLayer = frontLayer
            ? 0.22 + layer * 0.05 + wrap * 0.08 + orbitDepth * 0.16
            : -0.76 + layer * 0.12 - wrap * 0.12 + orbitDepth * 0.22;

          if (rib) {
            const ribSide = seeds[seedOffset + S_C] > 0.5 ? 1 : -1;
            const ribProgress = seeds[seedOffset + S_B];
            const ribFold = Math.sin(ribProgress * Math.PI);
            target.set(
              ribSide * (1.54 + ribFold * 0.28 + layer * 0.08) + seeds[seedOffset + S_WIDTH] * 0.14,
              (ribProgress - 0.5) * 2.7,
              -0.34 + frontLayer * 0.48 + ribFold * 0.18 + pulse * 0.05,
            );
            return 0.17 + frontLayer * 0.07 + pulse * 0.72 + voiceBeat * 0.05;
          }

          target.set(
            ax + (bx - ax) * blend + seeds[seedOffset + S_WIDTH] * 0.22,
            ay + (by - ay) * blend + level * 0.05,
            zLayer + pulse * 0.06 + Math.sin(time * 0.08 + phase) * 0.02,
          );
          return 0.18 + frontLayer * 0.09 + pulse * 0.78 + rollHighlight * 0.5 + voiceBeat * 0.065;
        }

        const column = Math.floor(seeds[seedOffset + S_A] * 46);
        const x = (column / 45 - 0.5) * 4.1;
        const shellHeight = 0.36 + clamp(1 - Math.pow(Math.abs(x) / 2.22, 1.55), 0, 1) * 1.56;
        const y = level * shellHeight;
        const gridFade = smoothstep(2.2, 0.28, Math.abs(x)) * smoothstep(shellHeight + 0.08, shellHeight * 0.25, Math.abs(y));
        const fall = (seeds[seedOffset + S_C] + time * (0.012 + seeds[seedOffset + S_FLOW] * 0.006)) % 1;
        const sparkle = Math.pow(Math.max(0, Math.sin(fall * TAU * 2.8 - time * 1.2 + phase)), 6);
        target.set(x + seeds[seedOffset + S_WIDTH] * 0.34, y + (fall - 0.5) * 0.12, -0.82 + sparkle * 0.1);
        return 0.035 + gridFade * 0.16 + sparkle * 0.36 + voiceBeat * 0.04;
      }

      const facetEdge = seeds[seedOffset + S_D] > 0.58;
      const side = Math.floor(seeds[seedOffset + S_C] * 6);
      const topFacet = seeds[seedOffset + S_E] > 0.5;
      const sideAngle = side * (TAU / 6) + Math.PI / 6;
      const nextAngle = sideAngle + TAU / 6;
      const oppositeAngle = sideAngle + Math.PI;
      const apexY = topFacet ? 1.46 : -1.46;
      const baseAx = Math.cos(sideAngle) * 0.96;
      const baseAz = Math.sin(sideAngle) * 0.56;
      const baseBx = Math.cos(nextAngle) * 0.96;
      const baseBz = Math.sin(nextAngle) * 0.56;
      const baseOx = Math.cos(oppositeAngle) * 0.74;
      const baseOz = Math.sin(oppositeAngle) * 0.44;
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

        target.x *= 1 + edgePulse * 0.012;
        target.z *= 1 + edgePulse * 0.015;
        target.y += seeds[seedOffset + S_WIDTH] * 0.08;
        return 0.32 + edgePulse * 1.32 + voiceEnergy * 0.12 + voiceBeat * 0.25;
      }

      const root = Math.sqrt(seeds[seedOffset + S_A]);
      const baryMix = seeds[seedOffset + S_B];
      const apexWeight = 1 - root;
      const sideWeightA = root * (1 - baryMix);
      const sideWeightB = root * baryMix;
      const facetPulse = Math.pow(
        Math.max(0, Math.sin((sideWeightA + sideWeightB) * TAU * 2.8 - time * crystalWaveSpeed + phase)),
        5,
      );
      const facetBreath = 1 + restrainedPulse * 0.018 + facetPulse * (0.006 + voiceBeat * 0.006);
      const inset = 0.92 + seeds[seedOffset + S_SHADE] * 0.08;

      target.set(
        (sideWeightA * ax + sideWeightB * bx) * inset * facetBreath,
        apexWeight * apexY * facetBreath,
        (sideWeightA * az + sideWeightB * bz) * inset * facetBreath,
      );

      const facetDepth = smoothstep(-0.18, 0.62, target.z);
      const apexLight = smoothstep(0.1, 1.4, Math.abs(target.y)) * 0.26;
      const innerRidge =
        Math.pow(Math.max(0, Math.cos((sideWeightA - sideWeightB) * TAU * 2.2 + time * 0.72 + phase)), 7) * 0.22;
      return 0.24 + facetDepth * 0.5 + apexLight * 1.12 + innerRidge * 1.16 + facetPulse * 0.52 + voiceEnergy * 0.09 + voiceBeat * 0.16;
    };

    const animate = () => {
      const currentSettings = settingsRef.current;
      const frameNow = performance.now();
      const delta = Math.min((frameNow - lastFrameTime) / 1000, 0.05);
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
      voiceEnvelope += (targetVoiceEnvelope - voiceEnvelope) * envelopeEase;
      const voiceEnergy = clamp(voiceEnvelope, 0, 1);
      const targetVoiceBeat =
        currentSettings.mode === 'speaking' ? speechBase * 0.58 + speechAccent * 0.27 + speechSwell * 0.15 : 0;
      const beatEase = targetVoiceBeat > voiceBeatEnvelope ? 0.11 : 0.06;
      voiceBeatEnvelope += (targetVoiceBeat - voiceBeatEnvelope) * beatEase;
      const voiceBeat = clamp(voiceBeatEnvelope, 0, 1);
      const palette = modePalettes[currentSettings.mode];
      const pointerTargetEnergy = frameNow - lastPointerMoveTime < 1600 ? 1 : 0;
      pointerCharge += (pointerTargetEnergy - pointerCharge) * 0.08;
      pointer.x += (pointerTarget.x - pointer.x) * 0.1;
      pointer.y += (pointerTarget.y - pointer.y) * 0.1;
      const graphTargetProgress = graphRouteRef.current.length > 0 ? 1 : 0;
      graphProgress += (graphTargetProgress - graphProgress) * (graphTargetProgress > graphProgress ? 0.036 : 0.045);
      const graphBlend = smoothstep(0, 1, graphProgress);
      const galaxyTravel = smoothstep(0.02, 0.58, graphProgress);
      const solarReveal = smoothstep(0.38, 0.78, graphProgress);
      const earthLock = smoothstep(0.72, 0.96, graphProgress);
      const deepCollapse = smoothstep(0.84, 0.995, graphProgress);
      const activeGraphFocusKey =
        graphTargetProgress > 0 ? graphFocusKeyRef.current || graphRouteRef.current.join(' / ') : '';
      lastFrameTime = frameNow;

      if (activeGraphFocusKey && activeGraphFocusKey !== lastGraphFocusKey) {
        lastGraphFocusKey = activeGraphFocusKey;
        pendingGraphFocusKey = activeGraphFocusKey;
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        lockedParticleTargets = new Map();
        clearGraphLabels();
      }

      if (!activeGraphFocusKey) {
        lastGraphFocusKey = '';
        pendingGraphFocusKey = '';
        graphFocusTarget.copy(defaultGraphFocus);
        graphDisplayCenterTarget.copy(defaultGraphDisplayCenter);
        lockedGraphNodes = [];
        lockedGraphEdges = [];
        lockedParticleTargets = new Map();
        clearGraphLabels();
      }

      if (pendingGraphFocusKey && graphProgress > 0.34) {
        chooseGraphFocus();
        pendingGraphFocusKey = '';
      }

      graphFocus.lerp(graphTargetProgress > 0 ? graphFocusTarget : defaultGraphFocus, graphTargetProgress > 0 ? 0.055 : 0.035);
      graphDisplayCenter.lerp(graphTargetProgress > 0 ? graphDisplayCenterTarget : defaultGraphDisplayCenter, 0.055);

      if (lastPulseSeed !== currentSettings.pulseSeed) {
        lastPulseSeed = currentSettings.pulseSeed;
        triggerPulse();
      }

      const innerDiamondSpin = -elapsed * INNER_DIAMOND_SPIN_SPEED;
      const innerDiamondCos = Math.cos(innerDiamondSpin);
      const innerDiamondSin = Math.sin(innerDiamondSpin);

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3;
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
        let shapeLight = writeTarget(index, elapsed, currentSettings, voiceEnergy, voiceBeat, innerDiamondCos, innerDiamondSin);
        const lerpAmount = role === ROLE_RIBBON ? 0.095 : role === ROLE_HALO ? 0.045 : 0.07;

        if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
          target.set(0, 0, 0);
        }

        const focusDx = target.x - graphFocus.x;
        const focusDy = target.y - graphFocus.y;
        const focusDz = target.z - graphFocus.z;
        const focusDistance = Math.sqrt(focusDx * focusDx * 1.06 + focusDy * focusDy * 1.42 + focusDz * focusDz * 0.72);
        const focusWeight = Math.exp(-focusDistance * focusDistance);
        const focusCore = Math.exp(-focusDistance * focusDistance * 4.8);
        const focusNeedle = Math.exp(-focusDistance * focusDistance * 12);
        const solarBand = Math.pow(Math.max(0, Math.cos(focusDistance * 8.2 - elapsed * 0.42 + seeds[seedOffset + S_E] * TAU)), 5.4);
        const travelSpark = Math.pow(Math.max(0, Math.sin(focusDistance * 9.5 - elapsed * 2.2 + seeds[seedOffset + S_A] * TAU)), 6);
        const localLock = earthLock * smoothstep(0.18, 0.82, focusCore);
        shapeLight +=
          focusWeight * galaxyTravel * (0.46 + voiceEnergy * 0.16) +
          solarBand * solarReveal * focusCore * 0.82 +
          travelSpark * galaxyTravel * smoothstep(1.6, 0.22, focusDistance) * 0.32 +
          focusNeedle * earthLock * (1.2 + voiceEnergy * 0.12) +
          localLock * (1.1 + voiceBeat * 0.22);

        const speechExpansion =
          currentSettings.mode === 'speaking'
            ? role === ROLE_SHELL
              ? 1 + voiceEnergy * 0.004
              : role === ROLE_HALO
                ? 1 + voiceEnergy * 0.006 + voiceBeat * 0.008 + pulsePower * 0.003
                : 1 + voiceEnergy * 0.024 + voiceBeat * 0.022 + pulsePower * 0.008
            : role === ROLE_SHELL
              ? 1
              : 1 + voiceEnergy * 0.014;
        target.multiplyScalar(speechExpansion);

        const responseWave =
          currentSettings.mode === 'speaking'
            ? Math.pow(Math.max(0, Math.sin(target.length() * 6.4 - elapsed * 4.6 + seeds[seedOffset + S_A] * TAU)), 5.2) *
              (0.36 + voiceBeat * 0.64)
            : 0;

        if (responseWave > 0) {
          target.multiplyScalar(1 + responseWave * (role === ROLE_SHELL ? 0.008 : role === ROLE_CORE ? 0.018 : role === ROLE_HALO ? 0.024 : 0.038));
        }

        const pointerX = pointer.x * 2.7;
        const pointerY = pointer.y * 1.95;
        const dx = target.x - pointerX;
        const dy = target.y - pointerY;
        const magnet = pointerCharge * Math.exp(-(dx * dx + dy * dy) * 0.62);
        const swirl = magnet * (role === ROLE_SHELL ? 0.018 : role === ROLE_HALO ? 0.055 : 0.075);
        target.x += -dy * swirl;
        target.y += dx * swirl;
        target.z += magnet * (role === ROLE_HALO ? 0.2 : 0.1);

        const lockedParticleTarget = lockedParticleTargets.get(index);

        if (lockedParticleTarget) {
          const routeNodeBlend = smoothstep(0.16, 0.86, graphProgress);
          target.x += (lockedParticleTarget.x - target.x) * routeNodeBlend;
          target.y += (lockedParticleTarget.y - target.y) * routeNodeBlend;
          target.z += (lockedParticleTarget.z - target.z) * routeNodeBlend;
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

        const color = palette[(index + Math.floor(seeds[seedOffset + S_D] * palette.length)) % palette.length];
        const px = positions[offset];
        const py = positions[offset + 1];
        const pz = positions[offset + 2];
        const radius = Math.max(0.001, Math.hypot(px, py, pz));
        const nx = px / radius;
        const ny = py / radius;
        const nz = pz / radius;
        const pointerLightX = pointer.x * 2.7;
        const pointerLightY = pointer.y * 1.95;
        const pointerLightDx = px - pointerLightX;
        const pointerLightDy = py - pointerLightY;
        const magneticGlow = pointerCharge * Math.exp(-(pointerLightDx * pointerLightDx + pointerLightDy * pointerLightDy) * 0.72);
        const listeningGlow =
          currentSettings.mode === 'listening'
            ? Math.exp(-(px * px + (py - 0.22) * (py - 0.22)) * 0.32) * (0.24 + voiceEnergy * 0.38)
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
              ? clamp(0.42 + densityLight * 1.1 + rimLight * 0.44, 0.18, 1.58)
              : clamp(0.22 + densityLight * 1.06 + rimLight * 0.2, 0.08, 1.28);
        const specular = Math.pow(keyLight, 5.2) * (role === ROLE_HALO ? 0.24 : 0.62);
        const shimmer =
          (shapeLight +
            Math.sin(elapsed * 1.05 + seeds[seedOffset + S_E] * TAU) * 0.036 +
            voiceEnergy * 0.15 +
            voiceBeat * 0.14 +
            scanBand +
            responseWave * (role === ROLE_SHELL ? 0.18 : role === ROLE_HALO ? 0.36 : 0.34) +
            listeningGlow * (role === ROLE_SHELL ? 0.18 : role === ROLE_HALO ? 0.42 : 0.34) +
            magneticGlow * (role === ROLE_SHELL ? 0.18 : role === ROLE_HALO ? 0.34 : 0.48)) *
            frontLight *
            sphereWeight +
          specular;
        const baseGlow = role === ROLE_CORE ? 0.08 : role === ROLE_HALO ? 0.044 : 0.026;

        const finalVisibility =
          (1 - earthLock * 0.66) * (1 - deepCollapse * 0.72) +
          earthLock * focusWeight * 0.16 * (1 - deepCollapse) +
          deepCollapse * (focusNeedle * 0.24 + localLock * 0.42) +
          solarBand * solarReveal * focusCore * 0.16;
        const roleBrightness =
          role === ROLE_HALO ? OUTER_PARTICLE_BRIGHTNESS_BOOST : role === ROLE_RIBBON ? 1.1 : 1;
        const finalGlow =
          (shimmer + baseGlow) *
          clamp(finalVisibility, 0.012 + 0.04 * (1 - deepCollapse), 3.8) *
          STAR_BRIGHTNESS_BOOST *
          roleBrightness;
        colors[offset] = color.r * finalGlow;
        colors[offset + 1] = color.g * finalGlow;
        colors[offset + 2] = color.b * finalGlow;
      }

      lockLinePositions.fill(0);
      lockPointPositions.fill(0);
      const lockedCount = lockedGraphNodes.length;
      const localGraphReveal = smoothstep(0.68, 0.95, graphProgress);
      const pointAlpha = localGraphReveal * (lockedCount > 0 ? 1 : 0);
      const lineAlpha = localGraphReveal * (lockedCount > 1 ? 1 : 0);
      const projectedLockPoints = lockedGraphNodes.map((node) => ({
        x: graphDisplayCenter.x + node.x,
        y: graphDisplayCenter.y + node.y,
        z: graphDisplayCenter.z + deepCollapse * 0.12 + node.z,
      }));

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
      lockLineMaterial.opacity += (lineAlpha * 0.78 - lockLineMaterial.opacity) * 0.08;
      lockPointMaterial.opacity += (pointAlpha * 1 - lockPointMaterial.opacity) * 0.1;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      const spinSpeed = STAR_SPIN_SPEED * (1 - graphBlend * 0.46);
      points.rotation.y = elapsed * spinSpeed + 0.16 * (1 - graphBlend) + pointer.x * 0.04;
      points.rotation.x = Math.sin(elapsed * 0.07) * 0.014 * (1 - graphBlend * 0.8) + pointer.y * 0.018;
      points.rotation.z = STAR_TILT_Z + Math.sin(elapsed * 0.055) * 0.008 * (1 - graphBlend);
      lockLines.rotation.copy(points.rotation);
      lockPoints.rotation.copy(points.rotation);
      pulsePower = Math.max(0, pulsePower - delta * 1.35);

      const coreScale = (width < 720 ? 1.22 : 1.56) * STAR_SCALE_BOOST;
      const graphScale = (width < 720 ? 2.35 : 2.92) * STAR_SCALE_BOOST;
      const baseScale = coreScale + (graphScale - coreScale) * graphBlend;
      const outputScale =
        currentSettings.mode === 'speaking'
          ? 0.03 + voiceEnergy * 0.075 + voiceBeat * 0.04
          : voiceEnergy * 0.018;
      points.scale.setScalar(baseScale * (1 + outputScale + pulsePower * 0.018));
      const focusLayerScale = (width < 720 ? 1.38 : 1.54) * STAR_SCALE_BOOST;
      lockLines.scale.setScalar(focusLayerScale);
      lockPoints.scale.setScalar(focusLayerScale);
      const sceneLift = (width < 720 ? 0.62 : 0.42) + graphBlend * (width < 720 ? 0.08 : 0.12);
      points.position.y += (sceneLift - points.position.y) * 0.08;
      const graphLayerY = width < 720 ? 0.02 : 0.03;
      lockLines.position.y += (graphLayerY - lockLines.position.y) * 0.12;
      lockPoints.position.y = lockLines.position.y;

      const targetSize =
        (width < 720 ? 0.032 : 0.028) +
        voiceEnergy * 0.016 +
        (currentSettings.mode === 'speaking' ? voiceBeat * 0.012 : 0) +
        pulsePower * 0.004;
      material.size += (targetSize - material.size) * 0.1;
      const lockPointTargetSize = (width < 720 ? 0.11 : 0.096) + localGraphReveal * (width < 720 ? 0.07 : 0.058);
      lockPointMaterial.size += (lockPointTargetSize - lockPointMaterial.size) * 0.12;
      const cameraGraphDrift = graphBlend * (1 - localGraphReveal * 0.94);
      const cameraX = pointer.x * 0.28 + cameraGraphDrift * graphFocus.x * 0.16;
      const cameraY = 0.08 + pointer.y * 0.14 + cameraGraphDrift * graphFocus.y * 0.18;
      const cameraZ =
        6.72 + cameraGraphDrift * (width < 720 ? -1.36 : -1.72) + deepCollapse * (1 - localGraphReveal) * (width < 720 ? -0.22 : -0.28);
      const lookAtX = graphFocus.x * cameraGraphDrift * 0.16;
      const lookAtY = graphFocus.y * cameraGraphDrift * 0.18;
      const lookAtZ = graphFocus.z * cameraGraphDrift * 0.12;

      camera.fov += ((48 - cameraGraphDrift * 10 - deepCollapse * (1 - localGraphReveal) * 3) - camera.fov) * 0.04;
      camera.updateProjectionMatrix();

      camera.position.x += (cameraX - camera.position.x) * 0.04;
      camera.position.y += (cameraY - camera.position.y) * 0.04;
      camera.position.z += (cameraZ - camera.position.z) * 0.04;
      camera.lookAt(lookAtX, lookAtY, lookAtZ);
      updateGraphLabels(localGraphReveal, deepCollapse);
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    resize();
    animate();

    window.addEventListener('resize', resize);
    host.addEventListener('pointermove', updatePointer);
    host.addEventListener('pointerdown', triggerPulse);
    host.addEventListener('pointerleave', clearPointer);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', updatePointer);
      host.removeEventListener('pointerdown', triggerPulse);
      host.removeEventListener('pointerleave', clearPointer);
      geometry.dispose();
      lockLineGeometry.dispose();
      lockPointGeometry.dispose();
      material.map?.dispose();
      material.dispose();
      lockLineMaterial.dispose();
      lockPointMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.remove();
    };
  }, []);

  return <div className="particle-field" ref={hostRef} data-testid="particle-field" />;
}
