# -*- coding: utf-8 -*-
"""Merge the de-customered industry knowledge graph workbook into the frontend pack."""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import pandas as pd
except ImportError as exc:  # pragma: no cover - depends on local runtime
    raise SystemExit("pandas is required to read the workbook. Use the bundled Codex Python runtime.") from exc


ROOT_ID = "root-brief"
IMPORT_ROOT_ID = "kg-industry-knowledge"
IMPORT_PREFIX = "kg-"

TYPE_MAP = {
    "PRODUCT_VERSION": "capability",
    "CUSTOMER_TYPE": "variable",
    "INDUSTRY_THEME": "industry",
    "BUSINESS_SCENARIO": "problem",
    "AI_CAPABILITY": "capability",
    "DELIVERY_MODULE": "asset",
    "PAIN_POINT": "variable",
}

ROOT_CHILD_TYPE_ORDER = {
    "INDUSTRY_THEME": 0,
    "PRODUCT_VERSION": 1,
    "CUSTOMER_TYPE": 2,
    "DELIVERY_MODULE": 3,
    "AI_CAPABILITY": 4,
    "BUSINESS_SCENARIO": 5,
    "PAIN_POINT": 6,
}

CONFIDENCE_SCORE = {"高": 3, "中": 2, "低": 1}

MANUAL_PARENT_HINTS = {
    "delivery_offline_course": "theme_education",
    "cap_ai_basic": "product_enterprise_ai",
    "cap_ai_reading": "theme_data_knowledge",
    "cap_excel_json": "theme_data_knowledge",
    "cap_auto_qa": "theme_agents_automation",
    "scenario_erp_integration": "theme_manufacturing_erp",
    "scenario_curriculum_rebuild": "theme_education",
    "scenario_community_qa": "theme_private_domain",
    "pain_delivery_not_started": "product_enterprise_ai",
    "pain_business_model_validation": "product_ip_stage",
    "pain_human_review": "theme_data_knowledge",
}

FUNCTION_HINTS = [
    (("销售", "成交", "招商", "线索", "转化", "跟进", "客户"), ["销售", "获客", "客户", "线索", "转化"]),
    (("内容", "文案", "短视频", "IP", "公域", "素材"), ["文案", "内容", "IP", "短视频"]),
    (("私域", "社群", "复购", "会员"), ["私域", "社群", "复购", "客户"]),
    (("数据", "知识库", "检索", "画像", "分层", "统计", "ERP"), ["数据", "知识库", "分析", "管理"]),
    (("智能体", "自动化", "编排", "工具", "流程"), ["智能体", "自动化", "工具", "流程"]),
    (("数字人", "分身", "思维克隆", "讲课"), ["数字人", "分身", "课程", "讲课"]),
    (("教育", "课程", "招生", "培训"), ["教育", "课程", "招生", "培训"]),
    (("生产", "库存", "财务", "保险", "规划"), ["管理", "专家", "数据", "财务"]),
]


def compact(value: object) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except TypeError:
        pass
    return re.sub(r"\s+", " ", str(value).strip())


def source_to_id(source_id: object) -> str:
    raw = compact(source_id)
    safe = re.sub(r"[^0-9A-Za-z_-]+", "-", raw).strip("-").replace("_", "-").lower()
    return f"{IMPORT_PREFIX}{safe}"


def support_count(value: object) -> int:
    text = compact(value)
    if not text:
        return 0
    try:
        return int(float(text))
    except ValueError:
        return 0


def confidence_value(value: object) -> int:
    return CONFIDENCE_SCORE.get(compact(value), 0)


def relation_sort_key(row: dict) -> tuple[int, int, str, str]:
    return (
        -support_count(row.get("支持记录数")),
        -confidence_value(row.get("置信度")),
        compact(row.get("source_label")),
        compact(row.get("target_label")),
    )


def best_relation(relations: list[dict], relation: str, target_id: str, allowed_source_ids: set[str]) -> dict | None:
    candidates = [
        row
        for row in relations
        if compact(row.get("relation")) == relation
        and compact(row.get("target_id")) == target_id
        and compact(row.get("source_id")) in allowed_source_ids
    ]
    return sorted(candidates, key=relation_sort_key)[0] if candidates else None


