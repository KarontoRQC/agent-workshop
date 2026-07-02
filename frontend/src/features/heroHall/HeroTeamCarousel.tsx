import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Shield, Sparkles } from 'lucide-react';
import type { EnrichedDrawAgent } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';
import './HeroTeamCarousel.css';

export type HeroTeamCarouselAgent = {
  agent: RecommendedAgent;
  enrichedAgent: EnrichedDrawAgent;
  key: string;
  name: string;
};

type HeroTeamCarouselProps = {
  agents: HeroTeamCarouselAgent[];
  draggingAgentKey?: string;
  dropTargetIndex?: number | null;
  focusResetKey: string;
  onAgentDragStart: (event: DragEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => void;
  onAgentDragLeave: (event: DragEvent<HTMLElement>, targetIndex: number) => void;
  onAgentDragOver: (event: DragEvent<HTMLElement>, targetIndex: number) => void;
  onAgentDrop: (event: DragEvent<HTMLElement>, targetIndex: number) => void;
  onDragEnd: () => void;
  onPointerDragStart: (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => void;
  replacePulseIndex?: number | null;
};

const heroTeamReferenceTemplates = {
  'is-far-left': {
    dotCount: 4,
    score: '98.6',
    stage: '战略决策',
    subtitle: '洞察全局・决策未来',
  },
  'is-left': {
    dotCount: 3,
    score: '96.1',
    stage: '运营管理',
    subtitle: '统筹有序・高效执行',
  },
  'is-center': {
    dotCount: 3,
    score: '95.4',
    stage: '技术开发',
    subtitle: '化繁为简・架构未来',
  },
  'is-right': {
    dotCount: 3,
    score: '97.2',
    stage: '研究洞察',
    subtitle: '洞察本质・预见趋势',
  },
  'is-far-right': {
    dotCount: 3,
    score: '95.8',
    stage: '创造设计',
    subtitle: '灵感无界・创造价值',
  },
  'is-hidden': {
    dotCount: 3,
    score: '95.4',
    stage: '技术开发',
    subtitle: '化繁为简・架构未来',
  },
};

function getCarouselPosition(index: number, focusIndex: number, total: number) {
  if (total <= 0) {
    return 'is-hidden';
  }

  let offset = index - focusIndex;

  while (offset > 2) {
    offset -= total;
  }

  while (offset < -2) {
    offset += total;
  }

  if (offset === -2) return 'is-far-left';
  if (offset === -1) return 'is-left';
  if (offset === 0) return 'is-center';
  if (offset === 1) return 'is-right';
  if (offset === 2) return 'is-far-right';

  return 'is-hidden';
}

function getReferenceTemplate(positionClass: string) {
  return heroTeamReferenceTemplates[positionClass as keyof typeof heroTeamReferenceTemplates] || heroTeamReferenceTemplates['is-hidden'];
}

export function HeroTeamCarousel({
  agents,
  draggingAgentKey = '',
  dropTargetIndex = null,
  focusResetKey,
  onAgentDragLeave,
  onAgentDragOver,
  onAgentDragStart,
  onAgentDrop,
  onDragEnd,
  onPointerDragStart,
  replacePulseIndex = null,
}: HeroTeamCarouselProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const agentKeySignature = useMemo(() => agents.map((agent) => agent.key).join('|'), [agents]);

  useEffect(() => {
    setFocusIndex(0);
  }, [agentKeySignature, focusResetKey]);

  useEffect(() => {
    setFocusIndex((current) => {
      if (agents.length === 0) {
        return 0;
      }

      return Math.min(current, agents.length - 1);
    });
  }, [agents.length]);

  const moveFocus = (direction: -1 | 1) => {
    setFocusIndex((current) => {
      if (agents.length === 0) {
        return 0;
      }

      return (current + direction + agents.length) % agents.length;
    });
  };

  return (
    <section className="hero-hall-ranking hero-hall-recommendations hero-hall-deployment" aria-label="智能体推荐战队">
      <div className="hero-hall-section-title">
        <Sparkles size={15} />
        <strong>推荐战队</strong>
        <span>签约落地</span>
      </div>
      <button aria-label="上一组推荐卡牌" className="hero-hall-carousel-button is-prev" onClick={() => moveFocus(-1)} type="button">
        <ChevronLeft size={18} />
      </button>
      <button aria-label="下一组推荐卡牌" className="hero-hall-carousel-button is-next" onClick={() => moveFocus(1)} type="button">
        <ChevronRight size={18} />
      </button>
      <div className="hero-team-carousel" aria-roledescription="carousel" aria-label="推荐战队卡牌轮播">
        <div className="hero-team-pedestal" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {agents.length > 0 ? (
          <>
            <ol className="hero-recommendation-deck hero-deploy-grid hero-team-carousel-track">
              {agents.map((agent, index) => {
                const displayName = agent.name;
                const positionClass = getCarouselPosition(index, focusIndex, agents.length);
                const isFocused = positionClass === 'is-center';
                const isDropTarget = draggingAgentKey && dropTargetIndex === index;
                const isDragSource = draggingAgentKey === agent.key;
                const isReplacing = replacePulseIndex === index;
                const presentation = getReferenceTemplate(positionClass);

                return (
                  <li
                    aria-current={isFocused ? 'true' : undefined}
                    className={`hero-recommendation-card hero-deploy-card hero-team-card ${positionClass} ${isDropTarget ? 'is-drop-target' : ''} ${isDragSource ? 'is-drag-source' : ''} ${isReplacing ? 'is-replacing' : ''}`}
                    data-recommendation-index={index}
                    data-replace-active={isDropTarget ? 'true' : 'false'}
                    draggable={false}
                    key={agent.key}
                    onClick={() => setFocusIndex(index)}
                    onDragEnter={(event) => onAgentDragOver(event, index)}
                    onDragLeave={(event) => onAgentDragLeave(event, index)}
                    onDragOver={(event) => onAgentDragOver(event, index)}
                    onDragEnd={onDragEnd}
                    onDragStart={(event) => onAgentDragStart(event, agent.key, index)}
                    onDrop={(event) => onAgentDrop(event, index)}
                    onMouseDown={(event) => onPointerDragStart(event, agent.key, index)}
                    onPointerDown={(event) => onPointerDragStart(event, agent.key, index)}
                  >
                    <span className="hero-team-glass" aria-hidden="true" />
                    <span className={`hero-team-portrait ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                      {agent.enrichedAgent.avatar ? <img alt="" draggable={false} loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={24} />}
                    </span>
                    <span className="hero-team-badge" aria-hidden="true">
                      <Shield size={15} />
                    </span>
                    <h3 title={displayName}>{displayName}</h3>
                    <p title={presentation.subtitle}>{presentation.subtitle}</p>
                    <span className="hero-team-stage">{presentation.stage}</span>
                    <span className="hero-team-divider" aria-hidden="true" />
                    <footer>
                      <strong>{presentation.score}</strong>
                      <small>综合评分</small>
                      <span className="hero-team-dots" aria-hidden="true">
                        {Array.from({ length: presentation.dotCount }, (_, dotIndex) => (
                          <i key={dotIndex} />
                        ))}
                      </span>
                    </footer>
                    {agent.enrichedAgent.launchTarget ? (
                      <a className="hero-team-action" aria-label={`打开${displayName}`} href={agent.enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <button className="hero-team-action" aria-label={`替换${displayName}`} type="button">
                        <Plus size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="hero-team-progress" role="tablist" aria-label="切换推荐战队卡牌">
              {agents.map((agent, index) => (
                <button
                  aria-label={`查看${agent.name}`}
                  aria-selected={index === focusIndex}
                  data-active={index === focusIndex ? 'true' : 'false'}
                  key={agent.key}
                  onClick={() => setFocusIndex(index)}
                  type="button"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="hero-team-empty">等待推荐战队生成</div>
        )}
      </div>
    </section>
  );
}
