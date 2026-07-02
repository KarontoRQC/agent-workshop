import { useEffect, useRef, useState } from 'react';

type ZhongyinIntroProps = {
  onEnter: () => void;
};

const CHANGE_EVENT_TIME = 0.34;
const CAMERA_Z = -420;
const CAMERA_TRAVEL_DISTANCE = 3400;
const START_DOT_Y_OFFSET = 28;
const VIEW_ZOOM = 110;
const TRAIL_LENGTH = 92;
const ANIMATION_DURATION_MS = 10500;
const INTRO_AUTO_EXIT_MS = 6900;
const INTRO_REMOVE_DELAY_MS = 920;
const TWO_PI = Math.PI * 2;

class Vector2D {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

class Vector3D {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const lerp = (start: number, end: number, amount: number) => start * (1 - amount) + end * amount;

const mapRange = (value: number, start1: number, stop1: number, start2: number, stop2: number) =>
  start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));

const createSeededRandom = (seed: number) => {
  let current = seed;

  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
};

const ease = (progress: number, gravity: number) => {
  if (progress < 0.5) {
    return 0.5 * Math.pow(2 * progress, gravity);
  }

  return 1 - 0.5 * Math.pow(2 * (1 - progress), gravity);
};

const easeOutElastic = (value: number) => {
  const c4 = (2 * Math.PI) / 4.5;

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return Math.pow(2, -8 * value) * Math.sin((value * 8 - 0.75) * c4) + 1;
};

class IntroStar {
  private readonly angle: number;
  private readonly distance: number;
  private readonly dx: number;
  private readonly dy: number;
  private readonly expansionRate: number;
  private readonly finalScale: number;
  private readonly rotationDirection: number;
  private readonly spiralLocation: number;
  private readonly strokeWeightFactor: number;
  private readonly z: number;

  constructor(random: () => number) {
    this.angle = random() * TWO_PI;
    this.distance = 30 * random() + 15;
    this.rotationDirection = random() > 0.5 ? 1 : -1;
    this.expansionRate = 1.12 + random() * 0.74;
    this.finalScale = 0.78 + random() * 0.54;
    this.dx = this.distance * Math.cos(this.angle);
    this.dy = this.distance * Math.sin(this.angle);
    this.spiralLocation = (1 - Math.pow(1 - random(), 3.0)) / 1.3;
    const rawZ = lerp(0.5 * CAMERA_Z, CAMERA_TRAVEL_DISTANCE + CAMERA_Z, random());
    this.z = lerp(rawZ, CAMERA_TRAVEL_DISTANCE / 2, 0.3 * this.spiralLocation);
    this.strokeWeightFactor = Math.pow(random(), 2.0);
  }

