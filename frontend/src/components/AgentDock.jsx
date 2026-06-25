import { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  ChatCircleText,
  Crosshair,
  GitBranch,
  PaperPlaneTilt,
  Sparkle,
  SquaresFour,
  UsersThree,
  Waveform,
} from "@phosphor-icons/react";
import { getAgentAvatar, getAgentAvatarAlt } from "../agentAvatars.js";

const STATUS_LABELS = {
  idle: "在线",
  streaming: "生成中",
  completed: "已完成",
  error: "异常",
};

const AGENT_NAME = "我不是古神";

export function AgentDock({ draft, setDraft, onSend, status = "idle", turns = [] }) {
  const threadRef = useRef(null);
  const isStreaming = status === "streaming";
  const hasTurns = turns.length > 0;

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, status]);

  function handleSubmit(event) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    onSend();
  }

  return (
    <aside className={`agent-dock agent-dock-${status}`} aria-label="智能助手对话窗口">
      <header className="agent-header">
        <span className="agent-mark">
          <Waveform size={18} weight="duotone" />
        </span>
        <div className="agent-heading">
          <strong>{AGENT_NAME}</strong>
          <span>监听业务输入，推动星图聚焦</span>
        </div>
        <em className={`agent-status agent-status-${status}`}>{STATUS_LABELS[status]}</em>
      </header>

      <div className="agent-thread" ref={threadRef} aria-live="polite">
        {!hasTurns && (
          <div className="agent-empty">
            <div className="agent-empty-orbit" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="agent-empty-core">
                <ChatCircleText size={42} weight="duotone" />
              </span>
            </div>
            <div className="agent-empty-copy">
              <strong>
                路径<span>已待命</span>
              </strong>
              <p>把业务问题发过来，我会给出路径建议。</p>
            </div>
            <div className="agent-empty-tags" aria-hidden="true">
              <span>
                <SquaresFour size={16} weight="bold" />
                行业
              </span>
              <span>
                <UsersThree size={16} weight="bold" />
                人群
              </span>
              <span>
                <Crosshair size={16} weight="bold" />
                需求
              </span>
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} currentStatus={status} />
        ))}
      </div>

      <form className="agent-composer" onSubmit={handleSubmit}>
        <div className="agent-composer-row">
          <div className="agent-input-shell">
            <Sparkle size={18} weight="fill" aria-hidden="true" />
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? `${AGENT_NAME}正在生成...` : "随时询问任何问题..."}
              rows={1}
              disabled={isStreaming}
            />
          </div>
          <button type="submit" aria-label={`发送给${AGENT_NAME}`} disabled={!draft.trim() || isStreaming}>
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </div>
      </form>
    </aside>
  );
}

