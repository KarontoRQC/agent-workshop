import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Shield, Sparkles } from 'lucide-react';
import type { EnrichedDrawAgent } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';
import './HeroTeamCarousel.css';
import { getHeroTeamPresentation } from './heroTeamPresentation';

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
  const trackRef = useRef<HTMLOListElement | null>(null);
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

  useEffect(() => {
    const track = trackRef.current;
    const card = track?.querySelector<HTMLElement>(`[data-recommendation-index="${focusIndex}"]`);

    if (!track || !card) {
      return;
    }

    const targetLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [focusIndex]);

  return (
    <section className="hero-hall-ranking hero-hall-recommendations hero-hall-deployment" aria-label="智能体推荐战队">
      <div className="hero-hall-section-title">
        <Sparkles size={15} />
        <strong>推荐战队</strong>
        <span>签约落地</span>
      </div>
      <button aria-label="上一组推荐卡片" className="hero-hall-carousel-button is-prev" onClick={() => moveFocus(-1)} type="button">
        <ChevronLeft size={18} />
      </button>
      <button aria-label="下一组推荐卡片" className="hero-hall-carousel-button is-next" onClick={() => moveFocus(1)} type="button">
        <ChevronRight size={18} />
      </button>
      <div className="hero-team-carousel" aria-roledescription="carousel" aria-label="推荐战队卡片轮播">
        <div className="hero-team-pedestal" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {agents.length > 0 ? (
          <>
            <ol className="hero-recommendation-deck hero-deploy-grid hero-team-carousel-track is-all-visible" ref={trackRef}>
              {agents.map((agent, index) => {
                const displayName = agent.name;
                const isFocused = index === focusIndex;
                const isDropTarget = draggingAgentKey && dropTargetIndex === index;
                const isDragSource = draggingAgentKey === agent.key;
                const isReplacing = replacePulseIndex === index;
                const presentation = getHeroTeamPresentation(agent, index);

                return (
                  <li
                    aria-current={isFocused ? 'true' : undefined}
                    className={`hero-recommendation-card hero-deploy-card hero-team-card is-all-visible-card ${isFocused ? 'is-focused' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${isDragSource ? 'is-drag-source' : ''} ${isReplacing ? 'is-replacing' : ''}`}
                    data-lineup={presentation.lineupLabel}
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
                    <div className="hero-team-copy">
                      <span className="hero-team-rank-chip">{presentation.rankLabel}</span>
                      <h3 title={displayName}>{displayName}</h3>
                      <span className="hero-team-stage" title={presentation.stage}>
                        {presentation.stage}
                      </span>
                      <p className="hero-team-summary" title={presentation.reason}>
                        {presentation.reason}
                      </p>
                    </div>
                    <span className="hero-team-divider" aria-hidden="true" />
                    <footer>
                      <strong>{presentation.rankLabel}</strong>
                      <small>{presentation.metricLabel}</small>
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
                      <button className="hero-team-action" aria-label={`${displayName}暂无可打开入口`} disabled type="button">
                        <Plus size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="hero-team-progress" role="tablist" aria-label="切换推荐战队卡片">
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
