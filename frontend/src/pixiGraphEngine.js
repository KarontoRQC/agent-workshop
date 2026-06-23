import {
  Application,
  Container,
  Graphics,
  Text,
} from "pixi.js";
import { getNode, ROOT_ID } from "./agentAdapter.js";
import { CENTER, VIEWBOX } from "./graphLayout.js";

const colors = {
  bg: 0x11110f,
  text: 0xebe3d1,
  label: 0xece1c5,
  amber: 0xd7a936,
  amberHot: 0xffd765,
  amberDeep: 0x3a2b13,
  copper: 0xe68b4a,
  teal: 0x54c6b2,
  mint: 0x9cd9aa,
  sky: 0x79aeca,
  blush: 0xe6a06f,
  lineWhite: 0xf4efe4,
  cream: 0xded6c4,
  green: 0x8d9e7d,
  blue: 0x6f929d,
  dust: 0xd7d0bd,
  black: 0x0f0f0e,
};

const TRANSITION_MS = 860;
const CAMERA_EASE = 0.16;

export async function createPixiGraphEngine(mount, handlers = {}) {
  const app = new Application();
  await app.init({
    resizeTo: mount,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 1.5),
    preference: "webgl",
  });

  app.canvas.className = "pixi-graph-canvas";
  mount.appendChild(app.canvas);

  const scene = new Container();
  const backgroundLayer = new Container();
  const ambientLayer = new Container();
  const linkLayer = new Container();
  const nodeLayer = new Container();
  const labelLayer = new Container();

  app.stage.addChild(backgroundLayer, scene);
  scene.addChild(ambientLayer, linkLayer, nodeLayer, labelLayer);

  const dragPositions = new Map();
  const physicsStates = new Map();
  const cameraState = {
    x: null,
    y: null,
    scale: null,
    focusKey: "",
  };
  let latestBaseParams = null;
  let latestParams = null;
  let destroyed = false;
  let transitionKey = "";
  let transitionStartedAt = performance.now();
  let transitionFromNodes = new Map();
  let dragState = null;
  let lastDragRelease = null;
  let backgroundKey = "";
  let ambientKey = "";
  let animationFrame = 0;
  let animationUntil = 0;
  let idleFrame = 0;
  let dragFrame = 0;
  let hoverKey = "";

  function update(params) {
    if (destroyed) return;
    const transitionChanged = params.transitionKey !== transitionKey;
    if (params.transitionKey !== transitionKey) {
      transitionFromNodes = new Map(
        (latestParams?.layout?.nodes || []).map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      transitionKey = params.transitionKey;
      transitionStartedAt = performance.now();
      scheduleAnimationBurst(params.mode === "step" ? 2400 : 3200);
    }
    const nextHoverKey = params.hoveredId || "";
    if (nextHoverKey !== hoverKey) {
      hoverKey = nextHoverKey;
      scheduleAnimationBurst(240);
    }
    latestBaseParams = params;
    const positionedParams = applyDragPositions(params, dragPositions);
    const transitionedParams = transitionChanged
      ? applyLayoutTransition(positionedParams, transitionFromNodes, transitionStartedAt)
      : applyLayoutTransition(positionedParams, transitionFromNodes, transitionStartedAt);
    latestParams = applyPhysicsLayout(transitionedParams, physicsStates);
    const bounds = mount.getBoundingClientRect();
    layoutScene(scene, bounds, latestParams, cameraState);
    const nextBackgroundKey = `${Math.round(bounds.width)}:${Math.round(bounds.height)}`;
    if (nextBackgroundKey !== backgroundKey) {
      backgroundKey = nextBackgroundKey;
      renderBackground(backgroundLayer, bounds);
    }
    const nextAmbientKey = `${latestParams.mode}:${latestParams.ambientNodes.length}:${latestParams.ambientLinks.length}`;
    if (nextAmbientKey !== ambientKey) {
      ambientKey = nextAmbientKey;
      renderAmbient(ambientLayer, latestParams);
    }
    renderLinks(linkLayer, latestParams, transitionStartedAt);
    renderNodes(nodeLayer, labelLayer, latestParams, handlers, {
      transitionStartedAt,
      startDrag,
    });
  }

  function redraw() {
    if (!latestBaseParams || destroyed) return;
    update(latestBaseParams);
  }

  function resize() {
    backgroundKey = "";
    redraw();
  }

  function scheduleAnimationBurst(duration = 1200) {
    animationUntil = Math.max(animationUntil, performance.now() + duration);
    if (animationFrame) return;

    const step = (now) => {
      if (destroyed) return;
      redraw();
      if (now < animationUntil) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        animationFrame = 0;
        animationUntil = 0;
        redraw();
      }
    };

    animationFrame = window.requestAnimationFrame(step);
  }

  function startIdleAnimationLoop() {
    if (idleFrame) return;

    const step = () => {
      if (destroyed) return;

      if (!document.hidden && !animationFrame) redraw();

      idleFrame = window.requestAnimationFrame(step);
    };

    idleFrame = window.requestAnimationFrame(step);
  }

  function startDrag(node, event) {
    const local = scene.toLocal(event.global);
    dragState = {
      id: node.id,
      offsetX: node.x - local.x,
      offsetY: node.y - local.y,
      startX: local.x,
      startY: local.y,
      moved: false,
    };
    app.canvas.classList.add("is-dragging");
  }

  function moveDrag(event) {
    if (!dragState) return;
    const local = pointerToScene(event, mount, scene);
    if (Math.hypot(local.x - dragState.startX, local.y - dragState.startY) > 4) {
      dragState.moved = true;
    }
    dragPositions.set(dragState.id, {
      x: clamp(local.x + dragState.offsetX, 28, VIEWBOX.width - 28),
      y: clamp(local.y + dragState.offsetY, 34, VIEWBOX.height - 34),
    });
    scheduleDragRedraw();
    scheduleAnimationBurst(900);
  }

  function scheduleDragRedraw() {
    if (dragFrame) return;
    dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      redraw();
    });
  }

  function handleCanvasClick(event) {
    if (!latestParams || destroyed) return;
    if (lastDragRelease?.moved && performance.now() - lastDragRelease.at < 260) return;

    const point = pointerToScene(event, mount, scene);
    const node = pickNodeAt(point, latestParams.layout.nodes);
    if (node) handlers.onNodeClick?.(node);
  }

  function stopDrag() {
    if (dragState) {
      lastDragRelease = {
        id: dragState.id,
        moved: dragState.moved,
        at: performance.now(),
      };
    }
    dragState = null;
    app.canvas.classList.remove("is-dragging");
    scheduleAnimationBurst(1600);
  }

  app.canvas.addEventListener("click", handleCanvasClick);
  app.canvas.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
  startIdleAnimationLoop();

  return {
    app,
    update,
    resize,
    destroy() {
      destroyed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (idleFrame) window.cancelAnimationFrame(idleFrame);
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      app.canvas.removeEventListener("click", handleCanvasClick);
      app.canvas.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      app.destroy(true, { children: true, texture: true });
    },
  };
}

