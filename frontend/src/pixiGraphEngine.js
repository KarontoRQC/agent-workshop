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
  let dragState = null;

  function update(params) {
    if (destroyed) return;
    if (params.transitionKey !== transitionKey) {
      transitionKey = params.transitionKey;
      transitionStartedAt = performance.now();
    }
    latestBaseParams = params;
    latestParams = applyDragPositions(params, dragPositions);
    const bounds = mount.getBoundingClientRect();
    layoutScene(scene, bounds, latestParams);
    renderBackground(backgroundLayer, bounds);
    renderAmbient(ambientLayer, latestParams);
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
    redraw();
  }

  function startDrag(node, event) {
    const local = scene.toLocal(event.global);
    dragState = {
      id: node.id,
      offsetX: node.x - local.x,
      offsetY: node.y - local.y,
    };
    app.canvas.classList.add("is-dragging");
  }

  function moveDrag(event) {
    if (!dragState) return;
    const local = pointerToScene(event, mount, scene);
    dragPositions.set(dragState.id, {
      x: clamp(local.x + dragState.offsetX, 28, VIEWBOX.width - 28),
      y: clamp(local.y + dragState.offsetY, 34, VIEWBOX.height - 34),
    });
    redraw();
  }

  function stopDrag() {
    dragState = null;
    app.canvas.classList.remove("is-dragging");
  }

  app.canvas.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  app.ticker.add(() => {
    if (!latestBaseParams || destroyed) return;
    if (performance.now() - transitionStartedAt < 1900) redraw();
  });

  return {
    app,
    update,
    resize,
    destroy() {
      destroyed = true;
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

function layoutScene(scene, bounds, params) {
  const base = Math.min(bounds.width / VIEWBOX.width, bounds.height / VIEWBOX.height);
  const focusBoost = params.focusId === ROOT_ID ? 1.02 : 1.1;
  const scale = base * focusBoost;
  const offsetX = (bounds.width - VIEWBOX.width * scale) / 2 + (params.focusId === ROOT_ID ? 0 : -16);
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

function clearLayer(layer) {
  layer.removeChildren().forEach((child) => child.destroy({ children: true }));
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
        width: link.kind === "industry" ? 8.5 : 6.5,
      });
    }

    drawCurve(graphics, source, target, link.kind);
    graphics.stroke({
      color: state.hot ? colors.amberHot : colors.amber,
      alpha: state.alpha,
      width: state.width,
    });
  });

  layer.addChild(glow);
  layer.addChild(graphics);
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
      .fill({ color: colors.black, alpha: node.kind === "focus" ? 0.78 : 0.86 })
      .stroke({
        color: state.hot ? colors.amberHot : state.related ? colors.amber : colors.dust,
        alpha: state.hot ? 0.92 : state.related ? 0.54 : 0.16,
        width: state.hot ? 1.55 : 0.9,
      });

    const core = new Graphics();
    core
      .circle(node.x, node.y, node.radius)
      .fill({ color: nodeCoreColor(node, state), alpha: nodeCoreAlpha(node, state) });

    const hit = new Graphics();
    hit
      .circle(node.x, node.y, Math.max(node.radius + 20, 22))
      .fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = node.dragged ? "grabbing" : "grab";
    hit.on("pointerover", () => handlers.onHover?.(node.id));
    hit.on("pointerout", () => handlers.onHover?.(null));
    hit.on("pointertap", () => handlers.onNodeClick?.(node));
    hit.on("pointerdown", (event) => {
      event.stopPropagation();
      handlers.onNodeClick?.(node);
      controls.startDrag(node, event);
    });

    group.addChild(aura, halo, ring, core, hit);
    nodeLayer.addChild(group);

    const labelVisible =
      params.showLabels ||
      node.labelMode === "always" ||
      state.hot ||
      (state.related && node.ring <= 2) ||
      node.kind === "focus";
    if (labelVisible) labelLayer.addChild(makeLabel(node, state));
  });
}

function getRelationState(params) {
  const related = new Set();
  const hot = new Set();
  const { layout, focusId, selectedId, hoveredId } = params;

  function addNode(id, isHot = false) {
    if (!id) return;
    related.add(id);
    if (isHot) hot.add(id);
  }

  addNode(focusId, true);
  addNode(selectedId, true);

  if (focusId !== ROOT_ID) {
    addNode(ROOT_ID);
    layout.nodes.forEach((node) => {
      if (node.parentId === focusId) addNode(node.id, node.ring <= 2);
      if (related.has(node.parentId)) addNode(node.id);
    });
  }

  if (hoveredId) {
    addNode(hoveredId, true);
    layout.nodes.forEach((node) => {
      if (hoveredId === ROOT_ID && node.parentId === ROOT_ID) addNode(node.id, true);
      if (node.parentId === hoveredId) addNode(node.id, true);
      if (node.id === hoveredId && node.parentId) addNode(node.parentId);
    });
  }

  if (focusId === ROOT_ID && !hoveredId) {
    layout.nodes.forEach((node) => {
      if (node.parentId === ROOT_ID) addNode(node.id);
    });
  }

  return { related, hot };
}

