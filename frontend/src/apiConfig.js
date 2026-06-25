export const DEFAULT_API_BASE_URL = "http://106.52.56.14/agent-workshop-api";

export function resolveApiBaseUrl() {
  const envBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  const apiBaseUrl = /^https?:\/\//i.test(envBaseUrl) ? envBaseUrl : DEFAULT_API_BASE_URL;

  return apiBaseUrl.replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();
export const COZE_CHAT_STREAM_URL = `${API_BASE_URL}/coze/chat/stream`;
export const AGENT_GATEWAY_URL = `${API_BASE_URL}/agent-gateway/chat`;