def top_relations_for(node_id: str, relations: list[dict], limit: int = 5) -> list[str]:
    rows = [
        row
        for row in relations
        if compact(row.get("source_id")) == node_id or compact(row.get("target_id")) == node_id
    ]
    entries = []
    for row in sorted(rows, key=relation_sort_key)[:limit]:
        is_source = compact(row.get("source_id")) == node_id
        other_label = compact(row.get("target_label" if is_source else "source_label"))
        relation = compact(row.get("relation"))
        support = support_count(row.get("支持记录数"))
        if other_label and relation:
            entries.append(f"{relation}：{other_label}（{support}条）")
    return entries


def extract_keywords(*parts: str) -> list[str]:
    text = " ".join(compact(part) for part in parts if compact(part))
    chunks = [item for item in re.split(r"[，。；、/|｜:：()\[\]{}<>\s]+", text) if len(item) >= 2]
    keywords = set(chunks[:14])

    for triggers, hints in FUNCTION_HINTS:
        if any(trigger in text for trigger in triggers):
            keywords.update(hints)

    return sorted(keywords, key=lambda item: (-len(item), item))[:24]


def pick_agents(agents: list[dict], keywords: list[str], cap: int = 7) -> list[str]:
    if not agents:
        return []

    scored = []
    lowered_keywords = [keyword.lower() for keyword in keywords if keyword]
    for agent in agents:
        haystack = " ".join(
            [
                compact(agent.get("name")),
                compact(agent.get("functionLabel")),
                compact(agent.get("typeLabel")),
                compact(agent.get("summary")),
                compact(agent.get("intro")),
                " ".join(compact(item) for item in agent.get("knowledge", [])),
            ]
        ).lower()
        score = float(agent.get("score") or 0)
        for keyword in lowered_keywords:
            if keyword and keyword in haystack:
                score += 18 + min(len(keyword), 8)
        scored.append((score, compact(agent.get("id")), agent))

    return [agent["id"] for _, _, agent in sorted(scored, key=lambda item: (-item[0], item[1]))[:cap]]


def relation_type_for(parent_id: str, child_type: str, source_type: str) -> str:
    if parent_id == ROOT_ID:
        return "starts_from_industry"
    if parent_id == IMPORT_ROOT_ID:
        if source_type == "INDUSTRY_THEME":
            return "kg_contains_theme"
        if source_type == "PRODUCT_VERSION":
            return "kg_context_product"
        if source_type == "CUSTOMER_TYPE":
            return "kg_context_customer"
        return "kg_contains_context"
    return f"kg_decomposes_to_{child_type}"


def display_label_for(parent_label: str, label: str, parent_id: str) -> str:
    if parent_id in {ROOT_ID, IMPORT_ROOT_ID}:
        return label
    return f"{parent_label}-{label}"


def load_workbook(workbook_path: Path) -> tuple[list[dict], list[dict]]:
    workbook = pd.ExcelFile(workbook_path)
    return workbook.parse("节点").to_dict("records"), workbook.parse("关系").to_dict("records")


def remove_existing_import(pack: dict) -> None:
    import_ids = {
        node["id"]
        for node in pack.get("nodes", [])
        if node.get("id") == IMPORT_ROOT_ID or str(node.get("id", "")).startswith(IMPORT_PREFIX)
    }
    if not import_ids:
        return

    pack["nodes"] = [node for node in pack.get("nodes", []) if node.get("id") not in import_ids]
    pack["edges"] = [
        edge
        for edge in pack.get("edges", [])
        if edge.get("source") not in import_ids and edge.get("target") not in import_ids
    ]
    for node in pack.get("nodes", []):
        if "children" in node:
            node["children"] = [child_id for child_id in node.get("children", []) if child_id not in import_ids]
            node["count"] = len(node["children"])


