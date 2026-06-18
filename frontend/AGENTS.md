# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Current Design Decision

The graph should follow an Obsidian-like local graph feeling rather than a linear workflow or cyberpunk dashboard. Use a hybrid reveal: the first view should start from one large "opening" mother node and a broad first ring of industry nodes. Hovering the opening node should light the industry ring; clicking an industry should make that industry the new mother node, pull the camera/focus toward it, and progressively light pain points, tasks, and agent-capability nodes in outward rings. Nodes should feel spatial and draggable, closer to Obsidian's relationship graph than a fixed radial diagram. The left brief/sidebar is removed; only a small floating agent chat dock remains for the future Coze API integration.
