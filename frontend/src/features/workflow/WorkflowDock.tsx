import { useEffect, useRef } from 'react';
import { ArrowUpRight, Crown, ExternalLink, GitBranch, PackageOpen, Sparkles } from 'lucide-react';
import { enrichDrawAgent, getAgentLaunchTargets, openAgentLaunchTargets } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';
import { getAgentDisplayName, getAgentStage, getRecommendedAgentKey } from '../agents/agentUtils';
import type { WorkflowHighlight } from './workflowModel';

export function WorkflowDock({
  active,
  agents,
  highlight,
  onOpenHeroHall,
  routeSegments,
}: {
  active: boolean;
  agents: RecommendedAgent[];
  highlight: WorkflowHighlight;
  onOpenHeroHall: () => void;
  routeSegments: string[];
}) {
  const hasRoute = routeSegments.length > 0;
  const hasAgents = agents.length > 0;
  const visibleAgents = agents;
  const agentListRef = useRef<HTMLDivElement>(null);
  const agentListKey = visibleAgents.map(getRecommendedAgentKey).join('|');

  useEffect(() => {
    const list = agentListRef.current;

    if (list) {
      list.scrollTop = 0;
    }
  }, [agentListKey]);

  if (!hasRoute && !hasAgents) {
    return null;
  }

  return (
    <aside
      className="workflow-dock"
      data-active={active}
      data-highlight={highlight}
      aria-label="Agent workflow context"
    >
      {hasRoute ? <RouteResult highlighted={highlight === 'route'} routeSegments={routeSegments} /> : null}
      {hasAgents ? (
        <section className={`workflow-dock-section workflow-agent-panel ${highlight === 'agents' ? 'is-prism' : ''}`}>
          <div className="workflow-dock-title">
            <Sparkles size={14} />
            <strong>推荐智能体</strong>
            <span>{agents.length}</span>
          </div>
          <div className="workflow-agent-list" ref={agentListRef}>
            {visibleAgents.map((agent, index) => (
              <RecommendedAgentCard agent={agent} index={index} key={getRecommendedAgentKey(agent)} />
            ))}
          </div>
          <RecommendedAgentLaunchBar agents={agents} onOpenHeroHall={onOpenHeroHall} />
        </section>
      ) : null}
    </aside>
  );
}

function RouteResult({ highlighted, routeSegments }: { highlighted: boolean; routeSegments: string[] }) {
  return (
    <section className={`workflow-dock-section workflow-route-panel ${highlighted ? 'is-prism' : ''}`}>
      <div className="workflow-dock-title">
        <GitBranch size={14} />
        <strong>知识路径</strong>
        <span>{routeSegments.length}</span>
      </div>
      <div className="workflow-route-chain">
        {routeSegments.map((segment, index) => (
          <span data-current={index === routeSegments.length - 1} key={`${index}-${segment}`}>
            {segment}
          </span>
        ))}
      </div>
    </section>
  );
}

function RecommendedAgentCard({ agent, index }: { agent: RecommendedAgent; index: number }) {
  const enrichedAgent = enrichDrawAgent(agent);
  const active = agent.streamStatus !== 'completed';
  const name = enrichedAgent.name || getAgentDisplayName(agent);
  const stage = enrichedAgent.stageLabel || getAgentStage(agent, index);
  const reason = String(agent.reason || enrichedAgent.fallbackReason || '').trim();
  const variant = ['cyan', 'gold', 'violet'][index % 3];
  const canOpen = Boolean(enrichedAgent.launchTarget);
  const statusLabel = active ? '匹配中' : canOpen ? '可打开' : '已匹配';
  const cardClassName = `recommended-agent-card recommended-agent-${variant} ${canOpen ? 'is-clickable' : 'is-static'}`;
  const cardBody = (
    <>
      <span className="recommended-agent-index">{String(index + 1).padStart(2, '0')}</span>
      <span className={`recommended-agent-avatar ${enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
        {enrichedAgent.avatar ? <img alt="" loading="lazy" src={enrichedAgent.avatar} /> : <Sparkles size={18} />}
      </span>
      <div className="recommended-agent-copy">
        <div className="recommended-agent-head">
          <strong title={name}>{name}</strong>
          <span className="recommended-agent-status">{statusLabel}</span>
        </div>
        <div className="recommended-agent-meta">
          <em title={stage}>{stage}</em>
          <span>{enrichedAgent.metaLabel}</span>
        </div>
        {reason ? <p>{reason}</p> : null}
      </div>
      <span className="recommended-agent-open-hint">
        {canOpen ? (
          <>
            <ExternalLink size={13} />
            打开
          </>
        ) : (
          '待补链接'
        )}
      </span>
    </>
  );

  if (canOpen) {
    return (
      <a className={cardClassName} data-active={active} href={enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
        {cardBody}
      </a>
    );
  }

  return (
    <article aria-disabled="true" aria-label={`${name} 推荐智能体`} className={cardClassName} data-active={active}>
      {cardBody}
    </article>
  );
}

function RecommendedAgentLaunchBar({ agents, onOpenHeroHall }: { agents: RecommendedAgent[]; onOpenHeroHall: () => void }) {
  const enrichedAgents = agents.map(enrichDrawAgent);
  const launchTargets = getAgentLaunchTargets(enrichedAgents);
  const canOpen = launchTargets.length > 0;

  return (
    <div className="recommended-agent-package">
      <div>
        <span>智能体组合包</span>
        <strong>{agents.length} 个智能体已生成</strong>
      </div>
      <div className="recommended-agent-package-actions">
        <button aria-label="进入智能体英雄殿堂" className="recommended-agent-package-hall" onClick={onOpenHeroHall} type="button">
          <Crown size={14} />
          <span>殿堂</span>
        </button>
        <button disabled={!canOpen} onClick={() => openAgentLaunchTargets(launchTargets)} type="button">
          <PackageOpen size={15} />
          <span>{canOpen ? '打开组合' : '暂无链接'}</span>
          {canOpen ? (
            <em>
              {launchTargets.length}
              <ArrowUpRight size={12} />
            </em>
          ) : null}
        </button>
      </div>
    </div>
  );
}
