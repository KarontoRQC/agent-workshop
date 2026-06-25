import { useEffect, useRef, useState } from "react";
import {
  ClockCounterClockwise,
  Network,
  PlugsConnected,
} from "@phosphor-icons/react";
import {
  askRoutingAgent,
  getAgentPackage,
  graphModel,
  hasChildren,
  libraryStats,
  ROOT_ID,
} from "./agentAdapter.js";
import { AgentDock } from "./components/AgentDock.jsx";
import { ControlDock } from "./components/ControlDock.jsx";
import { KnowledgeGraph } from "./components/KnowledgeGraph.jsx";
import { RecommendationRail } from "./components/RecommendationRail.jsx";
import { streamCozeChat } from "./cozeChatClient.js";
import baiLogo from "./assets/bailogo.png";

const GRAPH_PATH_STEP_MS = 980;

function createEmptyAgentWorkflow() {
  return {
    knowledgeGraph: {
      THINKING_PROCESS: "",
      ACK: "",
      DIRECT_REPLY: "",
      KG_PATH: "",
      EXPLANATION: "",
      graphPath: null,
    },
    agentRecommendation: {
      THINKING_PROCESS: "",
      ACK: "",
      SUMMARY: "",
      agents: [],
    },
  };
}

function TopBar({ mode, setMode }) {
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <img className="brand-logo" src={baiLogo} alt="中隐" />
      </div>

      <nav className="top-pills" aria-label="系统状态">
        <span>
          <Network size={15} />
          {libraryStats.agentCount} 智能体库
        </span>
        <span>
          <PlugsConnected size={15} />
          Coze API
        </span>
        <span>
          <ClockCounterClockwise size={15} />
          演示模式
        </span>
      </nav>

      <div className="top-switch">
        <button type="button" className={mode === "atlas" ? "active" : ""} onClick={() => setMode("atlas")}>
          全域
        </button>
        <button type="button" className={mode === "path" ? "active" : ""} onClick={() => setMode("path")}>
          路径
        </button>
        <button type="button" className={mode === "step" ? "active" : ""} onClick={() => setMode("step")}>
          推进
        </button>
      </div>
    </header>
  );
}

