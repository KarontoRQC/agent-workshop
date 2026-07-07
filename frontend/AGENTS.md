# frontend/AGENTS.md

本文件为 Codex 修改 `frontend/` 下代码时提供目录级指导。根级 `AGENTS.md` 仍然适用；前端视觉、交互、语音和 Hero Hall 的长期决策以本文件为准。

## 快速参考

- **源码入口**: `frontend/src/`
- **应用入口**: `frontend/src/App.tsx`
- **全局样式**: `frontend/src/App.css`、`frontend/src/index.css`
- **流式客户端**: `frontend/src/lib/agentStreamClient.ts`
- **工作流状态**: `frontend/src/features/workflow/workflowModel.ts`
- **Hero Hall**: `frontend/src/features/heroHall/`
- **导航入口**: `docs/ai-nav/frontend/_index.nav.md`

## 命令

```bash
cd frontend && npm run dev -- --host 127.0.0.1 --port 5188
cd frontend && npm run build
cd frontend && npm run preview -- --host 127.0.0.1
```

## 验证标准

- 修改 TypeScript、React 组件、样式或 Vite 配置后，至少运行 `cd frontend && npm run build`。
- 修改 Three.js、Hero Hall、HUD、语音或布局视觉后，必须用浏览器实际预览；桌面和移动端至少各检查一次。
- 修改 `/api/coze/chat/stream` 消费、SSE 事件、推荐智能体字段或工作流状态后，同步检查 `docs/coze-chat-stream-api.md`、`frontend/src/lib/agentStreamClient.ts` 和 `frontend/src/features/workflow/workflowModel.ts`。
- 修改代理、TTS 或环境变量读取后，同步检查 `frontend/vite.config.ts`、`frontend/README.md` 和根级 `README.md`。

## 禁止事项

- 禁止在没有依赖变更时修改 `frontend/package-lock.json`；如确需更新依赖，必须说明触发原因。
- 禁止让前端在 `workflow.stage.completed` 后停止读取 Coze/LongCat 流；完整结束信号以 `workflow.completed` 或 `chat.completed` 为准。
- 禁止把 `frontend/src/features/heroHall/HeroTeamCarousel.tsx` 的轮播实现内联回 `AgentHeroHall.tsx` 或追加到全局 `App.css`。
- 禁止在 Agent Hero Hall 中用静态占位文案覆盖后端返回的推荐智能体名称、阶段、理由、头像或启动目标。
- 禁止用可见说明文案替代拖拽、状态反馈或 HUD 交互本身。

## 代码导航

| 你要改的代码 | 先读 |
|---|---|
| `frontend/src/` | `docs/ai-nav/frontend/src/_index.nav.md` |
| `frontend/src/lib/` | `docs/ai-nav/frontend/src/lib/_index.nav.md` |
| `frontend/src/components/` | `docs/ai-nav/frontend/src/components/_index.nav.md` |
| `frontend/src/hooks/` | `docs/ai-nav/frontend/src/hooks/_index.nav.md` |
| `frontend/src/features/` | `docs/ai-nav/frontend/src/features/_index.nav.md` |
| `frontend/src/features/heroHall/` | `docs/ai-nav/frontend/src/features/heroHall/_index.nav.md` |
| `frontend/src/features/workflow/` | `docs/ai-nav/frontend/src/features/workflow/_index.nav.md` |

## 原型操作规则

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Current Design Decision

The graph should follow an Obsidian-like local graph feeling rather than a linear workflow or cyberpunk dashboard. Use a hybrid reveal: the first view should start from one large "opening" mother node and a broad first ring of industry nodes. Hovering the opening node should light the industry ring; clicking an industry should make that industry the new mother node, pull the camera/focus toward it, and progressively light pain points, tasks, and agent-capability nodes in outward rings. Nodes should feel spatial and draggable, closer to Obsidian's relationship graph than a fixed radial diagram. The left brief/sidebar is removed; only a small floating agent chat dock remains for the future Coze API integration.

When drilling from a parent node into a child node, do not collapse the parent into a tiny dim background dot. Keep the root / parent / current focus as a visible lineage anchor path: the parent should remain a large, legible, illuminated node while the child opens the next ring. Path-generation or routing demos should use a progressive highlighted route with subtle flow energy, similar to an Obsidian local graph path reveal, while preserving the current refined dark-gold visual system.

