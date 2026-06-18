# Knowledge Graph Rendering Notes

## What The Obsidian Pattern Actually Is

Obsidian's graph model is simple: notes are nodes, internal links are edges, and local graph depth expands one hop at a time from the active note. That model is useful for our interaction design, but it should not force our backend to store everything as Markdown files.

## Current Prototype Problem

The unstable version was doing too much work per interaction:

- Re-rendered the ambient star field and background on normal graph updates.
- Rebuilt Pixi graphics and labels during a 60fps transition loop.
- Triggered node focus on `pointerdown`, so dragging could also behave like clicking.
- Treated the current focus as a visually dominant node, which inverted parent-child hierarchy after drilling down.

## Recommended Architecture

Use a canonical graph data layer:

- `nodes`: semantic node content, type, parent, summary.
- `edges`: source, target, relation type, optional weight.
- `node_agents`: node-to-agent recommendation mapping.
- `agents`: provider and gateway metadata.

Then optionally generate an Obsidian-compatible vault as an export/debug/editing layer:

- Each node can become `nodes/<id>.md`.
- The first heading or filename can carry the visible title.
- YAML frontmatter can carry `node_type`, `level`, `agent_keys`, and `status`.
- Wikilinks can mirror edges, e.g. `[[problem-leads]]`.

This gives us Obsidian-style portability without making empty Markdown files the source of truth.

## Current Agent Library Decision

The imported agent library already has structured fields: name, function, type,
link, knowledge base, and description. For this project, that is stronger than a
fake vault full of empty Markdown files.

Runtime path:

- Source: `data/source_agents_full.json`.
- Compile step: `scripts/build-agent-graph-pack.mjs`.
- Frontend graph pack: `data/agent_graph_pack.json`.
- Optional later export: generate a vault mirror only for review, editing, or
  Obsidian-style portability.

This keeps the graph lightweight for presentation while preserving a clean
adapter boundary for Coze or another agent gateway.

## Renderer Direction

Short term:

- Keep PixiJS, but avoid full redraw loops.
- Keep fixed node size rules by semantic level.
- Use focus as selection, not as a command to make the selected node huge.
- Separate click and drag events.
- Show the full library as real graph particles in the root view, then reveal
  local children when a parent is selected.
- Use short animation bursts for focus, hover, and path flow instead of a
  permanent animation loop.
- Allow drag-to-pin behavior so important nodes can be repositioned during a
  live demo.

Medium term:

- Consider Sigma.js + Graphology for the main graph canvas if the graph grows beyond a few hundred active nodes.
- Use ForceAtlas2 or a precomputed layout for a stable Obsidian-like map.
- Keep custom React/Pixi panels for agent dock and recommendation rail.

## Size Rules

Use stable semantic sizes:

- Opening/root anchor: large.
- Parent/industry anchor: large but not larger than root by default.
- Current selected child: bright and legible, but smaller than parent.
- Children of current node: small branch nodes.
- Ambient/context nodes: tiny and subdued.

The UI should communicate ancestry and relation, not simply zoom whatever was last clicked.
