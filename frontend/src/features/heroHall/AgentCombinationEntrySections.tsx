import { useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Crown, ExternalLink, Gauge, Gem, GripVertical, PackageOpen, Plus, RefreshCcw, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react';
import type { EnrichedDrawAgent } from '../../lib/agentLaunchCatalog';
import {
  AGENT_LINEUP_SLOT_COUNT,
  ALL_AGENT_LINEUP_CATEGORY_ID,
  createAgentLineupCategories,
  filterAgentLineupCandidates,
  getAgentCombinationKey,
  getAgentRarity,
  type AgentCombinationSceneCard,
  type AgentLineupScore,
} from './agentCombinationEntryModel';

export function AgentCombinationHero({
  entryTitle,
  leadAgent,
  loading,
  recommendedCount,
  sceneCount,
  statusText,
}: {
  entryTitle: string;
  leadAgent?: EnrichedDrawAgent;
  loading: boolean;
  recommendedCount: number;
  sceneCount: number;
  statusText: string;
}) {
  return (
    <section className="agent-combination-entry-hero" aria-label="智能体英雄殿堂">
      <div className="agent-combination-hero-copy">
        <span className="agent-combination-crown-label">
          <Crown size={16} />
          CROWN LINEUP
        </span>
        <h1>{entryTitle}</h1>
        <p>{statusText}</p>
        <div className="agent-combination-hero-stats" aria-label="殿堂统计">
          <span>
            <Gem size={15} />
            {recommendedCount} 位英雄
          </span>
          <span>
            <ShieldCheck size={15} />
            {sceneCount} 座场景
          </span>
        </div>
      </div>

      <HeroCrownCard agent={leadAgent} loading={loading} />
    </section>
  );
}

export function HeroCrownCard({ agent, loading }: { agent?: EnrichedDrawAgent; loading: boolean }) {
  return (
    <article className={`agent-combination-crown-card ${agent ? '' : 'is-empty'}`} aria-label="首席推荐智能体">
      <span className="agent-combination-crown-icon">
        <Crown size={18} />
      </span>
      <span className={agent?.avatar ? 'agent-combination-crown-avatar has-avatar' : 'agent-combination-crown-avatar'} aria-hidden="true">
        {agent?.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Sparkles size={32} />}
      </span>
      <strong title={agent?.name}>{agent?.name || '英雄阵列待命'}</strong>
      <em title={agent?.stageLabel}>{agent?.stageLabel || (loading ? '星图正在校准' : '等待推荐生成')}</em>
      {agent?.fallbackReason ? <p title={agent.fallbackReason}>{agent.fallbackReason}</p> : null}
      {agent?.launchTarget ? (
        <a aria-label={`打开${agent.name}`} href={agent.launchTarget} rel="noopener noreferrer" target="_blank">
          <ExternalLink size={14} />
          <span>打开</span>
        </a>
      ) : null}
    </article>
  );
}

export function SceneSection({ scenes }: { scenes: AgentCombinationSceneCard[] }) {
  return (
    <section className="agent-combination-scenes" aria-label="精选场景">
      <h2>精选场景</h2>
      <div className="agent-combination-scene-row">
        {scenes.map((scene) => (
          <article className="agent-combination-scene-card" key={scene.label}>
            {scene.cover ? <img alt="" loading="lazy" src={scene.cover} /> : null}
            <div>
              <strong>{scene.label}</strong>
              <ul>
                {scene.agents.map((agent) => (
                  <SceneAgentRow agent={agent} key={agent.id || agent.name} />
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SceneAgentRow({ agent }: { agent: EnrichedDrawAgent }) {
  const content = (
    <>
      <span className={agent.avatar ? 'has-avatar' : ''}>{agent.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Sparkles size={13} />}</span>
      <em>{agent.name}</em>
    </>
  );

  return (
    <li>
      {agent.launchTarget ? (
        <a href={agent.launchTarget} rel="noopener noreferrer" target="_blank" title={agent.name}>
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
    </li>
  );
}

export function AgentLineupBuilder({
  canOpenLineup,
  candidateAgents,
  dropSlotIndex,
  lineupLaunchTargetCount,
  lineupAgents,
  onAddAgent,
  onCandidateDragStart,
  onCandidatePointerDragStart,
  onClearLineup,
  onDragEnd,
  onOpenLineup,
  onRemoveSlot,
  onSlotDragLeave,
  onSlotDragOver,
  onSlotDragStart,
  onSlotDrop,
  onSlotPointerDragStart,
  recommendedAgentKeys,
  score,
  selectedAgentKeys,
}: {
  canOpenLineup: boolean;
  candidateAgents: EnrichedDrawAgent[];
  dropSlotIndex: number | null;
  lineupLaunchTargetCount: number;
  lineupAgents: Array<EnrichedDrawAgent | null>;
  onAddAgent: (agentKey: string) => void;
  onCandidateDragStart: (event: DragEvent<HTMLElement>, agentKey: string) => void;
  onCandidatePointerDragStart: (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, agentKey: string) => void;
  onClearLineup: () => void;
  onDragEnd: () => void;
  onOpenLineup: () => void;
  onRemoveSlot: (slotIndex: number) => void;
  onSlotDragLeave: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotDragOver: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotDragStart: (event: DragEvent<HTMLElement>, agentKey: string, slotIndex: number) => void;
  onSlotDrop: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotPointerDragStart: (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, agentKey: string, slotIndex: number) => void;
  recommendedAgentKeys: Set<string>;
  score: AgentLineupScore;
  selectedAgentKeys: Set<string>;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(ALL_AGENT_LINEUP_CATEGORY_ID);
  const hasLineupAgent = lineupAgents.some(Boolean);
  const categories = useMemo(
    () => createAgentLineupCategories({ agents: candidateAgents, recommendedAgentKeys, selectedAgentKeys }),
    [candidateAgents, recommendedAgentKeys, selectedAgentKeys],
  );
  const resolvedCategoryId = categories.some((category) => category.id === activeCategoryId) ? activeCategoryId : ALL_AGENT_LINEUP_CATEGORY_ID;
  const visibleCandidateAgents = useMemo(
    () =>
      filterAgentLineupCandidates({
        activeCategoryId: resolvedCategoryId,
        agents: candidateAgents,
        recommendedAgentKeys,
        selectedAgentKeys,
      }),
    [candidateAgents, recommendedAgentKeys, resolvedCategoryId, selectedAgentKeys],
  );
  const candidateCountLabel =
    visibleCandidateAgents.length === candidateAgents.length ? `${candidateAgents.length} 个候选` : `${visibleCandidateAgents.length}/${candidateAgents.length} 个候选`;

  return (
    <section className="agent-combination-lineup-builder" aria-label="组合智能体">
      <div className="agent-combination-lineup-header">
        <div>
          <span className="agent-combination-crown-label">
            <Trophy size={15} />
            COMBO LINEUP
          </span>
          <h2>组合智能体</h2>
        </div>
        <div className="agent-combination-lineup-actions">
          <button className="agent-combination-lineup-open" disabled={!canOpenLineup} onClick={onOpenLineup} type="button">
            <PackageOpen size={15} />
            <span>{canOpenLineup ? '一键打开阵容' : '阵容暂无入口'}</span>
            {canOpenLineup ? <em>{lineupLaunchTargetCount} 个入口</em> : null}
          </button>
          <button className="agent-combination-lineup-reset" disabled={!hasLineupAgent} onClick={onClearLineup} type="button">
            <RefreshCcw size={15} />
            <span>重置阵容</span>
          </button>
        </div>
      </div>

      <div className="agent-combination-lineup-board">
        <ol className="agent-combination-lineup-slots">
          {Array.from({ length: AGENT_LINEUP_SLOT_COUNT }, (_, index) => (
            <LineupSlot
              agent={lineupAgents[index] || null}
              index={index}
              isDropTarget={dropSlotIndex === index}
              key={index}
              onDragEnd={onDragEnd}
              onRemoveSlot={onRemoveSlot}
              onSlotDragLeave={onSlotDragLeave}
              onSlotDragOver={onSlotDragOver}
              onSlotDragStart={onSlotDragStart}
              onSlotDrop={onSlotDrop}
              onSlotPointerDragStart={onSlotPointerDragStart}
            />
          ))}
        </ol>

        <LineupScorePanel score={score} />
      </div>

      <div className="agent-combination-candidate-panel">
        <div className="agent-combination-candidate-heading">
          <strong>可选智能体</strong>
          <span>{candidateCountLabel}</span>
        </div>
        <div className="agent-combination-candidate-categories" aria-label="可选智能体类目" role="group">
          {categories.map((category) => (
            <button
              aria-pressed={resolvedCategoryId === category.id}
              className={`agent-combination-category-chip ${resolvedCategoryId === category.id ? 'is-active' : ''}`}
              data-variant={category.variant}
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              title={category.label}
              type="button"
            >
              <span>{category.label}</span>
              <em>{category.count}</em>
            </button>
          ))}
        </div>
        <div className="agent-combination-candidate-grid">
          {visibleCandidateAgents.map((agent, index) => {
            const agentKey = getAgentCombinationKey(agent);
            const isSelected = selectedAgentKeys.has(agentKey);

            return (
              <button
                aria-pressed={isSelected}
                className={`agent-combination-candidate-card ${isSelected ? 'is-selected' : ''}`}
                draggable={false}
                key={`${agentKey}-${index}`}
                onClick={() => onAddAgent(agentKey)}
                onDragEnd={onDragEnd}
                onDragStart={(event) => onCandidateDragStart(event, agentKey)}
                onMouseDown={(event) => onCandidatePointerDragStart(event, agentKey)}
                onPointerDown={(event) => onCandidatePointerDragStart(event, agentKey)}
                type="button"
              >
                <span className={agent.avatar ? 'agent-combination-candidate-avatar has-avatar' : 'agent-combination-candidate-avatar'} aria-hidden="true">
                  {agent.avatar ? <img alt="" draggable={false} loading="lazy" src={agent.avatar} /> : <Sparkles size={18} />}
                </span>
                <span className="agent-combination-candidate-copy">
                  <strong title={agent.name}>{agent.name}</strong>
                  <span title={agent.stageLabel}>{agent.stageLabel}</span>
                </span>
                <em>{isSelected ? '已入阵' : getAgentRarity(agent, index, 'catalog')}</em>
                <Plus size={13} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LineupSlot({
  agent,
  index,
  isDropTarget,
  onDragEnd,
  onRemoveSlot,
  onSlotDragLeave,
  onSlotDragOver,
  onSlotDragStart,
  onSlotDrop,
  onSlotPointerDragStart,
}: {
  agent: EnrichedDrawAgent | null;
  index: number;
  isDropTarget: boolean;
  onDragEnd: () => void;
  onRemoveSlot: (slotIndex: number) => void;
  onSlotDragLeave: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotDragOver: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotDragStart: (event: DragEvent<HTMLElement>, agentKey: string, slotIndex: number) => void;
  onSlotDrop: (event: DragEvent<HTMLElement>, slotIndex: number) => void;
  onSlotPointerDragStart: (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, agentKey: string, slotIndex: number) => void;
}) {
  return (
    <li
      className={`agent-combination-lineup-slot ${agent ? 'has-agent' : 'is-empty'} ${isDropTarget ? 'is-drop-target' : ''}`}
      data-slot-index={index}
      draggable={false}
      onDragEnd={onDragEnd}
      onDragLeave={(event) => onSlotDragLeave(event, index)}
      onDragOver={(event) => onSlotDragOver(event, index)}
      onDragStart={(event) => {
        if (agent) {
          onSlotDragStart(event, getAgentCombinationKey(agent), index);
        }
      }}
      onDrop={(event) => onSlotDrop(event, index)}
      onMouseDown={(event) => {
        if (agent) {
          onSlotPointerDragStart(event, getAgentCombinationKey(agent), index);
        }
      }}
      onPointerDown={(event) => {
        if (agent) {
          onSlotPointerDragStart(event, getAgentCombinationKey(agent), index);
        }
      }}
    >
      <span className="agent-combination-slot-index">{String(index + 1).padStart(2, '0')}</span>
      {agent ? (
        <>
          <span className="agent-combination-slot-grip" aria-hidden="true">
            <GripVertical size={16} />
          </span>
          <span className={agent.avatar ? 'agent-combination-slot-avatar has-avatar' : 'agent-combination-slot-avatar'} aria-hidden="true">
            {agent.avatar ? <img alt="" draggable={false} loading="lazy" src={agent.avatar} /> : <Sparkles size={20} />}
          </span>
          <div className="agent-combination-slot-copy">
            <strong title={agent.name}>{agent.name}</strong>
            <em title={agent.stageLabel}>{agent.stageLabel}</em>
            <p title={agent.fallbackReason}>{agent.fallbackReason}</p>
          </div>
          <div className="agent-combination-slot-actions">
            {agent.launchTarget ? (
              <a aria-label={`打开${agent.name}`} href={agent.launchTarget} rel="noopener noreferrer" target="_blank">
                <ExternalLink size={14} />
              </a>
            ) : null}
            <button aria-label={`移除${agent.name}`} onClick={() => onRemoveSlot(index)} type="button">
              <X size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="agent-combination-slot-empty">
          <Sparkles size={18} />
          <strong>空位待命</strong>
          <span>选择下方智能体</span>
        </div>
      )}
    </li>
  );
}

function LineupScorePanel({ score }: { score: AgentLineupScore }) {
  return (
    <aside className="agent-combination-score-panel" aria-label="组合评分表">
      <header>
        <Gauge size={17} />
        <strong>组合评分表</strong>
        <span>{score.filledCount}/{AGENT_LINEUP_SLOT_COUNT}</span>
      </header>
      <div className="agent-combination-score-total">
        <strong>{score.total}</strong>
        <span>{score.grade}</span>
        <meter min={0} max={100} value={score.total}>
          {score.total}
        </meter>
      </div>
      <table>
        <tbody>
          {score.metrics.map((metric) => (
            <tr key={metric.id}>
              <th scope="row">{metric.label}</th>
              <td>
                <span style={{ width: `${metric.score}%` }} />
              </td>
              <td>{metric.score}</td>
              <td>{metric.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="agent-combination-score-tags">
        {[...score.coverageLabels, ...score.synergyTags].slice(0, 8).map((tag, index) => (
          <span key={`${tag}-${index}`}>{tag}</span>
        ))}
      </div>
    </aside>
  );
}

export function AgentCardSection({
  agents,
  footerAction,
  title,
  variant,
}: {
  agents: EnrichedDrawAgent[];
  footerAction?: ReactNode;
  title: string;
  variant: 'catalog' | 'recommended';
}) {
  return (
    <section className="agent-combination-card-section" data-variant={variant}>
      <h2>{title}</h2>
      <div className="agent-combination-card-grid">
        {agents.map((agent, index) => (
          <AgentCombinationCard agent={agent} index={index} key={`${agent.id || agent.name}-${index}`} variant={variant} />
        ))}
      </div>
      {footerAction ? <div className="agent-combination-section-action">{footerAction}</div> : null}
    </section>
  );
}

function AgentCombinationCard({
  agent,
  index,
  variant,
}: {
  agent: EnrichedDrawAgent;
  index: number;
  variant: 'catalog' | 'recommended';
}) {
  const rarity = getAgentRarity(agent, index, variant);

  return (
    <article className="agent-combination-agent-card" data-rarity={rarity.toLowerCase()}>
      <span className="agent-combination-rarity">{rarity}</span>
      <header>
        <span className={agent.avatar ? 'has-avatar' : ''}>{agent.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Sparkles size={18} />}</span>
        <div>
          <strong title={agent.name}>{agent.name}</strong>
          <em title={agent.stageLabel}>{agent.stageLabel}</em>
        </div>
      </header>
      <p title={agent.fallbackReason}>{agent.fallbackReason}</p>
      <footer>
        <div className="agent-combination-tags">
          {[agent.metaLabel, ...(Array.isArray(agent.tags) ? agent.tags : [])]
            .filter(Boolean)
            .slice(0, 3)
            .map((tag, tagIndex) => (
              <span key={`${String(tag)}-${tagIndex}`}>{String(tag)}</span>
            ))}
        </div>
        {agent.launchTarget ? (
          <a href={agent.launchTarget} rel="noopener noreferrer" target="_blank">
            <ExternalLink size={14} />
            <span>打开</span>
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export function RecommendedAgentsAction({
  canOpen,
  launchTargetCount,
  onOpen,
}: {
  canOpen: boolean;
  launchTargetCount: number;
  onOpen: () => void;
}) {
  return (
    <button className="agent-combination-open-recommended" disabled={!canOpen} onClick={onOpen} type="button">
      <PackageOpen size={16} />
      <span>{canOpen ? '一键打开推荐智能体' : '暂无可打开推荐智能体'}</span>
      {canOpen ? <em>{launchTargetCount} 个入口</em> : null}
    </button>
  );
}

export function StatusPanel({ text, title }: { text: string; title: string }) {
  return (
    <div className="agent-combination-entry-empty" aria-live="polite">
      <RefreshCcw size={18} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
