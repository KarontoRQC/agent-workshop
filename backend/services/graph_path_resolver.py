ROOT_ID = "dynamic-route-root"


class GraphPathResolver:
    def __init__(self, root_id=ROOT_ID):
        self.root_id = root_id

    def resolve(self, route_text):
        parts = split_route_text(route_text)
        nodes = [_serialize_dynamic_node(part, index, parts) for index, part in enumerate(parts)]
        edges = [_serialize_dynamic_edge(nodes[index], nodes[index + 1], index) for index in range(len(nodes) - 1)]

        return {
            "route": route_text,
            "root_id": self.root_id,
            "nodes": nodes,
            "edges": edges,
        }


def split_route_text(route_text):
    text = str(route_text or "").strip()

    if not text:
        return []

    return [
        part.strip()
        for part in (
            text.replace("—", "-")
            .replace("–", "-")
            .replace("›", "-")
            .replace(">", "-")
            .replace("→", "-")
            .replace("/", "-")
            .replace("、", "-")
            .replace("，", "-")
            .replace(",", "-")
            .split("-")
        )
        if part.strip()
    ]


def _serialize_dynamic_node(label, index, parts):
    node_id = f"route-node-{index + 1}"
    parent = ROOT_ID if index == 0 else f"route-node-{index}"

    return {
        "id": node_id,
        "label": label,
        "type": _get_dynamic_node_type(index, len(parts)),
        "summary": f"当前动态路线节点：{label}",
        "insight": "该节点来自路径规划智能体的实时输出，不依赖固定图谱包。",
        "parent": parent,
        "children": [f"route-node-{index + 2}"] if index < len(parts) - 1 else [],
        "agents": [],
        "count": 1 if index < len(parts) - 1 else 0,
    }


def _serialize_dynamic_edge(source, target, index):
    return {
        "id": f"{source['id']}->{target['id']}",
        "source": source["id"],
        "target": target["id"],
        "relationType": "dynamic_route",
        "relationLabel": "动态路径",
        "sortOrder": index,
    }


def _get_dynamic_node_type(index, total):
    if index == 0:
        return "entry"

    if index == total - 1:
        return "focus"

    return "route"
