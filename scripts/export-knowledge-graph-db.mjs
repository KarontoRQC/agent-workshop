import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentCatalog, getNode, graphModel, ROOT_ID } from "../src/agentAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "data");
const outputPath = path.join(outputDir, "knowledge_graph_seed.json");

const parentByChild = new Map();
const sortOrderByChild = new Map();
const edges = [];

Object.values(graphModel).forEach((node) => {
  (node.children || []).forEach((childId, index) => {
    parentByChild.set(childId, node.id);
    sortOrderByChild.set(childId, index + 1);
    edges.push({
      id: `${node.id}->${childId}`,
      source_node_id: node.id,
      target_node_id: childId,
      relation_type: relationTypeFor(node.type),
      relation_label: relationLabelFor(node.type),
      sort_order: index + 1,
    });
  });
});

const nodeIds = new Set([ROOT_ID, ...Object.keys(graphModel)]);
edges.forEach((edge) => {
  nodeIds.add(edge.source_node_id);
  nodeIds.add(edge.target_node_id);
});

const levels = buildLevels(edges);
const nodes = [...nodeIds].map((id) => {
  const node = getNode(id);
  const children = edges.filter((edge) => edge.source_node_id === id);
  const parentId = node.parent || parentByChild.get(id) || null;
  return {
    id: node.id,
    title: node.label,
    node_type: node.type,
    parent_id: parentId,
    level: levels.get(id) ?? null,
    summary: node.summary || "",
    insight: node.insight || "",
    status: "active",
    is_leaf: children.length === 0,
    sort_order: id === ROOT_ID ? 0 : sortOrderByChild.get(id) || 999,
  };
}).sort((a, b) => {
  const levelA = a.level ?? 999;
  const levelB = b.level ?? 999;
  if (levelA !== levelB) return levelA - levelB;
  if ((a.parent_id || "") !== (b.parent_id || "")) return (a.parent_id || "").localeCompare(b.parent_id || "");
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
});

const agents = Object.entries(agentCatalog).map(([id, agent]) => ({
  id,
  agent_key: agent.agentKey,
  name: agent.name,
  role: agent.role,
  provider: agent.provider,
  endpoint: agent.endpoint,
  score: agent.score,
  status: "active",
}));

const nodeAgents = Object.values(graphModel).flatMap((node) =>
  (node.agents || []).map((agentId, index) => ({
    id: `${node.id}:${agentId}`,
    node_id: node.id,
    agent_id: agentId,
    priority: index + 1,
    relation_type: "recommended_agent",
  })),
);

const database = {
  metadata: {
    version: "2026-06-18-v1",
    root_node_id: ROOT_ID,
    description: "业务语义图谱数据库种子数据，不包含任何前端视觉布局字段。",
  },
  tables: {
    nodes,
    edges,
    agents,
    node_agents: nodeAgents,
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");

console.log(`Exported ${nodes.length} nodes, ${edges.length} edges, ${agents.length} agents to ${outputPath}`);

function relationTypeFor(sourceType) {
  if (sourceType === "brief") return "opens_to_industry";
  if (sourceType === "industry") return "decomposes_to_business_node";
  return "decomposes_to_variable";
}

function relationLabelFor(sourceType) {
  if (sourceType === "brief") return "行业积累";
  if (sourceType === "industry") return "行业拆解";
  return "变量拆解";
}

function buildLevels(edgeRows) {
  const levels = new Map([[ROOT_ID, 0]]);
  let changed = true;

  while (changed) {
    changed = false;
    edgeRows.forEach((edge) => {
      if (!levels.has(edge.source_node_id)) return;
      const nextLevel = levels.get(edge.source_node_id) + 1;
      if (!levels.has(edge.target_node_id) || levels.get(edge.target_node_id) > nextLevel) {
        levels.set(edge.target_node_id, nextLevel);
        changed = true;
      }
    });
  }

  return levels;
}
