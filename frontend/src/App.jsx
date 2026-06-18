import { useEffect, useRef, useState } from "react";
import {
  ClockCounterClockwise,
  CubeTransparent,
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

const GRAPH_PATH_STEP_MS = 980;

function createEmptyAgentWorkflow() {
  return {
    knowledgeGraph: {
      ACK: "",
      DIRECT_REPLY: "",
      KG_PATH: "",
      EXPLANATION: "",
      graphPath: null,
    },
    agentRecommendation: {
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
        <span className="brand-glyph">
          <CubeTransparent size={24} weight="duotone" />
        </span>
        <div>
          <strong>智能体知识图谱</strong>
          <span>Agentic Knowledge Atlas</span>
        </div>
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
  const [showLabels, setShowLabels] = useState(false);
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
  });
  const hasRecommendedAgents = agentStream.workflow.agentRecommendation.agents.length > 0;

  useEffect(() => {
    return () => {
      agentRequestRef.current?.abort();
      clearGraphPathAnimation();
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

  function clearGraphPathAnimation() {
    const animation = graphPathAnimationRef.current;

    if (animation.timer) {
      window.clearTimeout(animation.timer);
    }

    animation.queue = [];
    animation.seen = new Set();
    animation.timer = null;
    animation.playing = false;
  }

  function enqueueGraphPathNode(node) {
    const nodeId = node?.id;

    if (!nodeId || !graphModel[nodeId]) return;

    const animation = graphPathAnimationRef.current;
    if (animation.seen.has(nodeId)) return;

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
        onGraphNode(node) {
          enqueueGraphPathNode(node);
        },
        onGraphPathResolved(event) {
          const nodes = Array.isArray(event.nodes) ? event.nodes : [];

          setAgentStream((current) => ({
            ...current,
            workflow: setWorkflowGraphPath(current.workflow, event),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: setWorkflowGraphPath(turn.workflow, event),
                  }
              : turn,
            ),
          );

          enqueueGraphPathNodes(nodes);
        },
        onWorkflowError(event) {
          const message = formatWorkflowError(event);

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
          setAgentStream((current) => ({
            ...current,
            status: "completed",
          }));
          setAgentTurns((current) =>
            current.map((turn) => (turn.id === turnId ? { ...turn, status: "completed" } : turn)),
          );
        },
      });

      setAgentStream((current) => ({
        ...current,
        status: current.status === "streaming" ? "completed" : current.status,
      }));
      setAgentTurns((current) =>
        current.map((turn) =>
          turn.id === turnId && turn.status === "streaming" ? { ...turn, status: "completed" } : turn,
        ),
      );
    } catch (error) {
      if (error.name === "AbortError") return;

      const message = error.message || "智能助手连接失败";
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
        showLabels={showLabels}
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
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        onReset={resetGraph}
      />
    </main>
  );
}

function getWorkflowSection(event) {
  if (event.stage === "knowledge_graph" && ["ACK", "DIRECT_REPLY", "KG_PATH", "EXPLANATION"].includes(event.type)) {
    return "knowledgeGraph";
  }

  if (event.stage === "agent_recommendation" && ["ACK", "SUMMARY"].includes(event.type)) {
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
