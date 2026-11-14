import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';
  const clientPort = Number(env.CLIENT_PORT) || 5173;

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      host: true,
      // Lets the app call "/api/..." in dev instead of hardcoding a backend URL.
      // Set VITE_API_PROXY_TARGET in .env if the backend is not on port 5000.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      port: clientPort,
      host: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