export function App() {
  const [focusId, setFocusId] = useState(ROOT_ID);
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  const [depth, setDepth] = useState(3);
  const [mode, setMode] = useState("atlas");
  const [draft, setDraft] = useState("");
  const [agentStream, setAgentStream] = useState({
    status: "idle",
    lastMessage: "",
    workflow: createEmptyAgentWorkflow(),
    error: "",
  });
  const [agentTurns, setAgentTurns] = useState([]);
  const agentRequestRef = useRef(null);
  const graphPathAnimationRef = useRef({
    queue: [],
    seen: new Set(),
    timer: null,
    playing: false,
    activeTurnId: null,
    completionPending: false,
    holdingReply: false,
    graphStarted: false,
  });
  const hasRecommendedAgents = agentStream.workflow.agentRecommendation.agents.length > 0;

  useEffect(() => {
    return () => {
      agentRequestRef.current?.abort();
      clearGraphPathAnimation({ releaseHold: false });
    };
  }, []);

  function focusNode(id) {
    setSelectedId(id);
    if (graphModel[id] && hasChildren(id)) {
      setFocusId(id);
      setMode(id === ROOT_ID ? "atlas" : "path");
    }
  }

  function moveGraphToNode(node) {
    const nodeId = node?.id;
    const graphNode = nodeId ? graphModel[nodeId] : null;

    if (!graphNode) return;

    const parentId = graphNode.parent || node.parent;
    const nextFocusId = hasChildren(nodeId) ? nodeId : parentId || nodeId;

    setSelectedId(nodeId);
    setFocusId(graphModel[nextFocusId] ? nextFocusId : nodeId);
    setMode(nodeId === ROOT_ID ? "atlas" : "path");
  }

  function clearGraphPathAnimation({ releaseHold = true } = {}) {
    const animation = graphPathAnimationRef.current;

    if (animation.timer) {
      window.clearTimeout(animation.timer);
    }

    if (releaseHold && animation.activeTurnId && animation.holdingReply) {
      setTurnReplyHold(animation.activeTurnId, false);
    }

    animation.queue = [];
    animation.seen = new Set();
    animation.timer = null;
    animation.playing = false;
    animation.activeTurnId = null;
    animation.completionPending = false;
    animation.holdingReply = false;
    animation.graphStarted = false;
  }

  function setTurnReplyHold(turnId, replyHold) {
    if (!turnId) return;

    setAgentTurns((current) =>
      current.map((turn) => (turn.id === turnId ? { ...turn, replyHold } : turn)),
    );
  }

  function beginGraphReplyHold() {
    const animation = graphPathAnimationRef.current;
    const turnId = animation.activeTurnId;

    if (!turnId || animation.holdingReply) return;

    animation.holdingReply = true;
    setTurnReplyHold(turnId, true);
  }

  function completeTurn(turnId) {
    setAgentStream((current) => ({
      ...current,
      status: current.status === "streaming" ? "completed" : current.status,
    }));
    setAgentTurns((current) =>
      current.map((turn) =>
        turn.id === turnId && turn.status === "streaming" ? { ...turn, status: "completed" } : turn,
      ),
    );
  }

  function completeTurnWhenGraphReady(turnId) {
    const animation = graphPathAnimationRef.current;
    const graphIsAnimating =
      animation.activeTurnId === turnId &&
      animation.graphStarted &&
      (animation.holdingReply || animation.playing || Boolean(animation.timer) || animation.queue.length > 0);

    if (animation.activeTurnId === turnId && animation.holdingReply && !animation.graphStarted) {
      setTurnReplyHold(turnId, false);
      animation.holdingReply = false;
    }

    if (graphIsAnimating) {
      animation.completionPending = true;
      return;
    }

    completeTurn(turnId);

    if (animation.activeTurnId === turnId) {
      animation.activeTurnId = null;
      animation.completionPending = false;
      animation.holdingReply = false;
    }
  }

  function releaseGraphReplyHoldIfIdle() {
    const animation = graphPathAnimationRef.current;

    if (animation.playing || animation.timer || animation.queue.length > 0) return;

    const turnId = animation.activeTurnId;

    if (turnId && animation.holdingReply) {
      setTurnReplyHold(turnId, false);
    }

    animation.holdingReply = false;

    if (turnId && animation.completionPending) {
      animation.completionPending = false;
      completeTurn(turnId);
      animation.activeTurnId = null;
      animation.graphStarted = false;
    }
  }

  function enqueueGraphPathNode(node) {
    const nodeId = node?.id;

    if (!nodeId || !graphModel[nodeId]) return;

    const animation = graphPathAnimationRef.current;
    if (animation.seen.has(nodeId)) return;

    animation.graphStarted = true;
    beginGraphReplyHold();
    animation.seen.add(nodeId);
    animation.queue.push(node);
    playNextGraphPathNode();
  }

  function enqueueGraphPathNodes(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node) => enqueueGraphPathNode(node));
  }

  function playNextGraphPathNode() {
    const animation = graphPathAnimationRef.current;

    if (animation.playing || animation.timer) return;

    const node = animation.queue.shift();
    if (!node) {
      animation.playing = false;
      releaseGraphReplyHoldIfIdle();
      return;
    }

    animation.playing = true;
    moveGraphToNode(node);
    animation.timer = window.setTimeout(() => {
      animation.timer = null;
      animation.playing = false;
      playNextGraphPathNode();
    }, GRAPH_PATH_STEP_MS);
  }

  function resetGraph() {
    clearGraphPathAnimation();
    setFocusId(ROOT_ID);
    setSelectedId(ROOT_ID);
    setMode("atlas");
  }

  async function sendAgentMessage() {
    const text = draft.trim();
    if (!text || agentStream.status === "streaming") return;

    const response = askRoutingAgent(text, focusId);
    const controller = new AbortController();
    const turnId = `turn-${Date.now()}`;
    const targetFocusId = response.focusId || focusId;
    const agentNames = getAgentPackage(targetFocusId).map((agent) => agent.name);

    agentRequestRef.current?.abort();
    clearGraphPathAnimation();
    graphPathAnimationRef.current.activeTurnId = turnId;
    agentRequestRef.current = controller;

    setDraft("");
    setAgentTurns((current) => [
      ...current.slice(-5),
      {
        id: turnId,
        user: text,
        status: "streaming",
        workflow: createEmptyAgentWorkflow(),
        error: "",
        replyHold: false,
      },
    ]);
    setAgentStream({
      status: "streaming",
      lastMessage: text,
      workflow: createEmptyAgentWorkflow(),
      error: "",
    });

    if (response.focusId) focusNode(response.focusId);

    try {
      await streamCozeChat(text, {
        signal: controller.signal,
        agentNames,
        onContentDelta(event) {
          const section = getWorkflowSection(event);
          if (!section) return;

          if (section === "knowledgeGraph") {
            beginGraphReplyHold();
          }

          const content = event.content || "";
          setAgentStream((current) => ({
            ...current,
            workflow: appendWorkflowContent(current.workflow, section, event.type, content),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: appendWorkflowContent(turn.workflow, section, event.type, content),
                  }
                : turn,
            ),
          );
        },
        onRecommendedAgentStarted(event) {
          const agent = { agent_index: event.agent_index };

          setAgentStream((current) => ({
            ...current,
            workflow: upsertRecommendedAgent(current.workflow, agent, { streamStatus: "streaming" }),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: upsertRecommendedAgent(turn.workflow, agent, { streamStatus: "streaming" }),
                  }
                : turn,
            ),
          );
        },
        onRecommendedAgent(agent, event) {
          if (!agent) return;

          const activeField = event?.delta?.field || null;

          setAgentStream((current) => ({
            ...current,
            workflow: upsertRecommendedAgent(current.workflow, agent, {
              activeField,
              streamStatus: "streaming",
            }),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: upsertRecommendedAgent(turn.workflow, agent, {
                      activeField,
                      streamStatus: "streaming",
                    }),
                  }
                : turn,
            ),
          );
        },
        onRecommendedAgentCompleted(agent) {
          if (!agent) return;

          setAgentStream((current) => ({
            ...current,
            workflow: upsertRecommendedAgent(current.workflow, agent, {
              streamStatus: "completed",
              activeField: null,
            }),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: upsertRecommendedAgent(turn.workflow, agent, {
                      streamStatus: "completed",
                      activeField: null,
                    }),
                  }
                : turn,
            ),
          );
        },
        onRecommendedAgentsCompleted(agents) {
          setAgentStream((current) => ({
            ...current,
            workflow: replaceRecommendedAgents(current.workflow, agents),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: replaceRecommendedAgents(turn.workflow, agents),
                  }
              : turn,
            ),
          );
        },
        onGraphNode(node, event) {
          if (isNodeInRouteContext(node, event?.route)) {
            enqueueGraphPathNode(node);
          }
        },
        onGraphPathResolved(event) {
          const nodes = sanitizeGraphPathNodes(Array.isArray(event.nodes) ? event.nodes : [], event.route);
          const graphPathEvent = { ...event, nodes };

          setAgentStream((current) => ({
            ...current,
            workflow: setWorkflowGraphPath(current.workflow, graphPathEvent),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: setWorkflowGraphPath(turn.workflow, graphPathEvent),
                  }
              : turn,
            ),
          );

          if (nodes.length > 0) {
            enqueueGraphPathNodes(nodes);
          } else {
            releaseGraphReplyHoldIfIdle();
          }
        },
        onWorkflowError(event) {
          const message = formatWorkflowError(event);

          setTurnReplyHold(turnId, false);
          setAgentStream((current) => ({
            ...current,
            status: "error",
            error: message,
          }));
          setAgentTurns((current) =>
            current.map((turn) => (turn.id === turnId ? { ...turn, status: "error", error: message } : turn)),
          );
        },
        onCompleted() {
          completeTurnWhenGraphReady(turnId);
        },
      });

      completeTurnWhenGraphReady(turnId);
    } catch (error) {
      if (error.name === "AbortError") return;

      const message = error.message || "智能助手连接失败";
      setTurnReplyHold(turnId, false);
      setAgentStream((current) => ({
        ...current,
        status: "error",
        error: message,
      }));
      setAgentTurns((current) =>
        current.map((turn) => (turn.id === turnId ? { ...turn, status: "error", error: message } : turn)),
      );
    } finally {
      if (agentRequestRef.current === controller) {
        agentRequestRef.current = null;
      }
    }
  }

  return (
    <main className={`app-shell app-mode-${mode} ${hasRecommendedAgents ? "" : "rail-collapsed"}`}>
      <TopBar mode={mode} setMode={setMode} />
      <AgentDock
        draft={draft}
        setDraft={setDraft}
        onSend={sendAgentMessage}
        status={agentStream.status}
        turns={agentTurns}
      />
      <KnowledgeGraph
        focusId={focusId}
        selectedId={selectedId}
        depth={depth}
        mode={mode}
        onFocus={focusNode}
        onSelect={setSelectedId}
      />
      <RecommendationRail
        focusId={focusId}
        selectedId={selectedId}
        recommendedAgents={agentStream.workflow.agentRecommendation.agents}
        status={agentStream.status}
      />
      <ControlDock
        mode={mode}
        setMode={setMode}
        depth={depth}
        setDepth={setDepth}
        onReset={resetGraph}
      />
    </main>
  );
}

