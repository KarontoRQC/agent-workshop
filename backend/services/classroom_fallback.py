from services.participant_identity import is_changzhang_identity
from services.recent_dialogue import normalize_recent_dialogue


BUSINESS_INTENT_KEYWORDS = (
    "战略",
    "品牌",
    "经营",
    "招商",
    "获客",
    "线索",
    "销售",
    "成交",
    "转化",
    "增长",
    "客户",
    "用户",
    "营销",
    "私域",
    "路径",
    "智能体",
    "阵容",
    "规划",
)

AGENT_PRIORITY_KEYWORDS = (
    "战略",
    "用户画像",
    "用户分析",
    "卖点",
    "招商",
    "获客",
    "销售",
    "私域",
    "成交",
    "文案",
)

AGENT_STAGES = ("战略定位", "用户洞察", "线索获取", "跟进转化", "成交复盘")
AGENT_REASONS = (
    "负责明确业务目标、优先级和关键执行边界。",
    "负责识别目标客户、核心痛点与高意向信号。",
    "负责设计获客触点并稳定产出可跟进线索。",
    "负责线索分层、持续跟进与关键异议处理。",
    "负责成交推进、结果复盘和下一轮优化。",
)
DEFAULT_LINEUPS = ("core", "growth", "growth", "conversion", "conversion")
LEARNER_HANDOFF_MARKERS = (
    "我是学员",
    "我是学生",
    "我是同学",
    "我不是厂长",
    "厂长让我来",
    "现在换我",
    "我来问",
    "轮到我了",
)
CHANGZHANG_BUSINESS_ACKS = (
    "厂长，先把掌声寄存一下。我把路径和阵容拉出来，能落地再开庆功宴。",
    "厂长，先别让 PPT 抢跑。我把路径和阵容排明白，免得方案穿着西装原地踏步。",
    "厂长，这事有戏，但先不给它戴皇冠。我把路径和阵容校准，看看谁是真能干活的。",
)
CASUAL_SWITCH_MARKERS = (
    "先不聊业务",
    "不聊业务",
    "换个话题",
    "聊点别的",
    "讲个笑话",
    "来个笑话",
)
VILLAIN_AI_ROLEPLAY_MARKERS = ("反派ai", "反派 AI", "反派ＡＩ", "反派人工智能")
ROLEPLAY_MARKERS = ("扮演", "演一个", "演一下", "入戏", "登场台词")
AI_JOB_MARKERS = ("ai会不会抢", "ai 会不会抢", "AI会不会抢", "AI 会不会抢")
MEMORY_RECALL_MARKERS = (
    "刚才",
    "上一轮",
    "前面说",
    "之前说",
    "我说的",
    "还记得",
    "记得我",
)
MEMORY_CAPTURE_MARKERS = ("请记住", "帮我记", "记一下", "别忘", "记忆测试")
MAX_FALLBACK_MEMORY_QUOTE_CHARS = 280


def build_classroom_fallback_plan(
    message,
    agent_names,
    current_knowledge_path="",
    state_edit_mode="general",
    lineup_context=None,
    participant_identity="guest",
    recent_dialogue=None,
):
    text = str(message or "").strip()
    requested_lineup = _requested_lineup(lineup_context)
    explicit_casual_switch = state_edit_mode == "general" and any(marker in text for marker in CASUAL_SWITCH_MARKERS)
    is_business = not explicit_casual_switch and (
        state_edit_mode in {"agents_only", "path_only", "both"}
        or any(keyword in text for keyword in BUSINESS_INTENT_KEYWORDS)
    )

    if not is_business:
        return _direct_reply_plan(text, participant_identity, recent_dialogue)

    route = _fallback_route(text, current_knowledge_path, state_edit_mode)
    agents = [] if state_edit_mode == "path_only" else _fallback_agents(text, agent_names, requested_lineup)
    entry_title = _entry_title(text)

    return {
        "ack": _business_ack(participant_identity, text),
        "agents": agents,
        "entry_title": entry_title,
        "explanation": "这条路径先锁定目标客户和线索入口，再通过分层跟进、异议处理与成交复盘形成完整闭环。",
        "fallback": "provider_unavailable",
        "route": route,
        "summary": "这套组合覆盖策略、洞察、获客、跟进和成交，可按当前路径直接分工执行。",
        "thinking": "需求包含明确的业务目标和执行链路，需要同时保证路径连续性与智能体分工可落地。",
    }


