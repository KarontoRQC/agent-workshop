import { getChildren, getNode, graphModel, hasChildren, ROOT_ID } from "./agentAdapter.js";

export const VIEWBOX = { width: 1660, height: 900 };
export const CENTER = { x: 650, y: 430 };

const rootChildIds = graphModel[ROOT_ID].children;

const ambientCategories = [
  "供应链管理",
  "生产制造",
  "库存管理",
  "企业治理",
  "财务管理",
  "合规管理",
  "危机管理",
  "组织能力",
  "落地资产",
  "价值服务",
  "客户成功",
  "品牌定位",
  "渠道承接",
  "增长复盘",
  "内容资产",
  "私域沉淀",
];

const industryOrbit = [
  { x: 320, y: 235, fan: "leftTop" },
  { x: 515, y: 170, fan: "top" },
  { x: 750, y: 188, fan: "top" },
  { x: 970, y: 275, fan: "rightTop" },
  { x: 1045, y: 470, fan: "rightMid" },
  { x: 920, y: 645, fan: "bottomRight" },
  { x: 690, y: 710, fan: "bottom" },
  { x: 455, y: 675, fan: "bottom" },
  { x: 270, y: 540, fan: "leftLow" },
  { x: 220, y: 365, fan: "leftTop" },
  { x: 1120, y: 195, fan: "rightTop" },
  { x: 1135, y: 650, fan: "bottomRight" },
];

const fanConfig = {
  leftTop: { start: -1.72, spread: 1.48, distance: 112, labelLimit: 3 },
  top: { start: -1.45, spread: 1.2, distance: 108, labelLimit: 2 },
  rightTop: { start: -0.82, spread: 1.42, distance: 118, labelLimit: 3 },
  rightMid: { start: -0.48, spread: 1.28, distance: 122, labelLimit: 3 },
  bottomRight: { start: 0.24, spread: 1.36, distance: 114, labelLimit: 2 },
  bottom: { start: 0.66, spread: 1.5, distance: 114, labelLimit: 2 },
  leftLow: { start: 2.1, spread: 1.32, distance: 112, labelLimit: 2 },
  focus: { start: -1.15, spread: 2.36, distance: 225, labelLimit: 8 },
};

function noise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function pickCluster(index) {
  const clusters = [
    { x: 250, y: 210, rx: 250, ry: 165 },
    { x: 450, y: 520, rx: 330, ry: 220 },
    { x: 820, y: 255, rx: 390, ry: 180 },
    { x: 1030, y: 545, rx: 370, ry: 220 },
    { x: 1280, y: 250, rx: 230, ry: 175 },
    { x: 760, y: 745, rx: 440, ry: 115 },
    { x: 590, y: 410, rx: 520, ry: 310 },
  ];
  return clusters[index % clusters.length];
}

export function makeAmbientField(count = 1180) {
  return Array.from({ length: count }, (_, index) => {
    const clustered = index < count * 0.82;
    const cluster = pickCluster(index);
    const angle = noise(index + 10) * Math.PI * 2;
    const distance = Math.pow(noise(index + 22), 0.58);
    const x = clustered
      ? cluster.x + Math.cos(angle) * cluster.rx * distance
      : 60 + noise(index + 44) * (VIEWBOX.width - 120);
    const y = clustered
      ? cluster.y + Math.sin(angle) * cluster.ry * distance
      : 54 + noise(index + 55) * (VIEWBOX.height - 118);
    const major = index % 43 === 0;
    const medium = index % 17 === 0 || index % 29 === 0;

    return {
      id: `ambient-${index}`,
      x: clamp(x, 34, VIEWBOX.width - 38),
      y: clamp(y, 36, VIEWBOX.height - 42),
      r: major ? 4.2 + noise(index) * 2.4 : medium ? 2.3 + noise(index) * 1.55 : 0.8 + noise(index) * 1.25,
      tone: index % 10 === 0 ? "amber" : index % 31 === 0 ? "blue" : index % 23 === 0 ? "muted" : "dust",
      label: ambientCategories[index % ambientCategories.length],
      mass: major ? 3 : medium ? 2 : 1,
    };
  });
}

