import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/house/',
  build: {
    sourcemap: process.env.VITE_BASE === './' ? false : 'hidden',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    tsconfigPaths(),
  ],
})