def build_parent_map(source_nodes: list[dict], relations: list[dict]) -> dict[str, str]:
    node_type_by_source_id = {compact(node.get("node_id")): compact(node.get("node_type")) for node in source_nodes}
    ids_by_type: dict[str, set[str]] = defaultdict(set)
    for source_id, node_type in node_type_by_source_id.items():
        ids_by_type[node_type].add(source_id)

    parent_by_source_id = {}

    for source_id, node_type in node_type_by_source_id.items():
        if node_type in {"INDUSTRY_THEME", "PRODUCT_VERSION", "CUSTOMER_TYPE"}:
            parent_by_source_id[source_id] = IMPORT_ROOT_ID

    for source_id in ids_by_type["BUSINESS_SCENARIO"]:
        relation = best_relation(relations, "包含应用场景", source_id, ids_by_type["INDUSTRY_THEME"])
        if relation:
            parent_by_source_id[source_id] = source_to_id(relation.get("source_id"))

    for source_id in ids_by_type["AI_CAPABILITY"]:
        relation = best_relation(relations, "由AI能力支撑", source_id, ids_by_type["BUSINESS_SCENARIO"])
        if relation:
            parent_by_source_id[source_id] = source_to_id(relation.get("source_id"))
        else:
            relation = best_relation(relations, "依赖AI能力", source_id, ids_by_type["INDUSTRY_THEME"])
            if relation:
                parent_by_source_id[source_id] = source_to_id(relation.get("source_id"))

    for source_id in ids_by_type["PAIN_POINT"]:
        relation = best_relation(relations, "常见卡点", source_id, ids_by_type["BUSINESS_SCENARIO"])
        if relation:
            parent_by_source_id[source_id] = source_to_id(relation.get("source_id"))

    for source_id in ids_by_type["DELIVERY_MODULE"]:
        relation = best_relation(relations, "交付载体", source_id, ids_by_type["AI_CAPABILITY"])
        if relation:
            parent_by_source_id[source_id] = source_to_id(relation.get("source_id"))

    for source_id, parent_source_id in MANUAL_PARENT_HINTS.items():
        if source_id in node_type_by_source_id and parent_source_id in node_type_by_source_id:
            parent_by_source_id.setdefault(source_id, source_to_id(parent_source_id))

    for source_id in node_type_by_source_id:
        parent_by_source_id.setdefault(source_id, IMPORT_ROOT_ID)

    return parent_by_source_id


def build_import_nodes(pack: dict, source_nodes: list[dict], relations: list[dict]) -> tuple[list[dict], list[dict]]:
    agents = pack.get("agents", [])
    source_by_id = {compact(node.get("node_id")): node for node in source_nodes}
    parent_by_source_id = build_parent_map(source_nodes, relations)
    children_by_parent_id: dict[str, list[str]] = defaultdict(list)

    for source_id, parent_id in parent_by_source_id.items():
        children_by_parent_id[parent_id].append(source_to_id(source_id))

    def source_sort_key(source_id: str) -> tuple[int, int, str]:
        source = source_by_id[source_id]
        return (
            ROOT_CHILD_TYPE_ORDER.get(compact(source.get("node_type")), 20),
            -support_count(source.get("支持记录数")),
            compact(source.get("label")),
        )

    source_id_by_import_id = {source_to_id(source_id): source_id for source_id in source_by_id}
    for child_ids in children_by_parent_id.values():
        child_ids.sort(key=lambda child_id: source_sort_key(source_id_by_import_id[child_id]))

    root_children = children_by_parent_id[IMPORT_ROOT_ID]
    import_root_keywords = extract_keywords("行业知识图谱", "企业AI化", "行业主题", "业务场景", "AI能力", "交付模块")
    import_root = {
        "id": IMPORT_ROOT_ID,
        "label": "AI服务行业知识图谱",
        "displayLabel": "AI服务行业知识图谱",
        "type": "industry",
        "summary": "从去客户化行业图谱导入，覆盖行业主题、业务场景、AI能力、常见卡点与交付载体。",
        "insight": f"本分支来自行业知识图谱工作簿，包含 {len(source_nodes)} 个源节点和 {len(relations)} 条源关系；前端按最强路径组织，完整关系保留在节点洞察中。",
        "parent": ROOT_ID,
        "children": root_children,
        "agents": pick_agents(agents, import_root_keywords),
        "count": len(root_children),
    }

    imported_nodes = [import_root]
    parent_label_by_id = {ROOT_ID: "业务关系索引", IMPORT_ROOT_ID: import_root["label"]}

    for source in sorted(source_nodes, key=lambda row: source_to_id(row.get("node_id"))):
        source_id = compact(source.get("node_id"))
        node_id = source_to_id(source_id)
        parent_id = parent_by_source_id[source_id]
        parent_label = parent_label_by_id.get(parent_id)
        if not parent_label and parent_id in source_id_by_import_id:
            parent_label = compact(source_by_id[source_id_by_import_id[parent_id]].get("label"))
        parent_label = parent_label or import_root["label"]

        label = compact(source.get("label")) or source_id
        node_type = compact(source.get("node_type"))
        mapped_type = TYPE_MAP.get(node_type, "variable")
        related = top_relations_for(source_id, relations)
        description = compact(source.get("description"))
        summary = description or f"{label} 是行业知识图谱中的{compact(source.get('中文类型')) or '语义'}节点。"
        support = support_count(source.get("支持记录数"))
        confidence = compact(source.get("置信度")) or "未标注"
        relation_note = "；".join(related) if related else "暂无高频关系"
        keywords = extract_keywords(label, description, compact(source.get("中文类型")), relation_note)
        children = children_by_parent_id.get(node_id, [])

        imported_nodes.append(
            {
                "id": node_id,
                "label": label,
                "displayLabel": display_label_for(parent_label, label, parent_id),
                "type": mapped_type,
                "summary": summary,
                "insight": f"来源：行业知识图谱 / {compact(source.get('中文类型')) or node_type}；支持记录数 {support}，置信度 {confidence}。关联关系：{relation_note}。",
                "parent": parent_id,
                "children": children,
                "agents": pick_agents(agents, keywords),
                "count": len(children),
                "sourceNodeType": node_type,
                "sourceSupportCount": support,
                "sourceConfidence": confidence,
            }
        )
        parent_label_by_id[node_id] = label

    imported_node_by_id = {node["id"]: node for node in imported_nodes}
    sort_order_by_parent: dict[str, int] = defaultdict(int)
    imported_edges = []
    for node in imported_nodes:
        parent_id = node.get("parent")
        if not parent_id:
            continue
        parent_node = imported_node_by_id.get(parent_id)
        if parent_node and node["id"] in parent_node.get("children", []):
            sort_order = parent_node["children"].index(node["id"]) + 1
        else:
            sort_order_by_parent[parent_id] += 1
            sort_order = sort_order_by_parent[parent_id]
        imported_edges.append(
            {
                "id": f"{parent_id}->{node['id']}",
                "source": parent_id,
                "target": node["id"],
                "relationType": relation_type_for(parent_id, node["type"], node.get("sourceNodeType", "")),
                "relationLabel": node["displayLabel"],
                "sortOrder": sort_order,
            }
        )

    return imported_nodes, imported_edges