function getWorkflowSection(event) {
  if (
    event.stage === "knowledge_graph" &&
    ["THINKING_PROCESS", "ACK", "DIRECT_REPLY", "KG_PATH", "EXPLANATION"].includes(event.type)
  ) {
    return "knowledgeGraph";
  }

  if (event.stage === "agent_recommendation" && ["THINKING_PROCESS", "ACK", "SUMMARY"].includes(event.type)) {
    return "agentRecommendation";
  }

  return null;
}

function appendWorkflowContent(workflow, section, type, content) {
  return {
    ...workflow,
    [section]: {
      ...workflow[section],
      [type]: `${workflow[section][type] || ""}${content}`,
    },
  };
}

function upsertRecommendedAgent(workflow, agent, options = {}) {
  const currentAgents = workflow.agentRecommendation.agents || [];
  const normalizedAgent = normalizeRecommendedAgent(agent);
  const key = getRecommendedAgentKey(normalizedAgent);
  const existingIndex = currentAgents.findIndex((item) => getRecommendedAgentKey(item) === key);
  const hasActiveFieldOption = Object.hasOwn(options, "activeField");

  if (existingIndex >= 0) {
    return {
      ...workflow,
      agentRecommendation: {
        ...workflow.agentRecommendation,
        agents: currentAgents.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                ...normalizedAgent,
                streamStatus: options.streamStatus || item.streamStatus || "streaming",
                activeField: hasActiveFieldOption ? options.activeField : item.activeField ?? null,
              }
            : item,
        ),
      },
    };
  }

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents: [
        ...currentAgents,
        {
          ...normalizedAgent,
          streamStatus: options.streamStatus || "streaming",
          activeField: hasActiveFieldOption ? options.activeField : null,
        },
      ],
    },
  };
}

