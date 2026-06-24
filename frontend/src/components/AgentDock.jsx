import { useEffect, useRef } from "react";
import {
  CaretRight,
  ChatCircleText,
  GitBranch,
  PaperPlaneTilt,
  Sparkle,
  Waveform,
} from "@phosphor-icons/react";

const STATUS_LABELS = {
  idle: "在线",
  streaming: "生成中",
  completed: "已完成",
  error: "异常",
};

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
          <strong>路径选择 Agent</strong>
          <span>监听业务输入，推动星图聚焦</span>
        </div>
        <em className={`agent-status agent-status-${status}`}>{STATUS_LABELS[status]}</em>
      </header>

      <div className="agent-thread" ref={threadRef} aria-live="polite">
        {!hasTurns && (
          <div className="agent-empty">
            <ChatCircleText size={18} />
            <p>把业务问题发过来，我会给出路径建议。</p>
          </div>
        )}

        {turns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} currentStatus={status} />
        ))}
      </div>

      <form className="agent-composer" onSubmit={handleSubmit}>
        <div className="agent-composer-row">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Agent 正在生成..." : "随时询问任何问题..."}
            rows={1}
            disabled={isStreaming}
          />
          <button type="submit" aria-label="发送给 Agent" disabled={!draft.trim() || isStreaming}>
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
  const ack = knowledgeGraph.ACK;
  const directReply = (knowledgeGraph.DIRECT_REPLY || "").trimStart();
  const path = knowledgeGraph.KG_PATH;
  const explanation = knowledgeGraph.EXPLANATION;
  const recommendationAck = agentRecommendation.ACK;
  const summary = agentRecommendation.SUMMARY;
  const recommendedAgents = agentRecommendation.agents || [];
  const isStreaming = turn.status === "streaming" && currentStatus === "streaming";
  const isReplyHeld = Boolean(turn.replyHold);
  const hasAssistantContent =
    ack ||
    directReply ||
    path ||
    explanation ||
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
          {ack && <AssistantText>{ack}</AssistantText>}
          {path && <PathResultCard path={path} active={isStreaming && !explanation} />}
          {explanation && <AssistantText>{explanation}</AssistantText>}

          {!isReplyHeld && recommendationAck && <AssistantText>{recommendationAck}</AssistantText>}
          {!isReplyHeld && recommendedAgents.length > 0 && (
            <section className="agent-recommendation-section" aria-label="推荐智能体组合">
              <div className="agent-section-heading">
                <Sparkle size={14} weight="bold" />
                <span>推荐智能体组合</span>
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

function PathResultCard({ path, active }) {
  return (
    <div className={`agent-path-card ${active ? "is-running" : ""}`}>
      <span className="agent-path-icon">
        <GitBranch size={22} weight="bold" />
      </span>
      <div className="agent-path-copy">
        <strong>知识图谱路径</strong>
        <p>{path}</p>
      </div>
      <StatusChip active={active} />
    </div>
  );
}

function AgentRecommendationCard({ agent, index, active }) {
  const rank = agent.rank || index + 1;
  const name = agent.agent_name || agent.name || "智能体生成中";
  const reason = agent.reason || (active ? "推荐理由生成中..." : "");

  return (
    <article className={`agent-recommendation-card ${active ? "is-running" : ""}`}>
      <span className="agent-recommendation-rank">{rank}</span>
      <div className="agent-recommendation-copy">
        <strong>{name}</strong>
        {agent.stage && <em>{agent.stage}</em>}
        {reason && <p>{reason}</p>}
      </div>
      <div className="agent-recommendation-side">
        <StatusChip active={active} />
        <CaretRight size={16} weight="bold" />
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
