import { getChildren, getNode, graphModel, ROOT_ID } from "./agentAdapter.js";

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
  { x: 320, y: 235, radius: 19, fan: "leftTop" },
  { x: 515, y: 170, radius: 16, fan: "top" },
  { x: 750, y: 188, radius: 17, fan: "top" },
  { x: 970, y: 275, radius: 18, fan: "rightTop" },
  { x: 1045, y: 470, radius: 19, fan: "rightMid" },
  { x: 920, y: 645, radius: 17, fan: "bottomRight" },
  { x: 690, y: 710, radius: 16, fan: "bottom" },
  { x: 455, y: 675, radius: 17, fan: "bottom" },
  { x: 270, y: 540, radius: 16, fan: "leftLow" },
  { x: 220, y: 365, radius: 18, fan: "leftTop" },
  { x: 1120, y: 195, radius: 15, fan: "rightTop" },
  { x: 1135, y: 650, radius: 15, fan: "bottomRight" },
];

const fanConfig = {
  leftTop: { start: -1.72, spread: 1.48, distance: 112, labelLimit: 5 },
  top: { start: -1.45, spread: 1.2, distance: 106, labelLimit: 4 },
  rightTop: { start: -0.82, spread: 1.42, distance: 118, labelLimit: 5 },
  rightMid: { start: -0.48, spread: 1.28, distance: 120, labelLimit: 5 },
  bottomRight: { start: 0.24, spread: 1.36, distance: 112, labelLimit: 4 },
  bottom: { start: 0.66, spread: 1.5, distance: 112, labelLimit: 4 },
  leftLow: { start: 2.1, spread: 1.32, distance: 110, labelLimit: 4 },
  focus: { start: -1.15, spread: 2.36, distance: 225, labelLimit: 9 },
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
  } = options;
  const cap = Math.min(children.length, limit);

  children.slice(0, cap).forEach((child, index) => {
    const progress = cap === 1 ? 0.5 : index / (cap - 1);
    const angle = config.start + config.spread * progress + (noise(index + anchor.x) - 0.5) * 0.18;
    const radiusShift = (index % 3) * 13 + noise(index + anchor.y) * 13;
    const leaf = {
      ...child,
      x: anchor.x + Math.cos(angle) * (distance + radiusShift),
      y: anchor.y + Math.sin(angle) * (distance + radiusShift) * 0.78,
      kind,
      radius: kind === "branch" ? 10 + (child.type === "problem" ? 3 : 1) : 4.4 + (index % 3 === 0 ? 1.6 : 0),
      labelMode: ring <= 2 && index < config.labelLimit ? "always" : "hover",
      opacity: mode === "step" && ring > depth ? 0.22 : 0.92,
      parentId: anchor.id,
      ring,
      fan: anchor.fan,
    };
    nodes.push(leaf);
    links.push({
      id: `${anchor.id}-${child.id}`,
      source: anchor.id,
      target: child.id,
      kind: ring === 1 ? "industry" : ring === 2 ? "main" : "leaf",
      strength: ring === 1 ? 0.62 : 0.48,
      ring,
    });

    if (depth >= 3 && graphModel[child.id]) {
      addChildRing(nodes, links, { ...leaf, fan: pickSubFan(index) }, {
        mode,
        depth,
        ring: ring + 1,
        kind: "leaf",
        limit: Math.min(getChildren(child.id).length, 4),
        distance: 64,
      });
    }
  });
}

function industryPosition(id, index) {
  const preset = industryOrbit[index % industryOrbit.length];
  const drift = index >= industryOrbit.length ? 52 : 0;
  return {
    ...preset,
    x: preset.x + Math.cos(index * 1.31) * drift,
    y: preset.y + Math.sin(index * 1.77) * drift,
  };
}

function focusChildPosition(child, index, total) {
  const start = total > 7 ? -1.18 : -1.06;
  const spread = total > 7 ? Math.PI * 1.76 : Math.PI * 1.48;
  const angle = start + (spread * index) / Math.max(total - 1, 1);
  const distance = 220 + (index % 3) * 28 + noise(index + 91) * 14;
  return {
    x: CENTER.x + Math.cos(angle) * distance,
    y: CENTER.y + Math.sin(angle) * distance * 0.72,
    angle,
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
    radius: isRoot ? 58 : 44,
    kind: "focus",
    labelMode: "always",
    opacity: 1,
    ring: 0,
    fan: "focus",
  };
  nodes.push(focusNode);

  if (isRoot) {
    rootChildIds.forEach((id, index) => {
      const node = getNode(id);
      const preset = industryPosition(id, index);
      const industry = {
        ...node,
        ...preset,
        kind: "industry",
        labelMode: index < 8 ? "always" : "hover",
        opacity: mode === "atlas" ? 0.88 : 0.64,
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
    });
    return { nodes, links };
  }

  nodes.push({
    ...getNode(ROOT_ID),
    x: CENTER.x - 300,
    y: CENTER.y + 52,
    radius: 18,
    kind: "ghost",
    labelMode: "hover",
    opacity: 0.34,
    parentId: null,
    ring: 0,
    fan: "leftLow",
  });
  links.push({
    id: `${ROOT_ID}-${focusId}-main`,
    source: ROOT_ID,
    target: focusId,
    kind: "industry",
    strength: 0.76,
    ring: 1,
  });

  children.forEach((child, index) => {
    const pos = focusChildPosition(child, index, children.length);
    const branch = {
      ...child,
      ...pos,
      radius: child.type === "problem" ? 15 : child.type === "capability" ? 13 : 10,
      kind: graphModel[child.id] ? "branch" : "leaf",
      labelMode: index < 10 ? "always" : "hover",
      opacity: mode === "step" && depth < 2 ? 0.18 : 0.95,
      parentId: focusId,
      ring: 2,
      fan: pickSubFan(index),
    };
    nodes.push(branch);
    links.push({
      id: `${focusId}-${child.id}`,
      source: focusId,
      target: child.id,
      kind: "main",
      strength: 0.72,
      ring: 2,
    });

    if (depth >= 3 && graphModel[child.id]) {
      addChildRing(nodes, links, branch, {
        mode,
        depth,
        ring: 3,
        kind: "leaf",
        limit: 5,
        distance: 76,
      });
    }
  });

  rootChildIds
    .filter((id) => id !== focusId)
    .forEach((id, index) => {
      const preset = industryPosition(id, index);
      const node = getNode(id);
      nodes.push({
        ...node,
        x: preset.x + 34 * Math.cos(index * 1.83),
        y: preset.y + 22 * Math.sin(index * 1.29),
        radius: 5.5,
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
