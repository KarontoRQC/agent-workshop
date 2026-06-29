import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_API_BASE_URL = 'http://106.52.56.14/agent-workshop-api';

function resolveProxyApi(value: string) {
  try {
    const apiUrl = new URL(value);

    return {
      prefix: apiUrl.pathname.replace(/\/+$/, ''),
      target: apiUrl.origin,
    };
  } catch {
    const fallbackUrl = new URL(DEFAULT_API_BASE_URL);

    return {
      prefix: fallbackUrl.pathname.replace(/\/+$/, ''),
      target: fallbackUrl.origin,
    };
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiBaseUrl = env.API_PROXY_BASE_URL || env.VITE_AGENT_API_BASE_URL || env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  const ttsProxyTarget = env.TTS_PROXY_TARGET || 'http://127.0.0.1:5000';
  const api = resolveProxyApi(apiBaseUrl);

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/tts': {
          changeOrigin: true,
          target: ttsProxyTarget,
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
