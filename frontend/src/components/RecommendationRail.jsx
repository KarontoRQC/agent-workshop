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
  const isDrawing = status === "streaming";

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
        <div className="rail-collapsed-tab" title={isDrawing ? "等待智能体抽卡" : "推荐智能体组合"}>
          <Sparkle size={17} weight="duotone" />
          <span>{isDrawing ? "抽取中" : "推荐"}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`recommendation-rail draw-rail ${isDrawing ? "is-drawing" : "is-settled"}`} aria-label="推荐智能体抽卡结果">
      <div className="draw-orbit" aria-hidden="true" />
      <div className="draw-sparks" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{ "--spark-index": index }} />
        ))}
      </div>

      <header className="draw-heading">
        <span className="mono">AI AGENT DRAW</span>
        <h2>智能体抽卡推荐</h2>
        <p>
          {isLeafSelection
            ? `当前选中：${contextNode.label} / 焦点：${focus.label}`
            : `当前焦点：${focus?.label || "行业智能体作战图谱"}`}
        </p>
      </header>

      <section className="draw-status-panel" aria-label="抽卡进度">
        <div className="draw-status-copy">
          <SealCheck size={18} weight="fill" />
          <span>{isDrawing ? "Agent 正在解析命盘" : "推荐结果已展开"}</span>
        </div>
        <strong>{String(agents.length).padStart(2, "0")}</strong>
      </section>

      <div className="draw-stage" aria-label="抽卡式推荐智能体列表">
        <div className="draw-stage-line" aria-hidden="true" />
        <div className="agent-card-stack">
          {agents.map((agent, index) => (
            <FlipAgentCard key={getRecommendedAgentKey(agent, index)} agent={agent} index={index} />
          ))}
        </div>
      </div>

      <footer className="rail-package draw-package">
        <div className="draw-summary">
          <span>生成结果</span>
          <strong>{agents.length} 个智能体</strong>
        </div>
        <button type="button" className="rail-action" onClick={handlePackageAgents} disabled={!launchTargets.length}>
          <Package size={16} weight="bold" />
          <span>{launchTargets.length ? "一键打开智能体" : "暂无可跳转智能体"}</span>
          {launchTargets.length > 0 && <em>{launchTargets.length}</em>}
        </button>
      </footer>
    </aside>
  );
}

function FlipAgentCard({ agent, index }) {
  const rank = String(agent.rank || index + 1).padStart(2, "0");
  const running = agent.streamStatus === "streaming";
  const rarity = getAgentRarity(agent, index);

  return (
    <article
      className={`agent-flip-card draw-card rarity-${rarity.key} ${running ? "is-running" : ""}`}
      style={{ "--agent-delay": `${Math.min(index * 120, 720)}ms` }}
      tabIndex={0}
      aria-label={`${agent.name} 推荐卡`}
    >
      <div className="agent-flip-card-inner">
        <div className="agent-flip-face agent-flip-front">
          <div className="card-rune" aria-hidden="true">
            <span>{rank}</span>
          </div>
          <div className="agent-card-topline">
            <span className="rank">{rarity.label}</span>
            <span className="agent-status-pill">{running ? "抽取中" : agent.stageLabel}</span>
          </div>
          <div className="agent-card-main">
            <span className="agent-dot" />
            <strong>{stripRankPrefix(agent.name)}</strong>
            <small>{agent.metaLabel}</small>
          </div>
          <div className="agent-card-foot">
            <span>契合度</span>
            <strong>{agent.scoreLabel}</strong>
          </div>
        </div>

        <div className="agent-flip-face agent-flip-back">
          <div>
            <span className="agent-card-kicker">推荐说明</span>
            <p className="agent-card-reason">{agent.reason || (running ? "Agent 正在补全推荐理由..." : agent.fallbackReason)}</p>
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

function getAgentRarity(agent, index) {
  const score = Number(agent.score || agent.scoreLabel);
  if (Number.isFinite(score) && score >= 95) return { key: "legend", label: "SSR" };
  if (Number.isFinite(score) && score >= 90) return { key: "epic", label: "SR" };
  if (index === 0) return { key: "legend", label: "SSR" };
  if (index < 3) return { key: "epic", label: "SR" };
  return { key: "rare", label: "R" };
}

function enrichRecommendedAgent(agent) {
  const name = agent.agent_name || agent.name || "智能体生成中";
  const agentKey = agent.agent_key || agent.agentKey || agent.id;
  const catalogAgent = findCatalogAgent(name, agentKey);
  const endpoint = agent.endpoint || agent.url || agent.link || agent.jump_url || catalogAgent?.endpoint || "";
  const metaLabel = catalogAgent ? `${catalogAgent.functionLabel} / ${catalogAgent.typeLabel}` : agent.stage || "推荐生成中";
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
    score: catalogAgent?.score || agent.score,
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
  return stripRankPrefix(name)
    .replace(/[\s·、，,.:：；;()（）[\]【】《》_\-/\\|]+/gu, "")
    .toLowerCase();
}

function stripRankPrefix(name) {
  return String(name || "智能体生成中")
    .trim()
    .replace(/^[\s\d①②③④⑤⑥⑦⑧⑨⑩]+[.、:：)）-]?\s*/u, "");
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
