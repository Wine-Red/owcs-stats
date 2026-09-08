import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => ({
  base: mode === 'static' ? './' : (process.env.VITE_BASE_PATH || '/'),
  
  plugins: [
    vue(),
    mode === 'static' && {
      name: 'owcs-static-html',
      transformIndexHtml(html) {
        return html.replace(/\s*<!-- external-analytics:start -->[\s\S]*?<!-- external-analytics:end -->/, '')
      }
    }
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: mode === 'static' ? {
    // Some third-party static hosts move secondary assets to a CDN without
    // enabling CORS for ES modules. Keep the downloadable release portable by
    // avoiding runtime chunk imports and cross-origin font requests.
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  } : undefined,
  server: {
    port: 8080,
    proxy: {
      '/data/v1': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        proxyTimeout: 150000,
        timeout: 150000
      },
      '/poll-api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000
      },
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000
      },
      '/public-api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        rewrite: requestPath => requestPath.replace(/^\/public-api/, '/api'),
        proxyTimeout: 60000,
        timeout: 60000
      },
      '/media': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000
      }
    }
  }
}))
