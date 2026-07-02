import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { Grid3X3, Menu, PackageOpen, Plus, RotateCcw, Search, Sparkles, Star, X } from 'lucide-react';
import { enrichDrawAgent, getAgentLaunchTargets, getCatalogHeroAgents, openAgentLaunchTargets } from '../../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../../types';
import { getAgentDisplayName, getAgentStage, hasDisplayableRecommendedAgent } from '../agents/agentUtils';
import { HeroTeamCarousel } from './HeroTeamCarousel';
import {
  createHeroHallLineupsFromAgents,
  getHeroHallAgentKey,
  mergeHeroHallLineups,
  normalizeHeroHallLineupId,
  type HeroHallLineupsState,
} from './heroHallModel';

type HeroPoolTab = 'all' | 'favorites' | 'created' | 'recent';
type HeroPoolView = 'grid' | 'list';

const heroPoolTabs: Array<{ id: HeroPoolTab; label: string }> = [
  { id: 'all', label: '全部英雄' },
  { id: 'favorites', label: '收藏夹' },
  { id: 'created', label: '我的创建的' },
  { id: 'recent', label: '最近使用' },
];

const heroPoolNames = [
  '战略参谋官',
  '经营罗盘官',
  '决策推演师',
  '竞品情报官',
  '市场洞察官',
  '风险预警官',
  '增长策略官',
  '复盘分析官',
  '用户画像大师',
  '数据分析官',
  '客户分层专家',
  '需求洞察官',
  '私域标签师',
  '客户旅程官',
  '痛点识别官',
  '意向判断官',
  '渠道放大官',
  '成交陪跑官',
  '内容爆破官',
  '组织诊断官',
];

const heroPoolTagMatrix = [
  ['战略推演', '经营决策'],
  ['经营分析', '竞品分析'],
  ['风险识别', '市场判断'],
  ['决策辅助', '战略复盘'],
  ['战略推演', '经营决策'],
  ['经营分析', '竞品分析'],
  ['风险识别', '市场判断'],
  ['决策辅助', '战略复盘'],
  ['画像识别', '销售沟通'],
  ['空间判断', '私域运营'],
  ['需求洞察', '客户分层'],
  ['人群细分', '产品优化'],
  ['画像识别', '销售沟通'],
  ['意向判断', '私域运营'],
  ['需求洞察', '客户分层'],
  ['人群细分', '产品优化'],
];

const abilityOptions = ['全部分类', '战略推演', '经营分析', '风险识别', '决策辅助', '画像识别', '需求洞察', '意向判断'];
const sceneOptions = ['全部场景', '经营决策', '竞品分析', '市场判断', '战略复盘', '销售沟通', '私域运营', '客户分层', '产品优化'];
const dataOptions = ['不限', '数据源支持', '最近调用', '高成功率'];
const heroPoolSuccessRates = ['95.9%', '97.8%', '94%'];

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

function normalizePoolText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function getHeroPoolName(index: number, fallbackName: string) {
  return heroPoolNames[index % heroPoolNames.length] || fallbackName;
}

function getHeroPoolTags(index: number) {
  return heroPoolTagMatrix[index % heroPoolTagMatrix.length] || heroPoolTagMatrix[0];
}

function getHeroPoolUsage(index: number) {
  return (3339 + index * 739).toLocaleString('en-US');
}

