<template>
  <div class="visualize-container vis-container">
    <!-- 顶部导航栏 (Header) -->
    <header class="vis-header">
      <div class="header-left">
        <div class="logo-placeholder">
          <img :src="logoUrl" alt="OWCS Logo" class="header-logo" />
        </div>
        <h1 class="vis-title"><span class="title-main">Overwatch</span> <span class="subtitle">电竞数据</span></h1>
      </div>
      <div class="header-right">
        <el-select 
          v-model="filterForm.seasonId" 
          placeholder="选择赛季" 
          @change="handleSeasonChange" 
          class="vis-season-select" 
          size="large"
        >
          <el-option
            v-for="season in seasons"
            :key="season.id"
            :label="season.name"
            :value="season.id"
          />
        </el-select>
      </div>
    </header>

    <!-- 主内容网格 (Main Grid) -->
    <main class="vis-content">
      <div class="vis-grid">
        <!-- 第一行: 英雄禁用 & 地图选取 -->
        <div class="vis-col span-6" v-if="chartConfig.heroBan">
          <HeroBanChart :seasonId="filterForm.seasonId" />
        </div>
        <div class="vis-col span-6" v-if="chartConfig.mapPick">
          <MapPickChart :seasonId="filterForm.seasonId" />
        </div>

        <!-- 第二行: 队伍数据 & 选手数据 -->
        <!-- 
          User requested: 
          - TeamStatsChart (Scatter plot)
          - PlayerStatsChart (List)
          Let's put them full width if they need space, or side-by-side.
          Scatter plots usually need width. Player lists need height.
          Let's try putting TeamStats full width (span-12) and PlayerStats full width (span-12) 
          OR split them. The previous layout had them stacked. 
          If I split them span-6, the scatter plot might be small.
          However, on 1920px span-6 is ~900px, which is plenty.
          Let's try span-12 for TeamStats (Scatter) to show detail, 
          and span-12 for PlayerStats (List).
          Wait, the user wanted "optimize information density".
          Maybe span-6 is better. Let's start with span-12 for better readability as per "original design" requests usually implying keeping data visible.
          Actually, let's do span-12 for TeamStats and span-12 for PlayerStats to be safe, 
          or span-6 if I want to be aggressive with density.
          Let's stick to span-12 for now as they are complex charts.
        -->
        <div class="vis-col span-12" v-if="chartConfig.teamStats">
          <TeamStatsChart :seasonId="filterForm.seasonId" />
        </div>
        <div class="vis-col span-12" v-if="chartConfig.playerStats">
          <PlayerStatsChart :seasonId="filterForm.seasonId" />
        </div>
        <div class="vis-col span-6" v-if="chartConfig.playerRadar">
          <PlayerRadarChart :seasonId="filterForm.seasonId" />
        </div>
      </div>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted, defineAsyncComponent, nextTick } from 'vue';
import { useStore } from 'vuex';
import { DataAnalysis, Moon } from '@element-plus/icons-vue';
import ScrollReveal from 'scrollreveal';

const HeroBanChart = defineAsyncComponent(() => import('./components/HeroBanChart.vue'));
const MapPickChart = defineAsyncComponent(() => import('./components/MapPickChart.vue'));
const TeamStatsChart = defineAsyncComponent(() => import('./components/TeamStatsChart.vue'));
const PlayerStatsChart = defineAsyncComponent(() => import('./components/PlayerStatsChart.vue'));
const PlayerRadarChart = defineAsyncComponent(() => import('./components/PlayerRadarChart.vue'));