export function makeAmbientLinks(nodes) {
  const links = [];
  nodes.forEach((node, index) => {
    if (index % 2 !== 0) return;
    const offset = 3 + Math.floor(noise(index + 3) * 37);
    const target = nodes[(index + offset) % nodes.length];
    if (!target) return;
    const dx = node.x - target.x;
    const dy = node.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 240 && index % 4 !== 0) return;
    links.push({
      id: `ambient-link-${index}`,
      source: node,
      target,
      tone: node.tone === "amber" || target.tone === "amber" ? "amber" : "dust",
      distance,
    });
  });
  return links;
}

function addChildRing(nodes, links, anchor, options = {}) {
  const children = getChildren(anchor.id);
  const config = fanConfig[anchor.fan] || fanConfig.focus;
  const {
    mode = "path",
    depth = 2,
    ring = 2,
    kind = "branch",
    limit = children.length,
    distance = config.distance,
    labelLimit = config.labelLimit,
  } = options;
  const cap = Math.min(children.length, limit);

  children.slice(0, cap).forEach((child, index) => {
    const progress = cap === 1 ? 0.5 : index / (cap - 1);
    const angle = config.start + config.spread * progress + (noise(index + anchor.x) - 0.5) * 0.18;
    const radiusShift = (index % 3) * 13 + noise(index + anchor.y) * 13;
    const childNode = {
      ...child,
      x: anchor.x + Math.cos(angle) * (distance + radiusShift),
      y: anchor.y + Math.sin(angle) * (distance + radiusShift) * 0.78,
      kind,
      radius: semanticRadius(child),
      labelMode: ring <= 2 && index < labelLimit ? "always" : "hover",
      opacity: mode === "step" && ring > depth ? 0.22 : 0.92,
      parentId: anchor.id,
      ring,
      fan: anchor.fan,
    };
    nodes.push(childNode);
    links.push({
      id: `${anchor.id}-${child.id}`,
      source: anchor.id,
      target: child.id,
      kind: ring === 1 ? "industry" : ring === 2 ? "main" : "leaf",
      strength: ring === 1 ? 0.62 : 0.48,
      ring,
    });

    if (depth >= 3 && hasChildren(child.id)) {
      addChildRing(nodes, links, { ...childNode, fan: pickSubFan(index) }, {
        mode,
        depth,
        ring: ring + 1,
        kind: "leaf",
        limit: Math.min(getChildren(child.id).length, 4),
        distance: 68,
        labelLimit: 0,
      });
    }
  });
}

function industryPosition(index) {
  const preset = industryOrbit[index % industryOrbit.length];
  const drift = index >= industryOrbit.length ? 52 : 0;
  return {
    ...preset,
    x: preset.x + Math.cos(index * 1.31) * drift,
    y: preset.y + Math.sin(index * 1.77) * drift,
  };
}

function focusChildPositionFrom(anchor, index, total, lineageDepth) {
  const opensRight = lineageDepth > 2;
  const denseLeafSet = opensRight && total > 10;
  const start = denseLeafSet ? -1.28 : opensRight ? -1.12 : total > 7 ? -1.18 : -1.06;
  const spread = denseLeafSet ? Math.PI * 1.58 : opensRight ? Math.PI * 1.24 : total > 7 ? Math.PI * 1.76 : Math.PI * 1.48;
  const angle = start + (spread * index) / Math.max(total - 1, 1);
  const distance = (denseLeafSet ? 244 : opensRight ? 192 : 220) + (index % 3) * 24 + noise(index + 91) * 14;
  return {
    x: anchor.x + Math.cos(angle) * distance,
    y: anchor.y + Math.sin(angle) * distance * 0.74,
    angle,
  };
}