  render(progress: number, controller: SpiralIntroController) {
    const spiralPosition = controller.spiralPath(this.spiralLocation);
    const offsetProgress = progress - this.spiralLocation;

    if (offsetProgress <= 0) {
      return;
    }

    const displacementProgress = clamp(4 * offsetProgress, 0, 1);
    const linearEasing = displacementProgress;
    const elasticEasing = easeOutElastic(displacementProgress);
    const powerEasing = Math.pow(displacementProgress, 2);
    let blendedEasing = elasticEasing;

    if (displacementProgress < 0.3) {
      blendedEasing = lerp(linearEasing, powerEasing, displacementProgress / 0.3);
    } else if (displacementProgress < 0.7) {
      blendedEasing = lerp(powerEasing, elasticEasing, (displacementProgress - 0.3) / 0.4);
    }

    let screenX: number;
    let screenY: number;

    if (displacementProgress < 0.3) {
      screenX = lerp(spiralPosition.x, spiralPosition.x + this.dx * 0.3, blendedEasing / 0.3);
      screenY = lerp(spiralPosition.y, spiralPosition.y + this.dy * 0.3, blendedEasing / 0.3);
    } else if (displacementProgress < 0.7) {
      const midProgress = (displacementProgress - 0.3) / 0.4;
      const curveStrength = Math.sin(midProgress * Math.PI) * this.rotationDirection * 1.35;
      const baseX = spiralPosition.x + this.dx * 0.3;
      const baseY = spiralPosition.y + this.dy * 0.3;
      const targetX = spiralPosition.x + this.dx * 0.7;
      const targetY = spiralPosition.y + this.dy * 0.7;
      const perpX = -this.dy * 0.4 * curveStrength;
      const perpY = this.dx * 0.4 * curveStrength;

      screenX = lerp(baseX, targetX, midProgress) + perpX * midProgress;
      screenY = lerp(baseY, targetY, midProgress) + perpY * midProgress;
    } else {
      const finalProgress = (displacementProgress - 0.7) / 0.3;
      const baseX = spiralPosition.x + this.dx * 0.7;
      const baseY = spiralPosition.y + this.dy * 0.7;
      const targetDistance = this.distance * this.expansionRate * 1.48;
      const spiralAngle = this.angle + 1.15 * this.rotationDirection * finalProgress * Math.PI;

      screenX = lerp(baseX, spiralPosition.x + targetDistance * Math.cos(spiralAngle), finalProgress);
      screenY = lerp(baseY, spiralPosition.y + targetDistance * Math.sin(spiralAngle), finalProgress);
    }

    const vx = (this.z - CAMERA_Z) * screenX / VIEW_ZOOM;
    const vy = (this.z - CAMERA_Z) * screenY / VIEW_ZOOM;
    const sizeTransition = displacementProgress < 0.6
      ? 1 + displacementProgress * 0.18
      : lerp(1.18, this.finalScale, (displacementProgress - 0.6) / 0.4);
    const dotSize = 4.2 * this.strokeWeightFactor * sizeTransition;
    const warmth = clamp(1 - displacementProgress * 0.8, 0.18, 1);
    const alpha = clamp(0.2 + this.strokeWeightFactor * 0.8, 0.12, 0.92);
    const color = `rgba(${Math.round(128 + warmth * 105)}, ${Math.round(205 + warmth * 32)}, 255, ${alpha})`;

    controller.showProjectedDot(new Vector3D(vx, vy, this.z), dotSize, color);
  }
}