function applyDragPositions(params, dragPositions) {
  if (dragPositions.size === 0) return params;
  return {
    ...params,
    layout: {
      ...params.layout,
      nodes: params.layout.nodes.map((node) => {
        const position = dragPositions.get(node.id);
        return position ? { ...node, ...position, dragged: true } : node;
      }),
    },
  };
}

function applyLayoutTransition(params, fromNodes, startedAt) {
  if (!fromNodes?.size) return params;
  const elapsed = performance.now() - startedAt;
  if (elapsed >= TRANSITION_MS) return params;
  const t = smoothstep(clamp(elapsed / TRANSITION_MS, 0, 1));
  const currentMap = new Map(params.layout.nodes.map((node) => [node.id, node]));

  return {
    ...params,
    layout: {
      ...params.layout,
      nodes: params.layout.nodes.map((node) => {
        const parentFrom = node.parentId ? fromNodes.get(node.parentId) : null;
        const from = fromNodes.get(node.id) || parentFrom || { x: node.x, y: node.y };
        const parentNow = node.parentId ? currentMap.get(node.parentId) : null;
        const fallbackX = parentNow?.x ?? node.x;
        const fallbackY = parentNow?.y ?? node.y;
        return {
          ...node,
          x: lerp(from.x ?? fallbackX, node.x, t),
          y: lerp(from.y ?? fallbackY, node.y, t),
        };
      }),
    },
  };
}

function applyPhysicsLayout(params, physicsStates) {
  const nodes = params.layout.nodes;
  const activeIds = new Set(nodes.map((node) => node.id));

  physicsStates.forEach((_, id) => {
    if (!activeIds.has(id)) physicsStates.delete(id);
  });

  nodes.forEach((node) => {
    let state = physicsStates.get(node.id);
    if (!state) {
      state = {
        x: node.x,
        y: node.y,
        vx: 0,
        vy: 0,
      };
      physicsStates.set(node.id, state);
    }

    state.node = node;
    state.targetX = node.x;
    state.targetY = node.y;
    state.radius = physicsCollisionRadius(node);
    state.fixed = isPhysicsFixed(node);
  });

  const states = nodes.map((node) => physicsStates.get(node.id)).filter(Boolean);
  stepPhysics(states, params);

  return {
    ...params,
    layout: {
      ...params.layout,
      nodes: nodes.map((node) => {
        const state = physicsStates.get(node.id);
        return state ? { ...node, x: state.x, y: state.y } : node;
      }),
    },
  };
}

function stepPhysics(states, params) {
  const stateById = new Map(states.map((state) => [state.node.id, state]));

  states.forEach((state) => {
    const node = state.node;

    if (state.fixed) {
      state.x = state.targetX;
      state.y = state.targetY;
      state.vx = 0;
      state.vy = 0;
      return;
    }

    const spring = physicsSpringStrength(node, params.mode);
    state.vx += (state.targetX - state.x) * spring;
    state.vy += (state.targetY - state.y) * spring;

    const desiredRadius = physicsDesiredRadius(node, params.mode);
    if (desiredRadius > 0) {
      const dx = state.x - CENTER.x;
      const dy = state.y - CENTER.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const radialForce = (desiredRadius - distance) * physicsRadialStrength(node);
      state.vx += (dx / distance) * radialForce;
      state.vy += (dy / distance) * radialForce;
    }
  });

  applyPhysicsLinkSprings(stateById, params.layout.links);

  states.forEach((state) => {
    if (state.fixed) return;
    state.vx *= 0.84;
    state.vy *= 0.84;
    state.x += clamp(state.vx, -18, 18);
    state.y += clamp(state.vy, -18, 18);
  });

  for (let pass = 0; pass < 3; pass += 1) {
    resolvePhysicsCollisions(states);
  }

  states.forEach((state) => {
    state.x = clamp(state.x, 48 + state.radius, VIEWBOX.width - 48 - state.radius);
    state.y = clamp(state.y, 50 + state.radius, VIEWBOX.height - 48 - state.radius);
  });
}

function applyPhysicsLinkSprings(stateById, links) {
  links.forEach((link) => {
    const source = stateById.get(link.source);
    const target = stateById.get(link.target);
    if (!source || !target) return;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const idealDistance = physicsLinkDistance(source.node, target.node, link);
    const force = (distance - idealDistance) * physicsLinkStrength(source.node, target.node, link);
    const nx = dx / distance;
    const ny = dy / distance;
    const sourceMobility = source.fixed ? 0 : physicsLinkMobility(source.node);
    const targetMobility = target.fixed ? 0 : physicsLinkMobility(target.node);
    const totalMobility = sourceMobility + targetMobility || 1;
    const sourceForce = (force * sourceMobility) / totalMobility;
    const targetForce = (force * targetMobility) / totalMobility;

    if (!source.fixed) {
      source.vx += nx * sourceForce;
      source.vy += ny * sourceForce;
    }

    if (!target.fixed) {
      target.vx -= nx * targetForce;
      target.vy -= ny * targetForce;
    }
  });
}

