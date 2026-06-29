import { CircleCheck, Cpu, ExternalLink, Orbit, PackageOpen, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { enrichDrawAgent, getAgentLaunchTargets, type EnrichedDrawAgent } from '../lib/agentLaunchCatalog';
import type { RecommendedAgent } from '../types';

const MIN_VISIBLE_MS = 2800;
const EXIT_MS = 720;
const MAX_DRAW_CARDS = 4;
const DRAW_SLOT_COUNT = 3;

type AgentDrawOverlayProps = {
  active: boolean;
  agents: RecommendedAgent[];
  onSettled?: () => void;
  pulseKey: number;
  replyText: string;
};

type DrawPhase = 'hidden' | 'active' | 'settled' | 'closing';

export default function AgentDrawOverlay({ active, agents, onSettled, pulseKey, replyText }: AgentDrawOverlayProps) {
  const [phase, setPhase] = useState<DrawPhase>('hidden');
  const [visibleAgents, setVisibleAgents] = useState<RecommendedAgent[]>([]);
  const shownAtRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const hasAgents = agents.length > 0;
  const realAgents = visibleAgents.length > 0 ? visibleAgents : agents;
  const cards = useMemo(() => realAgents.slice(0, MAX_DRAW_CARDS), [realAgents]);
  const resolvedAgents = useMemo(() => realAgents.filter(hasResolvedDrawAgentInfo), [realAgents]);
  const enrichedAgents = useMemo(() => resolvedAgents.map(enrichDrawAgent), [resolvedAgents]);
  const slots = useMemo(() => {
    const source = cards.length > 0 ? [...cards] : createPendingCards();

    if (phase !== 'settled' && source.length < DRAW_SLOT_COUNT) {
      source.push(...createPendingCards(source.length, DRAW_SLOT_COUNT - source.length));
    }

    return source.map((agent, index) => {
      const pending = index >= cards.length || !hasResolvedDrawAgentInfo(agent);

      return {
        agent: enrichDrawAgent(agent),
        pending,
      };
    });
  }, [cards, phase]);
  const launchTargets = useMemo(() => getAgentLaunchTargets(enrichedAgents), [enrichedAgents]);
  const resultCount = enrichedAgents.length;
  const hasVisibleResult = resultCount > 0 || cards.length > 0;
  const canOpenLaunchTargets = phase === 'settled' && launchTargets.length > 0;
  const compactReplyText = compactText(replyText);
  const showReplyText = phase === 'settled' && compactReplyText;

  useEffect(() => {
    return () => {
      clearTimer(closeTimerRef);
      clearTimer(hideTimerRef);
    };
  }, []);

  useEffect(() => {
    if (hasAgents) {
      setVisibleAgents(agents);
    }
  }, [agents, hasAgents]);

  useEffect(() => {
    if (!active && pulseKey === 0) {
      return;
    }

    clearTimer(closeTimerRef);
    clearTimer(hideTimerRef);
    shownAtRef.current = Date.now();
    setPhase('active');

    if (hasAgents) {
      setVisibleAgents(agents);
    } else if (active) {
      setVisibleAgents([]);
    }
  }, [active, agents, hasAgents, pulseKey]);

  useEffect(() => {
    if (active || phase !== 'active') {
      return;
    }

    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : MIN_VISIBLE_MS;
    const settleDelay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      if (hasVisibleResult) {
        setPhase('settled');
        onSettled?.();

        return;
      }

      setPhase('closing');
      hideTimerRef.current = window.setTimeout(() => {
        shownAtRef.current = 0;
        setVisibleAgents([]);
        setPhase('hidden');
      }, EXIT_MS);
    }, settleDelay);
  }, [active, hasVisibleResult, onSettled, phase]);

  function handleClose() {
    clearTimer(closeTimerRef);
    clearTimer(hideTimerRef);
    onSettled?.();
    setPhase('closing');
    hideTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = 0;
      setVisibleAgents([]);
      setPhase('hidden');
    }, EXIT_MS);
  }

  function handleOpenAll() {
    const openedTabs = launchTargets.map((target) => ({
      target,
      tab: window.open('about:blank', '_blank'),
    }));

    openedTabs.forEach(({ target, tab }) => {
      if (tab) {
        tab.opener = null;
        tab.location.replace(target.href);

        return;
      }

      window.open(target.href, '_blank', 'noopener,noreferrer');
    });
  }

  if (phase === 'hidden') {
    return null;
  }

  return (
    <section className={`agent-draw-overlay is-${phase}`} aria-label="智能体抽卡结果" role="dialog">
      <div className="agent-draw-backdrop" />
      <div className="agent-draw-grid" />
      <div className="agent-draw-particles" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <i key={index} style={{ '--draw-spark-index': index } as CSSProperties} />
        ))}
      </div>

      <div className="agent-draw-stage">
        <div className="agent-draw-summon" aria-hidden={phase === 'settled'}>
          <span className="agent-draw-ring ring-a" />
          <span className="agent-draw-ring ring-b" />
          <span className="agent-draw-ring ring-c" />
          <span className="agent-draw-ray ray-left" />
          <span className="agent-draw-ray ray-right" />
          <div className="agent-draw-core">
            <span>
              <Orbit size={15} />
              AI AGENT DRAW
            </span>
            <strong>{phase === 'settled' ? '推荐智能体已揭示' : '智能体卡牌抽取中'}</strong>
            <em>{phase === 'settled' ? '抽卡结果已锁定，可一键打开' : '推荐序列正在展开'}</em>
          </div>
        </div>

        <div className="agent-draw-matchline">
          <CircleCheck size={16} />
          <span>{phase === 'settled' ? '已自动筛选最优匹配' : '正在校准最优匹配'}</span>
        </div>

        <div className={`agent-draw-card-row card-count-${slots.length}`}>
          {slots.map(({ agent, pending }, index) => (
            <DrawCard agent={agent} index={index} key={getDrawAgentKey(agent, index)} pending={pending} />
          ))}
        </div>

        <div className={`agent-draw-readout ${showReplyText ? 'has-reply' : ''}`}>
          <span>
            <Sparkles size={15} />
            {showReplyText ? 'Agent 最终回复' : phase === 'settled' ? '推荐智能体抽取完成' : '正在揭示推荐智能体'}
          </span>
          {showReplyText ? (
            <p className="agent-draw-reply-text" title={compactReplyText}>
              {compactReplyText}
            </p>
          ) : (
            <>
              <strong>{String(Math.max(resultCount || cards.length, 1)).padStart(2, '0')}</strong>
              <em>精准匹配 · 智能精选 · 高效决策</em>
            </>
          )}
        </div>

        <footer className="agent-draw-actions">
          <div className="agent-draw-result-summary">
            <span>生成结果</span>
            <strong>
              <b>{resultCount}</b> 个智能体
            </strong>
          </div>
          <button className="agent-draw-open-all" disabled={!canOpenLaunchTargets} onClick={handleOpenAll} type="button">
            <PackageOpen size={17} />
            <span>{canOpenLaunchTargets ? '一键打开智能体' : phase === 'settled' ? '暂无可打开链接' : '抽卡完成后可打开'}</span>
            {launchTargets.length > 0 && (
              <em>
                {launchTargets.length}
                <ExternalLink size={13} />
              </em>
            )}
          </button>
          <button aria-label="收起抽卡结果" className="agent-draw-close" onClick={handleClose} type="button">
            <X size={18} />
          </button>
        </footer>
      </div>
    </section>
  );
}