## Recent Prototype Decision

- 2026-06-30: Trial the agent chat dock as a compact lower-left floating control on desktop. It should remain a small dock, expand upward when conversation history appears, and not become a full left sidebar. Mobile should keep the bottom drawer layout.
- 2026-06-30: When the user enters the Agent Hero Hall, keep the corresponding chat visible on the left and place the hero hall on the right. In this hall state the chat may expand from dock into a left-side conversation panel; this does not reintroduce a left brief/sidebar in the graph state.
- 2026-06-30: In the Agent Hero Hall roster grid, do not show text labels or stage tags beneath the avatar/icon cards; keep the cards focused on rank, avatar, and the add action.
- 2026-06-30: Sending a message from the Agent Hero Hall chat must keep the hall open and preserve the left chat / right hall layout. Do not return to the graph/home state unless the user explicitly closes the hall.
- 2026-06-30: Hero Hall follow-up prompts such as "recommend the conversion lineup" should send `requested_lineup` to the API. If the stream returns a lineup marker such as `DEAL_LINEUP` without `RECOMMENDED_AGENTS`, use the local catalog to populate the matching lineup rather than leaving the hall unchanged.
- 2026-06-30: The three Hero Hall lineup slots should default to empty. Recommending or refreshing one specific lineup should replace only that lineup and must not clear the other lineup slots.
- 2026-06-30: Beautify the Agent Hero Hall right side as a premium high-tech dark-gold hall with prism/rainbow light effects. Keep the left agent chat unchanged. The three lineup cards should show rainbow energy feedback when users add, remove, drag/drop, reset, open, recommend, or refresh a lineup.
- 2026-07-01: Remove the right-side Hero Hall lineup-combination column from the visible hall UI. The hall body should center the Agent Hero Wall, with draggable recommended agent cards below it. Users should be able to drag an agent from the hero wall onto a recommended card to replace it, and drag one recommended card onto another to swap cards.
- 2026-07-01: The Agent Hero Hall should feel like a premium display case rather than a dense table. The hero wall should reset to the top when opened, use contained scrolling, and avoid being visually covered by the mobile/bottom chat dock.
- 2026-07-01: Restyle the Agent Hero Hall to closely match the supplied reference image: deep blue cosmic palace, centered glowing crown stage, dark-gold glass panels, 7-by-2 hero wall density on wide screens, compact hero-name labels under avatar cards, and a horizontal recommendation deck below the wall.
- 2026-07-01: For this reference-image clone, keep the left chat/dialogue console visible in Hero Hall mode. The right-side Hero Hall surface should match the supplied screenshot proportions as closely as the remaining canvas allows: crown stage, visible hero card wall, bottom recommendation strip with arrows/dots, and reference-like visible card labels.
- 2026-07-01: Keep prototype runtime configuration reusable across machines. Commit safe default `.env` files for shared API/proxy behavior, use `.env.local` only for machine-specific secrets or overrides, and run voice output in auto mode: request `/api/tts/speech` first, then fall back to browser TTS or a local comms tone when server audio is unavailable.
- 2026-07-01: Push the right-side Agent Hero Hall toward an extremely premium, high-tech, high-desire display case. The hall should feel dramatic and purchasable at first glance: deep cosmic palace stage, dark-gold glass, prism/rainbow energy, glowing hero cards, and a luxury recommendation deck. Keep the left chat/dialogue console unchanged.
- 2026-07-01: After visual feedback that the polished grid still felt ugly, rewrite the right-side Agent Hero Hall as a cinematic showcase rather than a panel grid: compact AGENT HERO HALL crown stage, large featured CROWN agent card, horizontal recommended battle team, and a contained hero library. Preserve the left chat exactly.
- 2026-07-01: Keep the Agent Hero Hall performance budget strict. When the hall is open, unmount or pause the background Three.js particle field and avoid large animated blurs, backdrop filters, and infinite full-panel shimmer effects. Preserve the premium cinematic look with static gradients, image assets, and low-cost hover feedback.
- 2026-07-01: The Hero Hall recommended battle team must render the actual agents returned by the agent recommendation flow, including each agent's name, stage, reason, avatar, and launch target. Do not override those cards with static reference-image copy or catalog placeholder visuals except when the user manually drags a replacement card.
- 2026-07-01: Remove the small carousel dot/tag indicator under the Hero Hall recommended battle team; keep that strip visually clean with only the agent cards and arrow controls.
- 2026-07-01: Remove the large featured CROWN agent card from the Hero Hall stage. The stage should not show a separate hero card behind the action buttons; recommended agents should appear in the recommended battle team strip instead.
- 2026-07-01: Remove the descriptive tagline under the Agent Hero Hall stage title. The top stage should stay cleaner with the title, metrics, and action buttons only.
- 2026-07-01: After removing the Hero Hall tagline and featured card, compact the top stage height so it no longer occupies the old oversized showcase space. Keep the crown background and title, but let the recommended battle team sit closer to the top.
- 2026-07-01: In the Agent Hero Hall body, place the hero library in the middle and the recommended battle team at the bottom. Recommended battle team agents should render as compact vertical cards, not horizontal rectangular rows.
- 2026-07-01: The homepage should feel like the user is inside a Jarvis-style armor helmet, controlling an AI assistant. Keep the particle core as the central reactor/AI focus, add helmet visor/HUD framing, scanning and targeting feedback, and preserve the compact lower-left agent chat dock as the control surface.
- 2026-07-01: The homepage voice system should also feel like an in-helmet mech AI, not a generic microphone control. Voice mode should present as a compact Jarvis audio link with AI core status, voice waveform feedback, armor communications telemetry, and cockpit-style listening/responding states.
- 2026-07-01: Homepage mech effects should be visibly stronger around the screen edges. Avoid a faint decorative overlay; use high-contrast armor visor panels, segmented perimeter lines, stronger blue-gold edge glow, and clearer cockpit targeting/scanning feedback while preserving the compact chat dock.
- 2026-07-01: Add a top-left homepage HUD typewriter intel panel as a rotating state machine, not a static intro line. It should cycle through mech status, cosmic/weather telemetry, graph scanning, script radar, comms, agent array, and risk states, with contextual Chinese cockpit chatter such as arriving at the Zhongyinhui graph planet and detecting relevant topics or agent recommendations.
- 2026-07-01: Homepage AI replies and thinking states should render as bottom assistant subtitles with a compact bouncing audio waveform, not as top HUD text. Keep them centered below the reactor while avoiding the lower-left chat dock, so they feel like Jarvis speaking inside the helmet.
- 2026-07-01: The graph route star-chain should read as a prominent path object. Keep route nodes larger, spacing wider, labels more legible, and connecting energy brighter than the ambient particle field.
- 2026-07-01: The homepage voice system must produce audible feedback, not only visual state changes. Wake/standby should trigger a Jarvis-style confirmation sound or spoken response, AI replies should be spoken when browser/server TTS is available, and a local WebAudio or generated-WAV comms tone should play when speech synthesis is unavailable.
- 2026-07-01: The top-left homepage HUD typewriter intel panel should stay semi-transparent and glass-like, letting the reactor, star-chain, and particle field show through while preserving readable blue-gold cockpit borders and scan details.
- 2026-07-01: Homepage perimeter mech feeling should come from visible armor hardware, not faint decorative lines. Use angular side/top/bottom visor plates, corner armor locks, segmented metal ribs, and stronger blue-gold energy seams while keeping the graph core and lower-left chat dock unobstructed.
- 2026-07-01: The TTS backend is deployed on the shared server. In Vite dev mode, `/api/tts/*` should proxy to `API_PROXY_BASE_URL` by default, not localhost, unless `TTS_PROXY_TARGET` is explicitly set for local backend testing.
- 2026-07-01: Homepage information boxes such as dialogue, knowledge path, and recommended agents should feel like embedded mech helmet displays, not generic floating web cards. Use angular screen housings, exposed interface rails, corner locks, scan grids, status lamps, and blue-gold hardware seams while preserving the current compact dock layout.
- 2026-07-01: Homepage left and right mech visor armor should sit farther toward the screen edges. Keep the strong side-hardware feeling, but avoid letting the side plates bite too deeply into the graph/core area.
- 2026-07-01: In Agent Hero Hall, replace the recommended battle team strip with the previously cut-out hero-card carousel module. First pass should prioritize data wiring and interaction over final styling.
- 2026-07-01: Move the Agent Hero Hall recommended battle team carousel into the middle showcase slot and swap the hero library down into the lower slot.
- 2026-07-01: The Agent Hero Hall recommended battle team carousel should be a 1:1 clone of the previously cut-out module. Only agent names and avatars stay dynamic; copy, score, tag, card anatomy, card sizing, arrows, pedestal, and carousel chrome should follow the cut-out module rather than recommendation-specific parameters.
- 2026-07-01: Keep the Hero Hall recommended battle team carousel modular. Its implementation belongs in a dedicated HeroTeamCarousel component and colocated stylesheet rather than being embedded in AgentHeroHall or appended to App.css.
- 2026-07-01: Move the homepage left HUD status module upward and evolve it from a simple ONLINE chip into a compact dynamic CPU / GPU / AI telemetry block with mech performance meters, while keeping it lightweight and inside the helmet display language.
- 2026-07-01: Align the homepage script radar and CPU/GPU/AI telemetry modules higher with the right-side HUD status module. CPU and GPU telemetry should keep randomly drifting within 0-80%. AI telemetry should idle at a low nonzero load, then switch to 100% with a red progress bar only during active AI response/streaming.
- 2026-07-01: Homepage HUD radar and CPU/GPU/AI telemetry positions must remain fixed whether or not the user has chatted or a workflow dock is visible; do not use chat/workflow state selectors to change their coordinates.
- 2026-07-01: The homepage left GRAPH SCAN radar module should be fixed to the same top baseline as the right-side knowledge path panel. CPU/GPU/AI telemetry should stay locked directly below that left radar block, not float lower before chat.
- 2026-07-01: The homepage knowledge path panel should render as a contained scroll window showing five route nodes at a time; longer paths scroll inside the panel instead of stretching the dock.
- 2026-07-01: When the right-side knowledge path dock is visible, align the top-left script radar module and the CPU/GPU/AI telemetry module group to the same top rail as the right knowledge path card; do not move the chat composer for this alignment.
- 2026-07-01: In Agent Hero Hall, the recommended hero-card carousel must stay above the hero library. Do not let older App.css "hero library middle / recommended bottom" rules override the modular HeroTeamCarousel layout.
- 2026-07-01: The Agent Hero Hall should feel like a cockpit HUD popup rather than a full right-side page. Keep the left chat visible, dim/preserve the Jarvis cockpit context behind it, and present the hall as an armored blue-gold modal with visor framing, scan rails, corner locks, and elevated depth similar to the recommended-agent cockpit displays.
- 2026-07-01: Revised Agent Hero Hall direction: it should appear as a main-page cockpit HUD module, similar to the recommended-agent and knowledge-path panels, not as a full page, full right-side replacement, or oversized modal. Keep the Jarvis homepage HUD, particle core, and compact chat context visible behind it.
- 2026-07-01: Revised Agent Hero Hall placement: the hall should pop out in the center cockpit viewing area, as if launched from a main-page HUD control. Keep symmetrical top/bottom cockpit clearance and do not let the hall extend beyond the helmet/visor visual bounds.
- 2026-07-01: Opening Agent Hero Hall must not mutate or restyle the homepage behind it. Treat the hall as an isolated functional popup/module; the homepage HUD, recommendation dock, knowledge path, subtitles, and chat should keep their normal main-page layout and styling.
- 2026-07-01: In the isolated Agent Hero Hall popup, keep the hero pool chrome compact and make individual hero cards larger; the pool should feel like a focused module rather than a dense tiny table.
- 2026-07-02: When syncing from `KarontoRQC/agent-workshop-jarvis`, selectively import only the opening planet / particle-field visual work into the current `frontend/src` app. Do not replace the local Agent Hero Hall popup isolation, modular carousel, or homepage HUD layout with the remote nested app structure.
- 2026-07-02: Agent Hero Hall should make drag replacement obvious and reliable. Disable native image/browser drag inside hall cards, use custom pointer/mouse dragging from the hero pool or recommendation carousel, glow the current recommendation drop target, and pulse the card after replacement. Keep this as a functional module with no instructional text added to the visible UI.
- 2026-07-02: The homepage background should maintain an outer-space cruising feeling: use a deep-space starfield / warp-streak backdrop behind the particle core, keep the center readable, and preserve the Jarvis HUD, graph, and compact chat layers above it.
- 2026-07-06: Agent Hero Hall middle carousel cards must mirror the current 推荐智能体 list from the workflow dock / recommendation snapshot. Do not show static reference cards or hero-pool catalog cards in that carousel unless they have first entered the recommended-agent source.
- 2026-07-06: Homepage thinking/speaking readout such as “思考中...” should sit on the cockpit centerline, not offset by the left chat dock or side HUD panels.
- 2026-07-06: Agent Hero Hall middle recommended area must show every current 推荐智能体 card at once as a visible horizontal team strip. Do not hide extra recommended agents behind a three-card/center-only coverflow.
- 2026-07-06: On the homepage, right-side knowledge-path and recommended-agent panels plus graph focus should reveal only after the left agent console has shown the corresponding 工具调用 marker. Streaming recommendation snapshots must not auto-open the right panel before that left-side tool-call cue.
- 2026-07-06: The homepage center graph must remain contained in the cockpit viewport during rotation. In graph mode, use bounded yaw / gentle sway, restrained active scale, and a wider camera instead of unrestricted spin that can push knowledge-path or recommended-agent nodes offscreen.
- 2026-07-06: Homepage performance optimization must preserve the premium cockpit / graph visual effect. Prefer capping WebGL pixel ratio, throttling idle/background/hidden frames, disabling expensive canvas filters, and putting ParticleField into background mode while Hero Hall is open instead of removing visible graph, particle, or HUD effects. The graph should still visibly rotate within bounded yaw.
- 2026-07-06: The homepage center ParticleField graph must always visualize the knowledge path route, not the recommended-agent roster. Recommended agents belong in the right recommendation dock and Agent Hero Hall only; do not feed recommended-agent names into the center graph labels or graph focus key.
- 2026-07-06: During agent speech output, the center knowledge-path graph must stay spatially stable. Speech energy may add subtle glow/shimmer, but must not drive large particle scale, pulse seed expansion, or diamond/route-node popping while the graph is visible.
- 2026-07-06: When an agent reply completes successfully with a `recommendation_id` and generated recommended agents, the homepage should automatically open the matching `agent_combination` Hero Hall entry page in a new browser page/tab. Do not replace the original homepage tab and do not revive the legacy in-page Hero Hall popup for this jump.
- 2026-07-06: On the `agent_combination` Hero Hall entry page, agent cards should show rarity/level badges such as SSR in the top-right corner instead of numeric order badges. Card titles, reasons, tags, and buttons must be laid out so long Chinese text stays clipped or wrapped inside the module and never overflows the card.
- 2026-07-06: The homepage diamond knowledge-path star graph must not react to mouse hover with collision, magnetic pull, swirl, hover glow, or camera push. Preserve its bounded auto-rotation, route highlighting, and click pulse unless a later request explicitly removes click feedback too.
- 2026-07-06: Voice output should use the backend Edge TTS Chinese female voice path by default. Do not rely on Piper/local model synthesis or automatic browser speech fallback for the normal JARVIS voice path.
- 2026-07-07: The `agent_combination` Hero Hall entry page should keep the full hero-hall palace background beyond the top hero. Under the recommended-agent module, provide a usable combination lineup builder where users can choose candidate agents into a five-slot lineup, drag agents into slots, drag within the lineup to swap positions, and view a live combination score table.
- 2026-07-07: The `agent_combination` Hero Hall entry page background should use the generated deep-blue cosmic palace / crown-stage image. Page content must scroll inside the palace frame and be clipped by that frame; do not let cards or sections slide outside the visible background frame when scrolling upward.
- 2026-07-07: In the `agent_combination` lineup builder, optional/candidate agent cards must prioritize readable names and stage labels over dense tiny-card quantity. Keep a dedicated one-click open button for the currently composed lineup, separate from the recommended-agent batch open action.
- 2026-07-07: `agent_combination` 阵容搭建器的可选智能体必须提供类目筛选，让客户能按全部、推荐优先、已入阵以及阶段/能力类目选择候选；类目只筛选候选池，不改变推荐智能体真实字段、阵容槽位或评分逻辑。
- 2026-07-07: `agent_combination` 组合评分表必须根据用户当前阵容实时计算；填满五个槽位不能自动高分，重复阶段/能力类目、未保留推荐核心或入口不可用都应拉低对应指标和总分。
- 2026-07-07: `agent_combination` 组合智能体页右上角必须提供保存按钮。用户调整五槽阵容后点击保存，应持久化到当前推荐快照；页面刷新或重新打开时优先恢复后端保存的阵容，没有保存阵容时才使用推荐智能体默认阵容。