import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  components: {
    HeroBanChart,
    MapPickChart,
    TeamStatsChart,
    PlayerStatsChart,
    PlayerRadarChart,
    DataAnalysis,
    Moon
  },
  setup() {
    const store = useStore();
    
    const filterForm = ref({
      seasonId: '',
      teamIds: [],
      playerIds: [],
      heroIds: []
    });

    const chartConfig = ref({
      heroBan: true,
      mapPick: true,
      teamStats: true,
      playerStats: true,
      playerRadar: true
    });
    
    const seasons = computed(() => store.state.seasons);
    
    // 动态计算 logo URL，确保在非根路径部署时也能正确加载
    const logoUrl = computed(() => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      return `${baseUrl}icons/OWCS.png`;
    });
    
    const handleSeasonChange = async () => {
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
    };
    
    onMounted(async () => {
      // 等待 Vue DOM 更新
      await nextTick();
      
      // 强制清理可能存在的旧实例状态，防止刷新时的状态残留
      ScrollReveal().clean('.vis-col');

      const initReveal = () => {
        ScrollReveal().reveal('.vis-col', {
          distance: '50px',
          origin: 'bottom',
          opacity: 0,
          scale: 0.95, // 添加轻微缩放效果
          duration: 600, // 稍微放慢动画速度
          delay: 150, 
          easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
          interval: 200,
          viewFactor: 0.1, // 降低视口触发阈值，确保在视口边缘也能触发
          mobile: true,
          reset: false, // 动画只播放一次
          useDelay: 'always' // 强制每次都应用延迟，即使是刷新页面
        });
      };

      // 确保字体加载完成后再初始化，或者最长等待 500ms
      // 这能解决因字体加载导致的布局偏移（Layout Shift）使 ScrollReveal 计算不准的问题
      if (document.fonts && document.fonts.ready) {
        Promise.race([
          document.fonts.ready,
          new Promise(resolve => setTimeout(resolve, 500))
        ]).then(() => {
          setTimeout(initReveal, 200);
        });
      } else {
        setTimeout(initReveal, 300);
      }

      // 兜底策略：1秒后手动触发一次滚动事件，强制 ScrollReveal 重新计算
      // 解决移动端部分浏览器因地址栏变化或图片懒加载导致的视口判断失效
      setTimeout(() => {
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }, 1000);

      // 优先从后端加载配置
      try {
        const config = await apiService.getConfig('visualize_chart_config');
        if (config) {
          chartConfig.value = { ...chartConfig.value, ...config };
        }
      } catch (error) {
        console.error('加载图表配置失败，尝试使用本地缓存:', error);
        const savedConfig = localStorage.getItem('visualize_chart_config');
        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            chartConfig.value = { ...chartConfig.value, ...parsed };
          } catch (e) { /* ignore */ }
        }
      }

      await store.dispatch('loadBaseData');
      
      const inProgressSeason = seasons.value.find(season => season.status === 'in_progress');
      if (inProgressSeason) {
        filterForm.value.seasonId = inProgressSeason.id;
      } else if (seasons.value.length > 0) {
         filterForm.value.seasonId = seasons.value[0].id;
      }
    });
    
    return {
      filterForm,
      seasons,
      handleSeasonChange,
      chartConfig,
      logoUrl
    };
  }
};
</script>

<style scoped>
.vis-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Oxanium', sans-serif;
  
  /* 科技感背景设计 */
  background-color: #f5f7fa;
  background-image: 
    radial-gradient(circle at 90% 10%, rgba(255, 158, 15, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 10% 90%, rgba(64, 158, 255, 0.08) 0%, transparent 60%),
    linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
  background-attachment: fixed;
}

.vis-header {
  background: #FFFFFF;
  height: 64px;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  box-sizing: border-box; /* 确保 padding 包含在宽度内 */
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-placeholder {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.vis-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: #1A1A1A;
  margin: 0;
  letter-spacing: 1px;
}

.vis-title .subtitle {
  color: #FF9E0F;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.vis-season-select {
  width: 180px;
}

.vis-content {
  padding: 32px;
  width: 100%;
  flex: 1;
}

.vis-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
}

.vis-col {
  min-height: 300px; /* 增加最小高度，防止组件未加载时高度塌缩导致 ScrollReveal 误判所有元素都在视口内 */
  visibility: hidden; /* 初始隐藏，防止闪烁，ScrollReveal 初始化后会自动接管并显示 */
}

.span-6 {
  grid-column: span 6;
}

.span-12 {
  grid-column: span 12;
}

/* Responsive */
@media (max-width: 1200px) {
  .span-6 {
    grid-column: span 12;
  }
}

@media (max-width: 768px) {
  .vis-header {
    padding: 0 8px; /* 减小内边距 */
    flex-direction: row;
    align-items: center;
    height: 64px;
    gap: 8px; /* 减小间隙 */
  }
  
  .header-left {
    justify-content: flex-start;
    flex: 0 0 auto;
    gap: 8px; /* 减小 Logo 和标题的间隙 */
  }

  .logo-placeholder {
    width: 32px; /* 稍微缩小 Logo */
    height: 32px;
  }
  
  .logo-placeholder .el-icon {
    font-size: 18px;
  }

  .vis-title {
    font-size: 14px; /* 减小标题字体 */
    white-space: nowrap;
    display: flex;
    flex-direction: column; /* 将标题改为上下排列，节省横向空间 */
    line-height: 1.1;
    align-items: flex-start;
  }
  
  .vis-title .subtitle {
    font-size: 12px;
  }

  .header-right {
    width: auto;
    flex: 1 1 auto; /* 占据剩余空间 */
    min-width: 0; /* 允许缩小 */
  }
  
  .vis-season-select {
    width: 100%;
    max-width: none;
  }

  /* 解决移动端 Select 下拉框宽度问题 */
  :deep(.el-select-dropdown) {
    max-width: 90vw;
  }
}

/* 全局覆盖 Select 下拉框样式以确保内容显示完整 */
:deep(.vis-season-select .el-input__inner) {
  text-overflow: ellipsis;
}

</style>
