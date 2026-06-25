export const DEFAULT_API_BASE_URL = "http://106.52.56.14/agent-workshop-api";

function isRemoteApiBaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      /^https?:$/.test(url.protocol) &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1" &&
      !hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl() {
  const envBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  const apiBaseUrl = isRemoteApiBaseUrl(envBaseUrl) ? envBaseUrl : DEFAULT_API_BASE_URL;

  return apiBaseUrl.replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();
export const COZE_CHAT_STREAM_URL = `${API_BASE_URL}/coze/chat/stream`;
export const AGENT_GATEWAY_URL = `${API_BASE_URL}/agent-gateway/chat`;
