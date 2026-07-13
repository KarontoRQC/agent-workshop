import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_API_ORIGIN = 'https://agent.xtznai.com';
const DEFAULT_API_BASE_URL = DEFAULT_API_ORIGIN;

function resolveProxyApi(value: string) {
  const match = value.match(/^(https?:\/\/[^/]+)(\/.*)?$/i) || DEFAULT_API_BASE_URL.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);

  return {
    prefix: (match?.[2] || '').replace(/\/+$/, ''),
    target: match?.[1] || DEFAULT_API_ORIGIN,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiBaseUrl = env.API_PROXY_BASE_URL || env.VITE_AGENT_API_BASE_URL || env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  const api = resolveProxyApi(apiBaseUrl);
  const tts = resolveProxyApi(env.TTS_PROXY_TARGET || apiBaseUrl);

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            if (moduleId.includes('/node_modules/three/')) {
              return 'three-vendor';
            }
            if (moduleId.includes('/node_modules/react/') || moduleId.includes('/node_modules/react-dom/')) {
              return 'react-vendor';
            }

            return undefined;
          },
        },
      },
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/agent-avatars': {
          changeOrigin: true,
          target: api.target,
        },
        '/api/tts': {
          changeOrigin: true,
          rewrite: (path) => (tts.prefix ? path.replace(/^\/api/, tts.prefix) : path),
          target: tts.target,
        },
        '/api': {
          changeOrigin: true,
          rewrite: (path) => (api.prefix ? path.replace(/^\/api/, api.prefix) : path),
          target: api.target,
        },
      },
    },
  };
});
