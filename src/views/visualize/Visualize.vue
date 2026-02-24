<template>
  <div class="visualize-container vis-container">
    <!-- 顶部导航栏 (Header) -->
    <header class="vis-header">
      <div class="header-left">
        <div class="logo-placeholder">
          <img src="/public/OWCS.png" alt="OWCS Logo" class="header-logo" />
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
      </div>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue';
import { useStore } from 'vuex';
import { DataAnalysis, Moon } from '@element-plus/icons-vue';

const HeroBanChart = defineAsyncComponent(() => import('./components/HeroBanChart.vue'));
const MapPickChart = defineAsyncComponent(() => import('./components/MapPickChart.vue'));
const TeamStatsChart = defineAsyncComponent(() => import('./components/TeamStatsChart.vue'));
const PlayerStatsChart = defineAsyncComponent(() => import('./components/PlayerStatsChart.vue'));

import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  components: {
    HeroBanChart,
    MapPickChart,
    TeamStatsChart,
    PlayerStatsChart,
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
      playerStats: true
    });
    
    const seasons = computed(() => store.state.seasons);
    
    const handleSeasonChange = async () => {
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
    };
    
    onMounted(async () => {
      const savedConfig = localStorage.getItem('visualize_chart_config');
      if (savedConfig) {
        try {
          chartConfig.value = JSON.parse(savedConfig);
        } catch (e) {
          console.error('Failed to parse chart config', e);
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
      chartConfig
    };
  }
};
</script>

<style scoped>
.vis-container {
  background-color: #F5F7FA;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Oxanium', sans-serif;
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
  min-height: 100px;
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
