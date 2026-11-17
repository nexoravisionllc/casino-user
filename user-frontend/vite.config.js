import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server runs on port 5173 and proxies API calls to the Node backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5090',
        changeOrigin: true,
      },
      // The SignalR wallet hub lives on the admin backend, not the user backend.
      '/hubs': {
        target: 'http://localhost:5100',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