function ChatTurn({ turn, currentStatus }) {
  const knowledgeGraph = turn.workflow?.knowledgeGraph || {};
  const agentRecommendation = turn.workflow?.agentRecommendation || {};
  const thinkingProcess = knowledgeGraph.THINKING_PROCESS;
  const ack = knowledgeGraph.ACK;
  const directReply = (knowledgeGraph.DIRECT_REPLY || "").trimStart();
  const path = knowledgeGraph.KG_PATH;
  const explanation = knowledgeGraph.EXPLANATION;
  const recommendationThinkingProcess = agentRecommendation.THINKING_PROCESS;
  const recommendationAck = agentRecommendation.ACK;
  const summary = agentRecommendation.SUMMARY;
  const recommendedAgents = agentRecommendation.agents || [];
  const isStreaming = turn.status === "streaming" && currentStatus === "streaming";
  const isReplyHeld = Boolean(turn.replyHold);
  const hasAssistantContent =
    ack ||
    thinkingProcess ||
    directReply ||
    path ||
    explanation ||
    recommendationThinkingProcess ||
    recommendationAck ||
    recommendedAgents.length > 0 ||
    summary ||
    turn.error;

  return (
    <div className="agent-turn">
      <article className="agent-message agent-message-user">
        <div className="agent-bubble">
          <p>{turn.user}</p>
        </div>
        <span className="agent-avatar agent-avatar-user">你</span>
      </article>

      <article className="agent-message agent-message-assistant">
        <span className="agent-avatar agent-avatar-assistant">
          <Waveform size={15} weight="duotone" />
        </span>
        <div className="agent-bubble">
          {(isStreaming || isReplyHeld) && (
            <div className="agent-message-meta">
              <span>智能助手</span>
              <em>{isReplyHeld ? "正在思考" : "生成中"}</em>
            </div>
          )}

          {directReply && <AssistantText>{directReply}</AssistantText>}
          {thinkingProcess && <ThinkingProcessCard content={thinkingProcess} active={isStreaming && !ack} />}
          {ack && <AssistantText>{ack}</AssistantText>}
          {path && <PathResultCard path={path} active={isStreaming && !explanation} />}
          {explanation && <AssistantText>{explanation}</AssistantText>}

          {!isReplyHeld && recommendationThinkingProcess && (
            <ThinkingProcessCard
              content={recommendationThinkingProcess}
              active={isStreaming && !recommendationAck && recommendedAgents.length === 0 && !summary}
            />
          )}
          {!isReplyHeld && recommendationAck && <AssistantText>{recommendationAck}</AssistantText>}
          {!isReplyHeld && recommendedAgents.length > 0 && (
            <section className="agent-recommendation-section" aria-label="推荐智能体组合">
              <div className="agent-section-heading">
                <Sparkle size={14} weight="bold" />
                <span>推荐智能体组合</span>
                <small>为你生成 3 个阶段的提升方案</small>
                <i />
              </div>
              <div className="agent-recommendation-list">
                {recommendedAgents.map((agent, index) => (
                  <AgentRecommendationCard
                    key={getRecommendedAgentKey(agent, index)}
                    agent={agent}
                    index={index}
                    active={isStreaming && agent.streamStatus !== "completed"}
                  />
                ))}
              </div>
            </section>
          )}
          {!isReplyHeld && summary && <AssistantText>{summary}</AssistantText>}
          {(isReplyHeld || (isStreaming && !hasAssistantContent)) && <TypingLine />}

          {turn.error && <p className="agent-error">{turn.error}</p>}
        </div>
      </article>
    </div>
  );
}

function AssistantText({ children }) {
  return <p className="agent-assistant-text">{children}</p>;
}

function ThinkingProcessCard({ content, active }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOpen = active || isExpanded;
  const toggleLabel = isOpen ? "收起深度思考" : "展开深度思考";

  useEffect(() => {
    if (active) {
      setIsExpanded(false);
    }
  }, [active]);

  return (
    <section
      className={`agent-thinking-card ${active ? "is-running" : "is-collapsed"} ${isOpen ? "is-open" : ""}`}
      aria-label="深度思考"
      title={active ? "" : toggleLabel}
    >
      <button
        type="button"
        className="agent-thinking-heading"
        onClick={() => {
          if (!active) {
            setIsExpanded((current) => !current);
          }
        }}
        aria-expanded={isOpen}
        aria-label={toggleLabel}
      >
        <Sparkle size={14} weight="fill" />
        <strong>深度思考</strong>
        <StatusChip active={active} />
        <CaretDown className="agent-thinking-caret" size={14} weight="bold" aria-hidden="true" />
      </button>
      {isOpen && <p>{content}</p>}
    </section>
  );
}

