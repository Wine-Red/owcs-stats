import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => ({
  base: mode === 'static' ? './' : '/stats/',
  
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
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        proxyTimeout: 60000,
        timeout: 60000
      }
    }
  }
}))
