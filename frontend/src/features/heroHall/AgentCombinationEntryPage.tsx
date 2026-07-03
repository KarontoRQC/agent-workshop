import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, PackageOpen, RefreshCcw, Sparkles } from 'lucide-react';
import {
  enrichDrawAgent,
  getAgentLaunchTargets,
  getCatalogHeroAgents,
  setAgentCatalogAgents,
  type AgentLaunchTarget,
  type EnrichedDrawAgent,
} from '../../lib/agentLaunchCatalog';
import { fetchAgentCatalog } from '../../lib/agentCatalogClient';
import { fetchRecommendationSnapshot } from '../../lib/recommendationSnapshotClient';
import type { AgentCatalogItem, RecommendationSnapshot } from '../../types';
import { shouldPollRecommendationSnapshot, snapshotToRecommendedAgents } from '../workflow/recommendationSnapshotModel';
import spaceCruiseBg from '../../../assets/space-cruise-bg.png';

const POLL_INTERVAL_MS = 2000;

export function AgentCombinationEntryPage({ recommendationId }: { recommendationId: string }) {
  const [snapshot, setSnapshot] = useState<RecommendationSnapshot | null>(null);
  const [catalogAgents, setCatalogAgents] = useState<AgentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState('');

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

  const recommendedAgents = useMemo(() => snapshotToRecommendedAgents(snapshot).map(enrichDrawAgent), [catalogAgents, snapshot]);
  const catalogHeroAgents = useMemo(() => getCatalogHeroAgents(catalogAgents), [catalogAgents]);
  const visibleCatalogAgents = useMemo(() => {
    const recommendedIds = new Set(recommendedAgents.map((agent) => String(agent.id || agent.agent_id || agent.name)));

    return catalogHeroAgents.filter((agent) => !recommendedIds.has(String(agent.id || agent.agent_id || agent.name))).slice(0, 48);
  }, [catalogHeroAgents, recommendedAgents]);
  const sceneCards = useMemo(() => createSceneCards(catalogHeroAgents), [catalogHeroAgents]);
  const launchTargets = useMemo(() => getAgentLaunchTargets(recommendedAgents), [recommendedAgents]);
  const statusText = getSnapshotStatusText({ catalogLoading, error, loading, snapshot });
  const canOpen = launchTargets.length > 0;

  const openAllTargets = useCallback(() => {
    openLaunchTargets(launchTargets);
  }, [launchTargets]);

  return (
    <main className="agent-combination-entry-page">
      <style>{entryPageCss}</style>
      <section className="agent-combination-entry-hero">
        <div>
          <span>推荐快照 {recommendationId}</span>
          <h1>智能体组合入口</h1>
          <p>{statusText}</p>
        </div>
        <button disabled={!canOpen} onClick={openAllTargets} type="button">
          <PackageOpen size={17} />
          <span>{canOpen ? '打开全部智能体' : '暂无可打开智能体'}</span>
        </button>
      </section>

      {error ? (
        <StatusPanel title="推荐组合读取失败" text={error} />
      ) : loading ? (
        <StatusPanel title="正在读取推荐组合" text="页面会按地址里的 id 请求推荐快照接口。" />
      ) : null}

      {sceneCards.length > 0 ? (
        <section className="agent-combination-scenes" aria-label="精选场景">
          <h2>精选场景</h2>
          <div className="agent-combination-scene-row">
            {sceneCards.map((scene) => (
              <article className="agent-combination-scene-card" key={scene.label}>
                {scene.cover ? <img alt="" loading="lazy" src={scene.cover} /> : null}
                <div>
                  <strong>{scene.label}</strong>
                  <ul>
                    {scene.agents.map((agent) => {
                      const content = (
                        <>
                          <span className={agent.avatar ? 'has-avatar' : ''}>{agent.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Sparkles size={13} />}</span>
                          <em>{agent.name}</em>
                        </>
                      );

                      return (
                        <li key={agent.id || agent.name}>
                          {agent.launchTarget ? (
                            <a href={agent.launchTarget} rel="noopener noreferrer" target="_blank" title={agent.name}>
                              {content}
                            </a>
                          ) : (
                            <div>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {recommendedAgents.length > 0 ? (
        <AgentCardSection agents={recommendedAgents} title="推荐智能体" variant="recommended" />
      ) : !error && !loading ? (
        <StatusPanel title="推荐组合生成中" text="当前快照还没有可打开的智能体链接，稍后会自动更新。" />
      ) : null}

      {visibleCatalogAgents.length > 0 ? <AgentCardSection agents={visibleCatalogAgents} title="更多智能体" variant="catalog" /> : null}
    </main>
  );
}

function AgentCardSection({
  agents,
  title,
  variant,
}: {
  agents: EnrichedDrawAgent[];
  title: string;
  variant: 'catalog' | 'recommended';
}) {
  return (
    <section className="agent-combination-card-section" data-variant={variant}>
      <h2>{title}</h2>
      <div className="agent-combination-card-grid">
        {agents.map((agent, index) => (
          <article className="agent-combination-agent-card" key={`${agent.id || agent.name}-${index}`}>
            <header>
              <span className={agent.avatar ? 'has-avatar' : ''}>{agent.avatar ? <img alt="" loading="lazy" src={agent.avatar} /> : <Sparkles size={18} />}</span>
              <div>
                <strong title={agent.name}>{agent.name}</strong>
                <em>{agent.stageLabel}</em>
              </div>
            </header>
            <p title={agent.fallbackReason}>{agent.fallbackReason}</p>
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
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusPanel({ text, title }: { text: string; title: string }) {
  return (
    <div className="agent-combination-entry-empty" aria-live="polite">
      <RefreshCcw size={18} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function createSceneCards(agents: EnrichedDrawAgent[]) {
  const grouped = new Map<string, EnrichedDrawAgent[]>();

  for (const agent of agents) {
    const label = String(agent.function || agent.stageLabel || '精选场景').trim();
    const current = grouped.get(label) || [];

    if (current.length < 3) {
      grouped.set(label, [...current, agent]);
    }
  }

  return Array.from(grouped.entries())
    .filter(([, sceneAgents]) => sceneAgents.length > 0)
    .slice(0, 9)
    .map(([label, sceneAgents]) => ({
      agents: sceneAgents,
      cover: sceneAgents.find((agent) => agent.avatar)?.avatar || '',
      label,
    }));
}

function openLaunchTargets(launchTargets: AgentLaunchTarget[]) {
  launchTargets.forEach((target) => {
    openSingleLaunchTarget(target.href);
  });
}

function openSingleLaunchTarget(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function getSnapshotStatusText({
  catalogLoading,
  error,
  loading,
  snapshot,
}: {
  catalogLoading: boolean;
  error: string;
  loading: boolean;
  snapshot: RecommendationSnapshot | null;
}) {
  if (error) {
    return '没有读取到这个 id 对应的推荐快照。';
  }

  if (loading || catalogLoading) {
    return '正在同步推荐组合和智能体目录。';
  }

  if (snapshot?.status === 'streaming') {
    return '推荐还在生成中，页面会自动轮询并更新新的智能体入口。';
  }

  if (snapshot?.status === 'failed') {
    return '本次推荐生成失败，下面仅展示已经保存到快照里的可用入口。';
  }

  return '这里展示本次对话保存的推荐智能体组合，以及可继续浏览的智能体目录。';
}

const entryPageCss = `
  :root {
    color-scheme: dark;
    font-family:
      "HarmonyOS Sans SC", "MiSans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei",
      "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", Inter, system-ui, sans-serif;
    background: #030714;
  }

  body {
    margin: 0;
    background: #030714;
  }

  .agent-combination-entry-page {
    --hud-blue: 91, 204, 255;
    --hud-cyan: 137, 226, 205;
    --hud-gold: 255, 226, 152;
    --hud-amber: 226, 173, 87;

    position: relative;
    height: 100dvh;
    min-height: 100vh;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: clamp(18px, 2vw, 30px) clamp(20px, 3vw, 42px) 42px;
    scrollbar-color: rgba(var(--hud-gold), 0.68) rgba(4, 18, 38, 0.82);
    scrollbar-gutter: stable;
    color: rgba(236, 248, 255, 0.94);
    background:
      radial-gradient(circle at 50% 34%, rgba(var(--hud-blue), 0.3), transparent 23%),
      radial-gradient(circle at 17% 14%, rgba(var(--hud-gold), 0.14), transparent 26%),
      radial-gradient(circle at 83% 11%, rgba(var(--hud-cyan), 0.13), transparent 24%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.56), transparent 19% 81%, rgba(0, 0, 0, 0.56)),
      linear-gradient(180deg, rgba(2, 5, 17, 0.74), rgba(5, 22, 55, 0.84) 48%, rgba(1, 4, 12, 0.96)),
      url("${spaceCruiseBg}") center center / cover no-repeat;
  }

  .agent-combination-entry-page::before,
  .agent-combination-entry-page::after {
    position: fixed;
    z-index: 0;
    content: "";
    pointer-events: none;
  }

  .agent-combination-entry-page::before {
    inset: 26px 28px;
    border: 1px solid rgba(var(--hud-blue), 0.36);
    border-top-color: rgba(var(--hud-gold), 0.44);
    background:
      linear-gradient(90deg, rgba(var(--hud-gold), 0.42), transparent 16% 84%, rgba(var(--hud-blue), 0.44)) top / 100% 1px no-repeat,
      linear-gradient(90deg, rgba(var(--hud-blue), 0.3), transparent 18% 82%, rgba(var(--hud-gold), 0.28)) bottom / 100% 1px no-repeat,
      repeating-linear-gradient(90deg, transparent 0 41px, rgba(var(--hud-blue), 0.055) 42px 43px, transparent 44px 84px),
      repeating-linear-gradient(0deg, transparent 0 37px, rgba(var(--hud-gold), 0.035) 38px 39px, transparent 40px 78px);
    box-shadow:
      inset 0 0 42px rgba(var(--hud-blue), 0.09),
      inset 0 0 0 1px rgba(var(--hud-gold), 0.08),
      0 0 52px rgba(var(--hud-blue), 0.12);
    clip-path: polygon(22px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 22px), calc(100% - 22px) 100%, 28px 100%, 0 calc(100% - 28px), 0 22px);
  }

  .agent-combination-entry-page::after {
    inset: 0;
    background:
      radial-gradient(circle at 50% 50%, transparent 0 18%, rgba(var(--hud-blue), 0.1) 20%, transparent 24%),
      repeating-conic-gradient(from -8deg at 50% 50%, rgba(var(--hud-blue), 0.12) 0deg 0.22deg, transparent 0.22deg 7deg);
    mask-image: radial-gradient(circle at 50% 52%, transparent 0 14%, rgba(0, 0, 0, 0.78) 32%, transparent 88%);
    opacity: 0.36;
    mix-blend-mode: screen;
  }

  .agent-combination-entry-page::-webkit-scrollbar,
  .agent-combination-scene-row::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .agent-combination-entry-page::-webkit-scrollbar-track,
  .agent-combination-scene-row::-webkit-scrollbar-track {
    background: rgba(3, 14, 31, 0.86);
  }

  .agent-combination-entry-page::-webkit-scrollbar-thumb,
  .agent-combination-scene-row::-webkit-scrollbar-thumb {
    border: 1px solid rgba(var(--hud-blue), 0.42);
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(var(--hud-gold), 0.84), rgba(var(--hud-blue), 0.58));
  }

  .agent-combination-entry-page > * {
    position: relative;
    z-index: 1;
  }

  .agent-combination-entry-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: center;
    min-height: 118px;
    margin: 4px 0 22px;
    padding: 20px 22px;
    border: 1px solid rgba(var(--hud-blue), 0.32);
    border-left-color: rgba(var(--hud-gold), 0.48);
    border-radius: 4px;
    background:
      linear-gradient(90deg, rgba(var(--hud-gold), 0.28), transparent 28% 72%, rgba(var(--hud-blue), 0.3)) top / 100% 2px no-repeat,
      linear-gradient(90deg, rgba(3, 12, 28, 0.96), rgba(6, 25, 58, 0.74) 48%, rgba(2, 9, 22, 0.94)),
      radial-gradient(circle at 88% 28%, rgba(var(--hud-blue), 0.18), transparent 34%);
    box-shadow:
      0 20px 54px rgba(0, 0, 0, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 0 32px rgba(var(--hud-blue), 0.055);
    clip-path: polygon(14px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 18px 100%, 0 calc(100% - 18px), 0 14px);
  }

  .agent-combination-entry-hero span,
  .agent-combination-entry-hero p {
    color: rgba(176, 219, 238, 0.78);
  }

  .agent-combination-entry-hero > div > span {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border: 1px solid rgba(var(--hud-blue), 0.28);
    border-left-color: rgba(var(--hud-gold), 0.36);
    border-radius: 3px;
    background: rgba(4, 17, 39, 0.74);
    color: rgba(255, 235, 177, 0.86);
    font-size: 12px;
    font-weight: 800;
  }

  .agent-combination-entry-hero h1 {
    margin: 6px 0 6px;
    font-size: clamp(28px, 4vw, 42px);
    letter-spacing: 0;
    color: rgba(255, 241, 194, 0.98);
    text-shadow:
      0 0 18px rgba(255, 215, 132, 0.24),
      0 0 28px rgba(116, 220, 255, 0.14);
  }

  .agent-combination-entry-hero p {
    margin: 0;
    line-height: 1.6;
    max-width: 820px;
  }

  .agent-combination-entry-hero button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 16px;
    border: 1px solid rgba(var(--hud-gold), 0.46);
    border-radius: 4px;
    color: rgba(10, 22, 37, 0.96);
    background: linear-gradient(180deg, rgba(255, 229, 158, 0.96), rgba(182, 128, 48, 0.95));
    box-shadow:
      0 0 18px rgba(var(--hud-gold), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px);
  }

  .agent-combination-entry-hero button:disabled {
    cursor: not-allowed;
    color: rgba(220, 231, 238, 0.72);
    border-color: rgba(165, 190, 211, 0.26);
    background: rgba(96, 111, 124, 0.52);
    box-shadow: none;
    opacity: 0.88;
  }

  .agent-combination-scenes,
  .agent-combination-card-section {
    margin-top: 24px;
  }

  .agent-combination-scenes h2,
  .agent-combination-card-section h2 {
    margin: 0 0 14px;
    font-size: 20px;
    letter-spacing: 0;
    color: rgba(255, 239, 188, 0.96);
    text-shadow: 0 0 18px rgba(var(--hud-gold), 0.14);
  }

  .agent-combination-scene-row {
    display: grid;
    grid-auto-columns: minmax(246px, 1fr);
    grid-auto-flow: column;
    gap: 12px;
    overflow-x: auto;
    padding: 2px 2px 10px;
  }

  .agent-combination-scene-card {
    position: relative;
    min-height: 156px;
    overflow: hidden;
    border: 1px solid rgba(var(--hud-blue), 0.26);
    border-left-color: rgba(var(--hud-gold), 0.36);
    border-radius: 4px;
    background:
      repeating-linear-gradient(90deg, rgba(var(--hud-blue), 0.045) 0 1px, transparent 1px 26px),
      linear-gradient(135deg, rgba(var(--hud-gold), 0.09), rgba(4, 16, 39, 0.76) 38%, rgba(2, 8, 20, 0.9));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 12px 34px rgba(0, 0, 0, 0.22);
    clip-path: polygon(10px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 12px 100%, 0 calc(100% - 12px), 0 10px);
  }

  .agent-combination-scene-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(135deg, rgba(3, 12, 29, 0.92), rgba(3, 17, 42, 0.56)),
      radial-gradient(circle at 18% 12%, rgba(var(--hud-blue), 0.22), transparent 34%),
      radial-gradient(circle at 82% 22%, rgba(var(--hud-gold), 0.2), transparent 38%);
  }

  .agent-combination-scene-card > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.26;
    filter: saturate(1.08) contrast(1.04);
  }

  .agent-combination-scene-card > div {
    position: relative;
    z-index: 1;
    padding: 18px;
  }

  .agent-combination-scene-card strong {
    display: block;
    margin-bottom: 18px;
    color: rgba(255, 241, 195, 0.98);
    font-size: 16px;
  }

  .agent-combination-scene-card ul {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .agent-combination-scene-card li {
    display: flex;
    min-width: 0;
  }

  .agent-combination-scene-card li > a,
  .agent-combination-scene-card li > div {
    display: flex;
    min-width: 0;
    width: 100%;
    align-items: center;
    gap: 8px;
    color: inherit;
    text-decoration: none;
  }

  .agent-combination-scene-card li > a {
    cursor: pointer;
  }

  .agent-combination-scene-card li > a:focus-visible {
    outline: 2px solid rgba(var(--hud-gold), 0.72);
    outline-offset: 3px;
  }

  .agent-combination-scene-card li > a:hover span,
  .agent-combination-scene-card li > a:focus-visible span {
    border-color: rgba(var(--hud-gold), 0.58);
    box-shadow: 0 0 16px rgba(var(--hud-gold), 0.24);
  }

  .agent-combination-scene-card li > a:hover em,
  .agent-combination-scene-card li > a:focus-visible em {
    color: rgba(255, 239, 188, 0.96);
  }

  .agent-combination-scene-card li span,
  .agent-combination-agent-card header > span {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    overflow: hidden;
    border: 1px solid rgba(var(--hud-blue), 0.32);
    border-radius: 50%;
    background: rgba(9, 26, 52, 0.92);
    color: rgba(168, 225, 255, 0.84);
    box-shadow: 0 0 14px rgba(var(--hud-blue), 0.12);
  }

  .agent-combination-scene-card li span img,
  .agent-combination-agent-card header > span img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .agent-combination-scene-card li em {
    min-width: 0;
    overflow: hidden;
    color: rgba(229, 245, 255, 0.88);
    font-size: 13px;
    font-style: normal;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-combination-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .agent-combination-agent-card,
  .agent-combination-entry-empty {
    border: 1px solid rgba(var(--hud-blue), 0.24);
    border-left-color: rgba(var(--hud-gold), 0.32);
    border-radius: 4px;
    background:
      linear-gradient(90deg, rgba(var(--hud-gold), 0.18), transparent 36% 78%, rgba(var(--hud-blue), 0.17)) top / 100% 1px no-repeat,
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.026) 0 1px, transparent 1px 10px),
      linear-gradient(135deg, rgba(7, 22, 49, 0.9), rgba(2, 9, 23, 0.96));
    box-shadow:
      0 14px 34px rgba(0, 0, 0, 0.26),
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 0 22px rgba(var(--hud-blue), 0.045);
    clip-path: polygon(10px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 12px 100%, 0 calc(100% - 12px), 0 10px);
  }

  .agent-combination-agent-card {
    position: relative;
    min-height: 152px;
    padding: 16px;
  }

  .agent-combination-card-section[data-variant='recommended'] .agent-combination-agent-card {
    border-color: rgba(var(--hud-gold), 0.58);
    background:
      linear-gradient(90deg, rgba(var(--hud-gold), 0.34), transparent 34% 72%, rgba(var(--hud-blue), 0.22)) top / 100% 2px no-repeat,
      radial-gradient(circle at 92% 8%, rgba(var(--hud-gold), 0.13), transparent 34%),
      linear-gradient(135deg, rgba(20, 25, 45, 0.94), rgba(4, 13, 30, 0.96));
    box-shadow:
      0 0 26px rgba(var(--hud-gold), 0.08),
      0 16px 38px rgba(0, 0, 0, 0.28),
      inset 0 0 24px rgba(var(--hud-gold), 0.045);
  }

  .agent-combination-agent-card header {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }

  .agent-combination-agent-card header > span {
    width: 34px;
    height: 34px;
    border-radius: 8px;
  }

  .agent-combination-agent-card strong,
  .agent-combination-agent-card em {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-combination-agent-card strong {
    color: rgba(244, 251, 255, 0.96);
    font-size: 15px;
  }

  .agent-combination-agent-card em {
    margin-top: 3px;
    color: rgba(255, 232, 166, 0.74);
    font-size: 12px;
    font-style: normal;
  }

  .agent-combination-agent-card p {
    display: -webkit-box;
    min-height: 38px;
    margin: 14px 0;
    overflow: hidden;
    color: rgba(191, 223, 239, 0.82);
    font-size: 13px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .agent-combination-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-right: 58px;
  }

  .agent-combination-tags span {
    max-width: 100%;
    overflow: hidden;
    border: 1px solid rgba(var(--hud-blue), 0.18);
    border-radius: 3px;
    background: rgba(18, 40, 67, 0.78);
    color: rgba(199, 229, 242, 0.82);
    font-size: 12px;
    font-weight: 700;
    padding: 5px 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-combination-agent-card a {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(var(--hud-blue), 0.4);
    border-radius: 4px;
    background: linear-gradient(135deg, rgba(8, 31, 60, 0.96), rgba(3, 12, 26, 0.96));
    color: rgba(231, 247, 255, 0.92);
    font-size: 12px;
    font-weight: 800;
    padding: 8px 10px;
    text-decoration: none;
    box-shadow: 0 0 14px rgba(var(--hud-blue), 0.12);
    clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
  }

  .agent-combination-entry-empty {
    display: grid;
    gap: 8px;
    justify-items: start;
    margin-top: 20px;
    padding: 18px;
    color: rgba(178, 219, 238, 0.8);
  }

  .agent-combination-entry-empty strong {
    color: rgba(255, 239, 188, 0.96);
  }

  @media (max-width: 720px) {
    .agent-combination-entry-page {
      padding: 16px 12px 30px;
    }

    .agent-combination-entry-page::before {
      inset: 10px 8px;
    }

    .agent-combination-entry-hero {
      grid-template-columns: 1fr;
      padding: 16px;
    }

    .agent-combination-entry-hero button {
      justify-self: start;
    }

    .agent-combination-scene-row {
      grid-auto-columns: minmax(230px, 82vw);
    }

    .agent-combination-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

  }
`;
