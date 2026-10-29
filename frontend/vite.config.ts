import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // `host: true` binds every interface so a phone on the same LAN can reach
    // the dev server at http://<laptop-LAN-IP>:5173.
    host: true,
    // The backend's default CORS origin is http://localhost:5173, so the port
    // must not silently shift to 5174.
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