function resolvePhysicsCollisions(states) {
  for (let i = 0; i < states.length; i += 1) {
    const a = states[i];
    for (let j = i + 1; j < states.length; j += 1) {
      const b = states[j];
      const minDistance = a.radius + b.radius;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);

      if (distance >= minDistance) continue;

      if (distance < 0.001) {
        const angle = (i * 12.9898 + j * 78.233) % (Math.PI * 2);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = (minDistance - distance) * 0.56;
      const aMobility = a.fixed ? 0 : physicsMobility(a.node);
      const bMobility = b.fixed ? 0 : physicsMobility(b.node);
      const totalMobility = aMobility + bMobility || 1;
      const aPush = (overlap * aMobility) / totalMobility;
      const bPush = (overlap * bMobility) / totalMobility;

      if (!a.fixed) {
        a.x -= nx * aPush;
        a.y -= ny * aPush;
        a.vx -= nx * aPush * 0.08;
        a.vy -= ny * aPush * 0.08;
      }

      if (!b.fixed) {
        b.x += nx * bPush;
        b.y += ny * bPush;
        b.vx += nx * bPush * 0.08;
        b.vy += ny * bPush * 0.08;
      }
    }
  }
}

function physicsCollisionRadius(node) {
  if (node.kind === "focus") return node.radius + 58;
  if (node.kind === "origin" || node.kind === "anchor") return node.radius + 32;
  if (node.kind === "industry") return node.radius + 24;
  if (node.kind === "branch") return node.radius + 22;
  if (node.kind === "leaf") return node.radius + 18;
  return node.radius + 16;
}

function physicsSpringStrength(node, mode) {
  if (node.dragged || node.kind === "focus") return 0.34;
  if (mode === "step") return 0.045;
  if (node.kind === "industry") return 0.05;
  if (node.kind === "branch") return 0.035;
  if (node.kind === "leaf") return 0.024;
  return 0.032;
}

function physicsDesiredRadius(node, mode) {
  if (mode !== "atlas" || node.dragged || node.kind === "focus") return 0;
  if (node.kind === "leaf" || node.ring >= 3) return 380;
  if (node.kind === "branch" || node.ring === 2) return 245;
  if (node.kind === "industry" || node.ring === 1) return 350;
  return 0;
}

function physicsRadialStrength(node) {
  if (node.kind === "leaf" || node.ring >= 3) return 0.0048;
  if (node.kind === "branch" || node.ring === 2) return 0.0042;
  if (node.kind === "industry" || node.ring === 1) return 0.0032;
  return 0;
}

function physicsLinkDistance(source, target, link) {
  if (Number.isFinite(link.idealDistance)) return link.idealDistance;
  if (link.kind === "leaf" || target.kind === "leaf" || target.ring >= 3) return 74;
  if (link.kind === "main" || target.kind === "branch" || target.ring === 2) return 118;
  if (link.kind === "lineage") return 176;
  if (link.kind === "industry") return 330;
  return 126;
}

function physicsLinkStrength(source, target, link) {
  const draggedEndpoint = source.dragged || target.dragged;
  const base =
    link.kind === "leaf" || target.kind === "leaf" || target.ring >= 3
      ? 0.052
      : link.kind === "main" || target.kind === "branch"
        ? 0.038
        : link.kind === "lineage"
          ? 0.022
          : 0.012;

  return draggedEndpoint ? base * 2.2 : base;
}

function physicsLinkMobility(node) {
  if (node.kind === "focus") return 0;
  if (node.kind === "industry" || node.ring === 1) return 0.42;
  if (node.kind === "branch" || node.ring === 2) return 0.8;
  if (node.kind === "leaf" || node.ring >= 3) return 1.24;
  return 0.7;
}

function physicsMobility(node) {
  if (node.kind === "focus") return 0;
  if (node.kind === "industry") return 0.54;
  if (node.kind === "branch") return 0.86;
  if (node.kind === "leaf") return 1.12;
  return 0.74;
}

function isPhysicsFixed(node) {
  return node.dragged || node.kind === "focus";
}

function layoutScene(scene, bounds, params, cameraState) {
  const leftReserve = bounds.width >= 840 ? Math.min(260, Math.max(140, bounds.width * 0.18)) : 0;
  const usableWidth = Math.max(420, bounds.width - leftReserve * 0.66);
  const base = Math.min(usableWidth / VIEWBOX.width, bounds.height / VIEWBOX.height);
  const defaultScale = base * 1.02;
  const defaultCamera = {
    x: (bounds.width - VIEWBOX.width * defaultScale) / 2 + leftReserve * 0.55,
    y: (bounds.height - VIEWBOX.height * defaultScale) / 2 + 8,
    scale: defaultScale,
    focusKey: "global",
  };
  const focusCamera = getRouteFocusCamera(bounds, params, defaultScale, leftReserve);
  const target = focusCamera || defaultCamera;

  if (cameraState.x === null) {
    cameraState.x = target.x;
    cameraState.y = target.y;
    cameraState.scale = target.scale;
  } else {
    cameraState.x = lerp(cameraState.x, target.x, CAMERA_EASE);
    cameraState.y = lerp(cameraState.y, target.y, CAMERA_EASE);
    cameraState.scale = lerp(cameraState.scale, target.scale, CAMERA_EASE);
  }

  cameraState.focusKey = target.focusKey;
  scene.position.set(cameraState.x, cameraState.y);
  scene.scale.set(cameraState.scale);
}

