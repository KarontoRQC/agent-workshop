# Voice Particle JARVIS

A standalone Vite + React + Three.js prototype for a JARVIS-like AI dialogue surface.

The first screen is the actual experience: a central particle crystal, orbital particle streams, voice/text input, browser speech output, and a streaming agent endpoint.

## What It Tests

- A stable 3D particle core that feels like an AI presence instead of a generic visualizer.
- A natural orbital particle stream where brightness comes from particle density and lighting rather than hard white lines.
- Voice input through the browser Web Speech API.
- Microphone energy driving particle pulse, radius, brightness, and point size.
- Browser `speechSynthesis` output tuned toward a mature English male voice when the OS/browser provides a matching voice.
- Streaming backend text displayed above the input controls while the agent is responding.
- Agent recommendation cards and graph-focus actions from the `/coze/chat/stream` backend.
- A local mock fallback so the UI remains usable when the remote agent endpoint is unavailable.

## Run

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5188
```

Open:

```text
http://127.0.0.1:5188/
```

The default dev server proxies `/api` to `http://106.52.56.14/agent-workshop-api`, so a fresh clone can talk to the remote agent backend without creating a local backend first.

## Build

```powershell
npm run build
```

Vite may warn that the Three.js chunk is larger than 500 kB. That is expected for this prototype.

## Voice Notes

The app scores available English voices and prefers mature male-leaning candidates such as `Microsoft George`, `Google UK English Male`, `Daniel`, `George`, `Guy`, `David`, `Mark`, `Ryan`, `William`, `Brian`, or `Alex`. It avoids common female voice names when possible, then lowers pitch and slows the speech rate to create a steadier AI-butler feel.

Voice quality still depends on the user's OS and browser voice packs. If no matching voice is available, the app falls back to the browser's default English voice.

Voice recognition depends on browser support and page security:

- Local clone/dev use: open the app through `http://127.0.0.1:5188/` or `http://localhost:5188/`.
- Public deployment: use HTTPS. Plain `http://server-ip:port` will usually disable microphone and speech recognition.
- Recommended browsers: Chrome or Edge on desktop. Safari/Firefox support can vary.
- The first click on the voice bar is required so the browser can request microphone and speech permissions.
- If voice is unavailable, the UI shows the browser/runtime reason and text input still works.

## Agent Endpoint

Dev mode uses the Vite proxy in `vite.config.ts`. For production builds, configure the agent API explicitly:

```text
VITE_AGENT_API_BASE_URL=https://your-domain.example/agent-workshop-api
```

If the frontend is served over HTTPS and no API env var is provided, the app defaults to same-origin `/api` to avoid browser mixed-content blocking. Configure your deploy platform, Nginx, or Cloudflare Worker to proxy `/api/*` to the agent backend.

Optional switches:

```text
VITE_AGENT_STREAM_ENABLED=false
VITE_TTS_BROWSER_FALLBACK=auto
```

The streaming integration lives in `src/lib/agentStreamClient.ts` and `src/lib/aiClient.ts`.
