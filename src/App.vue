<template>
  <div class="app-layout" :class="{ 'no-sidebar': !showSidebar, 'is-visualize': isVisualizeRoute }">
    <!-- 移动端顶部导航 -->
    <div class="mobile-top-header" v-if="showSidebar">
      <el-icon class="menu-toggle-btn" @click="mobileSidebarOpen = true"><Menu /></el-icon>
      <span class="mobile-header-title">OWCS Stats 数据中心</span>
    </div>

    <!-- 侧边导航栏遮罩 -->
    <div class="sidebar-overlay" v-if="showSidebar && mobileSidebarOpen" @click="mobileSidebarOpen = false"></div>

    <!-- 侧边导航栏 -->
    <aside class="app-sidebar" :class="{ 'mobile-open': mobileSidebarOpen }" v-if="showSidebar">
      <div class="sidebar-logo">
        <div class="logo-text">
          <h1 class="logo-title">OWCS Stats</h1>
          <span class="logo-subtitle">数据中心</span>
        </div>
      </div>
      <div class="sidebar-sync-time">
        最后同步：{{ latestSyncTime }}
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
    <div :class="['app-content-wrapper', { 'full-width': !showSidebar, 'has-mobile-header': showSidebar }]">
      <main :class="['app-main', { 'no-padding-main': isAnalyticsRoute }]">
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
          <span class="divider" style="margin: 0 8px;">|</span>
          <span class="sync-time">最后同步时间：{{ latestSyncTime }}</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<script>
import { computed, watch, onMounted, ref, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import apiService from '@/services/api';
import { Menu } from '@element-plus/icons-vue';

export default {
  name: 'App',
  components: {
    Menu
  },
  setup() {
    const route = useRoute();
    const mobileSidebarOpen = ref(false);

    watch(() => route.path, () => {
      mobileSidebarOpen.value = false;
    });

    const sidebarGroups = [
      {
        title: '总览中心',
        items: [
          { to: '/dashboard', label: '全局总控' },
          { to: '/visualize', label: '数据可视化' },
          { to: '/analytics', label: '访问统计' }
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
          { to: '/data-manage/charts', label: '全局设置' }
        ]
      }
    ];

    const isVisualizeRoute = computed(() => {
      return route.path === '/visualize' || route.path.startsWith('/visualize/');
    });

    const isAnalyticsRoute = computed(() => {
      return route.path === '/analytics';
    });

    const isBlankLayout = computed(() => {
      return route.meta.layout === 'blank';
    });

    const hideFooterRouteNames = ['MatchDetail', 'TeamDetail', 'PlayerDetail', 'UpcomingMatchDetail'];

    // 控制侧边导航栏的显示
    // 在 /visualize 及其子路由下完全不渲染侧边栏
    const showSidebar = computed(() => {
      return !isVisualizeRoute.value && !isBlankLayout.value;
    });

    const showFooter = computed(() => {
      return isVisualizeRoute.value && !isBlankLayout.value && !hideFooterRouteNames.includes(String(route.name || ''));
    });

    const updateTheme = () => {
      if (showSidebar.value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const latestSyncTime = ref('获取中...');
    let syncTimer = null;

    const fetchLatestSyncTime = async () => {
      try {
        const result = await apiService.getConfig('latest_match_sync_updates');
        if (result && result.lastSyncAt) {
          const date = new Date(result.lastSyncAt);
          latestSyncTime.value = date.toLocaleString('zh-CN', { hour12: false });
        } else {
          latestSyncTime.value = '暂无记录';
        }
      } catch (error) {
        latestSyncTime.value = '获取失败';
      }
    };

    watch(showSidebar, updateTheme);
    onMounted(() => {
      updateTheme();
      fetchLatestSyncTime();
      syncTimer = setInterval(fetchLatestSyncTime, 60000); // 1分钟刷新一次
    });

    onUnmounted(() => {
      if (syncTimer) {
        clearInterval(syncTimer);
      }
    });

    return {
      showSidebar,
      showFooter,
      sidebarGroups,
      latestSyncTime,
      mobileSidebarOpen,
      isAnalyticsRoute,
      isVisualizeRoute
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

html, body {
  overflow-x: hidden;
  touch-action: manipulation; /* 禁用双指缩放，仅允许滚动和点击 */
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
  padding: 24px 20px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
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

.sidebar-sync-time {
  padding: 8px 20px;
  font-size: 11px;
  color: #6c6c6c;
  background-color: #0f0f0f;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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

/* 需要全宽无边距的常规页面（如 Analytics） */
.app-main.no-padding-main {
  padding: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
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
    padding: 24px 16px 32px;
    gap: 8px;
    background: linear-gradient(180deg, #f5f7fa 0%, #ebeef5 100%);
    border-top: 1px solid rgba(0,0,0,0.05);
  }
  
  html.dark .app-footer {
    background: linear-gradient(180deg, #141414 0%, #0a0a0a 100%);
    border-top: 1px solid rgba(255,255,255,0.05);
  }
  
  .footer-row {
    flex-direction: column;
    gap: 6px;
    text-align: center;
    font-size: 12px;
  }

  .footer-source {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
  }
  
  .footer-disclaimer .divider,
  .footer-copyright .divider {
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

.mobile-top-header {
  display: none;
}
.sidebar-overlay {
  display: none;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }

  .app-sidebar {
    position: fixed;
    left: -240px;
    top: 0;
    bottom: 0;
    z-index: 1000;
    transition: left 0.3s ease;
  }

  .app-sidebar.mobile-open {
    left: 0;
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }

  .mobile-top-header {
    display: flex;
    align-items: center;
    background-color: #141414;
    color: #ffffff;
    height: 50px;
    padding: 0 16px;
    position: relative;
    z-index: 900;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }

  .menu-toggle-btn {
    font-size: 24px;
    cursor: pointer;
    margin-right: 16px;
  }

  .mobile-header-title {
    font-size: 16px;
    font-weight: 700;
    font-family: 'Oxanium', sans-serif;
  }

  .app-content-wrapper {
    height: auto;
    min-height: 0;
  }

  .app-content-wrapper.has-mobile-header {
    padding-top: 0;
  }

  .app-header {
    padding: 0 20px;
  }

  .main-nav {
    gap: 15px;
  }

  .nav-item {
    font-size: 14px;
    padding: 10px 20px;
  }

  .app-main {
    padding: 16px;
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

.app-layout.no-sidebar .main-container {
  margin-left: 0 !important;
  width: 100% !important;
}
</style>