function getRouteFocusCamera(bounds, params, defaultScale, leftReserve) {
  const selectedId = params.selectedId;
  if (!selectedId || selectedId === ROOT_ID) return null;

  const nodeMap = new Map(params.layout.nodes.map((node) => [node.id, node]));
  const selectedNode = nodeMap.get(selectedId);
  if (!selectedNode || !isLeafRouteSelection(selectedNode)) return null;

  const pathIds = getSelectedPathIds(selectedId, nodeMap);
  const routeNodes = params.layout.nodes.filter((node) => pathIds.has(node.id));
  if (routeNodes.length < 2) return null;

  const padding = bounds.width < 760 ? 92 : 132;
  const minX = Math.min(...routeNodes.map((node) => node.x - node.radius)) - padding;
  const maxX = Math.max(...routeNodes.map((node) => node.x + node.radius)) + padding;
  const minY = Math.min(...routeNodes.map((node) => node.y - node.radius)) - padding;
  const maxY = Math.max(...routeNodes.map((node) => node.y + node.radius)) + padding;
  const routeWidth = Math.max(220, maxX - minX);
  const routeHeight = Math.max(180, maxY - minY);
  const cameraWidth = Math.max(360, bounds.width - leftReserve * 0.4);
  const cameraHeight = Math.max(260, bounds.height * 0.9);
  const routeScale = Math.min(cameraWidth / routeWidth, cameraHeight / routeHeight);
  const scale = clamp(Math.max(defaultScale * 1.16, routeScale), defaultScale, defaultScale * 1.78);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const screenCenterX = bounds.width * 0.56 + leftReserve * 0.22;
  const screenCenterY = bounds.height * 0.5 + 4;

  return {
    x: screenCenterX - centerX * scale,
    y: screenCenterY - centerY * scale,
    scale,
    focusKey: `route:${selectedId}`,
  };
}

function isLeafRouteSelection(node) {
  const sourceNode = getNode(node.id);
  return node.kind === "leaf" || node.ring >= 3 || !(sourceNode.children || []).length;
}

function pointerToScene(event, mount, scene) {
  const rect = mount.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - scene.position.x) / scene.scale.x,
    y: (event.clientY - rect.top - scene.position.y) / scene.scale.y,
  };
}

function pickNodeAt(point, nodes) {
  let best = null;
  let bestScore = Infinity;

  nodes.forEach((node) => {
    const dx = node.x - point.x;
    const dy = node.y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(node.radius + 22, 24);
    if (distance > threshold) return;

    const score = distance / threshold - (isMajorNode(node) ? 0.06 : 0);
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  });

  return best;
}

function clearLayer(layer) {
  layer.removeChildren().forEach((child) =>
    child.destroy({ children: true, texture: true, textureSource: true }),
  );
}

function renderBackground(layer, bounds) {
  clearLayer(layer);
  const wash = new Graphics();
  wash
    .ellipse(bounds.width * 0.46, bounds.height * 0.5, bounds.width * 0.5, bounds.height * 0.34)
    .fill({ color: colors.amber, alpha: 0.03 })
    .ellipse(bounds.width * 0.62, bounds.height * 0.48, bounds.width * 0.33, bounds.height * 0.25)
    .fill({ color: colors.blue, alpha: 0.018 });
  layer.addChild(wash);
}

function renderAmbient(layer, { ambientNodes, ambientLinks, mode }) {
  clearLayer(layer);
  const linkAlpha = mode === "atlas" ? 0.105 : mode === "path" ? 0.076 : 0.04;
  const nodeAlpha = mode === "atlas" ? 0.86 : mode === "path" ? 0.58 : 0.34;

  const lines = new Graphics();
  ambientLinks.forEach((link) => {
    lines
      .moveTo(link.source.x, link.source.y)
      .lineTo(link.target.x, link.target.y)
      .stroke({
        color: link.tone === "amber" ? colors.amber : colors.dust,
        alpha: link.tone === "amber" ? linkAlpha * 1.7 : linkAlpha,
        width: link.distance > 220 ? 0.38 : 0.56,
      });
  });
  layer.addChild(lines);

  const dots = new Graphics();
  ambientNodes.forEach((node) => {
    dots
      .circle(node.x, node.y, node.r)
      .fill({ color: ambientColor(node.tone), alpha: node.tone === "amber" ? nodeAlpha : nodeAlpha * 0.62 });
  });
  layer.addChild(dots);
}

function renderLinks(layer, params, transitionStartedAt) {
  const elapsed = (performance.now() - transitionStartedAt) / 1000;
  const nodeMap = new Map(params.layout.nodes.map((node) => [node.id, node]));
  const relation = getRelationState(params);
  const glow = getReusableGraphics(layer, "glow");
  const graphics = getReusableGraphics(layer, "lines");
  const flow = getReusableGraphics(layer, "flow");

  glow.clear();
  graphics.clear();
  flow.clear();

  params.layout.links.forEach((link) => {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (!source || !target) return;
    const state = getLinkState(link, source, target, relation, params, elapsed);

    if (state.highlight > 0.05) {
      drawCurve(glow, source, target, link.kind);
      glow.stroke({
        color: state.selected ? colors.amber : colors.lineWhite,
        alpha: state.selected ? 0.05 + state.highlight * 0.16 : 0.035 + state.highlight * 0.06,
        width: link.kind === "lineage" ? 12 : link.kind === "industry" ? 8.5 : 6.5,
      });
    }

    drawCurve(graphics, source, target, link.kind);
    graphics.stroke({
      color: state.selected ? colors.amberHot : colors.lineWhite,
      alpha: state.alpha,
      width: state.width,
    });

    if (state.flow > 0) {
      drawFlowMarker(flow, source, target, link.kind, elapsed, link.pathIndex ?? link.ring ?? 0, state.flow);
    }
  });

  layer.addChild(glow);
  layer.addChild(graphics);
  layer.addChild(flow);
}

