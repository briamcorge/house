import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/house/',
  build: {
    sourcemap: false,
    emptyOutDir: true,
  },
  plugins: [
    react(),
    tsconfigPaths(),
  ],
})
