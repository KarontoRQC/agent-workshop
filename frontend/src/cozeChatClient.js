const DEFAULT_API_BASE_URL = "http://106.52.56.14/agent-workshop-api";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
const API_BASE_URL = apiBaseUrl.replace(/\/+$/, "");
const COZE_CHAT_STREAM_URL = `${API_BASE_URL}/coze/chat/stream`;

export async function streamCozeChat(message, handlers = {}) {
  const body = {
    message,
    parameters: {},
  };

  if (Array.isArray(handlers.agentNames) && handlers.agentNames.length > 0) {
    body.agent_names = handlers.agentNames;
  }

  const response = await fetch(COZE_CHAT_STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const errorMessage = errorPayload?.error || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("浏览器不支持流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";

    for (const frame of frames) {
      emitSseFrame(frame, handlers);
    }
  }

  if (buffer.trim()) {
    emitSseFrame(buffer, handlers);
  }
}

function emitSseFrame(frame, handlers) {
  const event = parseSseFrame(frame);

  if (!event) {
    return;
  }

  handlers.onEvent?.(event);

  if (event.event === "content.delta") {
    handlers.onContentDelta?.(event);
  }

  if (event.event === "recommended_agents.delta") {
    handlers.onRecommendedAgent?.(event.agent, event);
  }

  if (event.event === "recommended_agent.started") {
    handlers.onRecommendedAgentStarted?.(event);
  }

  if (event.event === "recommended_agent.field.completed") {
    handlers.onRecommendedAgentFieldCompleted?.(event);
  }

  if (event.event === "recommended_agent.completed") {
    handlers.onRecommendedAgentCompleted?.(event.agent, event);
  }

  if (event.event === "recommended_agents.completed") {
    handlers.onRecommendedAgentsCompleted?.(event.agents || [], event);
  }

  if (event.event === "graph.node.delta") {
    handlers.onGraphNode?.(event.node, event);
  }

  if (event.event === "graph.path.resolved") {
    handlers.onGraphPathResolved?.(event);
  }

  if (event.event === "workflow.error") {
    handlers.onWorkflowError?.(event);
  }

  if (event.event === "workflow.completed" || event.event === "chat.completed") {
    handlers.onCompleted?.(event);
  }
}

function parseSseFrame(frame) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n");

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
