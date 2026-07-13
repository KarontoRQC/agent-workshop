import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Sparkles } from 'lucide-react';
import {
  enrichDrawAgent,
  type EnrichedDrawAgent,
  getAgentCombinationEntryUrl,
  getAgentLaunchTargets,
  getCatalogHeroAgents,
  openAgentLaunchTargets,
  setAgentCatalogAgents,
} from '../../lib/agentLaunchCatalog';
import { fetchAgentCatalog } from '../../lib/agentCatalogClient';
import { fetchCombinationAgentByRecommendation, saveCombinationAgentForRecommendation } from '../../lib/combinationAgentClient';
import { fetchRecommendationSnapshot } from '../../lib/recommendationSnapshotClient';
import { hasRecommendationEditAccess } from '../../lib/recommendationEditAccess';
import type { AgentCatalogItem, CombinationAgent, RecommendationSnapshot, RecommendedAgent } from '../../types';
import { shouldPollRecommendationSnapshot, snapshotToRecommendedAgents } from '../workflow/recommendationSnapshotModel';
import {
  AgentCardSection,
  AgentCombinationHero,
  AgentLineupBuilder,
  RecommendedAgentsAction,
  SceneSection,
  StatusPanel,
} from './AgentCombinationEntrySections';
import {
  calculateAgentLineupScore,
  createInitialLineupKeys,
  createSceneCards,
  getAgentCombinationKey,
  getEntryTitle,
  getSnapshotStatusText,
  padLineupKeys,
} from './agentCombinationEntryModel';
import { AgentCombinationShare } from './AgentCombinationShare';
import './AgentCombinationEntryPage.css';

const POLL_INTERVAL_MS = 2000;

type LineupDragPayload = {
  agentKey: string;
  sourceSlotIndex?: number;
};

type SaveLineupStatus = 'idle' | 'saving' | 'saved' | 'error';

function safeParseLineupDragPayload(value: string): LineupDragPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { agentKey?: unknown; sourceSlotIndex?: unknown };
    const agentKey = typeof parsed.agentKey === 'string' ? parsed.agentKey : '';
    const sourceSlotIndex = typeof parsed.sourceSlotIndex === 'number' ? parsed.sourceSlotIndex : undefined;

    return agentKey ? { agentKey, sourceSlotIndex } : null;
  } catch {
    return null;
  }
}

function getSavedCombinationLineupAgents(
  combinationAgent: CombinationAgent | null,
  snapshot: RecommendationSnapshot | null,
): Array<RecommendedAgent | null> {
  const combinationLineup = Array.isArray(combinationAgent?.lineup) ? combinationAgent.lineup : [];

  if (combinationLineup.some(Boolean)) {
    return combinationLineup;
  }

  return Array.isArray(snapshot?.saved_lineup) ? snapshot.saved_lineup : [];
}

function getLineupSignature(lineupKeys: string[]) {
  return padLineupKeys(lineupKeys).join('|');
}

function getLineupSignatureFromAgents(agents: Array<EnrichedDrawAgent | null>) {
  return getLineupSignature(agents.map((agent) => (agent ? getAgentCombinationKey(agent) : '')));
}

function uniqueSavedLineupAgents(agents: Array<EnrichedDrawAgent | null>) {
  const seenKeys = new Set<string>();

  return padLineupKeys(agents.map((agent) => (agent ? getAgentCombinationKey(agent) : ''))).map((key, index) => {
    if (!key || seenKeys.has(key)) {
      return null;
    }

    seenKeys.add(key);
    return agents[index] || null;
  });
}

function createSavedLineupAgent(agent: EnrichedDrawAgent, slotIndex: number): RecommendedAgent {
  const agentId = String(agent.agent_id || agent.id || agent.agentKey || '').trim();
  const launchTarget = String(agent.launchTarget || agent.launch_url || agent.endpoint || agent.url || agent.link || '').trim();
  const stage = String(agent.stage || agent.stageLabel || agent.function || agent.type || '').trim();
  const reason = String(agent.reason || agent.fallbackReason || agent.description || '').trim();

  return {
    ...agent,
    agent_id: agentId,
    agent_index: typeof agent.agent_index === 'number' ? agent.agent_index : slotIndex,
    agent_name: agent.name,
    avatar_url: agent.avatar,
    description: reason,
    endpoint: launchTarget,
    id: agentId,
    launch_url: launchTarget,
    link: launchTarget,
    name: agent.name,
    rank: slotIndex + 1,
    reason,
    source: String(agent.source || 'combination_agent'),
    stage,
    streamStatus: 'completed',
    tags: Array.isArray(agent.tags) ? agent.tags : [],
    url: launchTarget,
  };
}

