import graphPack from "../../data/agent_graph_pack.json";
import { AGENT_GATEWAY_URL } from "./apiConfig.js";

export const ROOT_ID = graphPack.rootId;
export const libraryStats = graphPack.stats;

export const graphModel = Object.fromEntries(
  graphPack.nodes.map((node) => [
    node.id,
    {
      ...node,
      children: node.children || [],
      agents: node.agents || [],
    },
  ]),
);

export const agentCatalog = Object.fromEntries(
  graphPack.agents.map((agent) => [
    agent.id,
    {
      ...agent,
      agentKey: agent.agentKey || agent.id,
      provider: agent.provider || "local",
      endpoint: agent.endpoint || AGENT_GATEWAY_URL,
    },
  ]),
);

export const defaultBrief =
  "我想从行业场景出发，沿着痛点、能力和动作生成一条适合业务演示的智能体作战路径。";

export const initialAgentMessages = [
  {
    id: "m-0",
    role: "assistant",
    text: "我会先从行业节点进入，再沿着痛点、能力和动作逐层点亮路径。60 个智能体会作为推荐调用资源挂在语义节点后面，不会替代行业图谱本身。",
    focusId: ROOT_ID,
  },
];

const NODE_KEYWORD_ALIASES = {
  "industry-education": ["教培", "培训", "辅导", "老师", "学员", "课程", "家长", "续费", "试听"],
  "industry-beauty": ["美业", "美容", "美发", "门店项目", "顾问成交", "到店"],
  "industry-catering": ["餐饮", "外卖", "菜单", "翻台", "加盟店"],
  "industry-baijiu": ["白酒", "酒商", "代理商", "招商会"],
  "industry-local-life": ["本地生活", "团购", "核销", "探店"],
  "industry-enterprise": ["企服", "企业服务", "销售线索", "方案生成"],
};

export function getNode(id) {
  if (graphModel[id]) return graphModel[id];
  return {
    id,
    label: id,
    type: "node",
    summary: `${id} 是一个待补充的图谱节点。`,
    insight: "这个节点暂时不参与主展示链路。",
    children: [],
    agents: [],
  };
}

export function getChildren(id) {
  return (getNode(id).children || []).map((childId) => getNode(childId));
}

export function hasChildren(id) {
  return getChildren(id).length > 0;
}

export function getFocusPath(focusId) {
  const path = [];
  const seen = new Set();
  let cursor = getNode(focusId);

  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parent ? getNode(cursor.parent) : null;
  }

  if (!path.some((node) => node.id === ROOT_ID)) path.unshift(getNode(ROOT_ID));
  return path;
}

function collectDescendantAgentIds(startId, cap = 9) {
  const out = [];
  const seen = new Set([startId]);
  const queue = [...(getNode(startId).children || [])];

  while (queue.length && out.length < cap) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = getNode(id);
    out.push(...(node.agents || []));
    if (node.type === "agent") out.push(id);
    queue.push(...(node.children || []));
  }

  return [...new Set(out)].slice(0, cap);
}

export function getAgentPackage(focusId) {
  const focus = getNode(focusId);
  const parent = focus.parent ? getNode(focus.parent) : null;
  const grandParent = parent?.parent ? getNode(parent.parent) : null;

  const ids = [
    ...(focus.type === "agent" ? [focus.id] : []),
    ...(focus.agents || []),
    ...collectDescendantAgentIds(focus.id, 9),
    ...(parent?.agents || []),
    ...(grandParent?.agents || []),
    ...graphModel[ROOT_ID].agents,
  ];

  return [...new Set(ids)]
    .map((id) => agentCatalog[id])
    .filter(Boolean)
    .slice(0, 7);
}

export function buildJumpPayload(focusId, source = "graph") {
  const focus = getNode(focusId);
  const path = getFocusPath(focusId).map((node) => ({ id: node.id, label: node.label, type: node.type }));
  const packageAgents = getAgentPackage(focusId);

  return {
    source,
    focusId,
    focusLabel: focus.label,
    focusType: focus.type,
    path,
    providerStrategy: "backend-gateway",
    gatewayEndpoint: AGENT_GATEWAY_URL,
    targetProvider: "coze-or-chatgpt-gpt",
    recommendedAgents: packageAgents.map((agent) => ({
      name: agent.name,
      agentKey: agent.agentKey,
      provider: agent.provider,
      endpoint: agent.endpoint,
    })),
  };
}

export function invokeAgentJump(agent, focusId = ROOT_ID) {
  return {
    ok: true,
    provider: agent.provider || "local",
    endpoint: agent.endpoint,
    payload: buildJumpPayload(focusId, "recommendation-rail"),
    message: `${agent.name} 已进入调用草案：前端只传 agentKey 和图谱上下文，后端再决定走 Coze、GPTs 链接或本地代理。`,
  };
}

export function buildCozeGatewayDraft({ agent, focusId, userMessage, conversationId }) {
  const focus = getNode(focusId);
  return {
    endpoint: AGENT_GATEWAY_URL,
    method: "POST",
    provider: agent.provider || "coze",
    agentKey: agent.agentKey,
    conversationId: conversationId || null,
    stream: true,
    message: {
      role: "user",
      type: "question",
      content: userMessage,
      content_type: "text",
      meta_data: {
        focusId,
        focusLabel: focus.label,
        focusType: focus.type,
      },
    },
    graphContext: {
      focusId,
      focusLabel: focus.label,
      focusType: focus.type,
      path: getFocusPath(focusId).map((node) => node.label),
      recommendedAgents: getAgentPackage(focusId).map((item) => item.name),
    },
  };
}

export function askRoutingAgent(message, currentFocusId = ROOT_ID) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const candidates = graphPack.nodes
    .filter((node) => node.id !== ROOT_ID)
    .filter((node) => matchesRoutingText(node, text, lower))
    .sort((a, b) => {
      const order = {
        industry: 1,
        problem: 2,
        capability: 2,
        action: 3,
        asset: 3,
        variable: 3,
        agent: 4,
      };
      return (order[a.type] || 9) - (order[b.type] || 9);
    });

  const target = candidates[0] || getNode(currentFocusId);
  const focusId = target.id || currentFocusId || ROOT_ID;
  const focus = getNode(focusId);
  const action = hasChildren(focusId) ? "展开" : "选中并点亮路径";
  const visibleParentId = hasChildren(focusId) ? focusId : focus.parent || ROOT_ID;

  return {
    id: `m-${Date.now()}`,
    role: "assistant",
    text: candidates[0]
      ? `我识别到「${focus.label}」，已${action}这个图谱节点。`
      : `我会保留当前焦点「${focus.label}」，先把你的补充写进语义简报，再等待下一步路径选择。`,
    focusId,
    entities: getChildren(visibleParentId)
      .slice(0, 5)
      .map((node) => node.label),
  };
}

function matchesRoutingText(node, text, lower) {
  const label = String(node.label || "");
  const displayLabel = String(node.displayLabel || "");
  const aliases = NODE_KEYWORD_ALIASES[node.id] || [];

  return (
    (label && text.includes(label)) ||
    (displayLabel && text.includes(displayLabel)) ||
    lower.includes(label.toLowerCase()) ||
    aliases.some((alias) => text.includes(alias) || lower.includes(alias.toLowerCase()))
  );
}
