import {
  ArrowsOutSimple,
  Crosshair,
  FadersHorizontal,
  GitBranch,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { makeAmbientField } from "../graphLayout.js";

const minimapNodes = makeAmbientField(72);

const modes = [
  { id: "atlas", label: "全域星图", desc: "先展示行业规模感" },
  { id: "path", label: "路径聚焦", desc: "高亮当前语义链" },
  { id: "step", label: "逐层推进", desc: "适合现场讲解" },
];

export function ControlDock({ mode, setMode, depth, setDepth, showLabels, setShowLabels, onReset }) {
  return (
    <footer className="control-dock" aria-label="图谱控制">
      <section className="control-cluster view-controls">
        <h3>
          <Crosshair size={16} />
          视角
        </h3>
        <div className="icon-buttons">
          <button type="button" onClick={onReset} aria-label="回到开端节点">
            <ArrowsOutSimple size={18} />
          </button>
          <button type="button" aria-label="路径聚焦" onClick={() => setMode("path")}>
            <GitBranch size={18} />
          </button>
          <button type="button" aria-label="显示标签" onClick={() => setShowLabels((value) => !value)}>
            <FadersHorizontal size={18} weight={showLabels ? "fill" : "regular"} />
          </button>
        </div>
      </section>

      <section className="control-cluster depth-control">
        <h3>
          <SlidersHorizontal size={16} />
          探索深度
        </h3>
        <div className="depth-segment">
          {[1, 2, 3].map((item) => (
            <button key={item} type="button" className={depth === item ? "active" : ""} onClick={() => setDepth(item)}>
              {item}层
            </button>
          ))}
        </div>
      </section>

      <section className="control-cluster mode-control">
        <h3>图谱模式</h3>
        <div className="mode-list">
          {modes.map((item) => (
            <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="control-cluster minimap">
        <h3>全局小地图</h3>
        <div className="mini-canvas" aria-hidden="true">
          {minimapNodes.map((node) => (
            <i
              key={node.id}
              className={node.tone}
              style={{
                left: `${((node.x - 250) / 880) * 100}%`,
                top: `${((node.y - 210) / 430) * 100}%`,
              }}
            />
          ))}
          <b />
        </div>
      </section>
    </footer>
  );
}
