import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/styles/visualize-theme.css'

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

// 使用插件
app.use(router)
app.use(store)
app.use(ElementPlus)

// 挂载应用
router.isReady().then(() => {
  app.mount('#app')
})