function getNodeState(node, relation, params, elapsed) {
  const reveal = ringReveal(node.ring ?? 1, elapsed, params.mode);
  const related = relation.related.has(node.id);
  const hot = relation.hot.has(node.id);
  const rootHoverIndustry = params.hoveredId === ROOT_ID && node.parentId === ROOT_ID;
  const highlight = Math.max(hot || rootHoverIndustry ? 1 : 0, related ? 0.62 : 0) * reveal;
  const alphaBase = node.kind === "context" ? 0.42 : node.kind === "ghost" ? 0.56 : 1;

  return {
    related,
    hot: hot || rootHoverIndustry,
    highlight,
    alpha: related || node.kind === "focus" || node.kind === "industry" ? alphaBase : 0.46,
    aura: node.kind === "focus" ? 42 : hot ? 22 : related ? 15 : 10,
    auraAlpha: node.kind === "focus" ? 0.1 + highlight * 0.06 : 0.016 + highlight * 0.12,
  };
}

function getLinkState(link, source, target, relation, params, elapsed) {
  const reveal = ringReveal(link.ring ?? Math.max(source.ring ?? 1, target.ring ?? 1), elapsed, params.mode);
  const hot = relation.hot.has(source.id) || relation.hot.has(target.id);
  const related = relation.related.has(source.id) && relation.related.has(target.id);
  const rootHoverIndustry = params.hoveredId === ROOT_ID && source.id === ROOT_ID && target.parentId === ROOT_ID;
  const highlight = (hot || rootHoverIndustry ? 1 : related ? 0.62 : 0.12) * reveal;
  return {
    hot: hot || rootHoverIndustry,
    highlight,
    alpha: link.kind === "leaf" ? 0.16 + highlight * 0.52 : 0.18 + highlight * 0.66,
    width: link.kind === "industry" ? 0.8 + highlight * 0.9 : link.kind === "main" ? 0.72 + highlight * 0.84 : 0.42 + highlight * 0.5,
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

function makeLabel(node, state) {
  const isCenter = node.kind === "focus";
  const text = new Text({
    text: node.label,
    style: {
      fontFamily: "Inter, Microsoft YaHei UI, sans-serif",
      fontSize: isCenter ? 18 : node.kind === "leaf" ? 11 : 13,
      fontWeight: isCenter ? "800" : "650",
      fill: isCenter || state.hot ? 0xfff3c5 : colors.label,
      align: "center",
      stroke: {
        color: colors.bg,
        width: isCenter ? 7 : 5,
      },
      wordWrap: isCenter,
      wordWrapWidth: isCenter ? 136 : 120,
    },
  });
  text.anchor.set(0.5);
  text.position.set(node.x, isCenter ? node.y + 3 : node.y - node.radius - 17);
  text.alpha = isCenter ? 1 : node.kind === "leaf" ? 0.82 : 0.92;
  return text;
}

function drawCurve(graphics, source, target, kind) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const normal = Math.sign(dx || 1);
  const lift = kind === "industry" ? -44 : kind === "main" ? -58 : -22;
  const side = kind === "leaf" ? 12 : 26;
  graphics
    .moveTo(source.x, source.y)
    .bezierCurveTo(
      midX - normal * side,
      midY + lift + dy * 0.06,
      midX + normal * side,
      midY + Math.abs(dx) * 0.035,
      target.x,
      target.y,
    );
}

function nodeCoreColor(node, state) {
  if (node.kind === "focus") return colors.amberDeep;
  if (state.hot && node.kind !== "context") return node.type === "industry" ? colors.amber : colors.amberHot;
  if (node.kind === "context" || node.kind === "ghost") return colors.dust;
  if (node.kind === "leaf") return node.type === "problem" ? colors.amber : colors.cream;
  if (node.type === "industry") return colors.cream;
  if (node.type === "problem") return colors.amber;
  return colors.cream;
}

function nodeCoreAlpha(node, state) {
  if (node.kind === "focus") return 0.98;
  if (node.kind === "context" || node.kind === "ghost") return 0.32;
  if (state.related || state.hot) return 0.96;
  return 0.72;
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