def update_pack(pack_path: Path, workbook_path: Path) -> dict:
    source_nodes, relations = load_workbook(workbook_path)

    with pack_path.open("r", encoding="utf-8") as file:
        pack = json.load(file)

    remove_existing_import(pack)
    imported_nodes, imported_edges = build_import_nodes(pack, source_nodes, relations)

    root = next(node for node in pack["nodes"] if node["id"] == ROOT_ID)
    if IMPORT_ROOT_ID not in root["children"]:
        root["children"].append(IMPORT_ROOT_ID)
    root["count"] = len(root["children"])

    pack["nodes"].extend(imported_nodes)
    pack["edges"].extend(imported_edges)

    stats = pack.setdefault("stats", {})
    stats["agentCount"] = len(pack.get("agents", []))
    stats["industryCount"] = len(root["children"])
    stats["nodeCount"] = len(pack["nodes"])
    stats["edgeCount"] = len(pack["edges"])

    base_version = str(pack.get("version", "agent-graph-pack")).split("+industry-kg")[0]
    pack["version"] = f"{base_version}+industry-kg-2026-06-23"

    with pack_path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(pack, file, ensure_ascii=False, indent=2)
        file.write("\n")

    return {
        "source_nodes": len(source_nodes),
        "source_relations": len(relations),
        "imported_nodes": len(imported_nodes),
        "imported_edges": len(imported_edges),
        "pack_nodes": stats["nodeCount"],
        "pack_edges": stats["edgeCount"],
        "root_children": stats["industryCount"],
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/import-industry-knowledge-graph.py <workbook.xlsx> [agent_graph_pack.json]")
        return 2

    workbook_path = Path(sys.argv[1]).expanduser().resolve()
    pack_path = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else Path("data/agent_graph_pack.json").resolve()

    if not workbook_path.exists():
        raise SystemExit(f"Workbook not found: {workbook_path}")
    if not pack_path.exists():
        raise SystemExit(f"Graph pack not found: {pack_path}")

    result = update_pack(pack_path, workbook_path)
    print(
        "Imported {source_nodes} source nodes and {source_relations} relations "
        "as {imported_nodes} frontend nodes / {imported_edges} edges. "
        "Pack now has {pack_nodes} nodes, {pack_edges} edges, {root_children} root branches.".format(**result)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
