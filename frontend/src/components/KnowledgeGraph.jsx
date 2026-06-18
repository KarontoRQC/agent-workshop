import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, GitBranch, Graph } from "@phosphor-icons/react";
import { getNode, graphModel } from "../agentAdapter.js";
import { buildGraphLayout, makeAmbientField, makeAmbientLinks } from "../graphLayout.js";

export function KnowledgeGraph({
  focusId,
  selectedId,
  depth,
  mode,
  showLabels,
  onFocus,
  onSelect,
}) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const ambientNodes = useMemo(() => makeAmbientField(1180), []);
  const ambientLinks = useMemo(() => makeAmbientLinks(ambientNodes), [ambientNodes]);
  const layout = useMemo(() => buildGraphLayout({ focusId, depth, mode }), [focusId, depth, mode]);
  const focus = getNode(focusId);
  const selected = getNode(selectedId || focusId);
  const transitionKey = `${focusId}:${selectedId}:${mode}:${depth}`;

  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return undefined;

    import("../pixiGraphEngine.js").then(({ createPixiGraphEngine }) =>
      createPixiGraphEngine(mount, {
        onHover: setHoveredId,
        onNodeClick(node) {
          onSelect(node.id);
          if (graphModel[node.id]) onFocus(node.id);
        },
      }),
    ).then((engine) => {
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      engine.update({
        ambientNodes,
        ambientLinks,
        layout,
        focusId,
        selectedId,
        hoveredId,
        showLabels,
        mode,
        transitionKey,
      });
    });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update({
      ambientNodes,
      ambientLinks,
      layout,
      focusId,
      selectedId,
      hoveredId,
      showLabels,
      mode,
      transitionKey,
    });
  }, [ambientNodes, ambientLinks, layout, focusId, selectedId, hoveredId, showLabels, mode, transitionKey]);

  useEffect(() => {
    const handleResize = () => engineRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section className={`graph-panel graph-mode-${mode}`} aria-label="智能体知识图谱">
      <div className="graph-summary">
        <span>{focusId === "root-brief" ? "开端 / 行业积累" : "行业聚焦 / 逐圈展开"}</span>
        <strong>{focus.label}</strong>
        <p>{focus.summary}</p>
      </div>

      <div className="graph-toolbar">
        <div className="graph-status">
          <span>
            <Graph size={15} />
            1180+ nodes
          </span>
          <span>
            <GitBranch size={15} />
            local depth {depth}
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
