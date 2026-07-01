import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { ChevronLeft, ChevronRight, Crown, ExternalLink, PackageOpen, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { enrichDrawAgent, getAgentLaunchTargets, getCatalogHeroAgents, openAgentLaunchTargets } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';
import { getAgentDisplayName, getAgentStage, hasDisplayableRecommendedAgent } from '../agents/agentUtils';
import {
  createHeroHallLineupsFromAgents,
  getHeroHallAgentKey,
  heroHallReferenceHeroLabels,
  mergeHeroHallLineups,
  normalizeHeroHallLineupId,
  type HeroHallLineupsState,
} from './heroHallModel';

function safeParseDragPayload(value: string) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { agentKey?: unknown; sourceIndex?: unknown };
    const agentKey = typeof parsed.agentKey === 'string' ? parsed.agentKey : '';
    const sourceIndex = typeof parsed.sourceIndex === 'number' ? parsed.sourceIndex : undefined;

    return agentKey ? { agentKey, sourceIndex } : null;
  } catch {
    return null;
  }
}

export function AgentHeroHall({
  agents,
  onClose,
  onLineupsChange,
  open,
}: {
  agents: RecommendedAgent[];
  onClose: () => void;
  onLineupsChange: Dispatch<SetStateAction<HeroHallLineupsState>>;
  open: boolean;
}) {
  const catalogHeroAgents = useMemo(
    () =>
      getCatalogHeroAgents().map((enrichedAgent, index) => ({
        agent: enrichedAgent,
        enrichedAgent,
        key: getHeroHallAgentKey(enrichedAgent, enrichedAgent),
        name: enrichedAgent.name || getAgentDisplayName(enrichedAgent),
        reason: String(enrichedAgent.fallbackReason || '').trim(),
        stage: enrichedAgent.stageLabel || getAgentStage(enrichedAgent, index),
      })),
    [],
  );
  const recommendedHeroAgents = useMemo(
    () =>
      agents.filter(hasDisplayableRecommendedAgent).map((agent, index) => {
        const enrichedAgent = enrichDrawAgent(agent);
        const name = enrichedAgent.name || getAgentDisplayName(agent);
        const stage = enrichedAgent.stageLabel || getAgentStage(agent, index);
        const reason = String(agent.reason || enrichedAgent.fallbackReason || '').trim();
        const key = getHeroHallAgentKey(agent, enrichedAgent);

        return {
          agent,
          enrichedAgent,
          key,
          name,
          reason,
          stage,
        };
      }),
    [agents],
  );
  const heroAgents = catalogHeroAgents;
  const lineupAgents = useMemo(() => {
    const seen = new Set<string>();

    return [...recommendedHeroAgents, ...catalogHeroAgents].filter((agent) => {
      if (seen.has(agent.key)) {
        return false;
      }

      seen.add(agent.key);
      return true;
    });
  }, [catalogHeroAgents, recommendedHeroAgents]);
  const agentByKey = useMemo(() => new Map(lineupAgents.map((agent) => [agent.key, agent])), [lineupAgents]);
  const recommendationKey = recommendedHeroAgents
    .map((agent) => `${agent.key}:${normalizeHeroHallLineupId(agent.agent.lineup ?? agent.agent.lineup_id ?? agent.agent.lineupId ?? agent.agent.LINEUP) || ''}`)
    .join('|');
  const [recommendationOverrides, setRecommendationOverrides] = useState<Record<number, string>>({});
  const displayedRecommendedHeroAgents = useMemo(
    () => recommendedHeroAgents.map((agent, index) => agentByKey.get(recommendationOverrides[index]) || agent),
    [agentByKey, recommendationOverrides, recommendedHeroAgents],
  );
  const recommendedLaunchTargets = useMemo(
    () => getAgentLaunchTargets(displayedRecommendedHeroAgents.map((agent) => agent.enrichedAgent)),
    [displayedRecommendedHeroAgents],
  );
  const heroGridRef = useRef<HTMLDivElement | null>(null);
  const recommendationDeckRef = useRef<HTMLOListElement | null>(null);
  const [draggingKey, setDraggingKey] = useState('');
  const [pointerDrag, setPointerDrag] = useState<{ agentKey: string; sourceIndex?: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const incomingLineups = createHeroHallLineupsFromAgents(recommendedHeroAgents);
    onLineupsChange((current) => mergeHeroHallLineups(current, incomingLineups));

    setDraggingKey('');
    setPointerDrag(null);
    setRecommendationOverrides({});
  }, [onLineupsChange, recommendationKey, recommendedHeroAgents]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    heroGridRef.current?.scrollTo({ left: 0, top: 0 });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const resetRecommendationCards = useCallback(() => {
    setRecommendationOverrides({});
  }, []);

  const scrollRecommendationDeck = useCallback((direction: -1 | 1) => {
    const deck = recommendationDeckRef.current;

    if (!deck) {
      return;
    }

    deck.scrollBy({ behavior: 'smooth', left: direction * Math.max(220, deck.clientWidth * 0.72) });
  }, []);

  const replaceRecommendationCard = useCallback(
    (targetIndex: number, agentKey: string, sourceIndex?: number) => {
      if (!agentByKey.has(agentKey) || targetIndex < 0 || targetIndex >= recommendedHeroAgents.length) {
        return;
      }

      setRecommendationOverrides((current) => {
        const nextKeys = recommendedHeroAgents.map((agent, index) => current[index] || agent.key);

        if (sourceIndex !== undefined && sourceIndex >= 0 && sourceIndex < nextKeys.length) {
          const sourceKey = nextKeys[sourceIndex];
          nextKeys[sourceIndex] = nextKeys[targetIndex];
          nextKeys[targetIndex] = sourceKey;
        } else {
          nextKeys[targetIndex] = agentKey;
        }

        return nextKeys.reduce<Record<number, string>>((next, key, index) => {
          if (key !== recommendedHeroAgents[index]?.key) {
            next[index] = key;
          }

          return next;
        }, {});
      });
    },
    [agentByKey, recommendedHeroAgents],
  );

  const handleDragStart = (event: DragEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => {
    setDraggingKey(agentKey);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-hero-agent', JSON.stringify({ agentKey, sourceIndex }));
    event.dataTransfer.setData('text/plain', agentKey);
  };

  useEffect(() => {
    if (!pointerDrag) {
      return undefined;
    }

    const agentKey = pointerDrag.agentKey;
    const handlePointerMove = (event: PointerEvent) => {
      setPointerDrag((current) => (current?.agentKey === agentKey ? { ...current, x: event.clientX, y: event.clientY } : current));
    };
    const handlePointerUp = (event: PointerEvent) => {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.hero-recommendation-card[data-recommendation-index]');
      const targetIndex = Number(dropTarget?.dataset.recommendationIndex);

      if (Number.isFinite(targetIndex)) {
        replaceRecommendationCard(targetIndex, agentKey, pointerDrag.sourceIndex);
      }

      setPointerDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pointerDrag, replaceRecommendationCard]);

  const handlePointerDragStart = (event: ReactPointerEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a')) {
      return;
    }

    setPointerDrag({ agentKey, sourceIndex, x: event.clientX, y: event.clientY });
  };

  const handleRecommendationDrop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const transferPayload = event.dataTransfer.getData('application/x-hero-agent');
    const parsedPayload = safeParseDragPayload(transferPayload);
    const agentKey = parsedPayload?.agentKey || event.dataTransfer.getData('text/plain') || draggingKey;

    replaceRecommendationCard(targetIndex, agentKey, parsedPayload?.sourceIndex);
    setDraggingKey('');
  };

  const pointerDragAgent = pointerDrag ? agentByKey.get(pointerDrag.agentKey) : null;
  const canOpenRecommended = recommendedLaunchTargets.length > 0;

  if (!open || heroAgents.length === 0) {
    return null;
  }

  return (
    <section className="agent-hero-hall" aria-label="智能体英雄殿堂">
      <div className="hero-hall-shell hero-hall-rewrite-shell">
        <header className="hero-hall-header hero-hall-stage">
          <div className="hero-hall-stage-glow" aria-hidden="true" />
          <div className="hero-hall-title hero-hall-stage-copy">
            <span>
              <Crown size={16} />
              AGENT HERO HALL
            </span>
            <h1>智能体英雄殿堂</h1>
            <div className="hero-hall-stage-metrics" aria-label="英雄殿堂状态">
              <span>
                <strong>{heroAgents.length}</strong>
                <em>英雄库存</em>
              </span>
              <span>
                <strong>{displayedRecommendedHeroAgents.length}</strong>
                <em>推荐战队</em>
              </span>
              <span>
                <strong>LIVE</strong>
                <em>可拖拽部署</em>
              </span>
            </div>
          </div>

          <div className="hero-hall-header-actions hero-hall-stage-actions">
            <button disabled={!canOpenRecommended} onClick={() => openAgentLaunchTargets(recommendedLaunchTargets)} type="button">
              <PackageOpen size={16} />
              <span>打开推荐</span>
            </button>
            <button onClick={resetRecommendationCards} type="button">
              <RotateCcw size={16} />
              <span>重置卡牌</span>
            </button>
            <button aria-label="关闭智能体英雄殿堂" className="hero-hall-icon-button" onClick={onClose} type="button">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="hero-hall-body hero-hall-rewrite-body">
          <section className="hero-hall-ranking hero-hall-recommendations hero-hall-deployment" aria-label="智能体推荐战队">
            <div className="hero-hall-section-title">
              <Sparkles size={15} />
              <strong>推荐战队</strong>
              <span>签约落地</span>
            </div>
            <button aria-label="上一组推荐卡牌" className="hero-hall-carousel-button is-prev" onClick={() => scrollRecommendationDeck(-1)} type="button">
              <ChevronLeft size={18} />
            </button>
            <button aria-label="下一组推荐卡牌" className="hero-hall-carousel-button is-next" onClick={() => scrollRecommendationDeck(1)} type="button">
              <ChevronRight size={18} />
            </button>
            <ol className="hero-recommendation-deck hero-deploy-grid" ref={recommendationDeckRef}>
              {displayedRecommendedHeroAgents.map((agent, index) => {
                const displayName = agent.name;
                const displayStage = agent.stage;
                const displayReason = agent.reason;

                return (
                  <li
                    className="hero-recommendation-card hero-deploy-card"
                    data-recommendation-index={index}
                    draggable
                    key={agent.key}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragEnd={() => setDraggingKey('')}
                    onDragStart={(event) => handleDragStart(event, agent.key, index)}
                    onDrop={(event) => handleRecommendationDrop(event, index)}
                    onPointerDown={(event) => handlePointerDragStart(event, agent.key, index)}
                  >
                    <span className="hero-ranking-number">S{String(index + 1).padStart(2, '0')}</span>
                    <span className={`hero-ranking-avatar ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                      {agent.enrichedAgent.avatar ? <img alt="" loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={18} />}
                    </span>
                    <div>
                      <strong title={displayName}>{displayName}</strong>
                      <em title={displayStage}>{displayStage}</em>
                      {displayReason ? <p>{displayReason}</p> : null}
                    </div>
                    {agent.enrichedAgent.launchTarget ? (
                      <a aria-label={`打开${displayName}`} href={agent.enrichedAgent.launchTarget} rel="noopener noreferrer" target="_blank">
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <button aria-label={`替换${displayName}`} type="button">
                        <Plus size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="hero-hall-roster hero-hall-armory" aria-label="智能体英雄库">
            <div className="hero-hall-section-title">
              <Crown size={15} />
              <strong>英雄库</strong>
              <span>{heroAgents.length}</span>
            </div>
            <div className="hero-hall-card-grid hero-armory-grid" ref={heroGridRef}>
              {heroAgents.map((agent, index) => {
                const displayName = heroHallReferenceHeroLabels[index] || agent.name;

                return (
                  <article
                    aria-label={agent.stage ? `${displayName} ${agent.stage}` : displayName}
                    className="hero-agent-card hero-armory-card"
                    draggable
                    key={agent.key}
                    onDragEnd={() => setDraggingKey('')}
                    onDragStart={(event) => handleDragStart(event, agent.key)}
                    onPointerDown={(event) => handlePointerDragStart(event, agent.key)}
                  >
                    <span className="hero-agent-rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`hero-agent-avatar ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                      {agent.enrichedAgent.avatar ? <img alt="" loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={24} />}
                    </span>
                    <strong title={displayName}>{displayName}</strong>
                    <em title={agent.stage}>{agent.stage}</em>
                    <button aria-label={`用${displayName}替换第一张推荐卡牌`} disabled={recommendedHeroAgents.length === 0} onClick={() => replaceRecommendationCard(0, agent.key)} type="button">
                      <Plus size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
        {pointerDrag && pointerDragAgent ? (
          <div className="hero-drag-ghost" style={{ left: pointerDrag.x, top: pointerDrag.y }}>
            <span className={`hero-drag-ghost-avatar ${pointerDragAgent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
              {pointerDragAgent.enrichedAgent.avatar ? <img alt="" src={pointerDragAgent.enrichedAgent.avatar} /> : <Sparkles size={14} />}
            </span>
            <strong>{pointerDragAgent.name}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}
