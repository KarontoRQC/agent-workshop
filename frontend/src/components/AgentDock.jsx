import {
  ChatCircleText,
  PaperPlaneTilt,
  Waveform,
} from "@phosphor-icons/react";

export function AgentDock({ draft, setDraft, onSend }) {
  function handleSubmit(event) {
    event.preventDefault();
    onSend();
  }

  return (
    <aside className="agent-dock" aria-label="Agent 对话窗口">
      <div className="dock-title">
        <span>
          <ChatCircleText size={14} />
          智能助手
        </span>
        <em>在线</em>
      </div>

      <div className="agent-orb">
        <Waveform size={30} weight="duotone" />
        <div>
          <strong>路径选择 Agent</strong>
          <span>监听业务输入，推动星图聚焦</span>
        </div>
      </div>

      <form className="agent-input" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="随时询问任何问题..."
          rows={1}
        />
        <div>
          <span>Enter 发送</span>
          <button type="submit" aria-label="发送给 Agent">
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </div>
      </form>
    </aside>
  );
}