function replaceRecommendedAgents(workflow, agents) {
  if (!Array.isArray(agents)) return workflow;
  const currentAgents = workflow.agentRecommendation.agents || [];

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents: agents.map((agent, index) => {
        const normalizedAgent = normalizeRecommendedAgent(agent, index);
        const existing = currentAgents.find((item) => getRecommendedAgentKey(item) === getRecommendedAgentKey(normalizedAgent));

        return {
          ...existing,
          ...normalizedAgent,
          streamStatus: "completed",
          activeField: null,
        };
      }),
    },
  };
}

function setWorkflowGraphPath(workflow, graphPath) {
  return {
    ...workflow,
    knowledgeGraph: {
      ...workflow.knowledgeGraph,
      graphPath,
    },
  };
}

function getRecommendedAgentKey(agent) {
  if (agent.agent_index !== undefined && agent.agent_index !== null) {
    return `agent-index-${agent.agent_index}`;
  }

  return `${agent.rank || ""}-${agent.agent_name || agent.name || ""}`;
}

function normalizeRecommendedAgent(agent, fallbackIndex = null) {
  if (!agent) return {};
  if (agent.agent_index !== undefined && agent.agent_index !== null) return agent;
  if (fallbackIndex === null) return agent;

  return {
    agent_index: fallbackIndex,
    ...agent,
  };
}

function formatWorkflowError(event) {
  if (event.detail?.msg) return event.detail.msg;
  if (event.detail && typeof event.detail === "string") return event.detail;
  return event.error || "智能体推荐阶段失败";
}

function sanitizeGraphPathNodes(nodes, routeText) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const filteredNodes = nodes.filter((node) => isNodeInRouteContext(node, routeText));
  if (filteredNodes.length > 0) return filteredNodes;

  return getRouteAnchorNodes(routeText);
}

function isNodeInRouteContext(node, routeText) {
  const anchors = getRouteAnchorNodes(routeText);
  if (anchors.length === 0) return true;

  const nodeId = node?.id;
  if (!nodeId || !graphModel[nodeId]) return false;

  return anchors.some((anchor) => nodeId === anchor.id || isDescendantOf(nodeId, anchor.id));
}

function getRouteAnchorNodes(routeText) {
  const parts = splitRouteText(routeText).map(normalizeRouteText).filter(Boolean);
  if (parts.length === 0) return [];

  return Object.values(graphModel).filter((node) => {
    const isIndustryAnchor = node.type === "industry" || node.parent === ROOT_ID;
    if (!isIndustryAnchor) return false;

    const labels = [node.label, node.displayLabel].map(normalizeRouteText);
    return labels.some((label) => parts.includes(label));
  });
}

function isDescendantOf(nodeId, ancestorId) {
  let cursor = graphModel[nodeId];
  const seen = new Set();

  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === ancestorId) return true;
    seen.add(cursor.id);
    cursor = graphModel[cursor.parent];
  }

  return false;
}

function splitRouteText(routeText) {
  return String(routeText || "")
    .split(/\s*(?:>|›|→|->|-|—|–|\/|、|，|,)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeRouteText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}
