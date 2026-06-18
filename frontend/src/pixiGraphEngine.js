import {
  Application,
  Container,
  Graphics,
  Text,
} from "pixi.js";
import { ROOT_ID } from "./agentAdapter.js";
import { VIEWBOX } from "./graphLayout.js";

const colors = {
  bg: 0x11110f,
  text: 0xebe3d1,
  label: 0xece1c5,
  amber: 0xd7a936,
  amberHot: 0xffd765,
  amberDeep: 0x3a2b13,
  cream: 0xded6c4,
  green: 0x8d9e7d,
  blue: 0x6f929d,
  dust: 0xd7d0bd,
  black: 0x0f0f0e,
};

const TRANSITION_MS = 860;

export async function createPixiGraphEngine(mount, handlers = {}) {
  const app = new Application();
  await app.init({
    resizeTo: mount,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
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
      scheduleAnimationBurst(960, 34);
    }
    const nextHoverKey = params.hoveredId || "";
    if (nextHoverKey !== hoverKey) {
      hoverKey = nextHoverKey;
      scheduleAnimationBurst(320, 72);
    }
    latestBaseParams = params;
    const positionedParams = applyDragPositions(params, dragPositions);
    latestParams = transitionChanged
      ? applyLayoutTransition(positionedParams, transitionFromNodes, transitionStartedAt)
      : applyLayoutTransition(positionedParams, transitionFromNodes, transitionStartedAt);
    const bounds = mount.getBoundingClientRect();
    layoutScene(scene, bounds, latestParams);
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

  function scheduleAnimationBurst(duration = 1200, frameBudget = 48) {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    const startedAt = performance.now();
    let lastFrameAt = 0;

    const step = (now) => {
      if (destroyed) return;
      if (now - lastFrameAt >= frameBudget) {
        lastFrameAt = now;
        redraw();
      }
      if (now - startedAt < duration) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        animationFrame = 0;
      }
    };

    animationFrame = window.requestAnimationFrame(step);
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
    redraw();
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
  }

  app.canvas.addEventListener("click", handleCanvasClick);
  app.canvas.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  return {
    app,
    update,
    resize,
    destroy() {
      destroyed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
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

function layoutScene(scene, bounds, params) {
  const base = Math.min(bounds.width / VIEWBOX.width, bounds.height / VIEWBOX.height);
  const scale = base * 1.02;
  const offsetX = (bounds.width - VIEWBOX.width * scale) / 2;
  const offsetY = (bounds.height - VIEWBOX.height * scale) / 2 + 8;
  scene.position.set(offsetX, offsetY);
  scene.scale.set(scale);
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
  clearLayer(layer);
  const elapsed = (performance.now() - transitionStartedAt) / 1000;
  const nodeMap = new Map(params.layout.nodes.map((node) => [node.id, node]));
  const relation = getRelationState(params);
  const glow = new Graphics();
  const graphics = new Graphics();
  const flow = new Graphics();

  params.layout.links.forEach((link) => {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (!source || !target) return;
    const state = getLinkState(link, source, target, relation, params, elapsed);

    if (state.highlight > 0.05) {
      drawCurve(glow, source, target, link.kind);
      glow.stroke({
        color: colors.amber,
        alpha: 0.05 + state.highlight * 0.16,
        width: link.kind === "lineage" ? 12 : link.kind === "industry" ? 8.5 : 6.5,
      });
    }

    drawCurve(graphics, source, target, link.kind);
    graphics.stroke({
      color: state.hot ? colors.amberHot : colors.amber,
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
  clearLayer(nodeLayer);
  clearLayer(labelLayer);
  const elapsed = (performance.now() - controls.transitionStartedAt) / 1000;
  const relation = getRelationState(params);

  params.layout.nodes.forEach((node) => {
    const state = getNodeState(node, relation, params, elapsed);
    const group = new Container();
    group.alpha = (node.opacity ?? 1) * state.alpha;

    const aura = new Graphics();
    aura
      .circle(node.x, node.y, node.radius + state.aura)
      .fill({ color: colors.amber, alpha: state.auraAlpha });

    const halo = new Graphics();
    if (state.highlight > 0.12) {
      halo
        .circle(node.x, node.y, node.radius + 12 + Math.sin(elapsed * 4 + node.ring) * 2)
        .stroke({
          color: colors.amberHot,
          alpha: 0.08 + state.highlight * 0.18,
          width: 1,
        });
    }

    const ring = new Graphics();
    ring
      .circle(node.x, node.y, node.radius + 3.6)
      .fill({ color: colors.black, alpha: isMajorNode(node) ? 0.78 : 0.86 })
      .stroke({
        color: state.hot ? colors.amberHot : state.related ? colors.amber : colors.dust,
        alpha: state.hot ? 0.92 : state.related ? 0.54 : 0.16,
        width: state.hot ? 1.55 : 0.9,
      });

    const core = new Graphics();
    core
      .circle(node.x, node.y, node.radius)
      .fill({ color: nodeCoreColor(node, state), alpha: nodeCoreAlpha(node, state) });

    const pin = new Graphics();
    if (node.dragged) {
      pin
        .circle(node.x + node.radius * 0.72, node.y - node.radius * 0.72, 3.2)
        .fill({ color: colors.amberHot, alpha: 0.95 })
        .circle(node.x, node.y, node.radius + 7)
        .stroke({ color: colors.amberHot, alpha: 0.28, width: 0.8 });
    }

    const hit = new Graphics();
    hit
      .circle(node.x, node.y, Math.max(node.radius + 20, 22))
      .fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = node.dragged ? "grabbing" : "grab";
    hit.on("pointerover", () => handlers.onHover?.(node.id));
    hit.on("pointerout", () => handlers.onHover?.(null));
    hit.on("pointerdown", (event) => {
      event.stopPropagation();
      controls.startDrag(node, event);
    });

    group.addChild(aura, halo, ring, core, pin, hit);
    nodeLayer.addChild(group);

    const labelVisible = shouldShowLabel(node, state, params);
    if (labelVisible) labelLayer.addChild(makeLabel(node, state));
  });
}

function shouldShowLabel(node, state, params) {
  if (node.type === "agent" || node.kind === "leaf") {
    return (
      params.showLabels ||
      node.labelMode === "always" ||
      node.id === params.selectedId ||
      node.id === params.hoveredId ||
      isMajorNode(node)
    );
  }

  return (
    params.showLabels ||
    node.labelMode === "always" ||
    state.hot ||
    (state.related && node.ring <= 2) ||
    isMajorNode(node)
  );
}

function getRelationState(params) {
  const related = new Set();
  const hot = new Set();
  const { layout, focusId, selectedId, hoveredId } = params;
  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  const hoveredNode = hoveredId ? nodeMap.get(hoveredId) : null;
  const selectedNode = selectedId ? nodeMap.get(selectedId) : null;
  const hoverIsRoute = Boolean(hoveredNode && hoveredId !== ROOT_ID && hoveredId !== focusId);
  const selectedIsRoute = Boolean(selectedNode && selectedId !== focusId);
  const specificSelection = hoverIsRoute || selectedIsRoute;

  function addNode(id, isHot = false) {
    if (!id) return;
    related.add(id);
    if (isHot) hot.add(id);
  }

  function addAncestors(id, isHot = false) {
    let cursor = nodeMap.get(id);
    let guard = 0;
    while (cursor && guard < 24) {
      addNode(cursor.id, isHot);
      cursor = cursor.parentId ? nodeMap.get(cursor.parentId) : null;
      guard += 1;
    }
  }

  addNode(focusId, true);
  addAncestors(focusId);
  if (selectedIsRoute && !hoverIsRoute) addAncestors(selectedId, true);

  layout.nodes.forEach((node) => {
    if (node.isLineage || isMajorNode(node)) addNode(node.id, node.id === focusId || node.id === selectedId);
  });

  if (focusId !== ROOT_ID && !specificSelection) {
    addNode(ROOT_ID);
    layout.nodes.forEach((node) => {
      if (node.parentId === focusId) addNode(node.id, node.ring <= 2);
      if (related.has(node.parentId)) addNode(node.id);
    });
  }

  if (hoveredId) {
    addAncestors(hoveredId, true);
    layout.nodes.forEach((node) => {
      if (hoveredId === ROOT_ID && node.parentId === ROOT_ID) addNode(node.id, true);
      if (node.parentId === hoveredId) addNode(node.id, true);
    });
  }

  if (focusId === ROOT_ID && !hoveredId) {
    layout.nodes.forEach((node) => {
      if (node.parentId === ROOT_ID) addNode(node.id);
    });
  }

  return { related, hot, specificSelection };
}

function getNodeState(node, relation, params, elapsed) {
  const reveal = ringReveal(node.ring ?? 1, elapsed, params.mode);
  const related = relation.related.has(node.id);
  const hot = relation.hot.has(node.id);
  const pinned = Boolean(node.dragged);
  const rootHoverIndustry = params.hoveredId === ROOT_ID && node.parentId === ROOT_ID;
  const highlight = Math.max(hot || rootHoverIndustry || pinned ? 1 : 0, related ? 0.62 : 0) * reveal;
  const alphaBase = node.kind === "context" ? 0.42 : node.kind === "ghost" ? 0.56 : node.kind === "sibling" ? 0.72 : 1;
  const major = isMajorNode(node);
  const dimmedAlpha = relation.specificSelection ? 0.18 : 0.46;

  return {
    related,
    hot: hot || rootHoverIndustry || pinned,
    highlight,
    alpha: related || major ? alphaBase : node.kind === "industry" ? alphaBase * 0.64 : dimmedAlpha,
    aura: node.kind === "focus" ? 42 : node.kind === "anchor" ? 34 : node.kind === "origin" ? 30 : hot ? 22 : related ? 15 : 10,
    auraAlpha: major ? 0.07 + highlight * 0.09 : 0.016 + highlight * 0.12,
  };
}

function getLinkState(link, source, target, relation, params, elapsed) {
  const reveal = ringReveal(link.ring ?? Math.max(source.ring ?? 1, target.ring ?? 1), elapsed, params.mode);
  const hot = relation.hot.has(source.id) && relation.hot.has(target.id);
  const related = relation.related.has(source.id) && relation.related.has(target.id);
  const rootHoverIndustry = params.hoveredId === ROOT_ID && source.id === ROOT_ID && target.parentId === ROOT_ID;
  const lineage = link.kind === "lineage";
  const highlight = (lineage || hot || rootHoverIndustry ? 1 : related ? 0.62 : relation.specificSelection ? 0 : 0.12) * reveal;
  const idleAlpha = relation.specificSelection ? 0.035 : 0.14;
  return {
    hot: lineage || hot || rootHoverIndustry,
    highlight,
    alpha: lineage ? 0.34 + highlight * 0.58 : link.kind === "leaf" ? idleAlpha + highlight * 0.52 : idleAlpha + highlight * 0.66,
    width: lineage ? 1.35 + highlight * 1.45 : link.kind === "industry" ? 0.8 + highlight * 0.9 : link.kind === "main" ? 0.72 + highlight * 0.84 : 0.42 + highlight * 0.5,
    flow: lineage ? reveal : hot && link.kind === "main" ? 0.45 * reveal : 0,
  };
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

function makeLabel(node, state) {
  const isCenter = isMajorNode(node);
  const text = new Text({
    text: node.label,
    style: {
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
    },
  });
  text.anchor.set(0.5);
  text.position.set(node.x, isCenter ? node.y + 3 : node.y - node.radius - 17);
  text.alpha = isCenter ? 1 : node.kind === "leaf" ? 0.82 : 0.92;
  return text;
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

function nodeCoreColor(node, state) {
  if (isMajorNode(node)) return colors.amberDeep;
  if (state.hot && node.kind !== "context") return node.type === "industry" ? colors.amber : colors.amberHot;
  if (node.kind === "context" || node.kind === "ghost") return colors.dust;
  if (node.kind === "leaf") return node.type === "problem" ? colors.amber : colors.cream;
  if (node.type === "industry") return colors.cream;
  if (node.type === "problem") return colors.amber;
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
