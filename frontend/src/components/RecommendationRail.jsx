import { ArrowSquareOut, BracketsCurly, PlugsConnected, SealCheck } from "@phosphor-icons/react";
import { buildJumpPayload, getAgentPackage, getNode, invokeAgentJump } from "../agentAdapter.js";

export function RecommendationRail({ focusId, selectedId, onToast }) {
  const focus = getNode(focusId);
  const selected = getNode(selectedId || focusId);
  const contextNode = selected || focus;
  const agents = getAgentPackage(contextNode.id);
  const payload = buildJumpPayload(contextNode.id, "inspector");
  const isLeafSelection = contextNode.id !== focus.id;

  function handleJump(agent) {
    const result = invokeAgentJump(agent, contextNode.id);
    onToast(result.message);
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
          <button key={agent.agentKey || agent.name} className="agent-row" type="button" onClick={() => handleJump(agent)}>
            <span className="rank">{String(index + 1).padStart(2, "0")}</span>
            <span className="agent-dot" />
            <span className="agent-copy">
              <strong>{agent.name}</strong>
              <small>{agent.functionLabel} / {agent.typeLabel}</small>
            </span>
            <span className="score">{agent.score}</span>
          </button>
        ))}
      </div>

      <div className="api-panel">
        <div>
          <BracketsCurly size={18} />
          <strong>Graph Context</strong>
        </div>
        <pre>{JSON.stringify(payload.recommendedAgents.slice(0, 3), null, 2)}</pre>
      </div>

      <button
        type="button"
        className="rail-action"
        onClick={() => onToast("调用方案已生成：前端传 agentKey 和 graphContext，后端再决定走 Coze / GPTs / 本地代理。")}
      >
        <PlugsConnected size={18} weight="fill" />
        生成调用方案
        <ArrowSquareOut size={15} />
      </button>
    </aside>
  );
}
