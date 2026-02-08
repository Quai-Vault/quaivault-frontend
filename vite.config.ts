/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
  plugins: [
    react(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        const siteUrl = env.VITE_SITE_URL || 'https://testnet.quaivault.org'

        return html
          .replace(/%VITE_SITE_URL%/g, siteUrl)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
  },
  build: {
    // Use esbuild (default) for minification - fast and efficient
    target: 'esnext',
    sourcemap: false, // Disable source maps in production for smaller bundles
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'quais': ['quais'],
          'tanstack': ['@tanstack/react-query'],
        },
      },
    },
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'quais', '@tanstack/react-query'],
  },
  // SPA fallback for preview mode
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
}})
