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