function siblingPositionFrom(anchor, index, total) {
  const start = 1.92;
  const spread = Math.PI * 1.18;
  const angle = start + (spread * index) / Math.max(total - 1, 1);
  const distance = 122 + (index % 2) * 18 + noise(index + 142) * 10;
  return {
    x: anchor.x + Math.cos(angle) * distance,
    y: anchor.y + Math.sin(angle) * distance * 0.72,
  };
}

function getLineage(id) {
  const lineage = [];
  const seen = new Set();
  let current = getNode(id);

  while (current && !seen.has(current.id)) {
    lineage.unshift(current);
    seen.add(current.id);
    current = current.parent ? getNode(current.parent) : null;
  }

  if (!lineage.some((node) => node.id === ROOT_ID)) {
    lineage.unshift(getNode(ROOT_ID));
  }

  return lineage;
}

function lineagePosition(index, total) {
  if (total <= 1) return { x: CENTER.x, y: CENTER.y, kind: "focus" };

  if (total === 2) {
    return index === 0
      ? { x: CENTER.x - 292, y: CENTER.y + 54, kind: "origin" }
      : { x: CENTER.x + 36, y: CENTER.y - 6, kind: "focus" };
  }

  const presets = [
    { x: CENTER.x - 430, y: CENTER.y + 66, kind: "origin" },
    { x: CENTER.x - 172, y: CENTER.y + 8, kind: "anchor" },
    { x: CENTER.x + 98, y: CENTER.y - 10, kind: "focus" },
  ];

  if (total === 3 && presets[index]) return presets[index];

  const t = index / Math.max(total - 1, 1);
  return {
    x: CENTER.x - 430 + t * 540,
    y: CENTER.y + 66 - Math.sin(t * Math.PI) * 76,
    kind: index === 0 ? "origin" : index === total - 1 ? "focus" : "anchor",
  };
}

