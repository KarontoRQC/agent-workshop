import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { DialogueMode, ParticleSettings } from '../types';

type ParticleFieldProps = {
  audioLevel: number;
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

export default function ParticleField({ audioLevel, graphRoute = [], settings }: ParticleFieldProps) {
  const audioLevelRef = useRef(audioLevel);
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

    const width = host.clientWidth || window.innerWidth;
    const particleCount = width < 720 ? 15000 : 25200;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * SEED_STRIDE);
    const graphTarget = new THREE.Vector3();
    const target = new THREE.Vector3();

    for (let index = 0; index < particleCount; index += 1) {
      const seedOffset = index * SEED_STRIDE;
      const mix = index / particleCount;
      const role = mix < 0.05 ? ROLE_CORE : mix < 0.58 ? ROLE_SHELL : mix < 0.77 ? ROLE_RIBBON : ROLE_HALO;
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

    const material = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xffffff,
      depthWrite: false,
      map: createParticleTexture(),
      opacity: 0.96,
      size: width < 720 ? 0.033 : 0.029,
      sizeAttenuation: true,
      transparent: true,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    points.scale.setScalar(width < 720 ? 1.22 : 1.56);
    scene.add(points);

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
    let lastPulseSeed = settingsRef.current.pulseSeed;

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
        const basePad = seeds[seedOffset + S_E] < 0.14;
        const orbitWrap = !basePad && seeds[seedOffset + S_D] < 0.82;
        const frame = !basePad && !orbitWrap;
        const side = Math.floor(seeds[seedOffset + S_C] * 8);
        const lane = seeds[seedOffset + S_A] * 2 - 1;
        const level = seeds[seedOffset + S_B] * 2 - 1;

        if (basePad) {
          const ring = Math.floor(seeds[seedOffset + S_C] * 5);
          const theta = seeds[seedOffset + S_A] * TAU + time * (0.045 + ring * 0.008);
          const radius = 0.72 + ring * 0.22 + seeds[seedOffset + S_B] * 0.1;
          const basePulse =
            Math.pow(Math.max(0, Math.sin(theta * 3 + time * (1.2 + voiceBeat * 1.6) + phase)), 7) *
            (0.32 + voiceEnergy * 0.38);

          target.set(
            Math.cos(theta) * radius * 1.28,
            -1.64 + seeds[seedOffset + S_WIDTH] * 0.35,
            Math.sin(theta) * radius * 0.42 - 0.36 + basePulse * 0.08,
          );
          return 0.06 + basePulse * 0.72 + voiceBeat * 0.08;
        }

        if (orbitWrap) {
          const band = Math.floor(seeds[seedOffset + S_C] * 6);
          const direction = band % 2 === 0 ? 1 : -1;
          const theta =
            seeds[seedOffset + S_A] * TAU +
            direction * time * (0.088 + band * 0.009 + seeds[seedOffset + S_FLOW] * 0.014);
          const radius = 1.94 + band * 0.09 + seeds[seedOffset + S_B] * 0.13;
          const tube = seeds[seedOffset + S_WIDTH] * (0.84 + band * 0.035);
          const bandLatitude = (band - 2.5) * 0.18 + Math.sin(time * 0.05 + band * 1.6) * 0.055;
          const roll = Math.sin(theta * 1.5 + phase + time * 0.22 * direction);
          const baseX = Math.cos(theta) * (radius + tube * 0.2 + roll * 0.035);
          const baseY =
            bandLatitude +
            Math.sin(theta + phase) * (0.2 + band * 0.006) +
            Math.sin(theta * 2.4 - time * 0.46 * direction + phase) * 0.055 +
            tube * 0.72;
          const baseZ =
            Math.sin(theta) * (0.82 + band * 0.018) +
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
          return 0.22 + ridgeLight + frontArc * 0.24 + edgeRead * 0.16 + streamPulse * 1.28 + voiceBeat * 0.12;
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
            return 0.13 + frontLayer * 0.05 + pulse * 0.6 + voiceBeat * 0.04;
          }

          target.set(
            ax + (bx - ax) * blend + seeds[seedOffset + S_WIDTH] * 0.22,
            ay + (by - ay) * blend + level * 0.05,
            zLayer + pulse * 0.06 + Math.sin(time * 0.08 + phase) * 0.02,
          );
          return 0.14 + frontLayer * 0.075 + pulse * 0.68 + rollHighlight * 0.42 + voiceBeat * 0.055;
        }

        const column = Math.floor(seeds[seedOffset + S_A] * 46);
        const x = (column / 45 - 0.5) * 4.1;
        const shellHeight = 0.36 + clamp(1 - Math.pow(Math.abs(x) / 2.22, 1.55), 0, 1) * 1.56;
        const y = level * shellHeight;
        const gridFade = smoothstep(2.2, 0.28, Math.abs(x)) * smoothstep(shellHeight + 0.08, shellHeight * 0.25, Math.abs(y));
        const fall = (seeds[seedOffset + S_C] + time * (0.012 + seeds[seedOffset + S_FLOW] * 0.006)) % 1;
        const sparkle = Math.pow(Math.max(0, Math.sin(fall * TAU * 2.8 - time * 1.2 + phase)), 6);
        target.set(x + seeds[seedOffset + S_WIDTH] * 0.34, y + (fall - 0.5) * 0.12, -0.82 + sparkle * 0.1);
        return 0.02 + gridFade * 0.12 + sparkle * 0.28 + voiceBeat * 0.03;
      }

      const facetEdge = seeds[seedOffset + S_D] > 0.58;
      const side = Math.floor(seeds[seedOffset + S_C] * 6);
      const topFacet = seeds[seedOffset + S_E] > 0.5;
      const sideAngle = side * (TAU / 6) + Math.PI / 6;
      const nextAngle = sideAngle + TAU / 6;
      const oppositeAngle = sideAngle + Math.PI;
      const apexY = topFacet ? 1.46 : -1.46;
      const ax = Math.cos(sideAngle) * 0.96;
      const az = Math.sin(sideAngle) * 0.56;
      const bx = Math.cos(nextAngle) * 0.96;
      const bz = Math.sin(nextAngle) * 0.56;
      const ox = Math.cos(oppositeAngle) * 0.74;
      const oz = Math.sin(oppositeAngle) * 0.44;
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
        return 0.24 + edgePulse * 1.2 + voiceEnergy * 0.1 + voiceBeat * 0.22;
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
      return 0.18 + facetDepth * 0.42 + apexLight + innerRidge + facetPulse * 0.44 + voiceEnergy * 0.07 + voiceBeat * 0.13;
    };

    const writeGraphTarget = (index: number, time: number, routeLength: number, voiceEnergy: number, voiceBeat: number) => {
      const seedOffset = index * SEED_STRIDE;
      const allocation = seeds[seedOffset + S_A];
      const nodeCount = clamp(routeLength || 4, 3, 6);
      const phase = seeds[seedOffset + S_E] * TAU;

      if (allocation < 0.34) {
        graphTarget.copy(target);
        graphTarget.multiplyScalar(0.36 + seeds[seedOffset + S_SHADE] * 0.04);
        graphTarget.x -= 2.34;
        graphTarget.y += 0.72;
        graphTarget.z -= 0.18;
        return 0.12 + voiceEnergy * 0.1;
      }

      if (allocation < 0.62) {
        const nodeIndex = Math.min(nodeCount - 1, Math.floor(seeds[seedOffset + S_B] * nodeCount));
        const nodeT = nodeCount <= 1 ? 0 : nodeIndex / (nodeCount - 1);
        const theta = seeds[seedOffset + S_C] * TAU + time * (0.22 + nodeIndex * 0.018);
        const latitude = Math.asin(clamp(seeds[seedOffset + S_D] * 2 - 1, -0.86, 0.86));
        const nodePulse =
          Math.pow(Math.max(0, Math.sin(time * (1.1 + voiceBeat) + nodeIndex * 1.7 + phase)), 4.4) *
          (0.04 + voiceEnergy * 0.08);
        const radius = 0.12 + seeds[seedOffset + S_WIDTH] * 0.16 + nodePulse;
        const centerX = -0.08 + nodeT * 2.92;
        const centerY = 0.82 - nodeT * 1.5 + Math.sin(nodeIndex * 1.62) * 0.22;
        const centerZ = -0.08 + Math.cos(nodeIndex * 1.37) * 0.22;

        sphericalToPoint(theta, latitude, radius, graphTarget);
        graphTarget.x += centerX;
        graphTarget.y += centerY;
        graphTarget.z += centerZ;
        return 0.22 + nodePulse * 2.6 + voiceBeat * 0.12;
      }

      if (allocation < 0.86) {
        const edgeCount = Math.max(1, nodeCount - 1);
        const edgeIndex = Math.min(edgeCount - 1, Math.floor(seeds[seedOffset + S_B] * edgeCount));
        const edgeT = edgeCount <= 1 ? 0 : edgeIndex / edgeCount;
        const nextT = edgeCount <= 1 ? 1 : (edgeIndex + 1) / edgeCount;
        const flow = (seeds[seedOffset + S_C] + time * (0.09 + seeds[seedOffset + S_FLOW] * 0.035 + voiceBeat * 0.06)) % 1;
        const ax = -0.08 + edgeT * 2.92;
        const ay = 0.82 - edgeT * 1.5 + Math.sin(edgeIndex * 1.62) * 0.22;
        const az = -0.08 + Math.cos(edgeIndex * 1.37) * 0.22;
        const bx = -0.08 + nextT * 2.92;
        const by = 0.82 - nextT * 1.5 + Math.sin((edgeIndex + 1) * 1.62) * 0.22;
        const bz = -0.08 + Math.cos((edgeIndex + 1) * 1.37) * 0.22;
        const curve = Math.sin(flow * Math.PI);
        const streamPulse = Math.pow(Math.max(0, Math.sin(flow * TAU * 2.6 - time * 2.8 + phase)), 5.2);

        graphTarget.set(
          ax + (bx - ax) * flow + seeds[seedOffset + S_WIDTH] * 0.18,
          ay + (by - ay) * flow + curve * (0.18 + edgeIndex * 0.015),
          az + (bz - az) * flow + Math.sin(flow * Math.PI + phase) * 0.08 + streamPulse * 0.08,
        );
        return 0.1 + streamPulse * 1.25 + voiceBeat * 0.16;
      }

      const column = Math.floor(seeds[seedOffset + S_B] * 18);
      const row = Math.floor(seeds[seedOffset + S_C] * 9);
      const flicker = Math.pow(Math.max(0, Math.sin(time * 1.3 + column * 0.7 + row * 0.9 + phase)), 6);
      graphTarget.set(
        0.2 + column * 0.16 + seeds[seedOffset + S_WIDTH] * 0.18,
        1.12 - row * 0.24 + seeds[seedOffset + S_E] * 0.04,
        -0.72 + flicker * 0.12,
      );
      return 0.025 + flicker * 0.26 + voiceEnergy * 0.04;
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
      const graphRouteLength = graphRouteRef.current.length;
      const graphTargetProgress = graphRouteLength > 0 ? 1 : 0;
      graphProgress += (graphTargetProgress - graphProgress) * (graphTargetProgress > graphProgress ? 0.025 : 0.04);
      const graphBlend = smoothstep(0, 1, graphProgress);
      lastFrameTime = frameNow;

      if (lastPulseSeed !== currentSettings.pulseSeed) {
        lastPulseSeed = currentSettings.pulseSeed;
        triggerPulse();
      }

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3;
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
        let shapeLight = writeTarget(index, elapsed, currentSettings, voiceEnergy, voiceBeat);
        const lerpAmount = role === ROLE_RIBBON ? 0.095 : role === ROLE_HALO ? 0.045 : 0.07;

        if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
          target.set(0, 0, 0);
        }

        if (graphBlend > 0.001) {
          const graphLight = writeGraphTarget(index, elapsed, graphRouteLength, voiceEnergy, voiceBeat);
          target.lerp(graphTarget, graphBlend);
          shapeLight = shapeLight * (1 - graphBlend * 0.58) + graphLight * graphBlend;
        }

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

        colors[offset] = color.r * (shimmer + baseGlow);
        colors[offset + 1] = color.g * (shimmer + baseGlow);
        colors[offset + 2] = color.b * (shimmer + baseGlow);
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      points.rotation.y +=
        ((0.16 * (1 - graphBlend) + pointer.x * 0.04 + Math.sin(elapsed * 0.12) * 0.025) - points.rotation.y) * 0.04;
      points.rotation.x = Math.sin(elapsed * 0.07) * 0.014 * (1 - graphBlend * 0.8) + pointer.y * 0.018;
      points.rotation.z = Math.sin(elapsed * 0.055) * 0.008 * (1 - graphBlend);
      pulsePower = Math.max(0, pulsePower - delta * 1.35);

      const coreScale = width < 720 ? 1.22 : 1.56;
      const graphScale = width < 720 ? 1.1 : 1.28;
      const baseScale = coreScale + (graphScale - coreScale) * graphBlend;
      const outputScale =
        currentSettings.mode === 'speaking'
          ? 0.03 + voiceEnergy * 0.075 + voiceBeat * 0.04
          : voiceEnergy * 0.018;
      points.scale.setScalar(baseScale * (1 + outputScale + pulsePower * 0.018));
      const sceneLift = (width < 720 ? 0.62 : 0.42) + graphBlend * (width < 720 ? -0.02 : 0.08);
      points.position.y += (sceneLift - points.position.y) * 0.08;

      const targetSize =
        (width < 720 ? 0.032 : 0.028) +
        voiceEnergy * 0.016 +
        (currentSettings.mode === 'speaking' ? voiceBeat * 0.012 : 0) +
        pulsePower * 0.004;
      material.size += (targetSize - material.size) * 0.1;
      const cameraX = pointer.x * 0.36 + graphBlend * (width < 720 ? 0.28 : 0.68);
      const cameraY = 0.08 + pointer.y * 0.18 + graphBlend * 0.04;
      const cameraZ = 6.72 + graphBlend * (width < 720 ? -0.28 : -0.6);

      camera.fov += ((48 - graphBlend * 5) - camera.fov) * 0.04;
      camera.updateProjectionMatrix();

      camera.position.x += (cameraX - camera.position.x) * 0.04;
      camera.position.y += (cameraY - camera.position.y) * 0.04;
      camera.position.z += (cameraZ - camera.position.z) * 0.04;
      camera.lookAt(0, 0, 0);
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
      material.map?.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="particle-field" ref={hostRef} data-testid="particle-field" />;
}
