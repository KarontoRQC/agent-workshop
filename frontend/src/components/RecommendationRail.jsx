import { BracketsCurly, PlugsConnected, SealCheck } from "@phosphor-icons/react";
import { buildJumpPayload, getAgentPackage, getNode, invokeAgentJump } from "../agentAdapter.js";

export function RecommendationRail({ focusId, selectedId, onToast }) {
  const focus = getNode(selectedId || focusId);
  const agents = getAgentPackage(focus.id);
  const payload = buildJumpPayload(focus.id, "inspector");

  function handleJump(agent) {
    const result = invokeAgentJump(agent, focus.id);
    onToast(result.message);
  }

  return (
    <aside className="recommendation-rail" aria-label="推荐智能体">
      <div className="rail-heading">
        <span className="mono">inspector</span>
        <h2>推荐作战包</h2>
        <p>当前焦点：{focus.label}</p>
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
              <small>{agent.role}</small>
            </span>
            <span className="score">{agent.score}</span>
          </button>
        ))}
      </div>

      <div className="api-panel">
        <div>
          <BracketsCurly size={18} />
          <strong>API Layer Mock</strong>
        </div>
        <pre>{JSON.stringify(payload.recommendedAgents.slice(0, 3), null, 2)}</pre>
      </div>

      <button type="button" className="rail-action" onClick={() => onToast("接口调用方案已生成，等待接入 Flask。")}>
        <PlugsConnected size={18} weight="fill" />
        生成调用方案
      </button>
    </aside>
  );
}
