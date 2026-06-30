# JARVIS Voice Particle Frontend

This is the primary Agent Workshop frontend. It is a Vite + React + TypeScript + Three.js app for a JARVIS-like AI dialogue surface.

The first screen is the actual product experience: a central particle crystal, orbital particle streams, voice/text input, browser speech output, streaming agent responses, graph focus actions, and agent recommendation cards.

## Run

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5188
```

Open:

```text
http://127.0.0.1:5188/
```

## Build

```powershell
npm run build
```

Vite may warn that the Three.js chunk is larger than 500 kB. That is expected for this prototype.

## API Proxy

Development mode uses `vite.config.ts`.

- `/api/tts/*` proxies to `TTS_PROXY_TARGET`, defaulting to `http://127.0.0.1:5000`.
- Other `/api/*` requests proxy to `API_PROXY_BASE_URL`, `VITE_AGENT_API_BASE_URL`, `VITE_API_BASE_URL`, or the default local backend at `http://127.0.0.1:5000`.

Useful switches:

```text
VITE_AGENT_STREAM_ENABLED=false
VITE_TTS_BROWSER_FALLBACK=auto
```

## Voice Notes

- Voice recognition depends on browser support and page security.
- Local development should use `http://127.0.0.1:5188/` or `http://localhost:5188/`.
- Recommended browsers are Chrome or Edge on desktop.
- The first voice interaction requires microphone permission.
- If server TTS fails, the UI falls back to browser `speechSynthesis`.

## Agent Notes

- Streaming integration lives in `src/lib/agentStreamClient.ts` and `src/lib/aiClient.ts`.
- Recommended-agent card enrichment uses `data/source_agents_full.json` and `src/assets/agent-avatars`.
- Graph focus actions are treated as visual controls for the JARVIS particle scene, not as a separate black-gold frontend.
