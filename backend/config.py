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


@dataclass(frozen=True)
class TtsSettings:
    provider: str
    edge_tts_exe: str
    edge_tts_voice: str
    edge_tts_rate: str
    edge_tts_volume: str
    edge_tts_pitch: str
    edge_tts_timeout: float
    piper_exe: str
    piper_voice: str
    piper_config: str
    piper_length_scale: float
    piper_noise_scale: float
    piper_noise_w: float
    piper_timeout: float


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


def get_tts_settings():
    return TtsSettings(
        provider=os.getenv("TTS_PROVIDER", "edge").strip().lower(),
        edge_tts_exe=os.getenv("EDGE_TTS_EXE", "edge-tts"),
        edge_tts_voice=os.getenv("EDGE_TTS_VOICE", "zh-CN-YunyangNeural"),
        edge_tts_rate=os.getenv("EDGE_TTS_RATE", "+0%"),
        edge_tts_volume=os.getenv("EDGE_TTS_VOLUME", "+0%"),
        edge_tts_pitch=os.getenv("EDGE_TTS_PITCH", "+0Hz"),
        edge_tts_timeout=_get_float_env("EDGE_TTS_TIMEOUT", "30"),
        piper_exe=os.getenv("PIPER_EXE", ""),
        piper_voice=os.getenv("PIPER_VOICE", ""),
        piper_config=os.getenv("PIPER_CONFIG", ""),
        piper_length_scale=_get_float_env("PIPER_LENGTH_SCALE", "1.0"),
        piper_noise_scale=_get_float_env("PIPER_NOISE_SCALE", "0.667"),
        piper_noise_w=_get_float_env("PIPER_NOISE_W", "0.8"),
        piper_timeout=_get_float_env("PIPER_TIMEOUT", "30"),
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
