import { useEffect, useMemo, useRef } from "react";
import { Crosshair, GitBranch, Graph } from "@phosphor-icons/react";
import { getNode, hasChildren, libraryStats } from "../agentAdapter.js";
import { buildGraphLayout, makeAmbientField, makeAmbientLinks } from "../graphLayout.js";

function focusModeLabel(node) {
  if (node.type === "brief") return "行业开端 / 场景积累";
  if (node.type === "industry") return "行业节点 / 痛点展开";
  if (node.type === "problem") return "痛点节点 / 变量拆解";
  if (node.type === "capability") return "能力节点 / 动作拆解";
  if (node.type === "action" || node.type === "asset" || node.type === "variable") {
    return "叶子节点 / 路径选中";
  }
  return "语义节点 / 关系聚焦";
}

export function KnowledgeGraph({
  focusId,
  selectedId,
  depth,
  mode,
  onFocus,
  onSelect,
}) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const hoverFrameRef = useRef(0);
  const pendingHoverRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const latestEngineParamsRef = useRef(null);
  const ambientNodes = useMemo(() => makeAmbientField(540), []);
  const ambientLinks = useMemo(() => makeAmbientLinks(ambientNodes), [ambientNodes]);
  const layout = useMemo(() => buildGraphLayout({ focusId, depth, mode }), [focusId, depth, mode]);
  const focus = getNode(focusId);
  const selected = getNode(selectedId || focusId);
  const transitionKey = `${focusId}:${selectedId}:${mode}:${depth}`;

  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return undefined;

    import("../pixiGraphEngine.js")
      .then(({ createPixiGraphEngine }) =>
        createPixiGraphEngine(mount, {
          onHover(id) {
            pendingHoverRef.current = id;
            if (hoverFrameRef.current) return;
            hoverFrameRef.current = window.requestAnimationFrame(() => {
              hoverFrameRef.current = 0;
              const hoveredId = pendingHoverRef.current;
              if (hoveredIdRef.current === hoveredId) return;

              hoveredIdRef.current = hoveredId;
              const latestParams = latestEngineParamsRef.current;
              if (!latestParams || !engineRef.current) return;

              const nextParams = {
                ...latestParams,
                hoveredId,
              };
              latestEngineParamsRef.current = nextParams;
              engineRef.current.update(nextParams);
            });
          },
          onNodeClick(node) {
            onSelect(node.id);
            if (hasChildren(node.id)) onFocus(node.id);
          },
        }),
      )
      .then((engine) => {
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        if (latestEngineParamsRef.current) engine.update(latestEngineParamsRef.current);
      });

    return () => {
      cancelled = true;
      if (hoverFrameRef.current) window.cancelAnimationFrame(hoverFrameRef.current);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const params = {
      ambientNodes,
      ambientLinks,
      layout,
      focusId,
      selectedId,
      hoveredId: hoveredIdRef.current,
      mode,
      transitionKey,
    };

    latestEngineParamsRef.current = params;
    engineRef.current?.update(params);
  }, [ambientNodes, ambientLinks, layout, focusId, selectedId, mode, transitionKey]);

  useEffect(() => {
    const handleResize = () => engineRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section className={`graph-panel graph-mode-${mode}`} aria-label="行业智能体知识图谱">
      <div className="graph-summary">
        <span>{focusModeLabel(focus)}</span>
        <strong>{focus.label}</strong>
        <p>{focus.summary}</p>
      </div>

      <div className="graph-toolbar">
        <div className="graph-status">
          <span>
            <Graph size={15} />
            {libraryStats.agentCount} agents
          </span>
          <span>
            <GitBranch size={15} />
            depth {depth}
          </span>
          <span>
            <Crosshair size={15} />
            {selected.label}
          </span>
        </div>
      </div>

      <div ref={mountRef} className="pixi-graph-host" aria-hidden="true" />
    </section>
  );
}
