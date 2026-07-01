# Voice Particle JARVIS

A standalone Vite + React + Three.js prototype for a JARVIS-like AI dialogue surface.

The first screen is the actual experience: a central 3D particle orb, natural density rings, voice/text input, browser speech output, and a placeholder model endpoint for later integration.

## What It Tests

- A stable 3D particle orb that feels like an AI presence instead of a generic visualizer.
- A natural orbital particle stream where brightness comes from particle density and lighting rather than hard white lines.
- Voice input through the browser Web Speech API.
- Microphone energy driving particle pulse, radius, brightness, and point size.
- Browser `speechSynthesis` output tuned toward a mature English male voice when the OS/browser provides a matching voice.
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

## Runtime Defaults

The committed `.env` is intentional for this private prototype. It keeps Vite proxying `/api` to the shared Agent Workshop API and keeps speech output on browser `speechSynthesis` by default, so a fresh checkout does not need local TTS setup and will not call `/api/tts/speech`.

Use `.env.local` for machine-specific overrides. For example, set `VITE_TTS_BROWSER_FALLBACK=auto` only when you want to test backend audio synthesis.

## Build

```powershell
npm run build
```

Vite may warn that the Three.js chunk is larger than 500 kB. That is expected for this prototype.

## Voice Notes

The app scores available English voices and prefers mature male-leaning candidates such as `Microsoft George`, `Google UK English Male`, `Daniel`, `George`, `Guy`, `David`, `Mark`, `Ryan`, `William`, `Brian`, or `Alex`. It avoids common female voice names when possible, then lowers pitch and slows the speech rate to create a steadier AI-butler feel.

Voice quality still depends on the user's OS and browser voice packs. If no matching voice is available, the app falls back to the browser's default English voice.

Click the bottom `Preview voice profile` control to trigger a short spoken line and confirm the browser is allowing speech output. During speech, the whole particle orb pulses with simulated output energy and speech boundary events.

## Model Endpoint

Leave the model slot empty for local demo mode, or provide an endpoint with:

```text
VITE_AI_CHAT_ENDPOINT=https://your-endpoint.example/chat
```

The endpoint integration lives in `src/lib/aiClient.ts`.
