import { agentCatalog } from "./agentAdapter.js";

const avatarModules = import.meta.glob("./assets/agent-avatars/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const GPT_ID_PATTERN = /g-[a-z0-9]+/i;
const IMAGE_SOURCE_PATTERN = /^(?:data:image\/|https?:\/\/|\/).+\.(?:png|webp|jpe?g|gif|svg)(?:[?#].*)?$/i;

const avatarByGptId = new Map(
  Object.entries(avatarModules)
    .map(([path, source]) => {
      const gptId = extractGptId(path);
      return gptId ? [gptId, source] : null;
    })
    .filter(Boolean),
);

const catalogAgents = Object.values(agentCatalog);
const catalogByStableKey = new Map();
const catalogByName = new Map();

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

export function getAgentAvatar(agent) {
  const directAvatar = getAvatarFromValues(getAgentLookupValues(agent));
  if (directAvatar) return directAvatar;

  const catalogAgent = findCatalogAgent(agent);
  if (!catalogAgent) return "";

  return getAvatarFromValues(getAgentLookupValues(catalogAgent));
}

export function getAgentAvatarAlt(agent) {
  return stripRankPrefix(agent?.agent_name || agent?.name || agent?.title || "agent");
}

function findCatalogAgent(agent) {
  if (!agent) return null;

  for (const value of getAgentLookupValues(agent)) {
    const gptId = extractGptId(value);
    if (gptId) {
      const fromGptId = catalogByStableKey.get(gptId);
      if (fromGptId) return fromGptId;
    }

    const stableKey = normalizeStableKey(value);
    if (stableKey) {
      const fromStableKey = catalogByStableKey.get(stableKey);
      if (fromStableKey) return fromStableKey;
    }
  }

  const names = [agent.agent_name, agent.name, agent.title].filter(Boolean);
  for (const name of names) {
    const normalizedName = normalizeAgentName(name);
    if (!normalizedName) continue;

    const exact = catalogByName.get(normalizedName);
    if (exact) return exact;

    const fuzzy = catalogAgents.find((candidate) => {
      const candidateName = normalizeAgentName(candidate.name);
      return (
        candidateName &&
        normalizedName.length >= 3 &&
        candidateName.length >= 3 &&
        (candidateName.includes(normalizedName) || normalizedName.includes(candidateName))
      );
    });

    if (fuzzy) return fuzzy;
  }

  return null;
}

function getAvatarFromValues(values) {
  for (const value of values) {
    const source = getDirectImageSource(value);
    if (source) return source;

    const gptId = extractGptId(value);
    if (gptId && avatarByGptId.has(gptId)) {
      return avatarByGptId.get(gptId);
    }
  }

  return "";
}

function getAgentLookupValues(agent) {
  if (!agent) return [];

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

function getDirectImageSource(value) {
  const source = String(value || "").trim();
  return IMAGE_SOURCE_PATTERN.test(source) ? source : "";
}

function extractGptId(value) {
  const match = String(value || "").match(GPT_ID_PATTERN);
  return match ? match[0].toLowerCase() : "";
}

function normalizeStableKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAgentName(value) {
  return stripRankPrefix(value)
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
}

function stripRankPrefix(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s\p{N}\p{So}]+[\p{P}\s]*/u, "");
}
