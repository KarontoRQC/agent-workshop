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

function createEmptyAgentWorkflow() {
  return {
    knowledgeGraph: {
      ACK: "",
      KG_PATH: "",
      EXPLANATION: "",
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
  const [toast, setToast] = useState("");
  const [agentStream, setAgentStream] = useState({
    status: "idle",
    lastMessage: "",
    workflow: createEmptyAgentWorkflow(),
    error: "",
  });
  const [agentTurns, setAgentTurns] = useState([]);
  const agentRequestRef = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => agentRequestRef.current?.abort();
  }, []);

  function focusNode(id) {
    setSelectedId(id);
    if (graphModel[id] && hasChildren(id)) {
      setFocusId(id);
      setMode(id === ROOT_ID ? "atlas" : "path");
    }
  }

  function resetGraph() {
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
    setToast(response.text);

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
        onRecommendedAgent(agent) {
          if (!agent) return;

          setAgentStream((current) => ({
            ...current,
            workflow: appendRecommendedAgent(current.workflow, agent),
          }));
          setAgentTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    workflow: appendRecommendedAgent(turn.workflow, agent),
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
    <main className={`app-shell app-mode-${mode}`}>
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
      <RecommendationRail focusId={focusId} selectedId={selectedId} onToast={setToast} />
      <ControlDock
        mode={mode}
        setMode={setMode}
        depth={depth}
        setDepth={setDepth}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        onReset={resetGraph}
      />
      {toast && (
        <button type="button" className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      )}
    </main>
  );
}

function getWorkflowSection(event) {
  if (event.stage === "knowledge_graph" && ["ACK", "KG_PATH", "EXPLANATION"].includes(event.type)) {
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

function appendRecommendedAgent(workflow, agent) {
  const currentAgents = workflow.agentRecommendation.agents || [];
  const key = getRecommendedAgentKey(agent);

  if (currentAgents.some((item) => getRecommendedAgentKey(item) === key)) {
    return workflow;
  }

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents: [...currentAgents, agent],
    },
  };
}

function replaceRecommendedAgents(workflow, agents) {
  if (!Array.isArray(agents)) return workflow;

  return {
    ...workflow,
    agentRecommendation: {
      ...workflow.agentRecommendation,
      agents,
    },
  };
}

function getRecommendedAgentKey(agent) {
  return `${agent.rank || ""}-${agent.agent_name || agent.name || ""}`;
}

function formatWorkflowError(event) {
  if (event.detail?.msg) return event.detail.msg;
  if (event.detail && typeof event.detail === "string") return event.detail;
  return event.error || "智能体推荐阶段失败";
}
