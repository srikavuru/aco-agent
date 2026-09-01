import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Single-file build used only to publish an interactive preview artifact.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-preview',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
