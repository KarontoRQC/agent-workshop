# Prototype Instructions

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
