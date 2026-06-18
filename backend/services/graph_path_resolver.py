import json
import os


ROOT_ID = "root-brief"
GRAPH_PACK_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "agent_graph_pack.json")
)


class GraphPathResolver:
    def __init__(self, graph_pack_path=GRAPH_PACK_PATH, root_id=ROOT_ID):
        self.graph_pack_path = graph_pack_path
        self.root_id = root_id
        self._graph_pack = None

    def resolve(self, route_text):
        graph_pack = self._load_graph_pack()
        nodes = graph_pack.get("nodes", [])
        edges = graph_pack.get("edges", [])
        node_by_id = {node.get("id"): node for node in nodes}
        node_by_label = {normalize_text(node.get("label")): node for node in nodes}

        route_nodes = self._resolve_route_nodes(route_text, node_by_label, node_by_id)
        route_node_ids = [node["id"] for node in route_nodes]
        route_edges = _find_path_edges(edges, [self.root_id, *route_node_ids])

        return {
            "route": route_text,
            "root_id": self.root_id,
            "nodes": [serialize_node(node) for node in route_nodes],
            "edges": [serialize_edge(edge) for edge in route_edges],
        }

    def _load_graph_pack(self):
        if self._graph_pack is None:
            with open(self.graph_pack_path, "r", encoding="utf-8") as file:
                self._graph_pack = json.load(file)

        return self._graph_pack

    def _resolve_route_nodes(self, route_text, node_by_label, node_by_id):
        parts = split_route_text(route_text)
        resolved = []

        for part in parts:
            node = node_by_label.get(normalize_text(part))

            if node:
                resolved.append(node)

        if resolved:
            return _dedupe_nodes(resolved)

        return self._resolve_by_suffix(route_text, node_by_label, node_by_id)

    def _resolve_by_suffix(self, route_text, node_by_label, node_by_id):
        normalized_route = normalize_text(route_text)
        matches = [
            node
            for label, node in node_by_label.items()
            if label and (label in normalized_route or is_subsequence(label, normalized_route))
        ]

        if not matches:
            return []

        target = max(
            matches,
            key=lambda node: (
                _node_depth(node, node_by_id, self.root_id),
                len(normalize_text(node.get("label"))),
            ),
        )
        return _ancestors_after_root(target, node_by_id, self.root_id)


def split_route_text(route_text):
    text = str(route_text or "").strip()

    if not text:
        return []

    return [
        part.strip()
        for part in text.replace("—", "-").replace("–", "-").split("-")
        if part.strip()
    ]


def normalize_text(value):
    return "".join(str(value or "").split()).lower()


def is_subsequence(needle, haystack):
    if not needle or not haystack:
        return False

    cursor = 0

    for char in haystack:
        if cursor < len(needle) and needle[cursor] == char:
            cursor += 1

    return cursor == len(needle)


def serialize_node(node):
    return {
        "id": node.get("id"),
        "label": node.get("label"),
        "type": node.get("type"),
        "summary": node.get("summary", ""),
        "insight": node.get("insight", ""),
        "parent": node.get("parent"),
        "children": node.get("children", []),
        "agents": node.get("agents", []),
        "count": node.get("count", 0),
    }


def serialize_edge(edge):
    return {
        "id": edge.get("id"),
        "source": edge.get("source"),
        "target": edge.get("target"),
        "relationType": edge.get("relationType"),
        "relationLabel": edge.get("relationLabel"),
        "sortOrder": edge.get("sortOrder", 0),
    }


def _find_path_edges(edges, node_ids):
    output = []

    for source, target in zip(node_ids, node_ids[1:]):
        edge = next(
            (
                item
                for item in edges
                if item.get("source") == source and item.get("target") == target
            ),
            None,
        )

        if edge:
            output.append(edge)

    return output


def _ancestors_after_root(node, node_by_id, root_id):
    path = []
    cursor = node
    seen = set()

    while cursor and cursor.get("id") not in seen:
        seen.add(cursor.get("id"))
        path.insert(0, cursor)

        if cursor.get("id") == root_id:
            break

        cursor = node_by_id.get(cursor.get("parent"))

    return [item for item in path if item.get("id") != root_id]


def _dedupe_nodes(nodes):
    output = []
    seen = set()

    for node in nodes:
        node_id = node.get("id")

        if not node_id or node_id in seen:
            continue

        seen.add(node_id)
        output.append(node)

    return output


def _node_depth(node, node_by_id, root_id):
    depth = 0
    cursor = node
    seen = set()

    while cursor and cursor.get("id") not in seen:
        seen.add(cursor.get("id"))

        if cursor.get("id") == root_id:
            return depth

        depth += 1
        cursor = node_by_id.get(cursor.get("parent"))

    return depth