function PathResultCard({ path, active }) {
  const segments = getPathSegments(path);
  const demandTags = segments.slice(0, 3);
  const routeLabel = getRouteLabel(segments, path);

  return (
    <div className={`agent-path-card ${active ? "is-running" : ""}`}>
      <div className="agent-path-panel agent-path-demand">
        <div className="agent-path-heading">
          <Crosshair size={15} weight="bold" />
          <strong>已识别需求</strong>
        </div>
        <div className="agent-path-tags">
          {demandTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <p>该路径包含销售话术、跟进策略等内容，可有效提升业务推进能力。</p>
      </div>
      <div className="agent-path-panel agent-path-route">
        <div className="agent-path-heading">
          <GitBranch size={15} weight="bold" />
          <strong>推荐知识图谱路径</strong>
        </div>
        <div className="agent-path-pill" title={path}>
          {routeLabel}
        </div>
        <em className="agent-path-status">{active ? "路径匹配中" : "路径已匹配完成"}</em>
      </div>
    </div>
  );
}

function AgentRecommendationCard({ agent, index, active }) {
  const name = agent.agent_name || agent.name || "智能体生成中";
  const reason = agent.reason || (active ? "推荐理由生成中..." : "");
  const stage = agent.stage || getFallbackAgentStage(index);
  const status = getRecommendationStatus(active, index);
  const variant = ["gold", "violet", "blue"][index % 3];
  const avatar = getAgentAvatar(agent);
  const avatarAlt = getAgentAvatarAlt(agent);

  return (
    <article className={`agent-recommendation-card agent-recommendation-${variant} ${active ? "is-running" : ""}`}>
      <span className={`agent-recommendation-icon ${avatar ? "has-avatar" : ""}`} aria-hidden="true">
        {avatar ? (
          <img src={avatar} alt={avatarAlt} loading="lazy" />
        ) : (
          <>
            {variant === "gold" && <SquaresFour size={22} weight="fill" />}
            {variant === "violet" && <Sparkle size={22} weight="fill" />}
            {variant === "blue" && <Crosshair size={22} weight="bold" />}
          </>
        )}
      </span>
      <div className="agent-recommendation-copy">
        <div className="agent-recommendation-head">
          <div className="agent-recommendation-title">
            <strong>{name}</strong>
            <span className={`agent-recommendation-state agent-recommendation-state-${status.tone}`}>{status.label}</span>
          </div>
        </div>
        <div className="agent-recommendation-meta">
          <em>{stage}</em>
          <span className="agent-recommendation-subtitle">{stage}阶段</span>
        </div>
        {reason && <p>{reason}</p>}
      </div>
    </article>
  );
}

function StatusChip({ active }) {
  return (
    <em className={`agent-result-chip ${active ? "is-running" : ""}`}>
      {active ? "生成中" : "完成"}
    </em>
  );
}

function getPathSegments(path) {
  return String(path || "")
    .split(/\s*(?:>|›|→|->|-|—|–|\/|、|，|,)\s*/g)
    .flatMap(expandPathSegment)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function expandPathSegment(segment) {
  const industryMatch = segment.match(/^(.+?行业)(.+)$/);
  if (industryMatch) {
    return [industryMatch[1], industryMatch[2]];
  }

  return [segment];
}

function getRouteLabel(segments, fallback) {
  if (segments.length >= 3) {
    return `${segments.slice(0, -1).join("")} › ${segments[segments.length - 1]}`;
  }

  return segments.join(" › ") || fallback;
}

function getFallbackAgentStage(index) {
  return ["核心阶段", "需求挖掘", "精准定位"][index % 3];
}

function getRecommendationStatus(active, index) {
  if (active) {
    return { label: "生成中", tone: "running" };
  }

  return [
    { label: "已就绪", tone: "ready" },
    { label: "推荐", tone: "recommend" },
    { label: "可执行", tone: "actionable" },
  ][index % 3];
}

function getRecommendedAgentKey(agent, index) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || index}-${agent.agent_name || agent.name || "pending"}`;
}

function TypingLine() {
  return (
    <div className="agent-typing" aria-label="智能助手正在思考">
      <strong>正在思考</strong>
      <span />
      <span />
      <span />
    </div>
  );
}