function renderNodes(nodeLayer, labelLayer, params, handlers, controls) {
  const entries = getNodeEntryCache(nodeLayer);
  entries.forEach((entry) => {
    entry.seen = false;
  });

  const elapsed = (performance.now() - controls.transitionStartedAt) / 1000;
  const relation = getRelationState(params);
  const labelState = getLabelState(params);

  params.layout.nodes.forEach((node) => {
    const state = getNodeState(node, relation, params, elapsed);
    const entry = getNodeEntry(nodeLayer, labelLayer, node.id);
    const { group, aura, halo, orbit, ring, core, facet, shine, pin, hit } = entry;
    const accent = nodeAccentColor(node, state);

    entry.node = node;
    entry.handlers = handlers;
    entry.controls = controls;
    entry.seen = true;
    group.visible = true;
    group.alpha = (node.opacity ?? 1) * state.alpha;

    aura.clear();
    aura
      .circle(node.x, node.y, node.radius + state.aura + 9)
      .fill({ color: accent, alpha: state.auraAlpha * 0.42 })
      .circle(node.x, node.y, node.radius + state.aura)
      .fill({ color: colors.amber, alpha: state.auraAlpha });

    halo.clear();
    if (state.highlight > 0.12) {
      halo
        .circle(node.x, node.y, node.radius + 12 + Math.sin(elapsed * 4 + node.ring) * 2)
        .stroke({
          color: state.hot ? colors.amberHot : accent,
          alpha: 0.08 + state.highlight * 0.18,
          width: 1,
        });
    }

    orbit.clear();
    drawNodeOrbit(orbit, node, state, elapsed, accent);

    ring.clear();
    ring
      .circle(node.x, node.y, node.radius + 3.6)
      .fill({ color: colors.black, alpha: isMajorNode(node) ? 0.72 : 0.82 })
      .stroke({
        color: state.hot ? colors.amberHot : state.related ? accent : colors.dust,
        alpha: state.hot ? 0.94 : state.related ? 0.62 : 0.22,
        width: state.hot ? 1.8 : state.related ? 1.25 : 0.9,
      });

    core.clear();
    core
      .circle(node.x, node.y, node.radius)
      .fill({ color: nodeCoreColor(node, state), alpha: nodeCoreAlpha(node, state) });

    facet.clear();
    drawNodeFacet(facet, node, state, accent);

    shine.clear();
    drawNodeSpark(shine, node, state, elapsed, accent);

    pin.clear();
    if (node.dragged) {
      pin
        .circle(node.x + node.radius * 0.72, node.y - node.radius * 0.72, 3.2)
        .fill({ color: colors.amberHot, alpha: 0.95 })
        .circle(node.x, node.y, node.radius + 7)
        .stroke({ color: colors.amberHot, alpha: 0.28, width: 0.8 });
    }

    hit.clear();
    hit
      .circle(node.x, node.y, Math.max(node.radius + 20, 22))
      .fill({ color: 0xffffff, alpha: 0.001 });
    hit.hitArea = makeCircleHitArea(node.x, node.y, Math.max(node.radius + 20, 22));
    hit.cursor = node.dragged ? "grabbing" : "grab";

    const labelVisible = shouldShowLabel(node, labelState);
    updateLabel(entry, node, state, labelVisible);
  });

  entries.forEach((entry) => {
    if (entry.seen) return;
    entry.group.visible = false;
    if (entry.label) entry.label.visible = false;
  });
}

function getReusableGraphics(layer, key) {
  if (!layer.__graphicsCache) layer.__graphicsCache = new Map();
  const cached = layer.__graphicsCache.get(key);
  if (cached) return cached;

  const graphics = new Graphics();
  layer.__graphicsCache.set(key, graphics);
  layer.addChild(graphics);
  return graphics;
}

function getNodeEntryCache(nodeLayer) {
  if (!nodeLayer.__nodeEntries) nodeLayer.__nodeEntries = new Map();
  return nodeLayer.__nodeEntries;
}

function getNodeEntry(nodeLayer, labelLayer, nodeId) {
  const entries = getNodeEntryCache(nodeLayer);
  const cached = entries.get(nodeId);
  if (cached) {
    cached.labelLayer = labelLayer;
    return cached;
  }

  const entry = {
    node: null,
    handlers: null,
    controls: null,
    seen: true,
    group: new Container(),
    aura: new Graphics(),
    halo: new Graphics(),
    ring: new Graphics(),
    core: new Graphics(),
    pin: new Graphics(),
    hit: new Graphics(),
    label: null,
    labelLayer,
    labelStyleKey: "",
    orbit: new Graphics(),
    facet: new Graphics(),
    shine: new Graphics(),
  };

  entry.hit.eventMode = "static";
  entry.hit.on("pointerover", () => entry.handlers?.onHover?.(entry.node?.id));
  entry.hit.on("pointerout", () => entry.handlers?.onHover?.(null));
  entry.hit.on("pointerdown", (event) => {
    if (!entry.node || !entry.controls) return;
    event.stopPropagation();
    entry.controls.startDrag(entry.node, event);
  });

  entry.group.addChild(entry.aura, entry.halo, entry.orbit, entry.ring, entry.core, entry.facet, entry.shine, entry.pin, entry.hit);
  nodeLayer.addChild(entry.group);
  entries.set(nodeId, entry);
  return entry;
}

function makeCircleHitArea(x, y, radius) {
  return {
    contains(pointX, pointY) {
      return Math.hypot(pointX - x, pointY - y) <= radius;
    },
  };
}

