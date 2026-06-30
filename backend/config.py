import json
import os
from dataclasses import dataclass
from functools import lru_cache

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


BASE_DIR = os.path.dirname(__file__)
REAL_BASE_DIR = os.path.realpath(BASE_DIR)
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, os.pardir))
REAL_ROOT_DIR = os.path.abspath(os.path.join(REAL_BASE_DIR, os.pardir))
PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")
DEFAULT_ROUTE_PLANNER_BOT_ID = "7655970825086074920"
DEFAULT_RECOMMENDER_BOT_ID = "7652585242385006626"
DEFAULT_LONGCAT_BASE_URL = "https://api.longcat.chat/openai/v1"
DEFAULT_LONGCAT_MODEL = "LongCat-2.0"
DEFAULT_ROUTE_PLANNER_PROMPT_PATH = os.path.join(PROMPTS_DIR, "knowledge_graph_agent.txt")
DEFAULT_RECOMMENDER_PROMPT_PATH = os.path.join(PROMPTS_DIR, "recommended_agent.txt")
DEFAULT_UNIFIED_ORCHESTRATOR_PROMPT_PATH = os.path.join(PROMPTS_DIR, "unified_orchestration_agent.txt")

if load_dotenv:
    load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_frontend_origins():
    raw_origins = os.getenv(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5178,http://localhost:5178",
    )
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def _get_float_env(name, default):
    value = os.getenv(name, default)

    try:
        return float(value)
    except ValueError:
        return float(default)


def _get_int_env(name, default):
    value = os.getenv(name, default)

    try:
        return int(value)
    except ValueError:
        return int(default)


@dataclass(frozen=True)
class CozeSettings:
    chat_provider: str
    workflow_mode: str
    chat_url: str
    bot_id: str
    route_planner_bot_id: str
    recommender_bot_id: str
    user_id: str
    api_token: str
    longcat_api_key: str
    longcat_base_url: str
    longcat_model: str
    longcat_max_tokens: int
    route_planner_prompt_path: str
    recommender_prompt_path: str
    unified_orchestrator_prompt_path: str
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
    longcat_api_key = os.getenv("LONGCAT_API_KEY", "")
    api_token = os.getenv("COZE_API_TOKEN") or os.getenv("COZE_PAT") or ""
    chat_provider = _get_chat_provider(longcat_api_key=longcat_api_key, coze_api_token=api_token)

    return CozeSettings(
        chat_provider=chat_provider,
        workflow_mode=os.getenv("WORKFLOW_MODE", "unified").strip().lower(),
        chat_url=os.getenv("COZE_CHAT_URL", "https://api.coze.cn/v3/chat"),
        bot_id=bot_id,
        route_planner_bot_id=os.getenv("COZE_ROUTE_PLANNER_BOT_ID") or DEFAULT_ROUTE_PLANNER_BOT_ID,
        recommender_bot_id=os.getenv("COZE_RECOMMENDER_BOT_ID", DEFAULT_RECOMMENDER_BOT_ID),
        user_id=os.getenv("COZE_USER_ID", "123456789"),
        api_token=api_token,
        longcat_api_key=longcat_api_key,
        longcat_base_url=os.getenv("LONGCAT_BASE_URL", DEFAULT_LONGCAT_BASE_URL),
        longcat_model=os.getenv("LONGCAT_MODEL", DEFAULT_LONGCAT_MODEL),
        longcat_max_tokens=_get_int_env("LONGCAT_MAX_TOKENS", "3000"),
        route_planner_prompt_path=os.getenv("ROUTE_PLANNER_PROMPT_PATH", DEFAULT_ROUTE_PLANNER_PROMPT_PATH),
        recommender_prompt_path=os.getenv("RECOMMENDER_PROMPT_PATH", DEFAULT_RECOMMENDER_PROMPT_PATH),
        unified_orchestrator_prompt_path=os.getenv(
            "UNIFIED_ORCHESTRATOR_PROMPT_PATH",
            DEFAULT_UNIFIED_ORCHESTRATOR_PROMPT_PATH,
        ),
        connect_timeout=_get_float_env("COZE_CONNECT_TIMEOUT", "10"),
        read_timeout=_get_float_env("COZE_READ_TIMEOUT", "300"),
        agent_names=_get_agent_names_env(),
    )


def _get_chat_provider(longcat_api_key="", coze_api_token=""):
    configured_provider = os.getenv("CHAT_PROVIDER", "").strip().lower()

    if not configured_provider:
        return "longcat"

    if configured_provider == "coze" and longcat_api_key and not coze_api_token:
        return "longcat"

    return configured_provider


def get_tts_settings():
    return TtsSettings(
        provider=os.getenv("TTS_PROVIDER", "auto").strip().lower(),
        edge_tts_exe=os.getenv("EDGE_TTS_EXE", "edge-tts").strip(),
        edge_tts_voice=os.getenv("EDGE_TTS_VOICE", "zh-CN-XiaoxiaoNeural").strip(),
        edge_tts_rate=os.getenv("EDGE_TTS_RATE", "+0%").strip(),
        edge_tts_volume=os.getenv("EDGE_TTS_VOLUME", "+0%").strip(),
        edge_tts_pitch=os.getenv("EDGE_TTS_PITCH", "+0Hz").strip(),
        edge_tts_timeout=_get_float_env("EDGE_TTS_TIMEOUT", "25"),
        piper_exe=os.getenv("PIPER_EXE", "").strip(),
        piper_voice=os.getenv("PIPER_VOICE", "").strip(),
        piper_config=os.getenv("PIPER_CONFIG", "").strip(),
        piper_timeout=_get_float_env("PIPER_TIMEOUT", "18"),
        piper_length_scale=_get_float_env("PIPER_LENGTH_SCALE", "1.0"),
        piper_noise_scale=_get_float_env("PIPER_NOISE_SCALE", "0.667"),
        piper_noise_w=_get_float_env("PIPER_NOISE_W", "0.8"),
    )


def _get_agent_names_env():
    raw_names = os.getenv("COZE_AGENT_NAMES")

    if raw_names:
        return tuple(name.strip() for name in raw_names.split(",") if name.strip())

    return _load_default_agent_names()


@lru_cache(maxsize=1)
def _load_default_agent_names():
    for path in _source_agent_paths():
        names = _read_agent_names(path, "智能体名称")
        if names:
            return names

    return ()


def _source_agent_paths():
    configured_path = os.getenv("SOURCE_AGENTS_PATH", "").strip()
    candidates = (
        configured_path,
        os.path.join(ROOT_DIR, "data", "source_agents_full.json"),
        os.path.join(REAL_ROOT_DIR, "data", "source_agents_full.json"),
    )
    return tuple(path for path in candidates if path)


def _read_agent_names(path, key):
    try:
        with open(path, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return ()

    if isinstance(data, dict):
        records = data.get("agents", [])
    elif isinstance(data, list):
        records = data
    else:
        return ()

    names = []
    seen = set()

    for record in records:
        if not isinstance(record, dict):
            continue

        name = str(record.get(key, "")).strip()

        if not name or name in seen:
            continue

        seen.add(name)
        names.append(name)

    return tuple(names)
