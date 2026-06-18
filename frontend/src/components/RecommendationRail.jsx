import { SealCheck, Sparkle } from "@phosphor-icons/react";
import { agentCatalog, getNode } from "../agentAdapter.js";

const catalogAgents = Object.values(agentCatalog);

export function RecommendationRail({ focusId, selectedId, recommendedAgents = [], status = "idle" }) {
  const focus = getNode(focusId);
  const selected = getNode(selectedId || focusId);
  const contextNode = selected || focus;
  const isLeafSelection = contextNode.id !== focus.id;
  const agents = recommendedAgents.map(enrichRecommendedAgent);
  const hasAgents = agents.length > 0;

  if (!hasAgents) {
    return (
      <aside className="recommendation-rail recommendation-rail-collapsed" aria-label="推荐智能体组合">
        <div className="rail-collapsed-tab" title={status === "streaming" ? "等待推荐智能体" : "推荐智能体组合"}>
          <Sparkle size={17} weight="duotone" />
          <span>推荐</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="recommendation-rail" aria-label="推荐智能体组合">
      <div className="rail-heading">
        <span className="mono">inspector</span>
        <h2>推荐智能体组合</h2>
        <p>
          {isLeafSelection
            ? `当前选中：${contextNode.label} / 焦点：${focus.label}`
            : `当前焦点：${focus.label}`}
        </p>
      </div>

      <div className="confidence-block">
        <SealCheck size={18} weight="fill" />
        <span>匹配度</span>
        <strong>92%</strong>
      </div>

      <div className="agent-rows">
        {agents.map((agent, index) => (
          <article
            key={getRecommendedAgentKey(agent, index)}
            className={`agent-row agent-row-static ${agent.streamStatus === "streaming" ? "is-running" : ""}`}
          >
            <span className="rank">{String(agent.rank || index + 1).padStart(2, "0")}</span>
            <span className="agent-dot" />
            <span className="agent-copy">
              <strong>{agent.name}</strong>
              <small>{agent.metaLabel}</small>
            </span>
            <span className="score">{agent.scoreLabel}</span>
          </article>
        ))}
      </div>
    </aside>
  );
}

function enrichRecommendedAgent(agent) {
  const name = agent.agent_name || agent.name || "智能体生成中";
  const catalogAgent = catalogAgents.find((item) => item.name === name);
  const metaLabel = catalogAgent
    ? `${catalogAgent.functionLabel} / ${catalogAgent.typeLabel}`
    : agent.stage || "推荐生成中";
  const scoreLabel = catalogAgent?.score || (agent.streamStatus === "completed" ? "完成" : "生成中");

  return {
    ...agent,
    name,
    metaLabel,
    scoreLabel,
  };
}

function getRecommendedAgentKey(agent, index) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || index}-${agent.name}`;
}