function updateLabel(entry, node, state, visible) {
  if (!visible) {
    if (entry.label) entry.label.visible = false;
    return;
  }

  if (!entry.label) {
    entry.label = new Text({
      text: node.label,
      style: makeLabelStyle(node, state),
    });
    entry.label.anchor.set(0.5);
    entry.labelLayer.addChild(entry.label);
  } else if (entry.label.text !== node.label) {
    entry.label.text = node.label;
  }

  const styleKey = makeLabelStyleKey(node, state);
  if (styleKey !== entry.labelStyleKey) {
    entry.label.style = makeLabelStyle(node, state);
    entry.labelStyleKey = styleKey;
  }

  entry.label.visible = true;
  entry.label.position.set(node.x, isMajorNode(node) ? node.y + 3 : node.y - node.radius - 17);
  entry.label.alpha = isMajorNode(node) ? 1 : node.kind === "leaf" ? 0.82 : 0.92;
}

function getLabelState(params) {
  const nodeMap = new Map(params.layout.nodes.map((node) => [node.id, node]));

  return {
    focusId: params.focusId,
    hoveredId: params.hoveredId,
    pathIds: getSelectedPathIds(params.selectedId || params.focusId, nodeMap),
  };
}

function getSelectedPathIds(selectedId, nodeMap) {
  const pathIds = new Set();
  let cursorId = selectedId;
  let guard = 0;

  while (cursorId && guard < 24) {
    pathIds.add(cursorId);
    const parentId = nodeMap.get(cursorId)?.parentId || getNode(cursorId)?.parent || null;
    if (!parentId) break;
    cursorId = parentId;
    guard += 1;
  }

  return pathIds;
}

function shouldShowLabel(node, labelState) {
  return (
    node.labelMode === "always" ||
    labelState.pathIds.has(node.id) ||
    isSecondLevelLabelNode(node, labelState.focusId) ||
    isHoveredRevealLabelNode(node, labelState.hoveredId)
  );
}

function isSecondLevelLabelNode(node, focusId) {
  if (node.kind === "context" || node.kind === "sibling" || node.kind === "ghost") return false;
  return node.parentId === ROOT_ID || node.parentId === focusId;
}

function isHoveredRevealLabelNode(node, hoveredId) {
  if (node.id !== hoveredId) return false;
  if (node.kind === "context" || node.kind === "sibling" || node.kind === "ghost") return false;
  return node.labelMode === "hover" || node.kind === "leaf" || node.kind === "branch";
}

function getRelationState(params) {
  const related = new Set();
  const hot = new Set();
  const hotEdges = new Set();
  const selectedEdges = new Set();
  const { layout, focusId, selectedId, hoveredId } = params;
  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  const hoveredNode = hoveredId ? nodeMap.get(hoveredId) : null;
  const hasHover = Boolean(hoveredNode);
  const rootHover = hoveredId === ROOT_ID && nodeMap.has(ROOT_ID);
  const hasSelectedNode = Boolean(selectedId && selectedId !== ROOT_ID && getNode(selectedId));
  const selectedIsRoute = Boolean(hasSelectedNode && selectedId !== focusId);

  function addNode(id, isHot = false) {
    if (!id) return;
    related.add(id);
    if (isHot) hot.add(id);
  }

  function addEdge(sourceId, targetId, isHot = false, options = {}) {
    if (!sourceId || !targetId) return;
    const key = edgeKey(sourceId, targetId);
    hotEdges.add(key);
    if (options.selected) selectedEdges.add(key);
    addNode(sourceId, isHot);
    addNode(targetId, isHot);
  }

  function parentIdFor(id) {
    return nodeMap.get(id)?.parentId || getNode(id)?.parent || null;
  }

  function addAncestorRoute(id, isHot = false, shouldLightEdges = false, options = {}) {
    let cursorId = id;
    let guard = 0;

    while (cursorId && guard < 24) {
      addNode(cursorId, isHot);
      const parentId = parentIdFor(cursorId);
      if (!parentId) break;
      if (shouldLightEdges) addEdge(parentId, cursorId, isHot, options);
      else addNode(parentId, isHot);
      cursorId = parentId;
      guard += 1;
    }
  }

  function addDirectChildEdges(id, isHot = false) {
    layout.nodes.forEach((node) => {
      if (node.parentId === id) addEdge(id, node.id, isHot);
    });
  }

  function addFocusedRoute(id) {
    addAncestorRoute(id, true, true);
    addDirectChildEdges(id, true);
  }

  if (hasSelectedNode) addAncestorRoute(selectedId, true, true, { selected: true });
  if (selectedIsRoute) addDirectChildEdges(selectedId, true);

  if (rootHover) {
    addNode(ROOT_ID, true);
    addDirectChildEdges(ROOT_ID, true);
  }

  if (hasHover && !rootHover) {
    addFocusedRoute(hoveredId);
  }

  if (selectedIsRoute || hasHover) {
    return { related, hot, hotEdges, selectedEdges, specificSelection: selectedIsRoute, hasHover, rootHover };
  }

  addNode(focusId, true);
  addAncestorRoute(focusId);

  layout.nodes.forEach((node) => {
    if (node.isLineage || isMajorNode(node)) addNode(node.id, node.id === focusId || node.id === selectedId);
  });

  if (focusId !== ROOT_ID) {
    addNode(ROOT_ID);
    layout.nodes.forEach((node) => {
      if (node.parentId === focusId) addNode(node.id, node.ring <= 2);
      if (related.has(node.parentId)) addNode(node.id);
    });
  }

  if (focusId === ROOT_ID) {
    layout.nodes.forEach((node) => {
      if (node.parentId === ROOT_ID) addNode(node.id);
    });
  }

  return { related, hot, hotEdges, selectedEdges, specificSelection: false, hasHover: false, rootHover: false };
}