function getHeroPoolSuccess(index: number) {
  return heroPoolSuccessRates[index % heroPoolSuccessRates.length];
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
  const catalogDisplayHeroAgents = useMemo(
    () =>
      catalogHeroAgents.map((agent, index) => ({
        ...agent,
        name: getHeroPoolName(index, agent.name),
      })),
    [catalogHeroAgents],
  );
  const lineupAgents = useMemo(() => {
    const seen = new Set<string>();

    return [...catalogDisplayHeroAgents, ...recommendedHeroAgents].filter((agent) => {
      if (seen.has(agent.key)) {
        return false;
      }

      seen.add(agent.key);
      return true;
    });
  }, [catalogDisplayHeroAgents, recommendedHeroAgents]);
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
  const onLineupsChangeRef = useRef(onLineupsChange);
  const heroGridRef = useRef<HTMLDivElement | null>(null);
  const pointerDropHandledRef = useRef(false);
  const pointerDragCleanupRef = useRef<(() => void) | null>(null);
  const replacePulseTimerRef = useRef<number | null>(null);
  const seededFavoritesRef = useRef(false);
  const [draggingKey, setDraggingKey] = useState('');
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{ agentKey: string; sourceIndex?: number; x: number; y: number } | null>(null);
  const [replacePulseIndex, setReplacePulseIndex] = useState<number | null>(null);
  const [favoriteHeroKeys, setFavoriteHeroKeys] = useState<Set<string>>(() => new Set());
  const [heroPoolTab, setHeroPoolTab] = useState<HeroPoolTab>('all');
  const [heroPoolView, setHeroPoolView] = useState<HeroPoolView>('grid');
  const [abilityFilter, setAbilityFilter] = useState('全部分类');
  const [sceneFilter, setSceneFilter] = useState('全部场景');
  const [dataFilter, setDataFilter] = useState('不限');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const heroPoolAgents = useMemo(
    () =>
      heroAgents.map((agent, index) => {
        const displayName = getHeroPoolName(index, agent.name);
        const tags = getHeroPoolTags(index);
        const isFavorite = favoriteHeroKeys.has(agent.key);
        const searchableText = [displayName, agent.name, agent.stage, agent.reason, agent.enrichedAgent.metaLabel, tags.join(' ')]
          .map(normalizePoolText)
          .join(' ');

        return {
          ...agent,
          ability: tags[0],
          displayName,
          isFavorite,
          isRecent: index < 8 || index % 9 === 0,
          isUserCreated: index % 6 === 0 || index % 10 === 3,
          scene: tags[1],
          searchableText,
          success: getHeroPoolSuccess(index),
          tags,
          usage: getHeroPoolUsage(index),
        };
      }),
    [favoriteHeroKeys, heroAgents],
  );

  const filteredHeroPoolAgents = useMemo(() => {
    const query = normalizePoolText(searchQuery);

    return heroPoolAgents.filter((agent) => {
      if (heroPoolTab === 'favorites' && !agent.isFavorite) {
        return false;
      }

      if (heroPoolTab === 'created' && !agent.isUserCreated) {
        return false;
      }

      if (heroPoolTab === 'recent' && !agent.isRecent) {
        return false;
      }

      if (availableOnly && !agent.enrichedAgent.canOpen) {
        return false;
      }

      if (abilityFilter !== '全部分类' && !agent.tags.includes(abilityFilter)) {
        return false;
      }

      if (sceneFilter !== '全部场景' && !agent.tags.includes(sceneFilter)) {
        return false;
      }

      if (dataFilter === '数据源支持' && !agent.enrichedAgent.metaLabel) {
        return false;
      }

      if (dataFilter === '最近调用' && !agent.isRecent) {
        return false;
      }

      if (dataFilter === '高成功率' && agent.success !== '97.8%') {
        return false;
      }

      return !query || agent.searchableText.includes(query);
    });
  }, [abilityFilter, availableOnly, dataFilter, heroPoolAgents, heroPoolTab, sceneFilter, searchQuery]);

  useEffect(() => {
    onLineupsChangeRef.current = onLineupsChange;
  }, [onLineupsChange]);

  useEffect(() => {
    const incomingLineups = createHeroHallLineupsFromAgents(recommendedHeroAgents);
    onLineupsChangeRef.current((current) => mergeHeroHallLineups(current, incomingLineups));

    setDraggingKey('');
    setPointerDrag(null);
    setRecommendationOverrides({});
  }, [recommendationKey, recommendedHeroAgents]);

  useEffect(() => {
    if (!open || seededFavoritesRef.current || heroAgents.length === 0) {
      return;
    }

    seededFavoritesRef.current = true;
    setFavoriteHeroKeys(new Set(heroAgents.filter((_, index) => index % 7 === 1 || index % 11 === 0).map((agent) => agent.key)));
  }, [heroAgents, open]);

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

  useEffect(() => {
    heroGridRef.current?.scrollTo({ left: 0, top: 0 });
  }, [abilityFilter, availableOnly, dataFilter, heroPoolTab, heroPoolView, sceneFilter, searchQuery]);

  useEffect(
    () => () => {
      if (replacePulseTimerRef.current !== null) {
        window.clearTimeout(replacePulseTimerRef.current);
      }
      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;
    },
    [],
  );

  const resetRecommendationCards = useCallback(() => {
    setRecommendationOverrides({});
  }, []);

  const toggleFavoriteHero = useCallback((agentKey: string) => {
    setFavoriteHeroKeys((current) => {
      const next = new Set(current);

      if (next.has(agentKey)) {
        next.delete(agentKey);
      } else {
        next.add(agentKey);
      }

      return next;
    });
  }, []);

  const replaceRecommendationCard = useCallback(
    (targetIndex: number, agentKey: string, sourceIndex?: number) => {
      if (!agentByKey.has(agentKey) || targetIndex < 0 || targetIndex >= recommendedHeroAgents.length) {
        return;
      }

      setReplacePulseIndex(targetIndex);
      if (replacePulseTimerRef.current !== null) {
        window.clearTimeout(replacePulseTimerRef.current);
      }
      replacePulseTimerRef.current = window.setTimeout(() => {
        setReplacePulseIndex(null);
        replacePulseTimerRef.current = null;
      }, 680);

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
    setDropTargetIndex(sourceIndex ?? null);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('application/x-hero-agent', JSON.stringify({ agentKey, sourceIndex }));
    event.dataTransfer.setData('text/plain', agentKey);
  };

  const clearDragState = useCallback(() => {
    setDraggingKey('');
    setDropTargetIndex(null);
  }, []);

  const handleRecommendationDragOver = useCallback((event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTargetIndex(targetIndex);
  }, []);

  const handleRecommendationDragLeave = useCallback((event: DragEvent<HTMLElement>, targetIndex: number) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropTargetIndex((current) => (current === targetIndex ? null : current));
  }, []);

  const handlePointerDragStart = (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, agentKey: string, sourceIndex?: number) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, input, select, label')) {
      return;
    }

    event.preventDefault();
    pointerDragCleanupRef.current?.();
    pointerDragCleanupRef.current = null;
    pointerDropHandledRef.current = false;
    setDraggingKey(agentKey);
    setDropTargetIndex(sourceIndex ?? null);
    setPointerDrag({ agentKey, sourceIndex, x: event.clientX, y: event.clientY });

    const pointerId = 'pointerId' in event ? event.pointerId : null;
    if ('pointerId' in event) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    const resolveDropTargetIndex = (clientX: number, clientY: number) => {
      const dropTarget = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.hero-recommendation-card[data-recommendation-index]');
      const targetIndex = Number(dropTarget?.dataset.recommendationIndex);
      return Number.isFinite(targetIndex) ? targetIndex : null;
    };

    const isSamePointer = (nativeEvent: PointerEvent | MouseEvent) => !('pointerId' in nativeEvent) || pointerId === null || nativeEvent.pointerId === pointerId;
    const handlePointerMove = (nativeEvent: PointerEvent | MouseEvent) => {
      if (!isSamePointer(nativeEvent)) {
        return;
      }

      nativeEvent.preventDefault();
      setPointerDrag({ agentKey, sourceIndex, x: nativeEvent.clientX, y: nativeEvent.clientY });
      setDropTargetIndex(resolveDropTargetIndex(nativeEvent.clientX, nativeEvent.clientY));
    };
    const handlePointerUp = (nativeEvent: PointerEvent | MouseEvent) => {
      if (!isSamePointer(nativeEvent) || pointerDropHandledRef.current) {
        return;
      }

      nativeEvent.preventDefault();
      pointerDropHandledRef.current = true;
      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;

      const targetIndex = resolveDropTargetIndex(nativeEvent.clientX, nativeEvent.clientY);
      if (targetIndex !== null) {
        replaceRecommendationCard(targetIndex, agentKey, sourceIndex);
      }

      setPointerDrag(null);
      clearDragState();
    };
    const handlePointerCancel = (nativeEvent: PointerEvent | MouseEvent) => {
      if (!isSamePointer(nativeEvent)) {
        return;
      }

      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;
      setPointerDrag(null);
      clearDragState();
    };
    const cleanupPointerDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };

    pointerDragCleanupRef.current = cleanupPointerDrag;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', handlePointerCancel, { passive: false });
    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp, { passive: false });
  };

  const handleRecommendationDrop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const transferPayload = event.dataTransfer.getData('application/x-hero-agent');
    const parsedPayload = safeParseDragPayload(transferPayload);
    const agentKey = parsedPayload?.agentKey || event.dataTransfer.getData('text/plain') || draggingKey;

    replaceRecommendationCard(targetIndex, agentKey, parsedPayload?.sourceIndex);
    clearDragState();
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
            <h1>智能体英雄殿堂</h1>
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
          <HeroTeamCarousel
            agents={displayedRecommendedHeroAgents}
            draggingAgentKey={draggingKey}
            dropTargetIndex={dropTargetIndex}
            focusResetKey={recommendationKey}
            onAgentDragLeave={handleRecommendationDragLeave}
            onAgentDragOver={handleRecommendationDragOver}
            onAgentDragStart={handleDragStart}
            onAgentDrop={handleRecommendationDrop}
            onDragEnd={clearDragState}
            onPointerDragStart={handlePointerDragStart}
            replacePulseIndex={replacePulseIndex}
          />

          <section className="hero-hall-roster hero-hall-armory hero-pool" aria-label="智能体英雄池">
            <div className="hero-pool-topbar">
              <div className="hero-pool-heading">
                <h2>英雄池</h2>
                <p>
                  从 <strong>{heroAgents.length}</strong> 位智能体中选择、收藏或加入组合。
                </p>
              </div>

              <nav className="hero-pool-tabs" aria-label="英雄池分类">
                {heroPoolTabs.map((tab) => (
                  <button aria-pressed={heroPoolTab === tab.id} key={tab.id} onClick={() => setHeroPoolTab(tab.id)} type="button">
                    {tab.label}
                  </button>
                ))}
              </nav>

              <label className="hero-pool-search">
                <Search size={15} aria-hidden="true" />
                <input onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索智能体名称或能力..." type="search" value={searchQuery} />
              </label>

              <div className="hero-pool-view-switch" aria-label="英雄池视图">
                <button aria-label="网格视图" aria-pressed={heroPoolView === 'grid'} onClick={() => setHeroPoolView('grid')} type="button">
                  <Grid3X3 size={15} />
                </button>
                <button aria-label="列表视图" aria-pressed={heroPoolView === 'list'} onClick={() => setHeroPoolView('list')} type="button">
                  <Menu size={16} />
                </button>
              </div>
            </div>

            <div className="hero-pool-layout">
              <aside className="hero-pool-filter" aria-label="英雄池筛选">
                <strong>筛选</strong>
                <label>
                  <span>能力类别</span>
                  <select onChange={(event) => setAbilityFilter(event.target.value)} value={abilityFilter}>
                    {abilityOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>适用场景</span>
                  <select onChange={(event) => setSceneFilter(event.target.value)} value={sceneFilter}>
                    {sceneOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>数据源支持</span>
                  <select onChange={(event) => setDataFilter(event.target.value)} value={dataFilter}>
                    {dataOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="hero-pool-checkbox">
                  <span>只看可用</span>
                  <input checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} type="checkbox" />
                </label>
              </aside>

              <div className={`hero-hall-card-grid hero-armory-grid hero-pool-grid is-${heroPoolView}`} ref={heroGridRef}>
                {filteredHeroPoolAgents.length > 0 ? (
                  filteredHeroPoolAgents.map((agent) => (
                    <article
                      aria-label={agent.stage ? `${agent.displayName} ${agent.stage}` : agent.displayName}
                      className={`hero-agent-card hero-armory-card hero-pool-card ${agent.isFavorite ? 'is-favorite' : ''} ${draggingKey === agent.key ? 'is-drag-source' : ''}`}
                      draggable={false}
                      key={agent.key}
                      onDoubleClick={() => replaceRecommendationCard(0, agent.key)}
                      onDragEnd={() => setDraggingKey('')}
                      onDragStart={(event) => handleDragStart(event, agent.key)}
                      onMouseDown={(event) => handlePointerDragStart(event, agent.key)}
                      onPointerDown={(event) => handlePointerDragStart(event, agent.key)}
                    >
                      <button
                        aria-label={agent.isFavorite ? `取消收藏${agent.displayName}` : `收藏${agent.displayName}`}
                        className="hero-pool-favorite"
                        onClick={() => toggleFavoriteHero(agent.key)}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        <Star size={15} />
                      </button>
                      <span className={`hero-agent-avatar ${agent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
                        {agent.enrichedAgent.avatar ? <img alt="" draggable={false} loading="lazy" src={agent.enrichedAgent.avatar} /> : <Sparkles size={24} />}
                      </span>
                      <div className="hero-pool-card-body">
                        <strong title={agent.displayName}>{agent.displayName}</strong>
                        <div className="hero-pool-card-tags" aria-label="能力标签">
                          {agent.tags.map((tag) => (
                            <em key={tag}>{tag}</em>
                          ))}
                        </div>
                      </div>
                      <dl className="hero-pool-card-stats">
                        <div>
                          <dt>调用量</dt>
                          <dd>{agent.usage}</dd>
                        </div>
                        <div>
                          <dt>成功率</dt>
                          <dd>{agent.success}</dd>
                        </div>
                      </dl>
                      <button
                        aria-label={`用${agent.displayName}替换第一张推荐卡牌`}
                        className="hero-pool-add"
                        disabled={recommendedHeroAgents.length === 0}
                        onClick={() => replaceRecommendationCard(0, agent.key)}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        <Plus size={13} />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="hero-pool-empty">
                    <Sparkles size={20} />
                    <strong>没有匹配的英雄</strong>
                    <span>换一个筛选条件试试。</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
        {pointerDrag && pointerDragAgent ? (
          <div className="hero-drag-ghost" style={{ left: pointerDrag.x, top: pointerDrag.y }}>
            <span className={`hero-drag-ghost-avatar ${pointerDragAgent.enrichedAgent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
              {pointerDragAgent.enrichedAgent.avatar ? <img alt="" draggable={false} src={pointerDragAgent.enrichedAgent.avatar} /> : <Sparkles size={14} />}
            </span>
            <strong>{pointerDragAgent.name}</strong>
          </div>
        ) : null}
      </div>
    </section>
  );
}
