import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { DialogueMode, ParticleSettings } from '../types';

type ParticleFieldProps = {
  audioLevel: number;
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

const STREAM_OFFSETS = [-0.08, 0.08, -0.03, 0.07];
const STREAM_PHASES = [0, 0.42, 2.7, 4.1];
const STREAM_DIRECTIONS = [1, -1, 1, -1];
const STREAM_TILTS = [-0.08, 0.02, -0.52, 0.58];
const STREAM_DEPTHS = [0.9, 0.84, 0.92, 0.8];
const STREAM_LIGHTS = [1, 0.86, 0.36, 0.3];

const modePalettes: Record<DialogueMode, THREE.Color[]> = {
  idle: ['#f7fbff', '#9cc7ff', '#4f96ff', '#173571'].map((color) => new THREE.Color(color)),
  listening: ['#ffffff', '#c8e7ff', '#6ab5ff', '#1f62d8'].map((color) => new THREE.Color(color)),
  thinking: ['#f4fbff', '#8ed0ff', '#5b8cff', '#16306b'].map((color) => new THREE.Color(color)),
  speaking: ['#ffffff', '#e7f5ff', '#93d4ff', '#2f7aff'].map((color) => new THREE.Color(color)),
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

export default function ParticleField({ audioLevel, settings }: ParticleFieldProps) {
  const audioLevelRef = useRef(audioLevel);
  const hostRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020614, 0.055);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0.08, 9.2);

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
    const particleCount = width < 720 ? 13600 : 23600;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount * SEED_STRIDE);
    const target = new THREE.Vector3();

    for (let index = 0; index < particleCount; index += 1) {
      const seedOffset = index * SEED_STRIDE;
      const mix = index / particleCount;
      const role = mix < 0.07 ? ROLE_CORE : mix < 0.48 ? ROLE_SHELL : mix < 0.72 ? ROLE_RIBBON : ROLE_HALO;
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
    points.scale.setScalar(width < 720 ? 0.78 : 0.9);
    scene.add(points);

    const pointer = new THREE.Vector2(0, 0);
    const startTime = performance.now();
    let lastFrameTime = startTime;
    let animationId = 0;
    let pulsePower = 0;
    let voiceEnvelope = 0;
    let voiceBeatEnvelope = 0;
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
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
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

      if (role === ROLE_CORE) {
        const theta = seeds[seedOffset + S_A] * TAU + time * 0.035;
        const latitude = Math.asin(clamp(seeds[seedOffset + S_B] * 2 - 1, -0.92, 0.92));
        const radius = 0.36 + seeds[seedOffset + S_C] * 0.78 + breath + restrainedPulse * 0.36;

        sphericalToPoint(theta, latitude, radius, target);
        return 0.62 + voiceEnergy * 0.16 + voiceBeat * 0.18;
      }

      if (role === ROLE_RIBBON) {
        const band = seeds[seedOffset + S_BAND];
        const direction = band % 2 === 0 ? 1 : -1;
        const flow = (seeds[seedOffset + S_A] + direction * time * 0.022 * seeds[seedOffset + S_FLOW]) % 1;
        const normalizedFlow = flow < 0 ? flow + 1 : flow;
        const theta = normalizedFlow * TAU + band * 0.78;
        const ribbonCurve =
          Math.sin(normalizedFlow * TAU * (1.05 + band * 0.05) + band * 1.2) * 0.34 +
          Math.sin(normalizedFlow * TAU * 2.15 + band * 0.72) * 0.11;
        const latitude = clamp(ribbonCurve + seeds[seedOffset + S_WIDTH], -1.05, 1.05);
        const ridge = 0.5 + Math.cos(normalizedFlow * TAU * 3 + band * 1.7) * 0.5;
        const localWave = Math.max(0, Math.sin(normalizedFlow * TAU * 3.2 - time * 1.85 + phase)) * voiceBeat;
        const radius = 2.46 + ridge * 0.16 + breath + restrainedPulse * 0.58 + localWave * 0.12;

        sphericalToPoint(theta, latitude, radius, target);
        return 1.42 + ridge * 0.72 + localWave * 0.32 + voiceBeat * 0.18;
      }

      const theta = seeds[seedOffset + S_A] * TAU + Math.sin(time * 0.18 + phase) * 0.014;
      const latitude = Math.asin(clamp(seeds[seedOffset + S_B] * 2 - 1, -0.96, 0.96));
      const fixedFold =
        Math.sin(theta * 3.2 + latitude * 4.6) * 0.055 +
        Math.cos(theta * 5.4 - latitude * 2.1) * 0.04;

      if (role === ROLE_HALO) {
        const bandSeed = seeds[seedOffset + S_C];
        const orbitBand = bandSeed < 0.5 ? 0 : bandSeed < 0.84 ? 1 : bandSeed < 0.93 ? 2 : 3;
        const direction = STREAM_DIRECTIONS[orbitBand] ?? 1;
        const orbitSpeed = 0.011 + seeds[seedOffset + S_FLOW] * 0.004 + orbitBand * 0.0008;
        const orbit =
          (seeds[seedOffset + S_A] +
            direction * time * orbitSpeed +
            Math.sin(time * 0.055 + phase + orbitBand) * 0.008) %
          1;
        const normalizedOrbit = orbit < 0 ? orbit + 1 : orbit;
        const bandPhase = STREAM_PHASES[orbitBand] ?? 0;
        const u = normalizedOrbit * TAU + bandPhase * 0.35;
        const secondaryBand = orbitBand >= 2;
        const wideScatter =
          (seeds[seedOffset + S_B] - 0.5) * (0.34 + seeds[seedOffset + S_D] * 0.22) * (secondaryBand ? 0.82 : 1.12);
        const laneScatter = seeds[seedOffset + S_WIDTH] * (secondaryBand ? 1.12 : 1.72);
        const twist = u * 0.56 + phase * 0.12 + bandPhase;
        const clump =
          Math.pow(0.5 + Math.sin(u * 3.4 + phase) * 0.5, 2.8) * 0.7 +
          Math.pow(0.5 + Math.sin(u * 5.2 - phase * 0.7) * 0.5, 4) * 0.35;
        const restrainedEscape = Math.max(0, Math.sin(time * 1.15 + phase)) * (0.035 + voiceEnergy * 0.04 + voiceBeat * 0.1);
        const planeDirection = orbitBand % 2 === 0 ? 1 : -1;
        const planeYaw =
          bandPhase +
          planeDirection * time * (0.082 + orbitBand * 0.009) +
          Math.sin(time * 0.11 + bandPhase) * 0.34;
        const planeTilt = (STREAM_TILTS[orbitBand] ?? 0) + Math.sin(time * 0.075 + bandPhase) * 0.24 + voiceBeat * 0.035;
        const planeRoll = Math.sin(time * 0.067 + phase * 0.12 + bandPhase) * 0.11;
        const radius =
          2.4 +
          Math.cos(u * 2.1 + bandPhase) * 0.06 +
          fixedFold * 0.18 +
          restrainedEscape;
        const streamOffset = (STREAM_OFFSETS[orbitBand] ?? 0) + Math.sin(u * 2.4 + phase) * 0.035;
        const tubeOffset = wideScatter * Math.cos(twist) * 0.2;
        const localX = Math.cos(u) * (radius + tubeOffset + laneScatter * 0.16);
        const sideArcDrop = Math.pow(Math.abs(Math.cos(u)), 1.85) * (secondaryBand ? 0.24 : 0.42);
        const localY =
          streamOffset +
          Math.sin(u * 1.75 + bandPhase) * 0.075 +
          wideScatter * Math.sin(twist) * 0.5 +
          laneScatter * 0.34 -
          sideArcDrop;
        const localZ = Math.sin(u) * (radius * (STREAM_DEPTHS[orbitBand] ?? 0.86)) + tubeOffset * 0.42;
        const cosTilt = Math.cos(planeTilt);
        const sinTilt = Math.sin(planeTilt);
        const tiltedY = localY * cosTilt - localZ * sinTilt;
        const tiltedZ = localY * sinTilt + localZ * cosTilt;
        const cosYaw = Math.cos(planeYaw);
        const sinYaw = Math.sin(planeYaw);
        const yawedX = localX * cosYaw + tiltedZ * sinYaw;
        const yawedZ = -localX * sinYaw + tiltedZ * cosYaw;
        const cosRoll = Math.cos(planeRoll);
        const sinRoll = Math.sin(planeRoll);
        const x = yawedX * cosRoll - tiltedY * sinRoll;
        const y = yawedX * sinRoll + tiltedY * cosRoll;
        const z = yawedZ;
        const orbitDepth = Math.pow(smoothstep(-2.1, 2.35, z), 1.35);
        const projectedRim = Math.hypot(x * 0.9, y * 1.12);
        const sideWrap = smoothstep(1.62, 2.38, projectedRim) * (0.72 + Math.max(0, -x) * 0.08);
        const topWrap = smoothstep(1.08, 2.12, y) * smoothstep(0.55, 1.85, Math.abs(x));
        const leftUpperWrap = smoothstep(0.45, 1.55, y) * smoothstep(0.32, 1.72, -x) * (secondaryBand ? 0.38 : 1);
        const lowerOrbitWrap =
          smoothstep(0.24, 1.68, -y) * smoothstep(0.42, 2.05, Math.abs(x)) * (secondaryBand ? 0.42 : 1);
        const rightReturnWrap =
          smoothstep(0.24, 1.62, x) * smoothstep(0.18, 1.62, -y) * (0.74 + orbitDepth * 0.26);
        const sideArcWrap = sideArcDrop * smoothstep(1.1, 2.28, Math.abs(x));
        const streamLight = STREAM_LIGHTS[orbitBand] ?? 0.5;

        target.set(x, y, z);
        return (
          0.26 +
          orbitDepth * 0.54 +
          sideWrap * 0.36 +
          topWrap * 0.16 +
          leftUpperWrap * 0.38 +
          lowerOrbitWrap * 0.34 +
          rightReturnWrap * 0.3 +
          sideArcWrap * 0.56 +
          clump * 0.2 +
          restrainedEscape * 0.22 +
          voiceBeat * 0.09
        ) * streamLight;
      }

      const surfaceRipple =
        Math.sin(time * 1.18 + theta * 2 + latitude * 3 + phase) * (0.006 + voiceEnergy * 0.003 + voiceBeat * 0.004);
      const radius = 2.3 + fixedFold * 0.32 + surfaceRipple + breath * 0.22;

      sphericalToPoint(theta, latitude, radius, target);
      return 0.26 + Math.max(0, fixedFold) * 2.4 + voiceEnergy * 0.08 + voiceBeat * 0.2;
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
      lastFrameTime = frameNow;

      if (lastPulseSeed !== currentSettings.pulseSeed) {
        lastPulseSeed = currentSettings.pulseSeed;
        triggerPulse();
      }

      for (let index = 0; index < particleCount; index += 1) {
        const offset = index * 3;
        const seedOffset = index * SEED_STRIDE;
        const role = seeds[seedOffset + S_ROLE];
        const shapeLight = writeTarget(index, elapsed, currentSettings, voiceEnergy, voiceBeat);
        const lerpAmount = role === ROLE_RIBBON ? 0.095 : role === ROLE_HALO ? 0.045 : 0.07;

        if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
          target.set(0, 0, 0);
        }

        const speechExpansion =
          currentSettings.mode === 'speaking'
            ? role === ROLE_SHELL
              ? 1 + voiceEnergy * 0.006
              : role === ROLE_HALO
                ? 1 + voiceEnergy * 0.018 + voiceBeat * 0.018 + pulsePower * 0.004
                : 1 + voiceEnergy * 0.065 + voiceBeat * 0.06 + pulsePower * 0.01
            : role === ROLE_SHELL
              ? 1
              : 1 + voiceEnergy * 0.014;
        target.multiplyScalar(speechExpansion);

        const pointerX = pointer.x * 4.4;
        const pointerY = pointer.y * 2.8;
        const dx = target.x - pointerX;
        const dy = target.y - pointerY;
        const influence = Math.exp(-(dx * dx + dy * dy) * 0.48) * 0.055;
        target.x += dx * influence;
        target.y += dy * influence;
        target.z += influence * 0.42;

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
        const frontLight = clamp(0.68 + pz * 0.18, 0.28, 1.46);
        const keyLight = clamp(nx * -0.36 + ny * 0.52 + nz * 0.78, 0, 1);
        const fillLight = clamp(nx * 0.12 + ny * 0.12 + nz * 0.32 + 0.24, 0, 0.72);
        const rimLight = Math.pow(clamp(1 - Math.abs(nz), 0, 1), 2.2) * (0.34 + keyLight * 0.44);
        const lowerShadow = smoothstep(0.1, 0.88, -ny * 0.72 - nx * 0.24 - nz * 0.18 + 0.28);
        const densityNoise = seeds[seedOffset + S_SHADE] * 0.2;
        const densityLight = clamp(keyLight * 0.86 + fillLight * 0.38 + rimLight * 0.58 + densityNoise - lowerShadow * 0.48, 0.04, 1.34);
        const sphereWeight =
          role === ROLE_HALO
            ? clamp(0.5 + rimLight * 0.24 + keyLight * 0.42 + frontLight * 0.24, 0.24, 1.34)
            : role === ROLE_CORE
              ? clamp(0.72 + keyLight * 0.34 + frontLight * 0.14, 0.5, 1.28)
              : role === ROLE_RIBBON
                ? clamp(0.42 + densityLight * 1.1 + rimLight * 0.44, 0.18, 1.58)
                : clamp(0.16 + densityLight * 1.16, 0.06, 1.26);
        const specular = Math.pow(keyLight, 5.2) * (role === ROLE_HALO ? 0.18 : 0.62);
        const shimmer =
          (shapeLight +
            Math.sin(elapsed * 1.05 + seeds[seedOffset + S_E] * TAU) * 0.036 +
            voiceEnergy * 0.15 +
            voiceBeat * 0.14) *
            frontLight *
            sphereWeight +
          specular;
        const baseGlow = role === ROLE_CORE ? 0.08 : role === ROLE_HALO ? 0.022 : 0.026;

        colors[offset] = color.r * (shimmer + baseGlow);
        colors[offset + 1] = color.g * (shimmer + baseGlow);
        colors[offset + 2] = color.b * (shimmer + baseGlow);
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      points.rotation.y += delta * (0.018 + currentSettings.energy * 0.012 + voiceEnergy * 0.008 + voiceBeat * 0.006);
      points.rotation.x = Math.sin(elapsed * 0.1) * 0.028;
      points.rotation.z = Math.sin(elapsed * 0.075) * 0.012;
      pulsePower = Math.max(0, pulsePower - delta * 1.35);

      const baseScale = width < 720 ? 0.78 : 0.9;
      const outputScale =
        currentSettings.mode === 'speaking'
          ? 0.03 + voiceEnergy * 0.075 + voiceBeat * 0.04
          : voiceEnergy * 0.018;
      points.scale.setScalar(baseScale * (1 + outputScale + pulsePower * 0.018));

      const targetSize =
        (width < 720 ? 0.032 : 0.028) +
        voiceEnergy * 0.016 +
        (currentSettings.mode === 'speaking' ? voiceBeat * 0.012 : 0) +
        pulsePower * 0.004;
      material.size += (targetSize - material.size) * 0.1;
      const cameraX = pointer.x * 0.36;
      const cameraY = 0.08 + pointer.y * 0.18;
      const cameraZ = 9.2;

      camera.fov += (48 - camera.fov) * 0.04;
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

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', updatePointer);
      host.removeEventListener('pointerdown', triggerPulse);
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="particle-field" ref={hostRef} data-testid="particle-field" />;
}