function getNodeState(node, relation, params, elapsed) {
  const reveal = ringReveal(node.ring ?? 1, elapsed, params.mode);
  const related = relation.related.has(node.id);
  const hot = relation.hot.has(node.id);
  const pinned = Boolean(node.dragged);
  const highlight = Math.max(hot || pinned ? 1 : 0, related ? 0.62 : 0) * reveal;
  const alphaBase = node.kind === "context" ? 0.42 : node.kind === "ghost" ? 0.56 : node.kind === "sibling" ? 0.72 : 1;
  const major = isMajorNode(node);
  const quietMode = relation.hasHover || relation.specificSelection;
  const dimmedAlpha = quietMode ? 0.13 : 0.46;
  const keepMajorVisible = major && !quietMode;

  return {
    related,
    hot: hot || pinned,
    highlight,
    alpha: related || keepMajorVisible ? alphaBase : node.kind === "industry" ? alphaBase * 0.5 : dimmedAlpha,
    aura: node.kind === "focus" ? 42 : node.kind === "anchor" ? 34 : node.kind === "origin" ? 30 : hot ? 22 : related ? 15 : 10,
    auraAlpha: major ? 0.07 + highlight * 0.09 : 0.016 + highlight * 0.12,
  };
}

function getLinkState(link, source, target, relation, params, elapsed) {
  const reveal = ringReveal(link.ring ?? Math.max(source.ring ?? 1, target.ring ?? 1), elapsed, params.mode);
  const key = edgeKey(source.id, target.id);
  const selected = relation.selectedEdges.has(key);
  const explicitlyHot = relation.hotEdges.has(key);
  const hot = explicitlyHot || (!relation.hasHover && !relation.specificSelection && relation.hot.has(source.id) && relation.hot.has(target.id));
  const related = relation.related.has(source.id) && relation.related.has(target.id);
  const rootHoverIndustry = relation.rootHover && source.id === ROOT_ID && target.parentId === ROOT_ID;
  const lineage = link.kind === "lineage";
  const quietMode = relation.hasHover || relation.specificSelection;
  const highlight = (selected ? 1 : hot || rootHoverIndustry ? 0.72 : related ? 0.36 : quietMode ? 0 : 0.18) * reveal;
  const idleAlpha = quietMode ? 0.15 : 0.2;
  const baseWidth = lineage ? 1.35 : link.kind === "industry" ? 0.86 : link.kind === "main" ? 0.76 : 0.48;

  return {
    selected,
    hot: hot || rootHoverIndustry,
    highlight,
    alpha: selected ? 0.62 + highlight * 0.28 : idleAlpha + highlight * (link.kind === "leaf" ? 0.24 : 0.32),
    width: baseWidth + highlight * (selected ? 1.35 : 0.58),
    flow: selected ? 0.42 * reveal : 0,
  };
}

function edgeKey(sourceId, targetId) {
  return `${sourceId}->${targetId}`;
}

function ringReveal(ring, elapsed, mode) {
  const delay = mode === "step" ? 0.28 : 0.18;
  const speed = mode === "step" ? 0.72 : 0.5;
  const t = (elapsed - Math.max(0, ring - 1) * delay) / speed;
  return smoothstep(clamp(t, 0, 1));
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeLabelStyleKey(node, state) {
  return [
    node.kind,
    node.radius,
    isMajorNode(node) ? "major" : "minor",
    state.hot ? "hot" : "idle",
  ].join(":");
}

function makeLabelStyle(node, state) {
  const isCenter = isMajorNode(node);

  return {
    fontFamily: "Inter, Microsoft YaHei UI, sans-serif",
    fontSize: node.kind === "focus" ? 18 : node.kind === "anchor" ? 15 : node.kind === "origin" ? 14 : node.kind === "leaf" ? 11 : 13,
    fontWeight: isCenter ? "800" : "650",
    fill: isCenter || state.hot ? 0xfff3c5 : colors.label,
    align: "center",
    stroke: {
      color: colors.bg,
      width: isCenter ? 7 : 5,
    },
    wordWrap: isCenter,
    wordWrapWidth: isCenter ? Math.max(104, node.radius * 2.5) : 120,
  };
}

function drawCurve(graphics, source, target, kind) {
  const curve = getCurve(source, target, kind);
  graphics
    .moveTo(curve.x0, curve.y0)
    .bezierCurveTo(curve.x1, curve.y1, curve.x2, curve.y2, curve.x3, curve.y3);
}

function getCurve(source, target, kind) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const normal = Math.sign(dx || 1);
  const lift = kind === "lineage" ? -28 : kind === "industry" ? -44 : kind === "main" ? -58 : kind === "sibling" ? -32 : -22;
  const side = kind === "leaf" ? 12 : kind === "lineage" ? 36 : 26;
  return {
    x0: source.x,
    y0: source.y,
    x1: midX - normal * side,
    y1: midY + lift + dy * 0.06,
    x2: midX + normal * side,
    y2: midY + Math.abs(dx) * 0.035,
    x3: target.x,
    y3: target.y,
  };
}

function drawFlowMarker(graphics, source, target, kind, elapsed, pathIndex, alpha) {
  const curve = getCurve(source, target, kind);
  const headT = (elapsed * 0.36 + pathIndex * 0.18) % 1;
  const tailT = Math.max(0, headT - 0.08);
  const head = cubicPoint(curve, headT);
  const tail = cubicPoint(curve, tailT);

  graphics
    .moveTo(tail.x, tail.y)
    .lineTo(head.x, head.y)
    .stroke({ color: colors.amberHot, alpha: 0.24 * alpha, width: kind === "lineage" ? 3.2 : 2.2 })
    .circle(head.x, head.y, kind === "lineage" ? 3.4 : 2.6)
    .fill({ color: colors.amberHot, alpha: 0.72 * alpha });
}