export function AgentCombinationEntryPage({ recommendationId }: { recommendationId: string }) {
  const canEditLineup = useMemo(() => hasRecommendationEditAccess(recommendationId), [recommendationId]);
  const [snapshot, setSnapshot] = useState<RecommendationSnapshot | null>(null);
  const [combinationAgent, setCombinationAgent] = useState<CombinationAgent | null>(null);
  const [catalogAgents, setCatalogAgents] = useState<AgentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState('');
  const seededLineupSignatureRef = useRef('');
  const pointerDropHandledRef = useRef(false);
  const pointerDragCleanupRef = useRef<(() => void) | null>(null);
  const lastSavedLineupSignatureRef = useRef('');
  const [lineupKeys, setLineupKeys] = useState<string[]>(() => padLineupKeys([]));
  const [dragPayload, setDragPayload] = useState<LineupDragPayload | null>(null);
  const [dropSlotIndex, setDropSlotIndex] = useState<number | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{ agentKey: string; x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveLineupStatus>('idle');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const loadCatalog = async () => {
      try {
        const agents = await fetchAgentCatalog(controller.signal);
        setAgentCatalogAgents(agents);
        setCatalogAgents(agents);
      } catch (nextError) {
        if (!controller.signal.aborted) {
          console.warn('Agent catalog request failed.', nextError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timeoutId: number | null = null;
    let cancelled = false;

    setSnapshot(null);
    setError('');
    setLoading(true);
    setLineupKeys(padLineupKeys([]));
    setSaveStatus('idle');
    setSaveError('');
    seededLineupSignatureRef.current = '';
    lastSavedLineupSignatureRef.current = '';

    const loadSnapshot = async () => {
      try {
        const nextSnapshot = await fetchRecommendationSnapshot(recommendationId, controller.signal);

        if (cancelled) {
          return;
        }

        setSnapshot(nextSnapshot);
        setError('');
        setLoading(false);

        if (shouldPollRecommendationSnapshot(nextSnapshot)) {
          timeoutId = window.setTimeout(loadSnapshot, POLL_INTERVAL_MS);
        }
      } catch (nextError) {
        if (controller.signal.aborted || cancelled) {
          return;
        }

        setSnapshot(null);
        setError(nextError instanceof Error ? nextError.message : '推荐组合读取失败');
        setLoading(false);
      }
    };

    void loadSnapshot();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [recommendationId]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setCombinationAgent(null);

    const loadCombinationAgent = async () => {
      try {
        const nextCombinationAgent = await fetchCombinationAgentByRecommendation(recommendationId, controller.signal);

        if (!cancelled) {
          setCombinationAgent(nextCombinationAgent);
        }
      } catch (nextError) {
        if (!controller.signal.aborted && !cancelled) {
          console.warn('Combination agent request failed.', nextError);
        }
      }
    };

    void loadCombinationAgent();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [recommendationId]);

  const recommendedAgents = useMemo(() => snapshotToRecommendedAgents(snapshot).map(enrichDrawAgent), [catalogAgents, snapshot]);
  const savedLineupAgents = useMemo(() => {
    const enrichedSavedAgents = getSavedCombinationLineupAgents(combinationAgent, snapshot).map((agent) => (agent ? enrichDrawAgent(agent) : null));

    return uniqueSavedLineupAgents(enrichedSavedAgents);
  }, [catalogAgents, combinationAgent, snapshot]);
  const savedLineupCandidateAgents = useMemo(
    () => savedLineupAgents.filter((agent): agent is EnrichedDrawAgent => Boolean(agent)),
    [savedLineupAgents],
  );
  const catalogHeroAgents = useMemo(() => getCatalogHeroAgents(catalogAgents), [catalogAgents]);
  const visibleCatalogAgents = useMemo(() => {
    const recommendedIds = new Set(recommendedAgents.map((agent) => String(agent.id || agent.agent_id || agent.name)));

    return catalogHeroAgents.filter((agent) => !recommendedIds.has(String(agent.id || agent.agent_id || agent.name))).slice(0, 48);
  }, [catalogHeroAgents, recommendedAgents]);
  const sceneCards = useMemo(() => createSceneCards(catalogHeroAgents), [catalogHeroAgents]);
  const recommendedLaunchTargets = useMemo(() => getAgentLaunchTargets(recommendedAgents), [recommendedAgents]);
  const lineupCandidateAgents = useMemo(() => {
    const seen = new Set<string>();

    return [...recommendedAgents, ...savedLineupCandidateAgents, ...visibleCatalogAgents].filter((agent) => {
      const key = getAgentCombinationKey(agent);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [recommendedAgents, savedLineupCandidateAgents, visibleCatalogAgents]);
  const lineupCandidateByKey = useMemo(() => new Map(lineupCandidateAgents.map((agent) => [getAgentCombinationKey(agent), agent])), [lineupCandidateAgents]);
  const recommendedAgentKeys = useMemo(() => new Set(recommendedAgents.map(getAgentCombinationKey)), [recommendedAgents]);
  const recommendedLineupSignature = useMemo(() => recommendedAgents.map(getAgentCombinationKey).join('|'), [recommendedAgents]);
  const savedLineupSignature = useMemo(() => getLineupSignatureFromAgents(savedLineupAgents), [savedLineupAgents]);
  const hasSavedLineup = useMemo(() => savedLineupAgents.some(Boolean), [savedLineupAgents]);
  const lineupAgents = useMemo(
    () => padLineupKeys(lineupKeys).map((key) => (key ? lineupCandidateByKey.get(key) || null : null)),
    [lineupCandidateByKey, lineupKeys],
  );
  const filledLineupAgents = useMemo(() => lineupAgents.filter((agent): agent is EnrichedDrawAgent => Boolean(agent)), [lineupAgents]);
  const selectedLineupAgentKeys = useMemo(() => new Set(lineupKeys.filter(Boolean)), [lineupKeys]);
  const currentLineupSignature = useMemo(() => getLineupSignature(lineupKeys), [lineupKeys]);
  const lineupScore = useMemo(() => calculateAgentLineupScore(filledLineupAgents, { recommendedAgentKeys }), [filledLineupAgents, recommendedAgentKeys]);
  const lineupLaunchTargets = useMemo(() => getAgentLaunchTargets(filledLineupAgents), [filledLineupAgents]);
  const statusText = getSnapshotStatusText({ catalogLoading, error, loading, snapshot });
  const entryTitle = getEntryTitle(snapshot);
  const shareUrl = useMemo(() => getAgentCombinationEntryUrl(recommendationId), [recommendationId]);
  const canOpenRecommendedAgents = recommendedLaunchTargets.length > 0;
  const canOpenLineupAgents = lineupLaunchTargets.length > 0;
  const canSaveLineup = canEditLineup && filledLineupAgents.length > 0 && !loading && !error;
  const isPersistedLineup = hasSavedLineup && currentLineupSignature === savedLineupSignature;
  const isLineupSaved = isPersistedLineup || (saveStatus === 'saved' && currentLineupSignature === (lastSavedLineupSignatureRef.current || savedLineupSignature));
  const saveButtonLabel = !canEditLineup ? '分享只读' : saveStatus === 'saving' ? '保存中' : isLineupSaved ? '已保存' : '保存阵容';
  const saveFeedbackText = !canEditLineup
    ? '此分享页可查看和打开，阵容仅创建者可修改'
    : saveStatus === 'error'
      ? saveError
      : isLineupSaved
        ? '当前组合已保存到组合智能体服务'
        : '';

  useEffect(() => {
    if (hasSavedLineup) {
      if (seededLineupSignatureRef.current !== `saved:${savedLineupSignature}`) {
        seededLineupSignatureRef.current = `saved:${savedLineupSignature}`;
        lastSavedLineupSignatureRef.current = savedLineupSignature;
        setLineupKeys(padLineupKeys(savedLineupAgents.map((agent) => (agent ? getAgentCombinationKey(agent) : ''))));
        setSaveStatus('saved');
        setSaveError('');
      }

      return;
    }

    if (!recommendedLineupSignature || seededLineupSignatureRef.current === `recommended:${recommendedLineupSignature}`) {
      return;
    }

    seededLineupSignatureRef.current = `recommended:${recommendedLineupSignature}`;
    setLineupKeys(createInitialLineupKeys(recommendedAgents));
  }, [hasSavedLineup, recommendedAgents, recommendedLineupSignature, savedLineupAgents, savedLineupSignature]);

  useEffect(() => {
    if (saveStatus === 'saving') {
      return;
    }

    const savedSignature = lastSavedLineupSignatureRef.current || savedLineupSignature;

    if ((saveStatus === 'saved' || saveStatus === 'error') && currentLineupSignature !== savedSignature) {
      setSaveStatus('idle');
      setSaveError('');
    }
  }, [currentLineupSignature, saveStatus, savedLineupSignature]);

  useEffect(
    () => () => {
      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;
    },
    [],
  );

  const openRecommendedAgents = useCallback(() => {
    void openAgentLaunchTargets(recommendedLaunchTargets);
  }, [recommendedLaunchTargets]);

  const openLineupAgents = useCallback(() => {
    void openAgentLaunchTargets(lineupLaunchTargets);
  }, [lineupLaunchTargets]);

  const saveCurrentLineup = useCallback(async () => {
    if (!canSaveLineup || saveStatus === 'saving') {
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      const savedLineup = lineupAgents.map((agent, index) => (agent ? createSavedLineupAgent(agent, index) : null));
      const updatedCombinationAgent = await saveCombinationAgentForRecommendation(recommendationId, {
        lineup: savedLineup,
        score: lineupScore as unknown as Record<string, unknown>,
        title: entryTitle,
      });

      lastSavedLineupSignatureRef.current = currentLineupSignature;
      setCombinationAgent(updatedCombinationAgent);
      setSaveStatus('saved');
    } catch (nextError) {
      setSaveError(nextError instanceof Error ? nextError.message : '组合智能体保存失败');
      setSaveStatus('error');
    }
  }, [canSaveLineup, currentLineupSignature, entryTitle, lineupAgents, lineupScore, recommendationId, saveStatus]);

  const clearLineupDragState = useCallback(() => {
    setDragPayload(null);
    setDropSlotIndex(null);
    setPointerDrag(null);
  }, []);

  const addAgentToLineup = useCallback(
    (agentKey: string) => {
      if (!canEditLineup || !lineupCandidateByKey.has(agentKey)) {
        return;
      }

      setLineupKeys((current) => {
        const next = padLineupKeys(current);

        if (next.includes(agentKey)) {
          return next;
        }

        const emptyIndex = next.findIndex((key) => !key);
        next[emptyIndex >= 0 ? emptyIndex : next.length - 1] = agentKey;

        return next;
      });
    },
    [canEditLineup, lineupCandidateByKey],
  );

  const clearLineup = useCallback(() => {
    if (!canEditLineup) {
      return;
    }

    setLineupKeys(padLineupKeys([]));
  }, [canEditLineup]);

  const removeLineupSlot = useCallback((slotIndex: number) => {
    if (!canEditLineup) {
      return;
    }

    setLineupKeys((current) => {
      const next = padLineupKeys(current);
      next[slotIndex] = '';

      return next;
    });
  }, [canEditLineup]);

  const commitLineupDrop = useCallback(
    (payload: LineupDragPayload, targetSlotIndex: number) => {
      if (!canEditLineup || !payload.agentKey || !lineupCandidateByKey.has(payload.agentKey)) {
        return;
      }

      setLineupKeys((current) => {
        const next = padLineupKeys(current);

        if (typeof payload.sourceSlotIndex === 'number' && payload.sourceSlotIndex >= 0 && payload.sourceSlotIndex < next.length) {
          const sourceKey = next[payload.sourceSlotIndex];
          next[payload.sourceSlotIndex] = next[targetSlotIndex];
          next[targetSlotIndex] = sourceKey || payload.agentKey;
          return next;
        }

        const previousIndex = next.indexOf(payload.agentKey);
        if (previousIndex >= 0) {
          next[previousIndex] = next[targetSlotIndex];
        }

        next[targetSlotIndex] = payload.agentKey;
        return next;
      });
    },
    [canEditLineup, lineupCandidateByKey],
  );

  const setLineupDragTransfer = (event: DragEvent<HTMLElement>, payload: LineupDragPayload) => {
    setDragPayload(payload);
    event.dataTransfer.effectAllowed = payload.sourceSlotIndex === undefined ? 'copyMove' : 'move';
    event.dataTransfer.setData('application/x-agent-lineup', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', payload.agentKey);
  };

  const handleCandidateDragStart = useCallback((event: DragEvent<HTMLElement>, agentKey: string) => {
    if (!canEditLineup) {
      event.preventDefault();
      return;
    }

    setLineupDragTransfer(event, { agentKey });
  }, [canEditLineup]);

  const handleSlotDragStart = useCallback((event: DragEvent<HTMLElement>, agentKey: string, sourceSlotIndex: number) => {
    if (!canEditLineup) {
      event.preventDefault();
      return;
    }

    setLineupDragTransfer(event, { agentKey, sourceSlotIndex });
    setDropSlotIndex(sourceSlotIndex);
  }, [canEditLineup]);

  const handleSlotDragOver = useCallback((event: DragEvent<HTMLElement>, slotIndex: number) => {
    if (!canEditLineup) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = dragPayload?.sourceSlotIndex === undefined ? 'copy' : 'move';
    setDropSlotIndex(slotIndex);
  }, [canEditLineup, dragPayload?.sourceSlotIndex]);

  const handleSlotDragLeave = useCallback((event: DragEvent<HTMLElement>, slotIndex: number) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropSlotIndex((current) => (current === slotIndex ? null : current));
  }, []);

  const handleSlotDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetSlotIndex: number) => {
      if (!canEditLineup) {
        return;
      }

      event.preventDefault();
      const transferPayload = event.dataTransfer.getData('application/x-agent-lineup');
      const parsedPayload = safeParseLineupDragPayload(transferPayload);
      const agentKey = parsedPayload?.agentKey || event.dataTransfer.getData('text/plain') || dragPayload?.agentKey || '';
      const sourceSlotIndex = parsedPayload?.sourceSlotIndex ?? dragPayload?.sourceSlotIndex;

      if (!agentKey || !lineupCandidateByKey.has(agentKey)) {
        clearLineupDragState();
        return;
      }

      commitLineupDrop({ agentKey, sourceSlotIndex }, targetSlotIndex);
      clearLineupDragState();
    },
    [canEditLineup, clearLineupDragState, commitLineupDrop, dragPayload, lineupCandidateByKey],
  );

  const handleLineupPointerDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>, payload: LineupDragPayload) => {
      if (!canEditLineup || event.button !== 0 || (event.target as HTMLElement).closest('a, input, select, label, .agent-combination-slot-actions')) {
        return;
      }

      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;
      pointerDropHandledRef.current = false;
      setDragPayload(payload);
      setDropSlotIndex(payload.sourceSlotIndex ?? null);
      setPointerDrag({ agentKey: payload.agentKey, x: event.clientX, y: event.clientY });

      const pointerId = 'pointerId' in event ? event.pointerId : null;
      if ('pointerId' in event) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }

      const resolveDropSlotIndex = (clientX: number, clientY: number) => {
        const dropTarget = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.agent-combination-lineup-slot[data-slot-index]');
        const targetIndex = Number(dropTarget?.dataset.slotIndex);
        return Number.isFinite(targetIndex) ? targetIndex : null;
      };

      const isSamePointer = (nativeEvent: PointerEvent | MouseEvent) => !('pointerId' in nativeEvent) || pointerId === null || nativeEvent.pointerId === pointerId;
      const handlePointerMove = (nativeEvent: PointerEvent | MouseEvent) => {
        if (!isSamePointer(nativeEvent)) {
          return;
        }

        nativeEvent.preventDefault();
        setPointerDrag({ agentKey: payload.agentKey, x: nativeEvent.clientX, y: nativeEvent.clientY });
        setDropSlotIndex(resolveDropSlotIndex(nativeEvent.clientX, nativeEvent.clientY));
      };
      const handlePointerUp = (nativeEvent: PointerEvent | MouseEvent) => {
        if (!isSamePointer(nativeEvent) || pointerDropHandledRef.current) {
          return;
        }

        nativeEvent.preventDefault();
        pointerDropHandledRef.current = true;
        pointerDragCleanupRef.current?.();
        pointerDragCleanupRef.current = null;

        const targetSlotIndex = resolveDropSlotIndex(nativeEvent.clientX, nativeEvent.clientY);
        if (targetSlotIndex !== null) {
          commitLineupDrop(payload, targetSlotIndex);
        }

        clearLineupDragState();
      };
      const handlePointerCancel = (nativeEvent: PointerEvent | MouseEvent) => {
        if (!isSamePointer(nativeEvent)) {
          return;
        }

        pointerDragCleanupRef.current?.();
        pointerDragCleanupRef.current = null;
        clearLineupDragState();
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
    },
    [canEditLineup, clearLineupDragState, commitLineupDrop],
  );

  return (
    <main className="agent-combination-entry-page">
      <div className="agent-combination-entry-frame">
        <AgentCombinationHero
          entryTitle={entryTitle}
          leadAgent={recommendedAgents[0]}
          loading={loading || catalogLoading}
          recommendedCount={recommendedAgents.length || 0}
          sceneCount={sceneCards.length || 0}
          shareControl={<AgentCombinationShare entryTitle={entryTitle} recommendationId={recommendationId} shareUrl={shareUrl} />}
          statusText={statusText}
        />

        {error ? (
          <StatusPanel title="推荐组合读取失败" text={error} />
        ) : loading ? (
          <StatusPanel title="正在读取推荐组合" text="页面会按地址里的 id 请求推荐快照接口。" />
        ) : null}

        {sceneCards.length > 0 ? <SceneSection scenes={sceneCards} /> : null}

        {recommendedAgents.length > 0 ? (
          <AgentCardSection
            agents={recommendedAgents}
            footerAction={
              <RecommendedAgentsAction
                canOpen={canOpenRecommendedAgents}
                launchTargetCount={recommendedLaunchTargets.length}
                onOpen={openRecommendedAgents}
              />
            }
            title="推荐智能体"
            variant="recommended"
          />
        ) : !error && !loading ? (
          <StatusPanel title="推荐组合生成中" text="当前快照还没有可打开的智能体链接，稍后会自动更新。" />
        ) : null}

        {lineupCandidateAgents.length > 0 ? (
          <AgentLineupBuilder
            canOpenLineup={canOpenLineupAgents}
            canSaveLineup={canSaveLineup}
            candidateAgents={lineupCandidateAgents}
            dropSlotIndex={dropSlotIndex}
            isEditable={canEditLineup}
            isLineupSaved={isLineupSaved}
            lineupLaunchTargetCount={lineupLaunchTargets.length}
            lineupAgents={lineupAgents}
            onAddAgent={addAgentToLineup}
            onCandidateDragStart={handleCandidateDragStart}
            onCandidatePointerDragStart={(event, agentKey) => handleLineupPointerDragStart(event, { agentKey })}
            onClearLineup={clearLineup}
            onDragEnd={clearLineupDragState}
            onOpenLineup={openLineupAgents}
            onRemoveSlot={removeLineupSlot}
            onSaveLineup={saveCurrentLineup}
            onSlotDragLeave={handleSlotDragLeave}
            onSlotDragOver={handleSlotDragOver}
            onSlotDragStart={handleSlotDragStart}
            onSlotDrop={handleSlotDrop}
            onSlotPointerDragStart={(event, agentKey, sourceSlotIndex) => handleLineupPointerDragStart(event, { agentKey, sourceSlotIndex })}
            recommendedAgentKeys={recommendedAgentKeys}
            saveButtonLabel={saveButtonLabel}
            saveFeedbackText={saveFeedbackText}
            saveStatus={saveStatus}
            score={lineupScore}
            selectedAgentKeys={selectedLineupAgentKeys}
          />
        ) : null}

        {visibleCatalogAgents.length > 0 ? <AgentCardSection agents={visibleCatalogAgents} title="更多智能体" variant="catalog" /> : null}
      </div>

      {pointerDrag ? (
        <div className="agent-combination-drag-ghost" style={{ left: pointerDrag.x, top: pointerDrag.y }}>
          {lineupCandidateByKey.get(pointerDrag.agentKey)?.avatar ? (
            <img alt="" draggable={false} src={lineupCandidateByKey.get(pointerDrag.agentKey)?.avatar} />
          ) : (
            <Sparkles size={14} />
          )}
          <strong>{lineupCandidateByKey.get(pointerDrag.agentKey)?.name || '智能体'}</strong>
        </div>
      ) : null}
    </main>
  );
}
