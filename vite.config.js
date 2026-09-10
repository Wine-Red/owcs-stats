import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { readFileSync } from 'node:fs'
import { validateSiteConfig } from './src/services/siteClient.mjs'

export default defineConfig(({ mode }) => {
  const portable = ['static', 'api-static'].includes(mode)
  const site = mode === 'api-static' ? validateSiteConfig(JSON.parse(readFileSync(process.env.OWCS_SITE_CONFIG || 'site-package.config.json', 'utf8'))) : null
  const origins = site ? [...new Set([new URL(site.apiBaseUrl).origin, site.mediaOrigin])].join(' ') : ''
  return {
    base: portable ? './' : (process.env.VITE_BASE_PATH || '/'),
    publicDir: 'public',

    plugins: [
      vue(),
      portable && {
        name: 'owcs-static-html',
        transformIndexHtml(html) {
          return html.replace(/\s*<!-- external-analytics:start -->[\s\S]*?<!-- external-analytics:end -->/, '')
            .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${origins}; font-src 'self' data:; connect-src 'self' ${origins}; object-src 'none'; base-uri 'self'">`)
        }
      }
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    build: portable ? {
      outDir: site ? 'dist-api' : 'dist',
      copyPublicDir: !site,
      // Produce one intermediate bundle. build-display embeds code, styles,
      // fonts, images and local JSON into HTML for hosts with a no-CORS CDN.
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
  }
})