class SpiralIntroController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private animationFrame = 0;
  private dpr = 1;
  private height = 1;
  private startedAt = performance.now();
  private stars: IntroStar[] = [];
  private time = 0;
  private width = 1;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number) {
    const boundedDpr = clamp(dpr, 1, 2);

    this.width = width;
    this.height = height;
    this.dpr = boundedDpr;
    this.canvas.width = Math.floor(width * boundedDpr);
    this.canvas.height = Math.floor(height * boundedDpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const nextStarCount = Math.round(clamp((width * height) / 110, 5200, 8600));

    if (nextStarCount !== this.stars.length) {
      const random = createSeededRandom(8168);
      this.stars = Array.from({ length: nextStarCount }, () => new IntroStar(random));
    }
  }

  start() {
    this.startedAt = performance.now();
    this.tick(this.startedAt);
  }

  destroy() {
    window.cancelAnimationFrame(this.animationFrame);
  }

  spiralPath(progress: number) {
    const normalizedProgress = ease(clamp(1.2 * progress, 0, 1), 1.8);
    const numberOfSpiralTurns = 6;
    const radiusScale = clamp(Math.min(this.width, this.height) / 860, 0.72, 1.2);
    const theta = TWO_PI * numberOfSpiralTurns * Math.sqrt(normalizedProgress);
    const radius = 176 * radiusScale * Math.sqrt(normalizedProgress);

    return new Vector2D(radius * Math.cos(theta), radius * Math.sin(theta) + START_DOT_Y_OFFSET * radiusScale);
  }

  showProjectedDot(position: Vector3D, sizeFactor: number, color: string) {
    const travelProgress = clamp(mapRange(this.time, CHANGE_EVENT_TIME, 1, 0, 1), 0, 1);
    const cameraZ = CAMERA_Z + ease(Math.pow(travelProgress, 1.18), 1.8) * CAMERA_TRAVEL_DISTANCE;

    if (position.z <= cameraZ) {
      return;
    }

    const dotDepthFromCamera = position.z - cameraZ;
    const x = VIEW_ZOOM * position.x / dotDepthFromCamera;
    const y = VIEW_ZOOM * position.y / dotDepthFromCamera;
    const depthScale = clamp(180 / dotDepthFromCamera, 0.12, 0.7);
    const dotRadius = clamp(0.24 + sizeFactor * depthScale, 0.28, 1.45);

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, dotRadius, 0, TWO_PI);
    this.ctx.fill();
  }

  private tick = (timestamp: number) => {
    this.time = ((timestamp - this.startedAt) % ANIMATION_DURATION_MS) / ANIMATION_DURATION_MS;
    this.render();
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private render() {
    const ctx = this.ctx;
    const travelProgress = clamp(mapRange(this.time, CHANGE_EVENT_TIME, 1, 0, 1), 0, 1);
    const trailProgress = clamp(mapRange(this.time, 0, CHANGE_EVENT_TIME + 0.25, 0, 1), 0, 1);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop();
    this.drawWarpStreaks(trailProgress, travelProgress);

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.rotate(-Math.PI * ease(travelProgress, 2.7));
    ctx.globalCompositeOperation = 'lighter';
    this.drawCentralGlow(trailProgress);
    this.drawTrail(trailProgress);

    for (const star of this.stars) {
      star.render(trailProgress, this);
    }

    this.drawStartDot();
    ctx.restore();
  }

  private drawWarpStreaks(progress: number, travelProgress: number) {
    const ctx = this.ctx;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const starfieldBloom = clamp((progress - 0.42) / 0.48, 0, 1);
    const jumpBloom = clamp((travelProgress - 0.04) / 0.42, 0, 1);
    const exitCalm = 1 - clamp((travelProgress - 0.78) / 0.22, 0, 1);
    const strength = clamp(0.14 + starfieldBloom * 0.52 + jumpBloom * 0.72, 0, 1) * exitCalm;

    if (strength <= 0.02) {
      return;
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-0.16 + this.time * 0.18);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let index = 0; index < 58; index += 1) {
      const seed = ((index * 37) % 101) / 101;
      const angle = seed * TWO_PI + Math.sin(this.time * TWO_PI + index) * 0.018;
      const lane = 0.62 + (((index * 19) % 23) / 23) * 0.62;
      const maxRadius = Math.max(this.width, this.height) * lane;
      const innerRadius = maxRadius * (0.2 + jumpBloom * 0.1);
      const outerRadius = maxRadius * (0.66 + strength * 0.28);
      const length = lerp(54, 190, strength) * (0.68 + seed * 0.78);
      const startRadius = clamp(outerRadius - length, innerRadius, outerRadius);
      const alpha = strength * (0.08 + seed * 0.14);
      const warm = index % 7 === 0;

      ctx.strokeStyle = warm
        ? `rgba(255, 219, 147, ${alpha * 0.9})`
        : `rgba(134, 224, 255, ${alpha})`;
      ctx.lineWidth = warm ? 1.35 : 0.96;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius);
      ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBackdrop() {
    const ctx = this.ctx;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.max(this.width, this.height) * 0.76;
    const gradient = ctx.createRadialGradient(centerX, centerY * 0.92, 0, centerX, centerY, radius);

    gradient.addColorStop(0, '#123775');
    gradient.addColorStop(0.36, '#071632');
    gradient.addColorStop(1, '#01030a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawCentralGlow(progress: number) {
    const ctx = this.ctx;
    const radius = clamp(Math.min(this.width, this.height) * 0.18, 120, 210);
    const pulse = 0.72 + Math.sin(progress * Math.PI) * 0.28;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.4);

    glow.addColorStop(0, `rgba(255, 220, 146, ${0.18 * pulse})`);
    glow.addColorStop(0.4, `rgba(85, 192, 255, ${0.1 * pulse})`);
    glow.addColorStop(1, 'rgba(1, 8, 22, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.4, 0, TWO_PI);
    ctx.fill();
  }

  private drawTrail(progress: number) {
    const ctx = this.ctx;

    for (let index = 0; index < TRAIL_LENGTH; index += 1) {
      const fade = mapRange(index, 0, TRAIL_LENGTH, 1.08, 0.08);
      const width = (1.1 * (1 - progress) + 2.5 * Math.sin(Math.PI * progress)) * fade;
      const pathTime = progress - 0.00016 * index;
      const position = this.spiralPath(pathTime);
      const offset = new Vector2D(position.x + 5, position.y + 5);
      const rotated = this.rotate(position, offset, Math.sin(this.time * TWO_PI) * 0.5 + 0.5, index % 2 === 0);
      const trailWarmth = 1 - index / TRAIL_LENGTH;
      const alpha = clamp(0.14 + fade * 0.42, 0.08, 0.7);

      ctx.fillStyle = index % 5 === 0
        ? `rgba(255, ${Math.round(201 + trailWarmth * 34)}, 142, ${alpha})`
        : `rgba(${Math.round(128 + trailWarmth * 76)}, 225, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(rotated.x, rotated.y, clamp(width / 2, 0.22, 1.75), 0, TWO_PI);
      ctx.fill();
    }
  }

  private drawStartDot() {
    if (this.time <= CHANGE_EVENT_TIME) {
      return;
    }

    const radiusScale = clamp(Math.min(this.width, this.height) / 860, 0.72, 1.2);
    const dy = CAMERA_Z * START_DOT_Y_OFFSET * radiusScale / VIEW_ZOOM;
    this.showProjectedDot(new Vector3D(0, dy, CAMERA_TRAVEL_DISTANCE), 2.8, 'rgba(255, 232, 174, 0.95)');
  }

  private rotate(v1: Vector2D, v2: Vector2D, progress: number, orientation: boolean) {
    const middle = new Vector2D((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
    const dx = v1.x - middle.x;
    const dy = v1.y - middle.y;
    const angle = Math.atan2(dy, dx);
    const direction = orientation ? -1 : 1;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const bounce = Math.sin(progress * Math.PI) * 0.05 * (1 - progress);

    return new Vector2D(
      middle.x + radius * (1 + bounce) * Math.cos(angle + direction * Math.PI * easeOutElastic(progress)),
      middle.y + radius * (1 + bounce) * Math.sin(angle + direction * Math.PI * easeOutElastic(progress)),
    );
  }
}

export function ZhongyinIntro({ onEnter }: ZhongyinIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completeTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      return undefined;
    }

    const controller = new SpiralIntroController(canvas, ctx);
    const resize = () => {
      controller.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    };
    const readyTimer = window.setTimeout(() => setReady(true), 900);
    const autoExitTimer = window.setTimeout(() => {
      setExiting(true);
      completeTimerRef.current = window.setTimeout(onEnter, INTRO_REMOVE_DELAY_MS);
    }, INTRO_AUTO_EXIT_MS);

    resize();
    controller.start();
    window.addEventListener('resize', resize);

    return () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(autoExitTimer);
      window.removeEventListener('resize', resize);
      controller.destroy();
    };
  }, [onEnter]);

  useEffect(() => () => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
    }

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
    }
  }, []);

  return (
    <section
      className={`zhongyin-intro ${ready ? 'is-ready' : ''} ${exiting ? 'is-exiting' : ''}`}
      aria-label="中隐会开场"
    >
      <canvas ref={canvasRef} className="zhongyin-intro__canvas" aria-hidden="true" />
      <div className="zhongyin-intro__veil" />
      <div className="zhongyin-intro__brand" aria-hidden="true">
        中隐会
      </div>
    </section>
  );
}