function DrawCard({ agent, index, pending }: { agent: EnrichedDrawAgent; index: number; pending: boolean }) {
  const rarity = getRarity(agent, index);
  const name = pending ? '匹配中' : agent.name;
  const stage = pending ? 'ANALYSING' : agent.stageLabel;
  const reason = pending ? '等待推荐流写入' : agent.fallbackReason;

  return (
    <article
      aria-label={`${name} 推荐卡`}
      className={`agent-draw-card rarity-${rarity.key} ${pending ? 'is-pending' : ''}`}
      style={{ '--draw-card-index': index } as CSSProperties}
    >
      <div className="agent-draw-card-face">
        <span className="agent-draw-rarity">{rarity.label}</span>
        <span className="agent-draw-chip" title={stage}>
          {stage}
        </span>
        <div className={`agent-draw-emblem ${!pending && agent.avatar ? 'has-avatar' : ''}`} aria-hidden="true">
          {!pending && agent.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Cpu size={30} />}
        </div>
        <strong title={name}>{name}</strong>
        <small>{reason}</small>
      </div>
    </article>
  );
}

function clearTimer(ref: MutableRefObject<number | null>) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

function createPendingCards(startIndex = 0, count = DRAW_SLOT_COUNT): RecommendedAgent[] {
  return Array.from({ length: count }, (_, index) => ({ agent_index: startIndex + index }));
}

function hasResolvedDrawAgentInfo(agent: RecommendedAgent) {
  return [
    agent.agent_name,
    agent.name,
    agent.id,
    agent.agentKey,
    agent.agent_key,
    agent.endpoint,
    agent.url,
    agent.link,
    agent.jump_url,
  ].some(hasMeaningfulText);
}

function hasMeaningfulText(value: unknown) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function getRarity(agent: EnrichedDrawAgent, index: number) {
  const score = Number(agent.score || agent.scoreLabel);

  if (Number.isFinite(score) && score >= 95) {
    return { key: 'legend', label: 'SSR' };
  }

  if (Number.isFinite(score) && score >= 90) {
    return { key: 'epic', label: 'SR' };
  }

  if (index === 0) {
    return { key: 'legend', label: 'SSR' };
  }

  if (index < 3) {
    return { key: 'epic', label: 'SR' };
  }

  return { key: 'rare', label: 'R' };
}

function getDrawAgentKey(agent: EnrichedDrawAgent, index: number) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `draw-agent-${agent.agent_index}`;
  }

  return `${index}-${agent.name}`;
}
