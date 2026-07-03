import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CENTER, VIEWBOX } from "./graphLayout.js";

const NODE_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uHover;
  uniform float uSweep;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    float ripple = sin((position.y + position.x * 0.45) * 5.0 + uTime * 4.4) * 0.018;
    float hoverLift = uHover * 0.16 + uSweep * 0.08;
    vec3 shaped = position * (1.0 + ripple + hoverLift);
    vec4 worldPosition = modelMatrix * vec4(shaped, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const NODE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uHover;
  uniform float uSweep;
  uniform float uAlpha;
  varying vec3 vNormalWorld;
  varying vec3 vViewDirection;
  varying vec2 vUv;

  void main() {
    float facing = max(dot(normalize(vNormalWorld), normalize(vViewDirection)), 0.0);
    float fresnel = pow(1.0 - facing, 2.25);
    float scan = smoothstep(0.08, 0.52, abs(sin(vUv.y * 9.0 + uTime * 2.4)));
    float pulse = uHover * (0.22 + 0.16 * sin(uTime * 9.0)) + uSweep * 0.38;
    vec3 core = uColor * (0.24 + 0.08 * scan);
    vec3 rim = uAccent * (fresnel * 1.12 + pulse);
    vec3 color = core + rim;
    float alpha = clamp(uAlpha + fresnel * 0.18 + pulse * 0.1, 0.16, 0.86);
    gl_FragColor = vec4(color, alpha);
  }
`;

const LINK_VERTEX_SHADER = `
  uniform float uTime;
  attribute float pulse;
  varying float vPulse;

  void main() {
    vPulse = pulse;
    vec3 p = position;
    p.y += sin(uTime * 1.8 + position.x * 0.21 + position.z * 0.13) * 0.012;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const LINK_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vPulse;

  void main() {
    float energy = 0.42 + vPulse * 0.58;
    gl_FragColor = vec4(uColor * energy, uAlpha * energy);
  }
`;

const BLUE = new THREE.Color("#5ab7ff");
const CYAN = new THREE.Color("#6fd8ff");
const PINK = new THREE.Color("#ff79b7");
const ROSE = new THREE.Color("#ff715f");
const GOLD = new THREE.Color("#ffd55c");
const VIOLET = new THREE.Color("#c78cff");
const DUST = new THREE.Color("#7894b8");

const BASE_CAMERA = {
  atlas: { x: 0, y: 4.6, z: 13.8 },
  path: { x: 0, y: 3.4, z: 12.2 },
  step: { x: 7.2, y: 5.4, z: 13.8 },
};

export function createThreeGraphEngine(mount, handlers = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x061022, 0.048);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x020713, 0);
  renderer.domElement.className = "three-graph-canvas";
  mount.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(BASE_CAMERA.atlas.x, BASE_CAMERA.atlas.y, BASE_CAMERA.atlas.z);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 5.5;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.63;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;
  controls.target.set(0, 0.55, 0);

  const root = new THREE.Group();
  scene.add(root);

  const stage = createStage();
  root.add(stage);

  const nodeGroup = new THREE.Group();
  const labelGroup = new THREE.Group();
  const linkGroup = new THREE.Group();
  root.add(linkGroup, nodeGroup, labelGroup);

  const starField = createStarField();
  root.add(starField);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(10, 10);
  const pointerScreen = { x: -9999, y: -9999 };
  const clickableMeshes = [];
  const nodeRecords = new Map();
  const activeLinkState = { links: [], geometry: null, material: null, lines: null };
  const startedAt = performance.now();

  let latestParams = null;
  let hoveredId = null;
  let raf = 0;
  let mounted = true;

  nearestScreenNodeId.renderer = renderer;
  nearestScreenNodeId.camera = camera;
  nearestScreenNodeId.nodeRecords = nodeRecords;
  nearestScreenNodeId.pointerScreen = pointerScreen;

  function resize() {
    const rect = mount.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(320, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function update(params) {
    latestParams = params;
    syncNodes(params);
    syncLinks(params);
    syncLabels(params);
    moveCameraForMode(params.mode);
  }

  function syncNodes(params) {
    const realNodes = params.layout.nodes.map((node) => ({
      ...node,
      ambient: false,
      target: projectNode(node, params.mode),
    }));
    const ambientNodes = (params.ambientNodes || []).slice(0, params.mode === "atlas" ? 460 : 260).map((node) => ({
      ...node,
      ambient: true,
      radius: node.r || 1.4,
      opacity: 0.22,
      target: projectAmbientNode(node, params.mode),
    }));
    const nextNodes = [...ambientNodes, ...realNodes];
    const nextIds = new Set(nextNodes.map((node) => node.id));

    for (const [id, record] of nodeRecords) {
      if (!nextIds.has(id)) {
        nodeGroup.remove(record.mesh);
        labelGroup.remove(record.label);
        record.mesh.geometry = null;
        record.material.dispose();
        record.label.material.map?.dispose();
        record.label.material.dispose();
        nodeRecords.delete(id);
      }
    }

    clickableMeshes.length = 0;
    nextNodes.forEach((node) => {
      let record = nodeRecords.get(node.id);
      if (!record) {
        const material = createNodeMaterial(node);
        const mesh = new THREE.Mesh(sharedSphereGeometry(), material);
        mesh.userData.nodeId = node.id;
        mesh.userData.clickable = !node.ambient;
        mesh.position.copy(node.target);
        mesh.scale.setScalar(nodeScale(node));
        nodeGroup.add(mesh);

        const label = createLabelSprite(node);
        label.position.copy(node.target).add(new THREE.Vector3(0, nodeScale(node) * 1.45, 0));
        labelGroup.add(label);

        record = {
          node,
          mesh,
          label,
          material,
          target: node.target.clone(),
          sweep: 0,
          hover: 0,
        };
        nodeRecords.set(node.id, record);
      }

      record.node = node;
      record.target.copy(node.target);
      record.mesh.userData.clickable = !node.ambient;
      record.mesh.scale.setScalar(nodeScale(node));
      record.material.uniforms.uColor.value.copy(nodeColor(node));
      record.material.uniforms.uAccent.value.copy(nodeAccent(node));
      record.material.uniforms.uAlpha.value = nodeAlpha(node);
      record.label.visible = shouldShowLabel(node, params);
      record.label.material.opacity = node.ambient ? 0 : labelOpacity(node, params);
      record.label.scale.setScalar(labelScale(node));
      record.label.userData.offset = nodeScale(node) * 1.45;

      if (!node.ambient) clickableMeshes.push(record.mesh);
    });
  }

  function syncLinks(params) {
    const linkPairs = [];
    const nodeById = new Map(params.layout.nodes.map((node) => [node.id, node]));
    params.layout.links.forEach((link) => {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      if (!source || !target) return;
      linkPairs.push({
        id: link.id,
        sourceId: source.id,
        targetId: target.id,
        kind: link.kind,
        ring: link.ring || 1,
      });
    });

    activeLinkState.links = linkPairs;
    const pointCount = Math.max(2, linkPairs.length * 2);
    const positions = new Float32Array(pointCount * 3);
    const pulses = new Float32Array(pointCount);

    if (activeLinkState.geometry) {
      activeLinkState.geometry.dispose();
      activeLinkState.material.dispose();
      linkGroup.remove(activeLinkState.lines);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("pulse", new THREE.BufferAttribute(pulses, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#61bdfd") },
        uAlpha: { value: 0.42 },
      },
      vertexShader: LINK_VERTEX_SHADER,
      fragmentShader: LINK_FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    activeLinkState.geometry = geometry;
    activeLinkState.material = material;
    activeLinkState.lines = lines;
    linkGroup.add(lines);
  }

  function syncLabels(params) {
    for (const record of nodeRecords.values()) {
      record.label.visible = shouldShowLabel(record.node, params);
    }
  }

  function moveCameraForMode(mode) {
    const target = BASE_CAMERA[mode] || BASE_CAMERA.path;
    camera.userData.targetPosition = new THREE.Vector3(target.x, target.y, target.z);
  }

  function animate() {
    if (!mounted) return;
    raf = window.requestAnimationFrame(animate);
    const elapsed = (performance.now() - startedAt) / 1000;

    updateRaycast(elapsed);
    updateNodeAnimation(elapsed);
    updateLinks(elapsed);
    updateCamera();

    stage.rotation.y += 0.0009;
    starField.rotation.y -= 0.00035;
    controls.update();
    renderer.render(scene, camera);
  }

  function updateNodeAnimation(elapsed) {
    for (const record of nodeRecords.values()) {
      record.mesh.position.lerp(record.target, 0.075);
      record.hover += ((record.node.id === hoveredId ? 1 : 0) - record.hover) * 0.18;
      record.sweep = Math.max(0, record.sweep - 0.035);
      record.material.uniforms.uTime.value = elapsed;
      record.material.uniforms.uHover.value = record.hover;
      record.material.uniforms.uSweep.value = record.sweep;
      record.label.position.copy(record.mesh.position).add(new THREE.Vector3(0, record.label.userData.offset || 0.5, 0));
      record.label.lookAt(camera.position);
    }
  }

  function updateLinks(elapsed) {
    const { geometry, material, links } = activeLinkState;
    if (!geometry || !material) return;
    const positions = geometry.getAttribute("position");
    const pulses = geometry.getAttribute("pulse");
    links.forEach((link, index) => {
      const source = nodeRecords.get(link.sourceId);
      const target = nodeRecords.get(link.targetId);
      if (!source || !target) return;
      const sourceHot = source.node.id === hoveredId || source.node.id === latestParams?.selectedId ? 1 : 0;
      const targetHot = target.node.id === hoveredId || target.node.id === latestParams?.selectedId ? 1 : 0;
      const pulse = Math.max(sourceHot, targetHot, link.kind === "lineage" ? 0.85 : 0.18);
      positions.setXYZ(index * 2, source.mesh.position.x, source.mesh.position.y, source.mesh.position.z);
      positions.setXYZ(index * 2 + 1, target.mesh.position.x, target.mesh.position.y, target.mesh.position.z);
      pulses.setX(index * 2, pulse);
      pulses.setX(index * 2 + 1, pulse);
    });
    positions.needsUpdate = true;
    pulses.needsUpdate = true;
    material.uniforms.uTime.value = elapsed;
  }

  function updateCamera() {
    const target = camera.userData.targetPosition;
    if (target) camera.position.lerp(target, 0.018);
  }

  function updateRaycast() {
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(clickableMeshes, false);
    const nextId = intersections[0]?.object?.userData?.nodeId || nearestScreenNodeId(46);
    if (nextId !== hoveredId) {
      hoveredId = nextId;
      handlers.onHover?.(hoveredId);
      if (hoveredId && nodeRecords.has(hoveredId)) {
        nodeRecords.get(hoveredId).sweep = 1;
      }
    }
  }

  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerScreen.x = event.clientX - rect.left;
    pointerScreen.y = event.clientY - rect.top;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerLeave() {
    pointer.set(10, 10);
    pointerScreen.x = -9999;
    pointerScreen.y = -9999;
  }

  function onClick() {
    if (!hoveredId) return;
    const record = nodeRecords.get(hoveredId);
    if (!record || record.node.ambient) return;
    record.sweep = 1;
    handlers.onNodeClick?.(record.node);
  }

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onClick);
  resize();
  animate();

  return {
    update,
    resize,
    destroy() {
      mounted = false;
      if (raf) window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      for (const record of nodeRecords.values()) {
        record.material.dispose();
        record.label.material.map?.dispose();
        record.label.material.dispose();
      }
      activeLinkState.geometry?.dispose();
      activeLinkState.material?.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    },
  };
}

function nearestScreenNodeId(maxDistancePx) {
  const renderer = nearestScreenNodeId.renderer;
  const camera = nearestScreenNodeId.camera;
  const nodeRecords = nearestScreenNodeId.nodeRecords;
  const pointerScreen = nearestScreenNodeId.pointerScreen;
  if (!renderer || !camera || !nodeRecords || pointerScreen.x < -100) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  const projected = new THREE.Vector3();
  let bestId = null;
  let bestDistance = maxDistancePx;

  for (const record of nodeRecords.values()) {
    if (record.node.ambient) continue;
    projected.copy(record.mesh.position).project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    const distance = Math.hypot(x - pointerScreen.x, y - pointerScreen.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = record.node.id;
    }
  }

  return bestId;
}

function sharedSphereGeometry() {
  if (!sharedSphereGeometry.geometry) {
    sharedSphereGeometry.geometry = new THREE.SphereGeometry(1, 32, 18);
  }
  return sharedSphereGeometry.geometry;
}

function createNodeMaterial(node) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uSweep: { value: 0 },
      uAlpha: { value: nodeAlpha(node) },
      uColor: { value: nodeColor(node) },
      uAccent: { value: nodeAccent(node) },
    },
    vertexShader: NODE_VERTEX_SHADER,
    fragmentShader: NODE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function projectNode(node, mode) {
  const dx = (node.x - CENTER.x) / (VIEWBOX.width * 0.5);
  const dy = (node.y - CENTER.y) / (VIEWBOX.height * 0.5);
  const angle = Math.atan2(dy, dx);
  const distance = Math.min(1.25, Math.sqrt(dx * dx + dy * dy));
  const ring = node.ring || 0;
  const jitter = (hash(node.id) - 0.5) * 0.75;

  if (mode === "step") {
    return new THREE.Vector3(
      dx * 8.6 + jitter,
      -1.15 + ring * 0.72 + hash(`${node.id}:y`) * 0.62,
      dy * 5.6 + ring * 1.15,
    );
  }

  if (mode === "path") {
    const radius = ring === 0 ? 0 : 1.2 + distance * 5.8 + ring * 0.52;
    return new THREE.Vector3(
      Math.cos(angle) * radius + jitter,
      -0.65 + ring * 0.38 + (hash(`${node.id}:rise`) - 0.5) * 1.8,
      Math.sin(angle) * radius + (hash(`${node.id}:z`) - 0.5) * 1.25,
    );
  }

  const domeRadius = ring === 0 ? 0 : 1.45 + distance * 6.7 + ring * 0.5;
  const domeHeight = 2.95 - ring * 0.68 - distance * 0.42 + hash(`${node.id}:h`) * 0.48;
  return new THREE.Vector3(
    Math.cos(angle) * domeRadius + jitter,
    domeHeight,
    Math.sin(angle) * domeRadius * 0.72,
  );
}

function projectAmbientNode(node, mode) {
  const seed = hash(node.id);
  const angle = seed * Math.PI * 2;
  const second = hash(`${node.id}:b`);
  const radius = 6.5 + second * 7.5;
  if (mode === "step") {
    return new THREE.Vector3(
      (seed - 0.5) * 17,
      -1.6 + hash(`${node.id}:y`) * 6.6,
      (second - 0.5) * 12,
    );
  }
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    -1.8 + hash(`${node.id}:height`) * 7.8,
    Math.sin(angle) * radius,
  );
}

function createStage() {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x1f7fff,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  [3.1, 4.35, 5.8].forEach((radius, index) => {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012 + index * 0.006, 8, 160), ringMaterial.clone());
    torus.rotation.x = Math.PI / 2;
    torus.position.y = -1.82 - index * 0.018;
    torus.material.opacity = 0.2 - index * 0.04;
    group.add(torus);
  });

  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(5.8, 6.6, 0.025, 180, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x0a6eea,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  disk.position.y = -1.88;
  group.add(disk);
  return group;
}

function createStarField() {
  const geometry = new THREE.BufferGeometry();
  const count = 480;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = hash(`star:${i}`) * Math.PI * 2;
    const r = 10 + hash(`star:r:${i}`) * 22;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = -2 + hash(`star:y:${i}`) * 13;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0x6fb6ff,
      size: 0.018,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  return points;
}

function createLabelSprite(node) {
  const text = node.displayLabel || node.label || node.id;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fontSize = node.kind === "focus" ? 34 : node.kind === "industry" ? 22 : 18;
  context.font = `${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  const width = Math.ceil(context.measureText(text).width + 32);
  const height = Math.ceil(fontSize + 20);
  canvas.width = nextPowerOfTwo(Math.min(512, Math.max(96, width)));
  canvas.height = nextPowerOfTwo(height);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(96,180,255,0.65)";
  context.shadowBlur = 10;
  context.fillStyle = node.kind === "focus" ? "#fff0bf" : "#c8ddff";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 120, canvas.height / 120, 1);
  return sprite;
}

function shouldShowLabel(node, params) {
  if (node.ambient) return false;
  if (node.id === params.focusId || node.id === params.selectedId || node.id === params.hoveredId) return true;
  if (node.kind === "focus" || node.isLineage) return true;
  if (node.labelMode === "always" && (node.ring || 0) <= 2) return true;
  return false;
}

function labelOpacity(node, params) {
  if (node.id === params.focusId || node.id === params.selectedId || node.id === params.hoveredId) return 1;
  if (node.isLineage) return 0.86;
  return 0.58;
}

function labelScale(node) {
  if (node.kind === "focus") return 1.08;
  if (node.kind === "industry") return 0.76;
  return 0.58;
}

function nodeScale(node) {
  const base = node.ambient ? node.radius * 0.011 : Math.max(0.035, (node.radius || 10) * 0.0075);
  if (node.kind === "focus") return base * 1.45;
  if (node.kind === "industry") return base * 1.15;
  return base;
}

function nodeAlpha(node) {
  if (node.ambient) return 0.16;
  if (node.kind === "focus") return 0.58;
  return Math.max(0.22, Math.min(0.62, (node.opacity ?? 0.9) * 0.58));
}

function nodeColor(node) {
  if (node.ambient) return node.tone === "amber" ? GOLD.clone() : node.tone === "blue" ? BLUE.clone() : DUST.clone();
  if (node.kind === "focus") return GOLD.clone();
  if (node.type === "industry") return BLUE.clone();
  if (node.type === "problem") return PINK.clone();
  if (node.type === "capability") return VIOLET.clone();
  if (node.type === "agent") return GOLD.clone();
  if (node.type === "action") return ROSE.clone();
  return CYAN.clone();
}

function nodeAccent(node) {
  if (node.kind === "focus") return new THREE.Color("#fff7b0");
  if (node.type === "problem" || node.type === "action") return new THREE.Color("#ffb1cf");
  if (node.type === "agent") return new THREE.Color("#fff0a0");
  return new THREE.Color("#bdeaff");
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(value));
}

function hash(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
