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
          popper-class="vis-dropdown-tabs"
          size="large"
          @visible-change="handleDropdownVisible"
        >
          <div class="stage-tabs-header">
            <div 
              v-for="group in groupedSeasons" 
              :key="'tab-' + group.label"
              class="stage-tab"
              :class="{ active: activeStage === group.label }"
              @click.stop="activeStage = group.label"
            >
              {{ group.label }}
            </div>
          </div>
          <template v-for="group in groupedSeasons" :key="'opt-' + group.label">
            <el-option
              v-for="season in group.options"
              :key="season.id"
              :label="season.name"
              :value="season.id"
              :style="{ display: activeStage === group.label ? '' : 'none' }"
            />
          </template>
        </el-select>
      </div>
    </header>

    <!-- 主内容网格 (Main Grid) -->
    <main class="vis-content">
      <!-- 赛事概览横幅 -->
      <TournamentBanner :seasonId="filterForm.seasonId" />

      <!-- 标签页导航 -->
      <div class="vis-tabs-container">
        <div class="vis-tabs">
          <div 
            class="vis-tab-item" 
            :class="{ active: currentTab === 'overview' }"
            @click="currentTab = 'overview'"
          >
            赛事概览
          </div>
          <div 
            class="vis-tab-item" 
            :class="{ active: currentTab === 'stats' }"
            @click="currentTab = 'stats'"
          >
            赛事数据
          </div>
        </div>
      </div>

      <!-- 概览内容 -->
      <div v-show="currentTab === 'overview'" class="tab-content" style="width: 100%;">
        <RecentMatches :matches="seasonMatches" :mapGames="seasonMapGames" />
        
        <div class="vis-grid" style="margin-bottom: 24px;">
          <div class="vis-col span-12">
            <RegularSeasonBoard :seasonId="filterForm.seasonId" :matches="seasonMatches" :mapGames="seasonMapGames" />
          </div>
        </div>

        <MapPool :seasonId="filterForm.seasonId" />
      </div>

      <!-- 进阶数据分析内容 -->
      <div v-if="currentTab === 'stats'" class="tab-content">
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
      </div>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted, defineAsyncComponent, nextTick, watch } from 'vue';
import { useStore } from 'vuex';

const HeroBanChart = defineAsyncComponent(() => import('./components/HeroBanChart.vue'));
const MapPickChart = defineAsyncComponent(() => import('./components/MapPickChart.vue'));
const TeamStatsChart = defineAsyncComponent(() => import('./components/TeamStatsChart.vue'));
const PlayerStatsChart = defineAsyncComponent(() => import('./components/PlayerStatsChart.vue'));
const PlayerRadarChart = defineAsyncComponent(() => import('./components/PlayerRadarChart.vue'));

import TournamentBanner from './components/TournamentBanner.vue';
import RecentMatches from './components/RecentMatches.vue';
import RegularSeasonBoard from './components/RegularSeasonBoard.vue';
import MapPool from './components/MapPool.vue';

