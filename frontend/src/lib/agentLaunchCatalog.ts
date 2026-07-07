import type { AgentCatalogItem, RecommendedAgent } from '../types';

type CatalogAgent = {
  agentKey?: string;
  agent_key?: string;
  avatar?: string;
  endpoint?: string;
  functionLabel?: string;
  id?: string;
  launch_url?: string;
  name?: string;
  role?: string;
  score?: number | string;
  tags?: string[];
  typeLabel?: string;
  [key: string]: unknown;
};

export type AgentLaunchTarget = {
  href: string;
  name: string;
};

type OpenAgentLaunchTargetsOptions = {
  preferCombinationEntry?: boolean;
  recommendationId?: string;
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

const GPT_ID_PATTERN = /g-[a-z0-9]+/i;
const IMAGE_FILE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const STATIC_AGENT_AVATAR_PATTERN = /^\/agent-avatars\//i;
const LEGACY_AGENT_AVATAR_PATTERN = /\/api\/agents\/[^/?#]+\/avatar(?:$|[?#])/i;

let catalogAgents: CatalogAgent[] = [];
const catalogByStableKey = new Map<string, CatalogAgent>();
const catalogByName = new Map<string, CatalogAgent>();

export function setAgentCatalogAgents(agents: AgentCatalogItem[]) {
  catalogAgents = agents.map(normalizeCatalogAgent).filter((agent) => Boolean(agent.name));
  rebuildCatalogIndexes(catalogAgents);
}

export function enrichDrawAgent(agent: RecommendedAgent): EnrichedDrawAgent {
  const inputName = firstString(agent.agent_name, agent.name);
  const agentKey = firstString(agent.agent_key, agent.agentKey, agent.agent_id, agent.id);
  const catalogAgent = findCatalogAgent({ ...agent, agentKey, name: inputName });
  const catalogName = firstString(catalogAgent?.name);
  const name = stripRankPrefix(inputName || catalogName || '智能体生成中');
  const endpoint = firstString(
    agent.launch_url,
    agent.endpoint,
    agent.url,
    agent.link,
    agent.jump_url,
    catalogAgent?.endpoint,
    catalogAgent?.launch_url,
  );
  const avatar = getAgentAvatar(
    {
    ...agent,
    agentKey: agentKey || catalogAgent?.agentKey,
    endpoint,
    name: inputName || catalogName || name,
    },
    catalogAgent,
  );
  const launchTarget = getAgentLaunchTarget(endpoint);
  const catalogFunctionLabel = firstString(catalogAgent?.functionLabel, catalogAgent?.function);
  const catalogTypeLabel = firstString(catalogAgent?.typeLabel, catalogAgent?.type);
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
  const fallbackReason = firstString(agent.reason, agent.description, catalogAgent?.role, '等待智能体补全推荐理由。');

  return {
    ...agent,
    agentKey: agentKey || catalogAgent?.agentKey,
    avatar,
    avatarAlt: `${name} 头像`,
    canOpen: Boolean(launchTarget?.href),
    endpoint,
    fallbackReason,
    id: firstString(agent.id, agent.agent_id, catalogAgent?.id),
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

export function getCatalogHeroAgents(agents?: AgentCatalogItem[]): EnrichedDrawAgent[] {
  const sourceAgents = agents ? agents.map(normalizeCatalogAgent).filter((agent) => Boolean(agent.name)) : catalogAgents;

  return sourceAgents.map((agent, index) =>
    enrichDrawAgent({
      ...agent,
      agent_id: agent.id,
      agent_index: index,
      agent_key: agent.agentKey,
      agent_name: agent.name,
      endpoint: agent.endpoint,
      launch_url: agent.launch_url,
      reason: agent.role,
      stage: agent.functionLabel || agent.typeLabel,
      streamStatus: 'completed',
    }),
  );
}

export async function openAgentLaunchTargets(launchTargets: AgentLaunchTarget[], options: OpenAgentLaunchTargetsOptions = {}) {
  const targets = normalizeLaunchTargets(launchTargets);
  const recommendationId = firstString(options.recommendationId);
  const combinationEntryUrl = recommendationId ? getAgentCombinationEntryUrl(recommendationId) : '';

  if (combinationEntryUrl) {
    openDetachedPage(combinationEntryUrl);
    return;
  }

  if (options.preferCombinationEntry) {
    return;
  }

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
    navigateOpenedTab(hubTab, targets[0].href);
  } else {
    openDetachedPage(targets[0].href);
  }

  openedEntries.forEach(({ target, tab }) => navigateOpenedTab(tab, target.href));
}

export function getAgentCombinationEntryUrl(recommendationId: string) {
  const id = firstString(recommendationId);
  const url = new URL(window.location.href);

  url.search = `?agent_combination=1&id=${encodeURIComponent(id)}`;
  url.hash = '';

  return url.toString();
}

function normalizeCatalogAgent(agent: AgentCatalogItem): CatalogAgent {
  const endpoint = firstString(agent.launch_url, agent.launchUrl, agent.endpoint, agent.url, agent.link);
  const avatar = firstString(agent.avatar_url, agent.avatarUrl, agent.avatar);
  const functionLabel = firstString(agent.function, agent.functionLabel);
  const typeLabel = firstString(agent.type, agent.typeLabel);
  const name = firstString(agent.name, agent.agent_name);

  return {
    ...agent,
    agentKey: firstString(agent.agentKey, agent.agent_key, agent.id),
    avatar,
    endpoint,
    functionLabel,
    id: firstString(agent.id),
    launch_url: endpoint,
    name,
    role: firstString(agent.description, agent.reason, name ? `${name} 是当前智能体库中的可调用能力。` : ''),
    tags: Array.isArray(agent.tags) ? agent.tags : [],
    typeLabel,
  };
}

function rebuildCatalogIndexes(agents: CatalogAgent[]) {
  catalogByStableKey.clear();
  catalogByName.clear();

  for (const agent of agents) {
    const stableKeys = [agent.id, agent.agentKey, agent.agent_key, agent.agent_id, extractGptId(agent.endpoint), extractGptId(agent.launch_url)];

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
}

function getAgentAvatar(agent: Record<string, unknown>, catalogAgent?: CatalogAgent | null) {
  const directAvatar = getAvatarFromValues(getAgentLookupValues(agent));
  const catalogAvatar = catalogAgent ? getAvatarFromValues(getAgentLookupValues(catalogAgent)) : '';

  if (catalogAvatar && (!directAvatar || isLegacyAgentAvatarUrl(directAvatar))) {
    return catalogAvatar;
  }

  if (directAvatar) {
    return directAvatar;
  }

  const matchedCatalogAgent = catalogAgent || findCatalogAgent(agent);

  return matchedCatalogAgent ? getAvatarFromValues(getAgentLookupValues(matchedCatalogAgent)) : '';
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
  }

  return null;
}

function getAvatarFromValues(values: unknown[]) {
  for (const value of values) {
    const source = getDirectImageSource(value);

    if (source) {
      return source;
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
    agent.launch_url,
    agent.launchUrl,
    agent.url,
    agent.link,
    agent.jump_url,
    agent.chatgptEndpoint,
    agent.gptId,
    agent.gpt_id,
    agent.id,
    agent.agent_id,
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
    openDetachedPage(href);
  }
}

function openDetachedPage(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function getDirectImageSource(value: unknown) {
  const source = firstString(value);

  if (!source) {
    return '';
  }

  if (/^data:image\//i.test(source) || STATIC_AGENT_AVATAR_PATTERN.test(source) || isLegacyAgentAvatarUrl(source)) {
    return source;
  }

  if (!/^(?:https?:\/\/|\/)/i.test(source)) {
    return '';
  }

  const pathWithoutQuery = source.split(/[?#]/, 1)[0] || '';

  return IMAGE_FILE_EXTENSION_PATTERN.test(pathWithoutQuery) ? source : '';
}

function isLegacyAgentAvatarUrl(value: unknown) {
  return LEGACY_AGENT_AVATAR_PATTERN.test(firstString(value));
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
