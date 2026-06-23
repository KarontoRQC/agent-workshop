import { useEffect, useMemo, useRef } from "react";
import { Crosshair, GitBranch, Graph } from "@phosphor-icons/react";
import { getNode, hasChildren, libraryStats } from "../agentAdapter.js";
import { buildGraphLayout, makeAmbientField, makeAmbientLinks } from "../graphLayout.js";

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
    <section className={`graph-panel graph-mode-${mode}`} aria-label="Knowledge graph">
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
