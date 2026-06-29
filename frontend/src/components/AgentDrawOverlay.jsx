import { Sparkle, SquaresFour, Waveform } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAgentAvatar, getAgentAvatarAlt } from "../agentAvatars.js";

const MIN_VISIBLE_MS = 2600;
const EXIT_MS = 760;
const MAX_DRAW_CARDS = 4;

export function AgentDrawOverlay({ agents = [], active = false, pulseKey = 0 }) {
  const [phase, setPhase] = useState("hidden");
  const [visibleAgents, setVisibleAgents] = useState([]);
  const shownAtRef = useRef(0);
  const closeTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const hasIncomingAgents = agents.length > 0;
  const shouldRender = phase !== "hidden";
  const drawCards = useMemo(() => {
    const source = visibleAgents.length > 0 ? visibleAgents : agents;
    return source.slice(0, MAX_DRAW_CARDS);
  }, [agents, visibleAgents]);
  const slots = drawCards.length > 0 ? drawCards : createPendingCards();

  useEffect(() => {
    return () => {
      window.clearTimeout(closeTimerRef.current);
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (hasIncomingAgents) {
      setVisibleAgents(agents);
    }
  }, [agents, hasIncomingAgents]);

  useEffect(() => {
    if (!active && pulseKey === 0) return;

    window.clearTimeout(closeTimerRef.current);
    window.clearTimeout(hideTimerRef.current);
    shownAtRef.current = Date.now();
    setPhase("active");

    if (hasIncomingAgents) {
      setVisibleAgents(agents);
    }
  }, [active, pulseKey, agents, hasIncomingAgents]);

  useEffect(() => {
    if (active) return;

    if (phase === "active") {
      const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : MIN_VISIBLE_MS;
      const closeDelay = Math.max(0, MIN_VISIBLE_MS - elapsed);

      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setPhase("closing");
        hideTimerRef.current = window.setTimeout(() => {
          shownAtRef.current = 0;
          setVisibleAgents([]);
          setPhase("hidden");
        }, EXIT_MS);
      }, closeDelay);
    }
  }, [active, phase]);

  if (!shouldRender) return null;

  return (
    <section className={`agent-draw-overlay is-${phase}`} aria-hidden="true">
      <div className="agent-draw-backdrop" />
      <div className="agent-draw-grid" />
      <div className="agent-draw-stage-global">
        <div className="agent-draw-rift">
          <span className="agent-draw-ring ring-outer" />
          <span className="agent-draw-ring ring-middle" />
          <span className="agent-draw-ring ring-inner" />
          <span className="agent-draw-beam beam-left" />
          <span className="agent-draw-beam beam-right" />
          <div className="agent-draw-pack">
            <span className="agent-draw-pack-kicker">
              <Waveform size={15} weight="duotone" />
              AI AGENT DRAW
            </span>
            <strong>智能体卡牌召唤中</strong>
            <em>推荐矩阵已接入</em>
          </div>
        </div>

        <div className="agent-draw-card-row">
          {slots.map((agent, index) => (
            <DrawAgentCard
              key={getDrawAgentKey(agent, index)}
              agent={agent}
              index={index}
              pending={drawCards.length === 0}
            />
          ))}
        </div>

        <div className="agent-draw-readout">
          <span>
            <Sparkle size={16} weight="fill" />
            正在校准推荐序列
          </span>
          <strong>{String(Math.max(drawCards.length, 1)).padStart(2, "0")}</strong>
        </div>
      </div>
    </section>
  );
}

function DrawAgentCard({ agent, index, pending }) {
  const rarity = getRarity(agent, index);
  const avatar = pending ? "" : getAgentAvatar(agent);
  const avatarAlt = pending ? "" : getAgentAvatarAlt(agent);
  const name = pending ? "匹配中" : getAgentName(agent, index);
  const stage = pending ? "ANALYSING" : getAgentStage(agent, index);

  return (
    <article
      className={`agent-draw-card rarity-${rarity.key} ${pending ? "is-pending" : ""}`}
      style={{ "--draw-card-index": index }}
    >
      <div className="agent-draw-card-face">
        <span className="agent-draw-rarity">{rarity.label}</span>
        <span className="agent-draw-card-chip">{stage}</span>
        <div className={`agent-draw-avatar ${avatar ? "has-avatar" : ""}`}>
          {avatar ? <img src={avatar} alt={avatarAlt} loading="lazy" /> : <SquaresFour size={30} weight="duotone" />}
        </div>
        <strong title={name}>{name}</strong>
        <small>{pending ? "等待推荐流写入" : getAgentReason(agent)}</small>
      </div>
    </article>
  );
}

function createPendingCards() {
  return Array.from({ length: 3 }, (_, index) => ({ agent_index: `pending-${index}` }));
}

function getAgentName(agent, index) {
  return agent.agent_name || agent.name || `智能体 ${index + 1}`;
}

function getAgentStage(agent, index) {
  return agent.stage || ["定位", "转化", "复盘", "提效"][index % 4];
}

function getAgentReason(agent) {
  return agent.reason || agent.stage || "高契合度推荐";
}

function getRarity(agent, index) {
  const score = Number(agent.score || agent.scoreLabel);
  if (Number.isFinite(score) && score >= 95) return { key: "legend", label: "SSR" };
  if (Number.isFinite(score) && score >= 90) return { key: "epic", label: "SR" };
  if (index === 0) return { key: "legend", label: "SSR" };
  if (index < 3) return { key: "epic", label: "SR" };
  return { key: "rare", label: "R" };
}

function getDrawAgentKey(agent, index) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `draw-agent-${agent.agent_index}`;
  }

  return `${index}-${getAgentName(agent, index)}`;
}
