# App.css

> `frontend/src/App.css` · CSS · 约 12944 行

## 用途

定义主页 JARVIS cockpit、HUD 面板、粒子场包裹层、Agent Console、Workflow Dock、Hero Hall 外壳和响应式视觉系统的大量样式。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.app-shell` / HUD 类 | 首页机甲头盔和控制台外观。 |
| `.agent-composer` | 打字输入、发送按钮和回答期间的高对比暂停按钮。 |
| `.workflow-*` | 工作流路径和推荐展示的全局配合样式。 |
| `.hero-hall-*` | Hero Hall 弹层外壳和部分共享样式。 |
| `.hero-pool-*` | Hero Hall 英雄池筛选、搜索、滚动列表和命中层级。 |
| 响应式 media query | 移动端和窄屏布局约束。 |
| `data-visual-performance` | 仅在平衡/受限设备关闭昂贵全屏滤镜、混合动画和局部模糊，完整档不变。 |

## 依赖

内部依赖:
- `App.tsx` — 使用大部分全局 class。
- `features/heroHall/*.css` — Hero Hall 内部轮播/模块样式应优先放在 colocated CSS。
- `features/workflow/WorkflowDock.css` — Workflow Dock 的模块样式。

## 修改指南

- **调整动态节奏**: 工作流虹光使用 12 秒线性旋转，外/内层不透明度为 `0.64/0.58`；思考点使用 2 秒平滑周期，语音模块波形使用 2.3 秒。中间字幕七柱波形使用 575ms 和逐柱 55ms 错峰。中央准星扫描线普通模式用 `helmet-scanline` 在约 ±92px 间以 3.8 秒周期上下往返；`prefers-reduced-motion` 下改用 `helmet-scanline-reduced`，以 7.6 秒周期、约 ±64px 行程和较低亮度继续扫描，不得冻结。低动态模式下虹光、思考点和字幕分别保留 20 秒、2.8 秒和 900ms 反馈，其他非必要动画限制为单次。
- **改性能降载**: 只在 `balanced/constrained` 根节点档位追加覆盖；`full` 档必须保留现有背景漂移、混合光层和装甲材质。

- **新增 feature 样式**: 优先写入对应 feature 的 `.css`，不要继续扩大 `App.css`。
- **改 Hero Hall 外壳**: 保持 `frontend/AGENTS.md` 中「作为主页 cockpit HUD 模块弹出」的约束。
- **改英雄池滚动/搜索**: 保持 topbar 高于滚动网格，并让 `.hero-pool-grid` 裁剪滚动子元素，防止滚动卡片盖住搜索框命中区域。
- **改移动端**: 检查文本是否溢出按钮、面板和卡片。
- **改首页 HUD**: 顶部总控条和底部动力/目镜状态条已删除，不得重新添加对应 class 或隐藏占位样式；保留边缘装甲、准星和遥测模块。