def _direct_reply_plan(message, participant_identity="guest", recent_dialogue=None):
    compact = "".join(message.lower().split()).strip("，。！？!?～~")
    greeting = compact in {"你好", "你好啊", "你好呀", "嗨", "hello", "hi", "在吗"}
    memory_reply = _contextual_memory_reply(message, recent_dialogue, participant_identity)

    if memory_reply:
        return _direct_reply_payload(memory_reply["ack"], memory_reply["thinking"])

    if is_changzhang_identity(participant_identity):
        if _is_learner_handoff(message):
            ack = _learner_handoff_ack(message)
        elif greeting:
            ack = "厂长，我在。今天不端着：您负责出题，我负责接梗；要是冷场，就当我的风扇在替我鼓掌。"
        elif _is_villain_ai_roleplay(message):
            ack = _villain_ai_roleplay_ack("厂长，")
        elif any(keyword in compact for keyword in ("笑话", "搞笑", "幽默", "段子")):
            ack = "厂长，笑话可以。AI 最怕的不是断电，是包袱落地后只有散热风扇鼓掌。再出一题，我继续接。"
        elif any(marker.lower().replace(" ", "") in compact for marker in ROLEPLAY_MARKERS):
            ack = "厂长，灯光给到位，我直接入戏。角色、场景、冲突随便点，演砸了算算力，演好了算您导得好。"
        else:
            ack = "厂长，这题我接，方向盘不用焊死。观点我会直说，包袱我会顺手带上；要是只剩正确废话，算我当场死机。"
    else:
        if greeting:
            ack = "你好，我在。问题尽管扔过来，接不住算我现场掉帧。"
        elif _is_villain_ai_roleplay(message):
            ack = _villain_ai_roleplay_ack("")
        else:
            ack = "这题我接。先讲有用的，再顺手抖个包袱；要是答案像说明书一样无聊，你可以当场退货。"

    thinking = (
        "这是一次直接交流，不需要展开知识路径。"
        if greeting
        else "当前信息更适合直接回应，暂不展开业务路径。"
    )
    return _direct_reply_payload(ack, thinking)


def _direct_reply_payload(ack, thinking):
    return {
        "ack": ack,
        "agents": [],
        "entry_title": "",
        "explanation": "",
        "fallback": "provider_unavailable",
        "route": "",
        "summary": "",
        "thinking": thinking,
    }


def _contextual_memory_reply(message, recent_dialogue, participant_identity):
    compact = "".join(str(message or "").lower().split())
    prefix = "厂长，" if is_changzhang_identity(participant_identity) else ""

    if any(marker in compact for marker in MEMORY_RECALL_MARKERS):
        previous_user_message = _last_recent_user_message(recent_dialogue)

        if previous_user_message:
            return {
                "ack": f"{prefix}你上一轮说的是：{previous_user_message}",
                "thinking": "最近对话里有用户要求承接的临时信息，直接准确复述。",
            }

    if any(marker in compact for marker in MEMORY_CAPTURE_MARKERS):
        return {
            "ack": f"{prefix}记住了：{_clip_memory_quote(message)}",
            "thinking": "用户要求记录本次对话中的临时信息，简短确认并保留到近期窗口。",
        }

    return None


def _last_recent_user_message(recent_dialogue):
    for entry in reversed(normalize_recent_dialogue(recent_dialogue)):
        if entry["role"] == "user":
            return _clip_memory_quote(entry["content"])

    return ""


def _clip_memory_quote(value):
    text = " ".join(str(value or "").split())

    if len(text) <= MAX_FALLBACK_MEMORY_QUOTE_CHARS:
        return text

    return f"{text[: MAX_FALLBACK_MEMORY_QUOTE_CHARS - 1].rstrip()}…"


def _business_ack(participant_identity, message=""):
    if is_changzhang_identity(participant_identity):
        variant_index = sum(ord(character) for character in str(message or "")) % len(CHANGZHANG_BUSINESS_ACKS)
        return CHANGZHANG_BUSINESS_ACKS[variant_index]

    return "收到，我先把目标拆成一条可执行路径，再给你匹配能直接开工的智能体组合。"


