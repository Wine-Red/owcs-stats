import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/orbitron/latin-400.css'
import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-600.css'
import '@fontsource/orbitron/latin-700.css'
import '@fontsource/orbitron/latin-800.css'
import '@fontsource/orbitron/latin-900.css'
import '@fontsource/oxanium/latin-200.css'
import '@fontsource/oxanium/latin-300.css'
import '@fontsource/oxanium/latin-400.css'
import '@fontsource/oxanium/latin-500.css'
import '@fontsource/oxanium/latin-600.css'
import '@fontsource/oxanium/latin-700.css'
import '@fontsource/oxanium/latin-800.css'
import '@/styles/visualize-theme.css'
import { initAnalytics } from '@/utils/analytics'

// 禁用双指缩放和 Ctrl+滚轮缩放
document.addEventListener('gesturestart', function (e) {
  e.preventDefault();
});
document.addEventListener('gesturechange', function (e) {
  e.preventDefault();
});
document.addEventListener('gestureend', function (e) {
  e.preventDefault();
});
document.addEventListener('wheel', function (e) {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

// 创建Vue应用
const app = createApp(App)
if (import.meta.env.MODE !== 'static') initAnalytics()

// 使用插件
app.use(router)
app.use(store)
app.use(ElementPlus)

// 挂载应用
router.isReady().then(() => {
  app.mount('#app')
})
