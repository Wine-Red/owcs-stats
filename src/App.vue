<template>
  <div class="app-layout">
    <!-- 侧边导航栏 -->
    <aside class="app-sidebar" v-if="showSidebar">
      <div class="sidebar-logo">
        <div class="logo-text">
          <h1 class="logo-title">OWCS Stats</h1>
          <span class="logo-subtitle">数据中心</span>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <div
          v-for="group in sidebarGroups"
          :key="group.title"
          class="nav-group"
        >
          <div class="nav-group-title">{{ group.title }}</div>
          <div class="nav-group-items">
            <router-link
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-item"
            >
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </nav>
    </aside>

    <!-- 主内容区与页脚 -->
    <div :class="['app-content-wrapper', { 'full-width': !showSidebar }]">
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <footer class="app-footer" v-if="showFooter">
        <div class="footer-row footer-source">
          <span>数据来源：网易大神</span>
        </div>
        <div class="footer-row footer-disclaimer">
          <span>部分素材版权归原权利方所有</span>
          <span class="divider">|</span>
          <span>统计数据仅供参考</span>
        </div>
        <div class="footer-row footer-copyright">
          <span class="trademark">© 2026 OWCS Stats</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<script>
import { computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';

export default {
  name: 'App',
  setup() {
    const route = useRoute();
    const sidebarGroups = [
      {
        title: '总览中心',
        items: [
          { to: '/dashboard', label: '全局总控' },
          { to: '/visualize', label: '数据可视化' }
        ]
      },
      {
        title: '数据采集',
        items: [
          { to: '/data-entry', label: '数据录入' },
          { to: '/data-manage/season-stats-upload', label: '赛季数据导入' }
        ]
      },
      {
        title: '赛事管理',
        items: [
          { to: '/data-manage/seasons', label: '赛季管理' },
          { to: '/data-manage/matches', label: '比赛管理' },
          { to: '/data-manage/season-visualize', label: '赛季可视化配置' }
        ]
      },
      {
        title: '战队与选手',
        items: [
          { to: '/data-manage/teams', label: '队伍管理' },
          { to: '/data-manage/players', label: '选手管理' },
          { to: '/data-manage/season-teams', label: '赛季-队伍关联' },
          { to: '/data-manage/season-team-players', label: '赛季-队伍-选手关联' }
        ]
      },
      {
        title: '系统配置',
        items: [
          { to: '/data-manage/charts', label: '图表管理' }
        ]
      }
    ];

    const isVisualizeRoute = computed(() => {
      return route.path === '/visualize' || route.path.startsWith('/visualize/');
    });

    // 控制侧边导航栏的显示
    // 在 /visualize 及其子路由下完全不渲染侧边栏
    const showSidebar = computed(() => {
      return !isVisualizeRoute.value;
    });

    const showFooter = computed(() => {
      return isVisualizeRoute.value;
    });

    const updateTheme = () => {
      if (showSidebar.value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    watch(showSidebar, updateTheme);
    onMounted(updateTheme);

    return {
      showSidebar,
      showFooter,
      sidebarGroups
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
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  background-color: #f5f7fa;
}

/* 应用布局：左侧边栏 + 右侧内容 */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* 侧边导航栏 */
.app-sidebar {
  width: 240px;
  background-color: #141414; /* 暗黑主题侧边栏 */
  color: #ffffff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.5);
  z-index: 100;
  height: 100%;
}

.sidebar-logo {
  padding: 24px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.logo-text {
  display: flex;
  flex-direction: column;
}

.logo-title {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 1px;
  color: #ffffff;
  line-height: 1.2;
}

.logo-subtitle {
  font-size: 13px;
  color: #facc15; /* 比赛金/黄 */
  font-weight: 600;
}

.sidebar-nav {
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.nav-group {
  display: flex;
  flex-direction: column;
}

.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group-title {
  font-size: 12px;
  color: #6c757d;
  font-weight: 600;
  padding: 6px 24px 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 14px 24px;
  color: #a3a3a3;
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s ease;
  border-left: 4px solid transparent;
}

.nav-item:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.05);
}

.nav-item.router-link-active {
  color: #facc15; /* 激活状态金黄色 */
  background-color: rgba(250, 204, 21, 0.1);
  border-left-color: #facc15;
  font-weight: 600;
}

/* 右侧内容包裹区 */
.app-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: #f5f7fa;
}

html.dark .app-content-wrapper {
  background-color: #0f0f0f;
  color: #e0e0e0;
}

html.dark body {
  background-color: #0f0f0f;
}

.app-content-wrapper.full-width {
  width: 100vw;
  background-color: #fafafa; /* Visualize fallback */
}

/* 主内容区 */
.app-main {
  flex: 1;
  padding: 30px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

/* Visualize 页面特殊样式：全宽无内边距 */
.app-content-wrapper.full-width .app-main {
  padding: 0;
  max-width: 100%;
}

/* 页脚 */
.app-footer {
  background-color: #ffffff;
  padding: 24px 0;
  text-align: center;
  border-top: 1px solid #e9ecef;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

html.dark .app-footer {
  background-color: #0f0f0f;
  border-top: 1px solid #262626;
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

html.dark .footer-source {
  color: #a3a3a3;
}

.footer-disclaimer {
  font-size: 12px;
  color: #909399;
}

html.dark .footer-disclaimer {
  color: #737373;
}

.footer-copyright {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 4px;
}

html.dark .footer-copyright {
  color: #525252;
}

.divider {
  color: #DCDFE6;
  font-size: 12px;
}

html.dark .divider {
  color: #404040;
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
