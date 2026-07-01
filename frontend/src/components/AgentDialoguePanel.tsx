import type { FormEvent, KeyboardEvent } from 'react';
import { Bot, GitBranch, Keyboard, Send, Sparkles, UserRound } from 'lucide-react';
import type { Message, RecommendedAgent, ReplySource } from '../types';

type AgentDialoguePanelProps = {
  disabled: boolean;
  draft: string;
  graphRoute: string[];
  messages: Message[];
  onDraftChange: (value: string) => void;
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendDraft: (event?: FormEvent<HTMLFormElement>) => void;
  recommendedAgents: RecommendedAgent[];
  source: ReplySource;
  visible: boolean;
};

function getAgentName(agent: RecommendedAgent, index: number) {
  return String(agent.agent_name || agent.name || agent.agent_key || agent.id || `Agent ${index + 1}`);
}

function getAgentMeta(agent: RecommendedAgent) {
  const score = agent.score ?? agent.rank;
  const stage = agent.stage || agent.activeField;

  if (score && stage) {
    return `${stage} / ${score}`;
  }

  return String(stage || score || 'candidate');
}

function TypingLine() {
  return (
    <div className="agent-dialogue-typing" aria-label="Agent is typing">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function AgentDialoguePanel({
  disabled,
  draft,
  graphRoute,
  messages,
  onDraftChange,
  onDraftKeyDown,
  onSendDraft,
  recommendedAgents,
  source,
  visible,
}: AgentDialoguePanelProps) {
  const visibleMessages = messages.filter((message) => message.text !== 'Processing...').slice(-5);
  const isThinking = messages.some((message) => message.text === 'Processing...');
  const routeText = graphRoute.length > 0 ? graphRoute.join(' / ') : '';
  const visibleAgents = recommendedAgents.slice(0, 3);

  if (!visible) {
    return null;
  }

  return (
    <aside className="agent-dialogue-panel" aria-label="Agent dialogue panel" onPointerDown={(event) => event.stopPropagation()}>
      <header className="agent-dialogue-header">
        <span aria-hidden="true">
          <Bot size={15} />
        </span>
        <strong>Agent Console</strong>
        <em>{source}</em>
      </header>

      <div className="agent-dialogue-thread" aria-live="polite">
        {visibleMessages.map((message) => (
          <article className={`agent-dialogue-message is-${message.speaker}`} key={message.id}>
            <span aria-hidden="true">{message.speaker === 'you' ? <UserRound size={14} /> : <Sparkles size={14} />}</span>
            <p>{message.text}</p>
          </article>
        ))}
        {isThinking ? <TypingLine /> : null}
      </div>

      {routeText || visibleAgents.length > 0 ? (
        <section className="agent-dialogue-context" aria-label="Agent context">
          {routeText ? (
            <div className="agent-dialogue-route">
              <GitBranch size={13} />
              <span>{routeText}</span>
            </div>
          ) : null}
          {visibleAgents.length > 0 ? (
            <div className="agent-dialogue-agents">
              {visibleAgents.map((agent, index) => (
                <span key={`${getAgentName(agent, index)}-${index}`}>
                  <strong>{getAgentName(agent, index)}</strong>
                  <em>{getAgentMeta(agent)}</em>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <form className="agent-dialogue-composer" onSubmit={onSendDraft}>
        <Keyboard size={15} />
        <textarea
          aria-label="Type to agent"
          disabled={disabled}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onDraftKeyDown}
          placeholder={disabled ? 'Agent is responding...' : 'Type to the agent...'}
          rows={1}
          value={draft}
        />
        <button aria-label="Send to agent" disabled={disabled || !draft.trim()} type="submit">
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}
