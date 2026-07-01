import sourceAgentsRaw from '../../../../data/source_agents_full.json?raw';
import type { RecommendedAgent } from '../types';

type CatalogAgent = {
  agentKey?: string;
  agent_key?: string;
  endpoint?: string;
  functionLabel?: string;
  id?: string;
  name?: string;
  role?: string;
  score?: number | string;
  typeLabel?: string;
  [key: string]: unknown;
};

type SourceAgent = {
  '功能'?: string;
  '智能体介绍'?: string | null;
  '智能体名称'?: string;
  '智能体链接'?: string | null;
  '知识库'?: string | null;
  '类型'?: string;
};

export type AgentLaunchTarget = {
  href: string;
  name: string;
};

export type EnrichedDrawAgent = RecommendedAgent & {
  agentKey?: string;
  avatar: string;
  avatarAlt: string;
  canOpen: boolean;
  endpoint: string;
  fallbackReason: string;
  launchLabel: string;
  launchTarget: string;
  metaLabel: string;
  name: string;
  scoreLabel: string;
  stageLabel: string;
};

const avatarModules = import.meta.glob('../../../src/assets/agent-avatars/*.{png,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const GPT_ID_PATTERN = /g-[a-z0-9]+/i;
const IMAGE_SOURCE_PATTERN = /^(?:data:image\/|https?:\/\/|\/).+\.(?:png|webp|jpe?g|gif|svg)(?:[?#].*)?$/i;

const catalogAgents = parseSourceAgents(sourceAgentsRaw);
const avatarByGptId = new Map(
  Object.entries(avatarModules)
    .map(([path, source]) => {
      const gptId = extractGptId(path);

      return gptId ? ([gptId, source] as const) : null;
    })
    .filter(isPresent),
);
const catalogByStableKey = new Map<string, CatalogAgent>();
const catalogByName = new Map<string, CatalogAgent>();

for (const agent of catalogAgents) {
  const stableKeys = [agent.id, agent.agentKey, agent.agent_key, extractGptId(agent.endpoint)];

  for (const key of stableKeys) {
    const normalizedKey = normalizeStableKey(key);

    if (normalizedKey && !catalogByStableKey.has(normalizedKey)) {
      catalogByStableKey.set(normalizedKey, agent);
    }
  }

  const normalizedName = normalizeAgentName(agent.name);

  if (normalizedName && !catalogByName.has(normalizedName)) {
    catalogByName.set(normalizedName, agent);
  }
}

export function enrichDrawAgent(agent: RecommendedAgent): EnrichedDrawAgent {
  const inputName = firstString(agent.agent_name, agent.name);
  const agentKey = firstString(agent.agent_key, agent.agentKey, agent.id);
  const catalogAgent = findCatalogAgent({ ...agent, agentKey, name: inputName });
  const catalogName = firstString(catalogAgent?.name);
  const name = stripRankPrefix(inputName || catalogName || '智能体生成中');
  const endpoint = firstString(agent.endpoint, agent.url, agent.link, agent.jump_url, catalogAgent?.endpoint);
  const avatar = getAgentAvatar({
    ...catalogAgent,
    ...agent,
    agentKey: agentKey || catalogAgent?.agentKey,
    endpoint,
    name: inputName || catalogName || name,
  });
  const launchTarget = getAgentLaunchTarget(endpoint);
  const catalogFunctionLabel = firstString(catalogAgent?.functionLabel);
  const catalogTypeLabel = firstString(catalogAgent?.typeLabel);
  const metaLabel =
    [catalogFunctionLabel, catalogTypeLabel].filter(Boolean).join(' / ') ||
    firstString(agent.activeField, agent.stage) ||
    '推荐生成中';
  const stageLabel = firstString(agent.stage, catalogFunctionLabel, '推荐');
  const scoreLabel = firstString(
    catalogAgent?.score,
    agent.score,
    agent.scoreLabel,
    agent.streamStatus === 'completed' ? '完成' : '生成中',
  );
  const fallbackReason = firstString(agent.reason, catalogAgent?.role, '等待智能体补全推荐理由。');

  return {
    ...agent,
    agentKey: agentKey || catalogAgent?.agentKey,
    avatar,
    avatarAlt: `${name} 头像`,
    canOpen: Boolean(launchTarget?.href),
    endpoint,
    fallbackReason,
    id: firstString(agent.id, catalogAgent?.id),
    launchLabel: launchTarget?.isChatGpt ? '进入 ChatGPT' : '打开智能体入口',
    launchTarget: launchTarget?.href || '',
    metaLabel,
    name,
    score: catalogAgent?.score || agent.score,
    scoreLabel,
    stageLabel,
  };
}

export function getAgentLaunchTargets(agents: EnrichedDrawAgent[]): AgentLaunchTarget[] {
  const seen = new Set<string>();

  return agents
    .map((agent) => ({ href: agent.launchTarget, name: agent.name }))
    .filter((target) => {
      if (!target.href || seen.has(target.href)) {
        return false;
      }

      seen.add(target.href);

      return true;
    });
}

export function getCatalogHeroAgents(): EnrichedDrawAgent[] {
  return catalogAgents.map((agent, index) =>
    enrichDrawAgent({
      ...agent,
      agent_index: index,
      agent_key: agent.agentKey,
      agent_name: agent.name,
      endpoint: agent.endpoint,
      reason: agent.role,
      stage: agent.functionLabel || agent.typeLabel,
      streamStatus: 'completed',
    }),
  );
}

export function openAgentLaunchTargets(launchTargets: AgentLaunchTarget[]) {
  const targets = normalizeLaunchTargets(launchTargets);

  if (targets.length === 0) {
    return;
  }

  const openedTabs = targets.map((target) => ({
    target,
    tab: window.open('about:blank', '_blank'),
  }));
  const openedEntries = openedTabs.filter((entry): entry is { target: AgentLaunchTarget; tab: Window } => Boolean(entry.tab));

  if (openedEntries.length === targets.length) {
    openedEntries.forEach(({ target, tab }) => navigateOpenedTab(tab, target.href));
    return;
  }

  const hubEntry = openedEntries.shift();
  const hubTab = hubEntry?.tab || window.open('about:blank', '_blank');

  if (hubTab) {
    writeLaunchHub(hubTab, targets);
  } else {
    window.location.href = targets[0].href;
  }

  openedEntries.forEach(({ target, tab }) => navigateOpenedTab(tab, target.href));
}

function parseSourceAgents(source: string): CatalogAgent[] {
  try {
    const rows = JSON.parse(source) as SourceAgent[];

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((row, index) => {
      const id = `agent-${String(index + 1).padStart(3, '0')}`;

      return {
        agentKey: id,
        endpoint: firstString(row['智能体链接']),
        functionLabel: firstString(row['功能']),
        id,
        knowledge: splitKnowledge(row['知识库']),
        name: firstString(row['智能体名称']),
        role: firstString(row['智能体介绍'], `${firstString(row['智能体名称'])} 是当前智能体库中的可调用能力。`),
        typeLabel: firstString(row['类型']),
      };
    });
  } catch (error) {
    console.warn('Failed to parse source agent catalog.', error);

    return [];
  }
}

function splitKnowledge(value: unknown) {
  return firstString(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAgentAvatar(agent: Record<string, unknown>) {
  const directAvatar = getAvatarFromValues(getAgentLookupValues(agent));

  if (directAvatar) {
    return directAvatar;
  }

  const catalogAgent = findCatalogAgent(agent);

  return catalogAgent ? getAvatarFromValues(getAgentLookupValues(catalogAgent)) : '';
}

function findCatalogAgent(agent: Record<string, unknown>): CatalogAgent | null {
  for (const value of getAgentLookupValues(agent)) {
    const gptId = extractGptId(value);

    if (gptId) {
      const fromGptId = catalogByStableKey.get(gptId);

      if (fromGptId) {
        return fromGptId;
      }
    }

    const stableKey = normalizeStableKey(value);

    if (stableKey) {
      const fromStableKey = catalogByStableKey.get(stableKey);

      if (fromStableKey) {
        return fromStableKey;
      }
    }
  }

  for (const name of [agent.agent_name, agent.name, agent.title]) {
    const normalizedName = normalizeAgentName(name);

    if (!normalizedName) {
      continue;
    }

    const exact = catalogByName.get(normalizedName);

    if (exact) {
      return exact;
    }

    const fuzzy = catalogAgents.find((candidate) => {
      const candidateName = normalizeAgentName(candidate.name);

      return (
        candidateName &&
        normalizedName.length >= 3 &&
        candidateName.length >= 3 &&
        (candidateName.includes(normalizedName) || normalizedName.includes(candidateName))
      );
    });

    if (fuzzy) {
      return fuzzy;
    }
  }

  return null;
}

function getAvatarFromValues(values: unknown[]) {
  for (const value of values) {
    const source = getDirectImageSource(value);

    if (source) {
      return source;
    }

    const gptId = extractGptId(value);

    if (gptId && avatarByGptId.has(gptId)) {
      return avatarByGptId.get(gptId) ?? '';
    }
  }

  return '';
}

function getAgentLookupValues(agent: Record<string, unknown>) {
  return [
    agent.avatar,
    agent.avatarUrl,
    agent.avatar_url,
    agent.image,
    agent.imageUrl,
    agent.logo,
    agent.logoUrl,
    agent.endpoint,
    agent.url,
    agent.link,
    agent.jump_url,
    agent.chatgptEndpoint,
    agent.gptId,
    agent.gpt_id,
    agent.id,
    agent.agentKey,
    agent.agent_key,
    agent.agent_name,
    agent.name,
    agent.title,
  ].filter(Boolean);
}

function getAgentLaunchTarget(endpoint: unknown) {
  const href = firstString(endpoint);

  if (!/^https?:\/\//i.test(href)) {
    return null;
  }

  return {
    href,
    isChatGpt: /^https:\/\/chatgpt\.com\/g\//i.test(href),
  };
}

function normalizeLaunchTargets(launchTargets: AgentLaunchTarget[]) {
  const seen = new Set<string>();

  return launchTargets
    .map((target) => ({
      href: firstString(target.href),
      name: firstString(target.name, target.href),
    }))
    .filter((target) => {
      if (!target.href || seen.has(target.href)) {
        return false;
      }

      seen.add(target.href);
      return true;
    });
}

function navigateOpenedTab(tab: Window, href: string) {
  try {
    tab.opener = null;
    tab.location.replace(href);
  } catch {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

function writeLaunchHub(tab: Window, targets: AgentLaunchTarget[]) {
  const targetJson = JSON.stringify(targets).replace(/</g, '\\u003c');
  const links = targets
    .map(
      (target, index) => `
        <a class="agent-link" href="${escapeHtml(target.href)}" target="_blank" rel="noopener noreferrer">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <strong>${escapeHtml(target.name)}</strong>
          <em>${escapeHtml(target.href)}</em>
        </a>`,
    )
    .join('');

  tab.document.open();
  tab.document.write(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>智能体组合入口</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; }
      body {
        min-height: 100vh;
        margin: 0;
        padding: clamp(24px, 5vw, 56px);
        color: rgba(245, 252, 255, 0.94);
        background:
          radial-gradient(circle at 20% 12%, rgba(85, 223, 255, 0.2), transparent 32%),
          radial-gradient(circle at 82% 20%, rgba(255, 215, 118, 0.16), transparent 30%),
          linear-gradient(135deg, #030817, #07162e 52%, #03131f);
      }
      main { width: min(880px, 100%); margin: 0 auto; display: grid; gap: 18px; }
      h1 { margin: 0; font-size: clamp(24px, 4vw, 42px); letter-spacing: 0; }
      p { margin: 0; color: rgba(214, 236, 255, 0.72); line-height: 1.6; }
      button {
        justify-self: start;
        height: 44px;
        padding: 0 18px;
        border: 1px solid rgba(137, 226, 205, 0.36);
        border-radius: 8px;
        color: rgba(248, 255, 252, 0.98);
        background: rgba(18, 78, 83, 0.72);
        cursor: pointer;
        font: inherit;
        font-weight: 800;
      }
      .agent-list { display: grid; gap: 10px; margin-top: 4px; }
      .agent-link {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 8px 12px;
        align-items: center;
        padding: 14px;
        border: 1px solid rgba(91, 204, 255, 0.22);
        border-radius: 8px;
        color: inherit;
        background: rgba(5, 18, 39, 0.72);
        text-decoration: none;
      }
      .agent-link:hover { border-color: rgba(255, 226, 152, 0.46); background: rgba(8, 30, 55, 0.84); }
      .agent-link span { color: rgba(255, 226, 152, 0.9); font-weight: 900; }
      .agent-link strong, .agent-link em { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .agent-link em { grid-column: 2; color: rgba(172, 209, 232, 0.58); font-size: 12px; font-style: normal; }
    </style>
  </head>
  <body>
    <main>
      <h1>智能体组合入口</h1>
      <p>浏览器如果拦截了多个新窗口，可以在这里一次性打开本次推荐的全部智能体。</p>
      <button id="open-all" type="button">打开全部智能体</button>
      <section class="agent-list">${links}</section>
    </main>
    <script>
      const targets = ${targetJson};
      function openAllTargets() {
        targets.forEach((target) => window.open(target.href, '_blank', 'noopener,noreferrer'));
      }
      document.getElementById('open-all').addEventListener('click', openAllTargets);
      window.setTimeout(openAllTargets, 80);
    </script>
  </body>
</html>`);
  tab.document.close();

  try {
    tab.opener = null;
  } catch {
    // Some browsers disallow changing opener after document writes.
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDirectImageSource(value: unknown) {
  const source = firstString(value);

  return IMAGE_SOURCE_PATTERN.test(source) ? source : '';
}

function extractGptId(value: unknown) {
  const match = firstString(value).match(GPT_ID_PATTERN);

  return match ? match[0].toLowerCase() : '';
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (text) {
      return text;
    }
  }

  return '';
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function normalizeStableKey(value: unknown) {
  return firstString(value).toLowerCase();
}

function normalizeAgentName(value: unknown) {
  return stripRankPrefix(value)
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function stripRankPrefix(value: unknown) {
  return firstString(value).replace(/^[\s\p{N}\p{So}]+[\p{P}\s]*/u, '');
}
