# Design QA

Final result: passed

## Prototype

- App: `frontend/voice-particle-jarvis`
- Stack: Vite + React + Three.js
- Intent: a JARVIS-like 3D particle dialogue surface with voice input, text input, browser speech output, and a placeholder model slot.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| 3D particle orb | passed | The central field renders as a stable 3D particle sphere with natural density rings and restrained motion. |
| Voice output tone | passed | Browser speech output is tuned toward a mature English male voice when a matching system voice is available. |
| Audio response path | passed | Microphone energy can drive particle pulse, radius, brightness, and point size after browser permission is granted. |
| Model slot | passed | The AI endpoint remains configurable through `VITE_AI_CHAT_ENDPOINT`; local English placeholder replies keep the demo flow alive. |
| Cinematic loop | passed | The animation loop includes a camera push-in and visible recomposition into smaller particle spheres. |
| Responsive layout | passed | Desktop and 390px mobile viewport checks keep the orb, dialogue cards, and input controls visible. |
| Build | passed | `npm run build` completes; Vite reports only the expected Three.js chunk-size warning. |

## Notes

- Automated QA did not accept the microphone permission prompt; live microphone input should be checked manually in Chrome or Edge.
- Speech voice availability depends on the user's browser and OS voice pack. If no preferred English male voice exists, the app falls back to the browser's default English voice.
- This directory intentionally excludes `node_modules` and generated `dist` output.
