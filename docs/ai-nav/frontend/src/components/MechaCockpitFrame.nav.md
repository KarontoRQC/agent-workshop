# MechaCockpitFrame

> `frontend/src/components/MechaCockpitFrame.tsx` · React 视觉组件
> `frontend/src/components/MechaCockpitFrame.css` · 组件样式

## 用途

首页机甲头盔的实体硬件层。它在旧 HUD 数据层下方增加枪灰金属顶部脊梁、左右承力柱、机械铰链、下颌框架和蓝金能量接缝，让座舱更接近第一人称机甲驾驶舱，同时不接管任何鼠标、语音或 Agent 交互。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `MechaCockpitFrame` | React component | 根据 Agent 状态和语音唤醒状态切换 standby、linked、engaged、alert 四种装甲反馈。 |

## 修改指南

- 装甲组件必须保持 `pointer-events: none` 和 `aria-hidden`，不得阻断页面交互或进入辅助技术阅读顺序。
- 桌面外壳只占屏幕边缘，中央粒子、图谱、字幕和工作流卡片必须清晰可见。
- 900px 以下隐藏机械铰链和复杂侧板，保留窄承力柱与能量接缝，避免覆盖移动端输入区。
- 动画只用于小面积能量接缝，并同步维护 `prefers-reduced-motion`。
- 顶部装甲脊梁和底部下颌硬件继续居中保留；顶部总控条和底部动力/目镜状态条已经删除，禁止在本组件 CSS 中恢复这些信息模块。
- 不在 `App.css` 继续追加这一组件的视觉规则；样式留在 colocated CSS。

## 依赖图

```text
App.tsx
└─ MechaCockpitFrame.tsx
   └─ MechaCockpitFrame.css
```
