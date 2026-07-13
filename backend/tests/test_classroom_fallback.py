from services.classroom_fallback import build_classroom_fallback_plan


AGENT_NAMES = (
    "普通助手",
    "①战略专家",
    "②用户画像大师",
    "招商获客专家",
    "销售成交教练",
    "私域运营专家",
)


def test_greeting_fallback_stays_natural_without_business_artifacts():
    plan = build_classroom_fallback_plan("你好啊", AGENT_NAMES)

    assert plan["route"] == ""
    assert plan["agents"] == []
    assert "你好" in plan["ack"]


def test_changzhang_greeting_fallback_is_playful_without_being_rigid():
    plan = build_classroom_fallback_plan(
        "你好啊",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert plan["agents"] == []
    assert plan["ack"].startswith("厂长，我在")
    assert "今天不端着" in plan["ack"]
    assert "风扇" in plan["ack"]


def test_changzhang_memory_capture_fallback_confirms_the_actual_fact():
    plan = build_classroom_fallback_plan(
        "请记住：我的现场口令是星槎-8642，领夹颜色是琥珀金。",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert plan["agents"] == []
    assert plan["ack"].startswith("厂长，记住了：")
    assert "星槎-8642" in plan["ack"]
    assert "琥珀金" in plan["ack"]


def test_changzhang_memory_recall_fallback_reads_the_latest_user_turn():
    plan = build_classroom_fallback_plan(
        "我上一轮说的现场口令和领夹颜色分别是什么？",
        AGENT_NAMES,
        participant_identity="changzhang",
        recent_dialogue=[
            {"role": "user", "content": "现场口令是星槎-8642，领夹颜色是琥珀金。"},
            {"role": "assistant", "content": "记住了。"},
        ],
    )

    assert plan["route"] == ""
    assert plan["agents"] == []
    assert plan["ack"].startswith("厂长，你上一轮说的是：")
    assert "星槎-8642" in plan["ack"]
    assert "琥珀金" in plan["ack"]


def test_changzhang_student_handoff_fallback_switches_the_active_speaker():
    plan = build_classroom_fallback_plan(
        "我是学员，厂长让我来问一个问题",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert plan["ack"].startswith("同学，")
    assert "厂长，" not in plan["ack"]


def test_changzhang_student_handoff_fallback_answers_ai_job_question_with_a_joke():
    plan = build_classroom_fallback_plan(
        "我是现场学员小李，厂长把麦克风给我了。AI 会不会抢走我的工作？",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert plan["ack"].startswith("同学，")
    assert "重复工作" in plan["ack"]
    assert "隔壁同学" in plan["ack"]


def test_changzhang_roleplay_fallback_performs_instead_of_acknowledging_the_request():
    plan = build_classroom_fallback_plan(
        "先不聊业务。如果你来演电影里的反派 AI，你的登场台词是什么？别分析，直接演。",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert plan["agents"] == []
    assert plan["ack"].startswith("厂长，灯光熄灭")
    assert "反派 AI" in plan["ack"]
    assert "这个话题我接" not in plan["ack"]


def test_changzhang_casual_fallback_follows_the_new_topic():
    plan = build_classroom_fallback_plan(
        "先不聊业务了，讲个笑话",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"] == ""
    assert "笑话可以" in plan["ack"]
    assert "目标、对象" not in plan["ack"]


def test_business_fallback_builds_route_and_allowlisted_agents():
    plan = build_classroom_fallback_plan("规划白酒招商获客到成交转化", AGENT_NAMES)

    assert plan["route"].startswith("白酒品牌-")
    assert 3 <= len(plan["agents"]) <= 5
    assert {agent["agent_name"] for agent in plan["agents"]} <= set(AGENT_NAMES)
    assert all(agent["stage"] and agent["reason"] for agent in plan["agents"])


def test_changzhang_business_fallback_uses_wit_without_flattery():
    plan = build_classroom_fallback_plan(
        "规划白酒招商获客到成交转化",
        AGENT_NAMES,
        participant_identity="changzhang",
    )

    assert plan["route"]
    assert plan["agents"]
    assert plan["ack"].startswith("厂长，")
    assert any(token in plan["ack"] for token in ("掌声", "PPT", "皇冠"))


def test_agents_only_fallback_preserves_route_and_requested_lineup():
    current_route = "行业-场景-目标-卡点-行动-结果"
    plan = build_classroom_fallback_plan(
        "只刷新增长阵容",
        AGENT_NAMES,
        current_knowledge_path=current_route,
        state_edit_mode="agents_only",
        lineup_context={"requested_lineup": "growth"},
    )

    assert plan["route"] == current_route
    assert plan["agents"]
    assert all(agent["lineup"] == "growth" for agent in plan["agents"])
