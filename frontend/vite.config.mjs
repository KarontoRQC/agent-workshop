import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_API_BASE_URL = "http://106.52.56.14/agent-workshop-api";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  const apiUrl = new URL(apiBaseUrl);
  const proxyPrefix = apiUrl.pathname.replace(/\/+$/, "");

  return {
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      proxy: {
        "/api": {
          target: apiUrl.origin,
          changeOrigin: true,
          rewrite: (path) => (proxyPrefix ? path.replace(/^\/api/, proxyPrefix) : path),
        },
      },
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react()],
  };
});
