import { ArrowSquareOut, Package, SealCheck, Sparkle } from "@phosphor-icons/react";
import { agentCatalog, getNode } from "../agentAdapter.js";

const catalogAgents = Object.values(agentCatalog);

export function RecommendationRail({ focusId, selectedId, recommendedAgents = [], status = "idle" }) {
  const focus = getNode(focusId);
  const selected = getNode(selectedId || focusId);
  const contextNode = selected || focus;
  const isLeafSelection = Boolean(focus && contextNode && contextNode.id !== focus.id);
  const agents = recommendedAgents.map(enrichRecommendedAgent);
  const hasAgents = agents.length > 0;
  const launchTargets = getAgentLaunchTargets(agents);

  function handlePackageAgents() {
    const openedTabs = launchTargets.map((target) => ({
      target,
      tab: window.open("about:blank", "_blank"),
    }));

    openedTabs.forEach(({ target, tab }) => {
      if (tab) {
        tab.opener = null;
        tab.location.replace(target.href);
        return;
      }

      window.open(target.href, "_blank", "noopener,noreferrer");
    });
  }

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
            : `当前焦点：${focus?.label || "行业智能体作战图谱"}`}
        </p>
      </div>

      <div className="confidence-block">
        <SealCheck size={18} weight="fill" />
        <span>匹配度</span>
        <strong>92%</strong>
      </div>

      <div className="agent-card-stack">
        {agents.map((agent, index) => (
          <FlipAgentCard key={getRecommendedAgentKey(agent, index)} agent={agent} index={index} />
        ))}
      </div>

      <div className="rail-package">
        <button type="button" className="rail-action" onClick={handlePackageAgents} disabled={!launchTargets.length}>
          <Package size={16} weight="bold" />
          <span>{launchTargets.length ? "一键打开智能体" : "暂无可跳转智能体"}</span>
          {launchTargets.length > 0 && <em>{launchTargets.length}</em>}
        </button>
      </div>
    </aside>
  );
}

function FlipAgentCard({ agent, index }) {
  const rank = String(agent.rank || index + 1).padStart(2, "0");
  const running = agent.streamStatus === "streaming";

  return (
    <article
      className={`agent-flip-card ${running ? "is-running" : ""}`}
      style={{ "--agent-delay": `${Math.min(index * 90, 540)}ms` }}
      tabIndex={0}
    >
      <div className="agent-flip-card-inner">
        <div className="agent-flip-face agent-flip-front">
          <div className="agent-card-topline">
            <span className="rank">{rank}</span>
            <span className="agent-status-pill">{running ? "生成中" : agent.stageLabel}</span>
          </div>
          <div className="agent-card-main">
            <span className="agent-dot" />
            <strong>{agent.name}</strong>
            <small>{agent.metaLabel}</small>
          </div>
          <div className="agent-card-foot">
            <span>评分</span>
            <strong>{agent.scoreLabel}</strong>
          </div>
        </div>

        <div className="agent-flip-face agent-flip-back">
          <div>
            <span className="agent-card-kicker">推荐说明</span>
            <p className="agent-card-reason">{agent.reason || (running ? "推荐理由生成中..." : agent.fallbackReason)}</p>
          </div>
          {agent.launchTarget ? (
            <a className="agent-card-link" href={agent.launchTarget} target="_blank" rel="noreferrer">
              <span>{agent.launchLabel}</span>
              <ArrowSquareOut size={14} weight="bold" />
            </a>
          ) : (
            <span className="agent-card-link-muted">等待入口</span>
          )}
        </div>
      </div>
    </article>
  );
}

function enrichRecommendedAgent(agent) {
  const name = agent.agent_name || agent.name || "智能体生成中";
  const agentKey = agent.agent_key || agent.agentKey || agent.id;
  const catalogAgent = findCatalogAgent(name, agentKey);
  const endpoint = agent.endpoint || agent.url || agent.link || agent.jump_url || catalogAgent?.endpoint || "";
  const metaLabel = catalogAgent
    ? `${catalogAgent.functionLabel} / ${catalogAgent.typeLabel}`
    : agent.stage || "推荐生成中";
  const stageLabel = agent.stage || catalogAgent?.functionLabel || "推荐";
  const scoreLabel = catalogAgent?.score || agent.score || (agent.streamStatus === "completed" ? "完成" : "生成中");
  const fallbackReason = catalogAgent?.role || "等待智能体补全推荐理由。";
  const launchTarget = getAgentLaunchTarget(endpoint);

  return {
    ...agent,
    id: agent.id || catalogAgent?.id,
    agentKey: agentKey || catalogAgent?.agentKey,
    name,
    endpoint,
    canOpen: Boolean(launchTarget?.href),
    metaLabel,
    stageLabel,
    scoreLabel,
    fallbackReason,
    chatgptEndpoint: isChatGptEndpoint(endpoint) ? endpoint : "",
    launchTarget: launchTarget?.href || "",
    launchLabel: launchTarget?.isChatGpt ? "进入 ChatGPT" : "打开智能体入口",
  };
}

function findCatalogAgent(name, agentKey) {
  const direct = catalogAgents.find((item) => item.name === name || item.id === agentKey || item.agentKey === agentKey);

  if (direct) return direct;

  const normalizedName = normalizeAgentName(name);
  if (!normalizedName) return null;

  return (
    catalogAgents.find((item) => normalizeAgentName(item.name) === normalizedName) ||
    catalogAgents.find((item) => {
      const candidate = normalizeAgentName(item.name);
      return (
        candidate &&
        normalizedName.length >= 3 &&
        candidate.length >= 3 &&
        (candidate.includes(normalizedName) || normalizedName.includes(candidate))
      );
    }) ||
    null
  );
}

function normalizeAgentName(name) {
  return String(name || "")
    .trim()
    .replace(/^[\s\d①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]+[.、:：)\]）-]?\s*/u, "")
    .replace(/[\s·・、，,.:：;；()（）[\]【】《》<>_\-/\\|]+/gu, "")
    .toLowerCase();
}

function getAgentLaunchTargets(agents) {
  const seen = new Set();

  return agents
    .map((agent) => ({ href: agent.launchTarget, name: agent.name }))
    .filter((target) => {
      if (!target.href || seen.has(target.href)) return false;
      seen.add(target.href);
      return true;
    });
}

function getAgentLaunchTarget(endpoint) {
  const href = String(endpoint || "").trim();

  if (!/^https?:\/\//i.test(href)) return null;

  return {
    href,
    isChatGpt: isChatGptEndpoint(href),
  };
}

function isChatGptEndpoint(endpoint) {
  return /^https:\/\/chatgpt\.com\/g\//i.test(String(endpoint || ""));
}

function getRecommendedAgentKey(agent, index) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || index}-${agent.name}`;
}
