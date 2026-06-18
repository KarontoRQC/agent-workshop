import { useEffect, useRef } from "react";
import {
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
  const path = knowledgeGraph.KG_PATH;
  const explanation = knowledgeGraph.EXPLANATION;
  const recommendationAck = agentRecommendation.ACK;
  const summary = agentRecommendation.SUMMARY;
  const recommendedAgents = agentRecommendation.agents || [];
  const isStreaming = turn.status === "streaming" && currentStatus === "streaming";
  const hasAssistantContent =
    ack ||
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
          <div className="agent-message-meta">
            <span>智能助手</span>
            {isStreaming && <em>生成中</em>}
          </div>

          {ack && <AssistantText>{ack}</AssistantText>}
          {path && (
            <ToolCall
              icon={<GitBranch size={13} weight="bold" />}
              label="知识图谱路径"
              value={path}
              active={isStreaming && !explanation}
            />
          )}
          {explanation && <AssistantText>{explanation}</AssistantText>}
          {recommendationAck && <AssistantText>{recommendationAck}</AssistantText>}
          {recommendedAgents.length > 0 && (
            <AgentRecommendationCall agents={recommendedAgents} active={isStreaming && !summary} />
          )}
          {summary && <AssistantText>{summary}</AssistantText>}
          {isStreaming && !hasAssistantContent && <TypingLine />}

          {turn.error && <p className="agent-error">{turn.error}</p>}
        </div>
      </article>
    </div>
  );
}

function AssistantText({ children }) {
  return <p className="agent-assistant-text">{children}</p>;
}

function ToolCall({ icon, label, value, active }) {
  return (
    <div className={`agent-tool-call ${active ? "is-running" : ""}`}>
      <div className="agent-tool-call-head">
        <span>
          {icon}
          {label}
        </span>
        <em>{active ? "运行中" : "完成"}</em>
      </div>
      <p>{value}</p>
    </div>
  );
}

function AgentRecommendationCall({ agents, active }) {
  return (
    <div className={`agent-tool-call agent-recommendation-call ${active ? "is-running" : ""}`}>
      <div className="agent-tool-call-head">
        <span>
          <Sparkle size={13} weight="bold" />
          推荐智能体
        </span>
        <em>{active ? "运行中" : "完成"}</em>
      </div>
      <div className="agent-recommendation-list">
        {agents.map((agent, index) => (
          <article className="agent-recommendation-item" key={`${agent.rank || index}-${agent.agent_name || agent.name}`}>
            <span>{agent.rank || index + 1}</span>
            <div>
              <strong>{agent.agent_name || agent.name || "未命名智能体"}</strong>
              {agent.stage && <em>{agent.stage}</em>}
              {agent.reason && <p>{agent.reason}</p>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TypingLine() {
  return (
    <div className="agent-typing" aria-label="智能助手正在思考">
      <span />
      <span />
      <span />
    </div>
  );
}