function cubicPoint(curve, t) {
  const inv = 1 - t;
  return {
    x:
      inv * inv * inv * curve.x0 +
      3 * inv * inv * t * curve.x1 +
      3 * inv * t * t * curve.x2 +
      t * t * t * curve.x3,
    y:
      inv * inv * inv * curve.y0 +
      3 * inv * inv * t * curve.y1 +
      3 * inv * t * t * curve.y2 +
      t * t * t * curve.y3,
  };
}

function nodeAccentColor(node, state = {}) {
  if (state.hot) return colors.amberHot;
  if (node.type === "industry" || node.kind === "industry") return colors.amber;
  if (node.type === "problem") return colors.copper;
  if (node.type === "capability") return colors.teal;
  if (node.type === "asset" || node.type === "action") return colors.mint;
  if (node.type === "variable") return colors.sky;
  return colors.cream;
}

function drawNodeOrbit(graphics, node, state, elapsed, accent) {
  if (node.kind === "ghost") return;
  if (node.kind === "context" && !state.related && !state.hot) return;

  const major = isMajorNode(node);
  const baseRadius = node.radius + (major ? 15 : node.kind === "industry" ? 10 : 7);
  const spin = elapsed * (state.hot ? 1.28 : state.related ? 0.72 : 0.38) + (node.ring || 0) * 0.84;
  const alpha = major ? 0.34 : state.hot ? 0.46 : state.related ? 0.28 : 0.12;
  const width = major ? 1.3 : state.hot ? 1.15 : 0.78;

  drawArcSegment(graphics, node.x, node.y, baseRadius, spin, spin + Math.PI * 0.58, major ? 24 : 16);
  graphics.stroke({ color: accent, alpha, width });

  drawArcSegment(graphics, node.x, node.y, baseRadius + (major ? 8 : 4), spin + Math.PI * 1.08, spin + Math.PI * 1.42, 12);
  graphics.stroke({ color: colors.lineWhite, alpha: alpha * 0.58, width: Math.max(0.55, width * 0.62) });

  if (major || state.hot) {
    drawArcSegment(graphics, node.x, node.y, baseRadius + 13, -spin * 0.62, -spin * 0.62 + Math.PI * 0.32, 10);
    graphics.stroke({ color: colors.amberHot, alpha: alpha * 0.86, width: 1 });
  }
}

function drawNodeFacet(graphics, node, state, accent) {
  const major = isMajorNode(node);
  const r = node.radius;
  const highlightAlpha = major ? 0.18 : state.hot ? 0.2 : state.related ? 0.13 : 0.08;

  graphics
    .circle(node.x - r * 0.24, node.y - r * 0.28, Math.max(2.2, r * 0.42))
    .fill({ color: colors.lineWhite, alpha: highlightAlpha })
    .circle(node.x + r * 0.3, node.y + r * 0.26, Math.max(1.6, r * 0.2))
    .fill({ color: accent, alpha: highlightAlpha * 0.84 });

  if (major) {
    graphics
      .circle(node.x, node.y, r * 0.72)
      .stroke({ color: colors.amberHot, alpha: 0.18 + state.highlight * 0.12, width: 0.8 })
      .circle(node.x, node.y, r * 0.42)
      .stroke({ color: colors.lineWhite, alpha: 0.1, width: 0.55 });
  }
}

function drawNodeSpark(graphics, node, state, elapsed, accent) {
  if (node.kind === "ghost" || node.kind === "context") return;

  const major = isMajorNode(node);
  const count = major ? 3 : state.hot ? 2 : state.related || node.type === "industry" ? 1 : 0;
  if (!count) return;

  const baseRadius = node.radius + (major ? 18 : 9);
  const alpha = major ? 0.62 : state.hot ? 0.78 : 0.42;

  for (let index = 0; index < count; index += 1) {
    const angle = elapsed * (0.9 + index * 0.18) + index * Math.PI * 0.74 + (node.ring || 0) * 0.66;
    const sparkX = node.x + Math.cos(angle) * (baseRadius + index * 2.6);
    const sparkY = node.y + Math.sin(angle) * (baseRadius + index * 2.6);
    const size = major ? 2.2 - index * 0.28 : 1.75 - index * 0.22;

    graphics
      .circle(sparkX, sparkY, Math.max(1.05, size))
      .fill({ color: index === 0 ? colors.amberHot : accent, alpha: alpha * (1 - index * 0.16) })
      .circle(sparkX, sparkY, Math.max(2.6, size * 2.2))
      .fill({ color: accent, alpha: alpha * 0.11 });
  }
}

function drawArcSegment(graphics, x, y, radius, start, end, segments = 16) {
  for (let index = 0; index <= segments; index += 1) {
    const angle = start + ((end - start) * index) / segments;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) graphics.moveTo(pointX, pointY);
    else graphics.lineTo(pointX, pointY);
  }
}

function nodeCoreColor(node, state) {
  if (isMajorNode(node)) return colors.amberDeep;
  if (state.hot && node.kind !== "context") return node.type === "industry" ? colors.amber : nodeAccentColor(node, state);
  if (node.kind === "context" || node.kind === "ghost") return colors.dust;
  if (node.kind === "leaf") return nodeAccentColor(node, state);
  if (node.type === "industry") return colors.cream;
  if (node.type === "problem") return colors.copper;
  if (node.type === "capability") return colors.teal;
  if (node.type === "asset" || node.type === "action") return colors.mint;
  if (node.type === "variable") return colors.sky;
  return colors.cream;
}

function nodeCoreAlpha(node, state) {
  if (isMajorNode(node)) return 0.98;
  if (node.kind === "context" || node.kind === "ghost") return 0.32;
  if (state.related || state.hot) return 0.96;
  return 0.72;
}

function isMajorNode(node) {
  return node.kind === "focus" || node.kind === "anchor" || node.kind === "origin";
}

function ambientColor(tone) {
  if (tone === "amber") return colors.amber;
  if (tone === "blue") return colors.blue;
  if (tone === "muted") return colors.green;
  return colors.dust;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