import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  components: {
    HeroBanChart,
    MapPickChart,
    TeamStatsChart,
    PlayerStatsChart,
    PlayerRadarChart,
    TournamentBanner,
    RecentMatches,
    RegularSeasonBoard,
    MapPool
  },
  setup() {
    const store = useStore();
    
    const currentTab = ref('overview');

    const filterForm = ref({
      seasonId: '',
      teamIds: [],
      playerIds: [],
      heroIds: []
    });

    const seasonMatches = ref([]);
    const seasonMapGames = ref([]);

    // 当切换到数据图表时，确保 ECharts 正确获取宽高
    watch(currentTab, async (newTab) => {
      if (newTab === 'stats') {
        await nextTick();
        window.dispatchEvent(new Event('resize'));
      }
    });

    const loadSeasonData = async (seasonId) => {
      if (!seasonId) return;
      try {
        const matchesRes = await apiService.getMatches({ seasonId });
        seasonMatches.value = Array.isArray(matchesRes) ? matchesRes : matchesRes.data || [];
        
        const mapGamesRes = await apiService.getMapGames({ seasonId });
        seasonMapGames.value = Array.isArray(mapGamesRes) ? mapGamesRes : mapGamesRes.data || [];
      } catch (error) {
        console.error('Failed to load season data', error);
      }
    };

    const chartConfig = ref({
      heroBan: true,
      mapPick: true,
      teamStats: true,
      playerStats: true,
      playerRadar: true
    });
    
    const seasons = computed(() => store.state.seasons);

    const groupedSeasons = computed(() => {
      const groups = {};
      const ungrouped = [];
      
      seasons.value.forEach(season => {
        if (season.stage) {
          if (!groups[season.stage]) {
            groups[season.stage] = [];
          }
          groups[season.stage].push(season);
        } else {
          ungrouped.push(season);
        }
      });
      
      const result = [];
      
      for (const [stage, options] of Object.entries(groups)) {
        result.push({ label: stage, options });
      }
      
      if (ungrouped.length > 0) {
        if (result.length > 0) {
          result.push({ label: '其他赛季', options: ungrouped });
        } else {
          result.push({ label: '', options: ungrouped });
        }
      }
      
      return result;
    });
    
    // 动态计算 logo URL，确保在非根路径部署时也能正确加载
    const logoUrl = computed(() => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      return `${baseUrl}icons/OWCS.png`;
    });
    
    const activeStage = ref('');

    const handleDropdownVisible = (visible) => {
      if (visible) {
        const selectedSeason = seasons.value.find(s => s.id === filterForm.value.seasonId);
        if (selectedSeason) {
          activeStage.value = selectedSeason.stage || '其他';
        } else if (groupedSeasons.value.length > 0) {
          activeStage.value = groupedSeasons.value[0].label;
        }
      }
    };

    const handleSeasonChange = async () => {
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
      await loadSeasonData(filterForm.value.seasonId);
    };
    
    onMounted(async () => {
      // 等待 Vue DOM 更新
      await nextTick();

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
        activeStage.value = inProgressSeason.stage || '其他';
      } else if (seasons.value.length > 0) {
         filterForm.value.seasonId = seasons.value[0].id;
         activeStage.value = seasons.value[0].stage || '其他';
      }

      if (filterForm.value.seasonId) {
        await loadSeasonData(filterForm.value.seasonId);
      }
    });

    // 修复：确保选择器变化时或初始加载后，子组件能够接收到数据并渲染
    watch(() => filterForm.value.seasonId, async (newVal, oldVal) => {
      // 只有当值真正改变时才触发重新加载，避免与 onMounted 重复
      if (newVal && newVal !== oldVal) {
        await loadSeasonData(newVal);
      }
    }, { immediate: true });
    
    return {
      currentTab,
      filterForm,
      seasonMatches,
      seasonMapGames,
      seasons,
      groupedSeasons,
      activeStage,
      handleDropdownVisible,
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

/* 标签页导航样式 */
.vis-tabs-container {
  display: flex;
  margin-bottom: 32px;
  width: 100%;
}

.vis-tabs {
  display: flex;
  background: #ffffff;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  width: 100%;
}

.vis-tab-item {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 16px;
  font-weight: 700;
  color: #606266;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s ease;
  user-select: none;
}

.vis-tab-item:hover {
  color: #1a1a1a;
}

.vis-tab-item.active {
  background: #f0f2f5;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.tab-content {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
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
  /* Removed min-height and visibility hidden to disable scrollreveal behavior */
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

<style>
/* 赛段切换标签下拉框样式 */
.vis-dropdown-tabs .el-select-dropdown__list {
  padding: 0 !important;
  display: block !important;
}

.stage-tabs-header {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  border-bottom: 1px solid #ebeef5;
  padding: 8px 12px 0;
  background: #fafafa;
  border-radius: 4px 4px 0 0;
  margin-bottom: 8px;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.stage-tabs-header::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}

.stage-tab {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  color: #333;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
  white-space: nowrap;
  margin-bottom: -1px;
}

.stage-tab:hover {
  color: #000;
}

.stage-tab.active {
  color: #000;
  border-bottom-color: #333;
}

.vis-dropdown-tabs .el-select-dropdown__item {
  margin: 4px 12px;
  border-radius: 4px;
  transition: all 0.2s ease;
  height: 36px;
  line-height: 36px;
}

/* 统一的可视化页面下拉菜单基础样式 */
.vis-dropdown .el-select-dropdown__list {
  display: grid !important;
  grid-template-columns: 1fr; /* 默认一栏，适合赛季等短列表 */
  gap: 4px;
  padding: 8px !important;
}

.vis-dropdown .el-select-dropdown__item {
  border-radius: 4px;
  margin: 0;
  transition: all 0.2s ease;
  padding: 0 16px;
  height: 36px;
  line-height: 36px;
}

/* 针对长列表（队伍、选手）在桌面端的网格布局 */
@media (min-width: 769px) {
  .vis-dropdown-tabs {
    min-width: 320px !important;
  }
  .vis-dropdown {
    min-width: max-content !important;
  }
  .vis-dropdown-long {
    min-width: 480px !important; /* 加宽下拉框以适应多列 */
  }
  .vis-dropdown-long .el-select-dropdown__list {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important; /* 桌面端三栏 */
    gap: 8px;
  }
}

/* 移动端行为：长列表分两栏，下拉框占满屏幕宽度 */
@media (max-width: 768px) {
  .vis-dropdown-tabs, .vis-dropdown, .vis-dropdown-long {
    width: 90vw !important;
    min-width: unset !important;
    max-width: 90vw !important;
    left: 5vw !important;
    margin: 0 !important;
  }
  
  .vis-dropdown .el-select-dropdown__list {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px;
  }
  .vis-dropdown-long .el-select-dropdown__list {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 6px;
  }
  
  .vis-dropdown .el-scrollbar {
    padding-right: 0 !important;
  }
}
</style>
