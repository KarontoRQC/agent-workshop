import { LoaderCircle, ShieldCheck } from 'lucide-react';
import './AgentCombinationEntryPage.css';
import './AgentCombinationPendingPage.css';

export function AgentCombinationPendingPage() {
  return (
    <main className="agent-combination-entry-page agent-combination-pending-page">
      <section className="agent-combination-pending-stage" aria-live="polite" role="status">
        <span className="agent-combination-pending-mark" aria-hidden="true">
          <LoaderCircle />
        </span>
        <p>JARVIS HERO ARRAY</p>
        <h1>智能体阵列同步中</h1>
        <span className="agent-combination-pending-status">
          <ShieldCheck aria-hidden="true" />
          正在校验路径与推荐组合
        </span>
      </section>
    </main>
  );
}
