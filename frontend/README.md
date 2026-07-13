# Voice Particle JARVIS

A standalone Vite + React + Three.js prototype for a JARVIS-like AI dialogue surface.

The first screen is the actual experience: a central 3D particle orb, natural density rings, voice/text input, server Edge TTS speech output, and a placeholder model endpoint for later integration.

## What It Tests

- A stable 3D particle orb that feels like an AI presence instead of a generic visualizer.
- A natural orbital particle stream where brightness comes from particle density and lighting rather than hard white lines.
- Voice input through the browser Web Speech API.
- Microphone energy driving particle pulse, radius, brightness, and point size.
- Server `/api/tts/speech` output through Edge TTS, using the backend's Chinese female voice by default.
- A one-click voice preview control in the bottom hint row, useful for testing the current voice profile without waiting for a model reply.
- A blank AI model slot through `VITE_AI_CHAT_ENDPOINT`, with local English placeholder replies as the fallback.
- A stable orb that keeps its main form; voice output drives whole-orb breathing, brightness, and particle size instead of ending in a small-sphere recomposition.

## Run

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5178
```

Open:

```text
http://127.0.0.1:5178/
```

## Participant Identity

The page stays visually identical for every participant. Use the query parameter only to select the server-side conversation persona:

```text
Ordinary user: http://127.0.0.1:5178/
Factory director: http://127.0.0.1:5178/?identity=changzhang
Production: https://agent.xtznai.com/?identity=changzhang
```

Unknown values fall back to the ordinary-user persona. This parameter is not authentication and must never control permissions.

## Runtime Defaults

The committed `.env` is intentional for this private prototype. It keeps Vite proxying `/api` to `https://agent.xtznai.com` and keeps speech output in `server` mode, so the app requests `/api/tts/speech` and does not auto-fallback to browser `speechSynthesis`.

Production builds use the same-origin `/api` path by default, so HTTP and HTTPS pages automatically use the matching protocol without mixed-content requests. If you override `VITE_AGENT_API_BASE_URL` or `VITE_API_BASE_URL` with a bare origin such as `https://agent.xtznai.com`, the frontend normalizes it to the `/api` base automatically; HTTPS deployments must use an HTTPS override.

Protected mutations use `src/lib/apiSession.ts`: the browser lazily creates `/api/session`, keeps the CSRF token in `sessionStorage`, and sends the HttpOnly session cookie with same-origin requests. A generated recommendation's edit token is stored locally by recommendation ID and is never added to the share URL, so a Hero Hall opened on another browser remains read-only.

Use `.env.local` for machine-specific overrides. Keep `VITE_TTS_BROWSER_FALLBACK=server` for the Edge TTS path.

## Build

```powershell
npm run build
```

Vite may warn that the isolated Three.js vendor chunk is slightly larger than 500 kB. The application and Hero Hall chunks are split separately; verify gzip and HTTP/2 in production rather than merging Three.js back into the main bundle.

## Voice Notes

Default speech quality depends on the backend Edge TTS service and the configured female voice `zh-CN-XiaoxiaoNeural`, not on the user's OS/browser voice packs.

Click the bottom `Preview voice profile` control to trigger a short spoken line and confirm the browser is allowing speech output. During speech, the whole particle orb pulses with simulated output energy and speech boundary events.

## Model Endpoint

Leave the model slot empty for local demo mode, or provide an endpoint with:

```text
VITE_AI_CHAT_ENDPOINT=https://your-endpoint.example/chat
```

The endpoint integration lives in `src/lib/aiClient.ts`.