export function buildGraphLayout({ focusId, depth = 2, mode = "path" }) {
  const focus = getNode(focusId);
  const isRoot = focusId === ROOT_ID;
  const children = getChildren(focusId);
  const nodes = [];
  const links = [];

  const focusNode = {
    ...focus,
    x: CENTER.x,
    y: CENTER.y,
    radius: semanticRadius(focus),
    kind: "focus",
    labelMode: "always",
    opacity: 1,
    ring: 0,
    fan: "focus",
    isLineage: true,
    lineageIndex: 0,
  };

  if (isRoot) {
    nodes.push(focusNode);
    rootChildIds.forEach((id, index) => {
      const node = getNode(id);
      const preset = industryPosition(index);
      const industry = {
        ...node,
        ...preset,
        radius: semanticRadius(node),
        kind: "industry",
        labelMode: index < 8 ? "always" : "hover",
        opacity: mode === "atlas" ? 0.9 : 0.66,
        parentId: ROOT_ID,
        ring: 1,
      };
      nodes.push(industry);
      links.push({
        id: `${focusId}-${id}`,
        source: focusId,
        target: id,
        kind: "industry",
        strength: 0.64,
        ring: 1,
      });

      if (depth >= 2) {
        addChildRing(nodes, links, industry, {
          mode,
          depth,
          ring: 2,
          kind: "branch",
          limit: Math.min(getChildren(id).length, 6),
          distance: mode === "atlas" ? 88 : 74,
          labelLimit: mode === "atlas" ? 2 : 0,
        });
      }
    });
    return { nodes, links };
  }

  const lineage = getLineage(focusId);
  const lineageIds = new Set(lineage.map((node) => node.id));

  lineage.forEach((node, index) => {
    const position = lineagePosition(index, lineage.length);
    nodes.push({
      ...node,
      ...position,
      radius: semanticRadius(node),
      labelMode: "always",
      opacity: 1,
      parentId: node.parent || null,
      ring: index,
      fan: index === lineage.length - 1 ? "focus" : index === 0 ? "leftLow" : "leftTop",
      isLineage: true,
      lineageIndex: index,
    });
  });

  lineage.slice(1).forEach((node, index) => {
    const source = lineage[index];
    links.push({
      id: `${source.id}-${node.id}-lineage`,
      source: source.id,
      target: node.id,
      kind: "lineage",
      strength: 0.9,
      ring: index + 1,
      pathIndex: index,
    });
  });

  const activeFocus = nodes.find((node) => node.id === focusId) || focusNode;
  const activeParent = focus.parent ? nodes.find((node) => node.id === focus.parent) : null;
  const childRing = lineage.length > 2 ? 3 : 2;

  if (activeParent && activeParent.id !== ROOT_ID) {
    const siblings = getChildren(activeParent.id)
      .filter((child) => child.id !== focusId)
      .slice(0, 7);

    siblings.forEach((child, index) => {
      const pos = siblingPositionFrom(activeParent, index, siblings.length);
      nodes.push({
        ...child,
        ...pos,
        radius: semanticRadius(child),
        kind: "sibling",
        labelMode: index < 3 ? "always" : "hover",
        opacity: mode === "atlas" ? 0.54 : 0.36,
        parentId: activeParent.id,
        ring: 2,
        fan: pickSubFan(index),
      });
      links.push({
        id: `${activeParent.id}-${child.id}-sibling`,
        source: activeParent.id,
        target: child.id,
        kind: "sibling",
        strength: 0.42,
        ring: 2,
      });
    });
  }

  children.forEach((child, index) => {
    const pos = focusChildPositionFrom(activeFocus, index, children.length, lineage.length);
    const childHasChildren = hasChildren(child.id);
    const labelLimit = focus.type === "industry" ? 8 : focus.type === "problem" || focus.type === "capability" ? 5 : 4;
    const branchNode = {
      ...child,
      ...pos,
      radius: semanticRadius(child),
      kind: childHasChildren ? "branch" : "leaf",
      labelMode: childHasChildren || index < labelLimit ? "always" : "hover",
      opacity: mode === "step" && childRing > depth ? 0.18 : 0.95,
      parentId: focusId,
      ring: childRing,
      fan: pickSubFan(index),
    };
    nodes.push(branchNode);
    links.push({
      id: `${focusId}-${child.id}`,
      source: focusId,
      target: child.id,
      kind: "main",
      strength: 0.72,
      ring: childRing,
    });

    if (depth >= 3 && childHasChildren) {
      addChildRing(nodes, links, branchNode, {
        mode,
        depth,
        ring: childRing + 1,
        kind: "leaf",
        limit: 5,
        distance: 76,
        labelLimit: 0,
      });
    }
  });

  rootChildIds
    .filter((id) => !lineageIds.has(id))
    .forEach((id, index) => {
      const preset = industryPosition(index);
      const node = getNode(id);
      nodes.push({
        ...node,
        x: preset.x + 34 * Math.cos(index * 1.83),
        y: preset.y + 22 * Math.sin(index * 1.29),
        radius: semanticRadius(node),
        kind: "context",
        labelMode: "hover",
        opacity: mode === "atlas" ? 0.28 : 0.11,
        parentId: ROOT_ID,
        ring: 1,
        fan: preset.fan,
      });
    });

  return { nodes, links };
}

function pickSubFan(index) {
  const keys = ["rightTop", "rightMid", "bottomRight", "bottom", "leftLow", "leftTop", "top"];
  return keys[index % keys.length];
}

function semanticRadius(node) {
  if (node.type === "brief") return 58;
  if (node.type === "industry") return 22;
  if (node.type === "problem") return 16;
  if (node.type === "capability") return 15;
  if (node.type === "action") return 10.5;
  if (node.type === "asset") return 10.5;
  if (node.type === "variable") return 9.5;
  if (node.type === "agent") return 8;
  return 11;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
