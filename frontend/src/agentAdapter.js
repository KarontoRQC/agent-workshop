import sourceAgents from "../../data/source_agents_full.json";
import { AGENT_GATEWAY_URL } from "./apiConfig.js";

export const ROOT_ID = "dynamic-route-root";
export const libraryStats = {
  agentCount: sourceAgents.length,
  edgeCount: 0,
  nodeCount: 1,
};

export const graphModel = {
  [ROOT_ID]: {
    agents: sourceAgents.map((_, index) => agentIdFromIndex(index)),
    children: [],
    count: 0,
    id: ROOT_ID,
    insight: "路径由知识图谱智能体实时规划；前端只负责把路径可视化，不保存固定图谱。",
    label: "动态路径",
    parent: null,
    summary: "等待路径规划智能体生成本次对话的动态路线。",
    type: "dynamic-root",
  },
};

export const agentCatalog = Object.fromEntries(
  sourceAgents.map((row, index) => {
    const id = agentIdFromIndex(index);

    return [
      id,
      {
        agentKey: id,
        endpoint: row["智能体链接"] || AGENT_GATEWAY_URL,
        functionLabel: row["功能"] || "",
        id,
        knowledge: splitKnowledge(row["知识库"]),
        name: row["智能体名称"] || id,
        provider: row["智能体链接"] ? "chatgpt-gpt" : "local",
        role: row["智能体介绍"] || `${row["智能体名称"] || id} 是当前智能体库中的可调用能力。`,
        typeLabel: row["类型"] || "",
      },
    ];
  }),
);

export const defaultBrief = "请描述你的业务问题，路径规划智能体会生成本次动态路径，推荐智能体会独立匹配工具组合。";

export const initialAgentMessages = [
  {
    focusId: ROOT_ID,
    id: "m-0",
    role: "assistant",
    text: "我不会从固定图谱里选节点。你说出需求后，路径规划智能体会自由生成路线；推荐智能体会从 60 个智能体里独立挑组合。",
  },
];

export function getNode(id) {
  return (
    graphModel[id] || {
      agents: [],
      children: [],
      id,
      insight: "这是一次对话中生成的动态路径节点，不属于固定图谱。",
      label: id,
      parent: ROOT_ID,
      summary: `${id} 来自路径规划智能体的实时输出。`,
      type: "dynamic-route",
    }
  );
}

export function getChildren() {
  return [];
}

export function hasChildren() {
  return false;
}

export function getFocusPath(focusId) {
  return focusId && focusId !== ROOT_ID ? [getNode(ROOT_ID), getNode(focusId)] : [getNode(ROOT_ID)];
}

export function getAgentPackage() {
  return Object.values(agentCatalog).slice(0, 7);
}

export function buildJumpPayload(focusId = ROOT_ID, source = "dynamic-route") {
  const focus = getNode(focusId);

  return {
    focusId,
    focusLabel: focus.label,
    focusType: focus.type,
    gatewayEndpoint: AGENT_GATEWAY_URL,
    path: getFocusPath(focusId).map((node) => ({ id: node.id, label: node.label, type: node.type })),
    providerStrategy: "backend-gateway",
    recommendedAgents: [],
    source,
    targetProvider: "coze-or-chatgpt-gpt",
  };
}

export function invokeAgentJump(agent, focusId = ROOT_ID) {
  return {
    endpoint: agent.endpoint,
    message: `${agent.name} 已进入调用草案：推荐结果来自推荐智能体，不来自固定图谱节点。`,
    ok: true,
    payload: buildJumpPayload(focusId, "recommendation-rail"),
    provider: agent.provider || "local",
  };
}

export function buildCozeGatewayDraft({ agent, focusId, userMessage, conversationId }) {
  const focus = getNode(focusId);

  return {
    agentKey: agent.agentKey,
    conversationId: conversationId || null,
    endpoint: AGENT_GATEWAY_URL,
    graphContext: {
      focusId,
      focusLabel: focus.label,
      focusType: focus.type,
      path: getFocusPath(focusId).map((node) => node.label),
      recommendedAgents: [],
    },
    message: {
      content: userMessage,
      content_type: "text",
      meta_data: {
        focusId,
        focusLabel: focus.label,
        focusType: focus.type,
      },
      role: "user",
      type: "question",
    },
    method: "POST",
    provider: agent.provider || "coze",
    stream: true,
  };
}

export function askRoutingAgent(message) {
  const text = String(message || "").trim();
  const routeLabel = text ? text.slice(0, 24) : "动态路径";

  return {
    entities: [],
    focusId: ROOT_ID,
    id: `m-${Date.now()}`,
    role: "assistant",
    text: `我会把「${routeLabel}」交给路径规划智能体自由规划，不再匹配固定图谱节点。`,
  };
}

function agentIdFromIndex(index) {
  return `agent-${String(index + 1).padStart(3, "0")}`;
}

function splitKnowledge(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
