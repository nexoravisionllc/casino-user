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
    },
  },
});
