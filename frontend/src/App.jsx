import { useEffect, useState } from "react";
import {
  ClockCounterClockwise,
  CubeTransparent,
  Network,
  PlugsConnected,
} from "@phosphor-icons/react";
import {
  askRoutingAgent,
  graphModel,
  ROOT_ID,
} from "./agentAdapter.js";
import { AgentDock } from "./components/AgentDock.jsx";
import { ControlDock } from "./components/ControlDock.jsx";
import { KnowledgeGraph } from "./components/KnowledgeGraph.jsx";
import { RecommendationRail } from "./components/RecommendationRail.jsx";

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
          66 智能体库
        </span>
        <span>
          <PlugsConnected size={15} />
          API Layer Mock
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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function focusNode(id) {
    setSelectedId(id);
    if (graphModel[id]) {
      setFocusId(id);
      setMode(id === ROOT_ID ? "atlas" : "path");
    }
  }

  function resetGraph() {
    setFocusId(ROOT_ID);
    setSelectedId(ROOT_ID);
    setMode("atlas");
  }

  function sendAgentMessage() {
    const text = draft.trim();
    if (!text) return;
    const response = askRoutingAgent(text, focusId);
    setDraft("");
    if (response.focusId) focusNode(response.focusId);
    setToast(response.text);
  }

  return (
    <main className={`app-shell app-mode-${mode}`}>
      <TopBar mode={mode} setMode={setMode} />
      <AgentDock
        draft={draft}
        setDraft={setDraft}
        onSend={sendAgentMessage}
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
