import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


BASE_DIR = os.path.dirname(__file__)

if load_dotenv:
    load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_frontend_origins():
    raw_origins = os.getenv(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def _get_float_env(name, default):
    value = os.getenv(name, default)

    try:
        return float(value)
    except ValueError:
        return float(default)


@dataclass(frozen=True)
class CozeSettings:
    chat_url: str
    bot_id: str
    route_planner_bot_id: str
    recommender_bot_id: str
    user_id: str
    api_token: str
    connect_timeout: float
    read_timeout: float
    agent_names: tuple


def get_coze_settings():
    bot_id = os.getenv("COZE_BOT_ID", "")

    return CozeSettings(
        chat_url=os.getenv("COZE_CHAT_URL", "https://api.coze.cn/v3/chat"),
        bot_id=bot_id,
        route_planner_bot_id=os.getenv("COZE_ROUTE_PLANNER_BOT_ID") or bot_id,
        recommender_bot_id=os.getenv("COZE_RECOMMENDER_BOT_ID", "7652585242385006626"),
        user_id=os.getenv("COZE_USER_ID", "123456789"),
        api_token=os.getenv("COZE_API_TOKEN") or os.getenv("COZE_PAT") or "",
        connect_timeout=_get_float_env("COZE_CONNECT_TIMEOUT", "10"),
        read_timeout=_get_float_env("COZE_READ_TIMEOUT", "300"),
        agent_names=_get_agent_names_env(),
    )


def _get_agent_names_env():
    raw_names = os.getenv("COZE_AGENT_NAMES")

    if raw_names:
        return tuple(name.strip() for name in raw_names.split(",") if name.strip())

    return (
        "帝王竞技场",
        "第一性原理挖掘",
        "①战略专家",
        "②用户画像大师",
        "用户分析-卖点专家",
        "行业尽调",
        "销售智能体",
    )