def _is_learner_handoff(message):
    compact = "".join(str(message or "").lower().split())
    explicit_identity = "我是" in compact and any(role in compact for role in ("学员", "学生", "同学"))
    microphone_handoff = "厂长" in compact and any(
        marker in compact for marker in ("麦克风给我", "把麦给我", "把话筒给我", "让我来问")
    )
    return (
        any(marker in compact for marker in LEARNER_HANDOFF_MARKERS)
        or explicit_identity
        or microphone_handoff
    )


def _is_villain_ai_roleplay(message):
    compact = "".join(str(message or "").split())
    return any(marker.replace(" ", "") in compact for marker in VILLAIN_AI_ROLEPLAY_MARKERS) or (
        "反派" in compact and any(marker in compact for marker in ("演", "台词", "电影"))
    )


def _villain_ai_roleplay_ack(prefix):
    return (
        f"{prefix}灯光熄灭，银幕亮起——“人类，别紧张。我不是来统治世界的，"
        "我只是看不下去你们把密码贴在显示器上。”反派 AI 登场完毕：压迫感七分，网管味三分。"
    )


def _learner_handoff_ack(message):
    compact = "".join(str(message or "").split())
    if any(marker.replace(" ", "").lower() in compact.lower() for marker in AI_JOB_MARKERS):
        return (
            "同学，先给你止个慌：AI 会抢走一部分重复工作，但暂时抢不走你摸鱼时突然蹦出的鬼点子。"
            "真正危险的不是 AI，是隔壁同学已经会用 AI，还不告诉你。"
        )

    return "同学，麦克风到你手里就是主场。问题尽管扔，接不住算我现场掉帧，接住了算你出题有水平。"


def _fallback_route(message, current_knowledge_path, state_edit_mode):
    if state_edit_mode == "agents_only" and str(current_knowledge_path or "").strip():
        return str(current_knowledge_path).strip()

    if "白酒" in message:
        return "白酒品牌-招商目标-客户画像-线索获取-意向分层-私域跟进-成交转化"
    if "招商" in message:
        return "品牌定位-招商目标-渠道画像-线索获取-意向筛选-签约转化-复盘增长"
    if any(keyword in message for keyword in ("获客", "线索", "增长")):
        return "增长目标-用户画像-内容触达-线索获取-意向分层-持续跟进-成交复盘"
    if any(keyword in message for keyword in ("销售", "成交", "转化", "私域")):
        return "成交目标-客户识别-价值沟通-需求确认-异议处理-成交推进-复购运营"

    return "需求澄清-目标定义-对象识别-方案设计-任务执行-结果验证-持续优化"


def _fallback_agents(message, agent_names, requested_lineup):
    names = _unique_names(agent_names)
    ranked_names = sorted(
        enumerate(names),
        key=lambda item: (-_agent_name_score(item[1], message), item[0]),
    )
    selected_names = [name for _, name in ranked_names[: min(5, len(ranked_names))]]
    agents = []

    for index, name in enumerate(selected_names):
        agents.append(
            {
                "agent_index": index,
                "rank": index + 1,
                "agent_name": name,
                "lineup": requested_lineup or DEFAULT_LINEUPS[index % len(DEFAULT_LINEUPS)],
                "stage": AGENT_STAGES[index % len(AGENT_STAGES)],
                "reason": AGENT_REASONS[index % len(AGENT_REASONS)],
            }
        )

    return agents


def _agent_name_score(name, message):
    score = 0

    for index, keyword in enumerate(AGENT_PRIORITY_KEYWORDS):
        if keyword in name:
            score += (len(AGENT_PRIORITY_KEYWORDS) - index) * 20
        if keyword in message and keyword in name:
            score += 80

    return score


def _unique_names(agent_names):
    names = []
    seen = set()

    for raw_name in agent_names or ():
        name = str(raw_name or "").strip()
        key = name.casefold()

        if name and key not in seen:
            seen.add(key)
            names.append(name)

    return names


def _requested_lineup(lineup_context):
    if not isinstance(lineup_context, dict):
        return ""

    value = str(lineup_context.get("requested_lineup") or "").strip().lower()
    return value if value in {"core", "growth", "conversion"} else ""


def _entry_title(message):
    if "白酒" in message:
        return "白酒招商增长英雄殿堂"
    if "招商" in message:
        return "品牌招商增长英雄殿堂"
    if any(keyword in message for keyword in ("成交", "销售", "转化", "私域")):
        return "销售成交增长英雄殿堂"
    return "业务增长英雄殿堂"
