<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <header class="app-header" v-if="showHeader">
      <div class="logo">
        <h1>OWCS Stats</h1>
      </div>
      <nav class="main-nav">
        <router-link to="/dashboard" class="nav-item">仪表盘</router-link>
        <router-link to="/data-entry" class="nav-item">数据录入</router-link>
        <router-link to="/data-manage" class="nav-item">数据管理</router-link>
        <router-link to="/visualize" class="nav-item">数据可视化</router-link>
      </nav>
    </header>

    <!-- 主内容区 -->
    <main :class="['app-main', { 'visualize-main': !showHeader }]">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 页脚 -->
    <footer class="app-footer">
      <div class="footer-row footer-source">
        <span>数据来源：网易大神</span>
      </div>
      <div class="footer-row footer-disclaimer">
        <span>部分素材版权归原权利方所有</span>
        <span class="divider">|</span>
        <span>统计数据仅供参考，赛场表现不止于数据</span>
      </div>
      <div class="footer-row footer-copyright">
        <span class="trademark">© 2026 OWCS Stats</span>
      </div>
    </footer>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

export default {
  name: 'App',
  setup() {
    const route = useRoute();

    // 控制顶部导航栏的显示
    // 在 /visualize 及其子路由下完全不渲染导航栏
    const showHeader = computed(() => {
      return route.path !== '/visualize' && !route.path.startsWith('/visualize/');
    });

    return {
      showHeader
    };
  }
}
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  background-color: #f5f7fa;
}

/* 应用容器 */
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 顶部导航栏 */
.app-header {
  background-color: #1a1a2e;
  color: white;
  padding: 0 30px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo h1 {
  font-size: 20px;
  font-weight: 600;
}

.main-nav {
  display: flex;
  gap: 30px;
}

.nav-item {
  color: white;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.nav-item.router-link-active {
  background-color: #42b983;
}

/* 主内容区 */
.app-main {
  flex: 1;
  padding: 30px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

/* 页脚 */
.app-footer {
  background-color: #f8f9fa;
  padding: 32px 0;
  text-align: center;
  border-top: 1px solid #e9ecef;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.footer-source {
  font-size: 13px;
  color: #606266;
}

.footer-disclaimer {
  font-size: 12px;
  color: #909399;
}

.footer-copyright {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 4px;
}

.divider {
  color: #DCDFE6;
  font-size: 12px;
}

@media (max-width: 768px) {
  .app-footer {
    padding: 20px 16px;
    gap: 12px;
  }
  
  .footer-row {
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
  
  .footer-disclaimer .divider {
    display: none;
  }
}

/* 页面过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-header {
    padding: 0 20px;
  }

  .main-nav {
    gap: 15px;
  }

  .nav-item {
    font-size: 12px;
    padding: 6px 10px;
  }

  .app-main {
    padding: 20px;
  }
  
  /* 在移动端也要去除 Visualize 页面的 padding */
  .app-main.visualize-main {
    padding: 0;
  }
}

/* Visualize 页面特殊样式：全宽无内边距 */
.app-main.visualize-main {
  padding: 0;
  max-width: 100%;
  margin: 0;
}
</style>