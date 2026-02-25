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
      <div class="footer-content">
        <span>数据来源：网易大神</span>
        <span class="divider">|</span>
        <span>更多数据仍在开发中，敬请期待</span>
      </div>
      <p class="copyright">© 2026 OWCS Stats</p>
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
  padding: 24px 32px;
  text-align: center;
  border-top: 1px solid #e9ecef;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.footer-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #606266;
}

.divider {
  color: #DCDFE6;
  font-size: 12px;
}

.app-footer .copyright {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

@media (max-width: 768px) {
  .app-footer {
    padding: 16px;
  }
  
  .footer-content {
    font-size: 12px;
    flex-direction: column;
    gap: 4px;
  }
  
  .divider {
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