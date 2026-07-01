import { useCallback, useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import {
  AudioLines,
  Bot,
  BrainCircuit,
  CircuitBoard,
  GitBranch,
  Keyboard,
  Mic,
  MicOff,
  RadioTower,
  Send,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import type { AgentStatus, AgentTurn } from '../../types';
import {
  getHeroHallLineupLabel,
  getRecommendedAgentLineup,
  normalizeHeroHallLineupId,
  type HeroHallLineupId,
} from '../heroHall/heroHallModel';
import {
  hasAgentOutput,
  normalizeSubtitleText,
  splitRouteText,
  stripSpeechTagSyntax,
} from '../workflow/workflowModel';

export type InputMode = 'text' | 'voice';

type AgentConsoleProps = {
  draft: string;
  helmetVoice: boolean;
  inputMode: InputMode;
  onDraftKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (mode: InputMode) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  setDraft: (value: string) => void;
  speakingText: string;
  status: AgentStatus;
  turns: AgentTurn[];
  voiceAwake: boolean;
  voiceHeardText: string;
  voiceListening: boolean;
  voiceTranscript: string;
  voiceSupported: boolean;
};

export function AgentConsole({
  draft,
  helmetVoice,
  inputMode,
  onDraftKeyDown,
  onModeChange,
  onSend,
  onToggleVoice,
  setDraft,
  speakingText,
  status,
  turns,
  voiceAwake,
  voiceHeardText,
  voiceListening,
  voiceTranscript,
  voiceSupported,
}: AgentConsoleProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isStreaming = status === 'streaming';
  const visibleVoiceText = voiceHeardText || voiceTranscript;
  const latestTurn = turns.at(-1) ?? null;
  const latestTurnId = latestTurn?.id ?? '';
  const hasTurns = turns.length > 0;
  const pendingVoiceText = inputMode === 'voice' && !hasTurns ? visibleVoiceText : '';
  const voiceActivityLabel = !voiceSupported
    ? '语音链路不可用'
    : isStreaming
      ? 'AI 正在分析并回应'
      : voiceAwake
        ? voiceListening
          ? '正在监听驾驶员指令'
          : '语音链路已接入'
        : '待命，等待唤醒';
  const voiceBadgeLabel = !voiceSupported ? 'OFFLINE' : isStreaming ? 'PROCESSING' : voiceAwake ? 'LINKED' : 'STANDBY';
  const voicePrompt = visibleVoiceText || speakingText || (voiceAwake ? '座舱收音已打开，可以直接下达指令。' : '座舱 AI 待命，等待驾驶员指令。');

  const scrollThreadToBottom = useCallback(() => {
    const thread = threadRef.current;

    if (!thread) {
      return;
    }

    thread.scrollTop = thread.scrollHeight;
  }, []);

  const handleThreadScroll = useCallback(() => {
    const thread = threadRef.current;

    if (!thread) {
      return;
    }

    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 28;
  }, []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    scrollThreadToBottom();
  }, [latestTurnId, scrollThreadToBottom]);

  useLayoutEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollThreadToBottom();
    }
  }, [pendingVoiceText, scrollThreadToBottom, status, turns]);

  const handleComposerSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSend();
    },
    [onSend],
  );

  return (
    <aside
      className="agent-console"
      data-has-turn={hasTurns}
      data-input-mode={inputMode}
      data-status={status}
      aria-label="Agent response panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {hasTurns || pendingVoiceText ? (
        <div className="agent-console-thread" aria-live="polite" onScroll={handleThreadScroll} ref={threadRef}>
          {hasTurns ? (
            <>
              {turns.map((turn) => (
                <section className="agent-turn" key={turn.id}>
                  <article className="agent-user-line">
                    <span aria-hidden="true">
                      <UserRound size={14} />
                    </span>
                    <p>{turn.user}</p>
                  </article>
                  <AgentResponse
                    active={turn.status === 'streaming'}
                    speakingText={turn.id === latestTurnId ? speakingText : ''}
                    turn={turn}
                  />
                </section>
              ))}
            </>
          ) : (
            <article className="agent-user-line">
              <span aria-hidden="true">
                <UserRound size={14} />
              </span>
              <p>{pendingVoiceText}</p>
            </article>
          )}
        </div>
      ) : null}

      <div className="agent-input-hub">
        <div className="agent-mode-switch" role="tablist" aria-label="输入模式">
          <button
            type="button"
            aria-selected={inputMode === 'voice'}
            className={inputMode === 'voice' ? 'active' : ''}
            onClick={() => onModeChange('voice')}
            role="tab"
          >
            <Mic size={15} />
            <span>语音</span>
          </button>
          <button
            type="button"
            aria-selected={inputMode === 'text'}
            className={inputMode === 'text' ? 'active' : ''}
            onClick={() => onModeChange('text')}
            role="tab"
          >
            <Keyboard size={15} />
            <span>打字</span>
          </button>
        </div>

        {inputMode === 'voice' ? helmetVoice ? (
          <div
            className="agent-voice-module"
            data-awake={voiceAwake}
            data-listening={voiceListening}
            data-status={status}
            data-supported={voiceSupported}
          >
            <div className="voice-ai-core">
              <span className="voice-ai-orb" aria-hidden="true">
                <Bot size={17} />
              </span>
              <div>
                <strong>JARVIS VOICE AI</strong>
                <em>{voiceActivityLabel}</em>
              </div>
              <span className="voice-ai-badge">{voiceBadgeLabel}</span>
            </div>

            <div className="voice-ai-wave" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>

            <div className="voice-ai-control-row">
              <div className="voice-presence" aria-hidden="true" data-active={voiceListening} data-awake={voiceAwake} />
            <button
                aria-label={voiceAwake ? '关闭机甲语音链路' : '唤醒机甲语音链路'}
              aria-pressed={voiceAwake}
              className="voice-toggle"
              data-active={voiceAwake}
              disabled={!voiceSupported || isStreaming}
              onClick={onToggleVoice}
                title={voiceAwake ? '关闭语音链路' : '唤醒语音链路'}
              type="button"
            >
                {voiceAwake ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
              <div className="voice-ai-telemetry">
                <span>
                  <RadioTower size={12} />
                  AUDIO LINK
                </span>
                <span>
                  <CircuitBoard size={12} />
                  ARMOR COMMS
                </span>
              </div>
            </div>

            <p className="voice-ai-prompt">
              <AudioLines size={13} />
              <span>{voicePrompt}</span>
            </p>
          </div>
        ) : (
          <div className="agent-voice-legacy">
            <div className="voice-presence" aria-hidden="true" data-active={voiceListening} data-awake={voiceAwake} />
            <button
              aria-label={voiceAwake ? 'Stand down voice mode' : 'Wake voice mode'}
              aria-pressed={voiceAwake}
              className="voice-toggle"
              data-active={voiceAwake}
              disabled={!voiceSupported || isStreaming}
              onClick={onToggleVoice}
              title={voiceAwake ? 'Stand down' : 'Wake voice'}
              type="button"
            >
              {voiceAwake ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <em>{voiceSupported ? (voiceAwake ? '语音已激活' : '语音待命') : '语音不可用'}</em>
          </div>
        ) : (
          <form className="agent-composer" onSubmit={handleComposerSubmit}>
            <textarea
              value={draft}
              disabled={isStreaming}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder={isStreaming ? 'Agent 正在生成...' : '问你的 agent...'}
              rows={1}
            />
            <button type="submit" disabled={!draft.trim() || isStreaming} aria-label="发送给 agent">
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

function AgentResponse({ active, speakingText, turn }: { active: boolean; speakingText: string; turn: AgentTurn }) {
  const workflow = turn.workflow;
  const knowledgeGraph = workflow.knowledgeGraph;
  const recommendation = workflow.agentRecommendation;
  const routeSegments = splitRouteText(knowledgeGraph.KG_PATH);
  const lineupIntent = normalizeHeroHallLineupId(recommendation.lineupIntent);
  const lineupAgentCount = lineupIntent
    ? recommendation.agents.filter((agent) => getRecommendedAgentLineup(agent) === lineupIntent).length ||
      recommendation.agents.length
    : 0;
  const showOutput = hasAgentOutput(turn);

  if (!showOutput && active) {
    return <TypingLine />;
  }

  return (
    <article className="agent-response">
      {renderThinkingText('思考过程', knowledgeGraph.THINKING_PROCESS, active && !knowledgeGraph.ACK)}
      {renderAgentSubtitle(knowledgeGraph.DIRECT_REPLY, speakingText)}
      {renderAgentSubtitle(knowledgeGraph.ACK, speakingText)}
      {renderToolCallDivider('route', routeSegments.length)}
      {renderAgentSubtitle(knowledgeGraph.EXPLANATION, speakingText)}
      {renderThinkingText('推荐思考', recommendation.THINKING_PROCESS, active && !recommendation.ACK)}
      {renderAgentSubtitle(recommendation.ACK, speakingText)}
      {renderToolCallDivider('lineup', lineupAgentCount, lineupIntent)}
      {renderToolCallDivider('agents', recommendation.agents.length)}
      {renderAgentSubtitle(recommendation.SUMMARY, speakingText)}
      {renderAgentSubtitle(turn.fallbackText, speakingText)}
      {turn.error && <p className="agent-error-text">{turn.error}</p>}
      {active && <TypingLine />}
    </article>
  );
}

function renderToolCallDivider(kind: 'agents' | 'lineup' | 'route', count: number, lineupId?: HeroHallLineupId) {
  if (kind === 'lineup' && !lineupId) {
    return null;
  }

  if (count <= 0 && kind !== 'lineup') {
    return null;
  }

  const isRoute = kind === 'route';
  const isLineup = kind === 'lineup';
  const lineupLabel = getHeroHallLineupLabel(lineupId);
  const title = isRoute ? '知识路径工具调用' : isLineup ? `${lineupLabel}工具调用` : '智能体推荐工具调用';
  const detail = isRoute
    ? `${count} 个路径节点已匹配`
    : isLineup
      ? count > 0
        ? `${count} 个${lineupLabel}智能体已匹配`
        : `正在匹配${lineupLabel}智能体`
      : `${count} 个推荐智能体已生成`;

  return (
    <section className={`agent-tool-call agent-tool-call-${kind}`} aria-label={title}>
      <span className="agent-tool-call-rail" />
      <div className="agent-tool-call-core">
        <span className="agent-tool-call-icon" aria-hidden="true">
          {isRoute ? <GitBranch size={13} /> : isLineup ? <Trophy size={13} /> : <Sparkles size={13} />}
        </span>
        <strong>{title}</strong>
        <em>{detail}</em>
      </div>
      <span className="agent-tool-call-rail" />
    </section>
  );
}

function renderThinkingText(label: string, text: string, active: boolean) {
  const visibleText = stripSpeechTagSyntax(text);

  if (!visibleText) {
    return null;
  }

  return (
    <section className="agent-thinking-stream" data-active={active} data-collapsed={!active}>
      <div>
        <BrainCircuit size={13} />
        <strong>{label}</strong>
      </div>
      <p>{visibleText}</p>
    </section>
  );
}

function renderAgentSubtitle(text: string, speakingText: string) {
  const visibleText = stripSpeechTagSyntax(text);
  const normalizedVisibleText = normalizeSubtitleText(visibleText);
  const normalizedSpeakingText = normalizeSubtitleText(speakingText);
  const isSpeaking = Boolean(
    normalizedVisibleText &&
      normalizedSpeakingText &&
      (normalizedVisibleText === normalizedSpeakingText ||
        normalizedVisibleText.startsWith(normalizedSpeakingText) ||
        normalizedSpeakingText.startsWith(normalizedVisibleText)),
  );

  return visibleText ? (
    <section className="agent-subtitle-line" data-speaking={isSpeaking}>
      <p>{visibleText}</p>
    </section>
  ) : null;
}

function TypingLine() {
  return (
    <div className="agent-typing-line" aria-label="Agent 正在生成">
      <span />
      <span />
      <span />
    </div>
  );
}
