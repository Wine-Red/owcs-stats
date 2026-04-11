<template>
  <div class="visualize-container vis-container">
    <!-- 顶部导航栏 (Header) -->
    <header class="vis-header">
      <div class="header-left">
        <div class="logo-placeholder">
          <img :src="logoUrl" alt="OWCS Logo" class="header-logo" width="40" height="40" />
        </div>
        <h1 class="vis-title"><span class="title-main">Overwatch</span> <span class="subtitle">电竞数据</span></h1>
      </div>
      <div class="header-right">
        <el-select 
          v-model="filterForm.seasonId" 
          placeholder="选择赛季" 
          aria-label="选择赛季"
          @change="handleSeasonChange" 
          class="vis-season-select" 
          popper-class="vis-dropdown-tabs"
          size="large"
          @visible-change="handleDropdownVisible"
        >
          <div class="stage-tabs-header">
            <button 
              v-for="group in groupedSeasons" 
              :key="'tab-' + group.label"
              class="stage-tab"
              :class="{ active: activeStage === group.label }"
              :aria-label="`切换到${group.label}赛段`"
              @click.stop="activeStage = group.label"
            >
              {{ group.label }}
            </button>
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
      <div v-if="isPageLoading" class="page-loading">
        <div class="loading-panel">
          <div class="loading-spinner"></div>
          <div class="loading-text">加载中...</div>
        </div>
      </div>

      <Transition name="page-fade" mode="out-in">
        <div v-if="!isPageLoading" class="vis-body">
          <!-- 赛事概览横幅 -->
          <TournamentBanner 
            :seasonId="filterForm.seasonId" 
            :tags="seasonVisualConfig.tags" 
            :dateRange="seasonVisualConfig.dateRange"
          />

          <!-- 即将到来的比赛 -->
          <UpcomingMatches 
            :liquipediaTournamentName="seasonVisualConfig.liquipediaTournamentName" 
          />

          <!-- 标签页导航 -->
          <div class="vis-tabs-container">
            <div class="vis-tabs" role="tablist">
              <button 
                v-if="chartConfig.overviewTab"
                class="vis-tab-item" 
                :class="{ active: currentTab === 'overview' }"
                @click="currentTab = 'overview'"
                role="tab"
                :aria-selected="currentTab === 'overview'"
              >
                赛事概览
              </button>
              <button 
                v-if="chartConfig.recentTab"
                class="vis-tab-item" 
                :class="{ active: currentTab === 'recent' }"
                @click="currentTab = 'recent'"
                role="tab"
                :aria-selected="currentTab === 'recent'"
              >
                比赛列表
              </button>
              <button 
                v-if="chartConfig.statsTab"
                class="vis-tab-item" 
                :class="{ active: currentTab === 'stats' }"
                @click="currentTab = 'stats'"
                role="tab"
                :aria-selected="currentTab === 'stats'"
              >
                赛事数据
              </button>
            </div>
          </div>

          <Transition name="tab-fade" mode="out-in" @after-enter="handleTabAfterEnter">
            <div :key="currentTab" class="tab-content" style="width: 100%;">
              <template v-if="currentTab === 'overview'">
                <div class="vis-grid overview-section">
                  <div class="vis-col span-12">
                    <RegularSeasonBoard :seasonId="filterForm.seasonId" :matches="seasonMatches" :mapGames="seasonMapGames" :template="seasonVisualConfig.standings.template" :score-stats="seasonTeamScoreStats" :stage-overrides="seasonVisualConfig.standings.stageOverrides" :current-stage-label="seasonVisualConfig.standings.currentStageLabel" />
                  </div>
                </div>

                <MapPool :seasonId="filterForm.seasonId" :map-ids="seasonVisualConfig.mapPool.mapIds" :map-pick-stats="seasonMapPickStats" :map-games="seasonMapGames" />
              </template>
              <template v-else-if="currentTab === 'recent'">
                <RecentMatches :matches="seasonMatches" :mapGames="seasonMapGames" />
              </template>
              <template v-else>
                <div class="vis-grid">
                  <div class="vis-col span-6" v-if="chartConfig.heroBan">
                    <HeroBanChart :seasonId="filterForm.seasonId" />
                  </div>

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
              </template>
            </div>
          </Transition>
        </div>
      </Transition>
    </main>
  </div>
</template>

<script>
import { ref, computed, onMounted, defineAsyncComponent, nextTick } from 'vue';
import { useStore } from 'vuex';

const HeroBanChart = defineAsyncComponent(() => import('./components/HeroBanChart.vue'));
const TeamStatsChart = defineAsyncComponent(() => import('./components/TeamStatsChart.vue'));
const PlayerStatsChart = defineAsyncComponent(() => import('./components/PlayerStatsChart.vue'));
const PlayerRadarChart = defineAsyncComponent(() => import('./components/PlayerRadarChart.vue'));

import TournamentBanner from './components/TournamentBanner.vue';
import RegularSeasonBoard from './components/RegularSeasonBoard.vue';
import MapPool from './components/MapPool.vue';
import RecentMatches from './components/RecentMatches.vue';
import UpcomingMatches from './components/UpcomingMatches.vue';

import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  components: {
    HeroBanChart,
    TeamStatsChart,
    PlayerStatsChart,
    PlayerRadarChart,
    TournamentBanner,
    RegularSeasonBoard,
    MapPool,
    RecentMatches,
    UpcomingMatches
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
    const seasonTeamScoreStats = ref([]);
    const seasonMapPickStats = ref([]);
    const isPageLoading = ref(true);

    const handleTabAfterEnter = async () => {
      if (currentTab.value === 'stats') {
        await nextTick();
        window.dispatchEvent(new Event('resize'));
      }
    };

    const loadSeasonData = async (seasonId) => {
      if (!seasonId) return;
      try {
        const matchesRes = await apiService.getMatches({ seasonId, pageSize: 1000 });
        seasonMatches.value = Array.isArray(matchesRes) ? matchesRes : matchesRes.data || matchesRes.list || [];
        
        const mapGamesRes = await apiService.getMapGames({ seasonId, pageSize: 1000 });
        seasonMapGames.value = Array.isArray(mapGamesRes) ? mapGamesRes : mapGamesRes.data || mapGamesRes.list || [];
      } catch (error) {
        console.error('Failed to load season data', error);
      }
    };

    const loadSeasonTeamsMapping = async (seasonId) => {
      if (!seasonId) return;
      try {
        const allSeasonTeams = await apiService.getAllSeasonTeams();
        const seasonIdNum = Number(seasonId);
        const filteredSeasonTeams = (allSeasonTeams || []).filter(st => Number(st.seasonId) === seasonIdNum);
        store.commit('setSeasonTeams', filteredSeasonTeams);
      } catch (error) {
        console.error('Failed to load season teams mapping', error);
        store.commit('setSeasonTeams', []);
      }
    };

    const loadSeasonOverviewStats = async (seasonId) => {
      if (!seasonId) return;
      try {
        const [teamScoreRes, mapPickRes] = await Promise.all([
          apiService.getSeasonTeamScoreStats(seasonId),
          apiService.getSeasonMapPickStats(seasonId)
        ]);
        seasonTeamScoreStats.value = Array.isArray(teamScoreRes) ? teamScoreRes : teamScoreRes?.data || [];
        seasonMapPickStats.value = Array.isArray(mapPickRes) ? mapPickRes : mapPickRes?.data || [];
      } catch (error) {
        console.error('Failed to load season overview stats', error);
        seasonTeamScoreStats.value = [];
        seasonMapPickStats.value = [];
      }
    };

    const seasonVisualConfig = ref({
      tags: [],
      dateRange: '',
      mapPool: {
        mapIds: []
      },
      standings: {
        template: 'wl_maps'
      },
      liquipediaTournamentName: ''
    });

    const normalizeStringArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => String(v).trim()).filter(Boolean);
    };

    const normalizeIdArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => Number(v)).filter(v => Number.isFinite(v));
    };

    const loadSeasonVisualConfig = async (seasonId) => {
      if (!seasonId) return;
      try {
        const config = await apiService.getConfig(`visualize_season_${seasonId}`);
        seasonVisualConfig.value = {
          tags: normalizeStringArray(config?.tags),
          dateRange: config?.dateRange || '',
          mapPool: { mapIds: normalizeIdArray(config?.mapPool?.mapIds) },
          standings: {
            template: config?.standings?.template === 'points_3_0' ? 'points_3_0' : 'wl_maps',
            stageOverrides: (config?.standings?.stageOverrides && typeof config.standings.stageOverrides === 'object') ? config.standings.stageOverrides : {},
            currentStageLabel: String(config?.standings?.currentStageLabel || '当前阶段')
          },
          liquipediaTournamentName: config?.liquipediaTournamentName || ''
        };
      } catch (error) {
        seasonVisualConfig.value = {
          tags: [],
          dateRange: '',
          mapPool: { mapIds: [] },
          standings: { template: 'wl_maps', stageOverrides: {}, currentStageLabel: '当前阶段' },
          liquipediaTournamentName: ''
        };
      }
    };

    const chartConfig = ref({
      overviewTab: true,
      recentTab: true,
      statsTab: true,
      heroBan: true,
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
      isPageLoading.value = true;
      try {
        await Promise.all([
          loadSeasonData(filterForm.value.seasonId),
          loadSeasonTeamsMapping(filterForm.value.seasonId),
          loadSeasonVisualConfig(filterForm.value.seasonId),
          loadSeasonOverviewStats(filterForm.value.seasonId)
        ]);
      } finally {
        await nextTick();
        isPageLoading.value = false;
      }
    };
    
    onMounted(async () => {
      isPageLoading.value = true;
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
        try {
          await Promise.all([
            loadSeasonData(filterForm.value.seasonId),
            loadSeasonTeamsMapping(filterForm.value.seasonId),
            loadSeasonVisualConfig(filterForm.value.seasonId),
            loadSeasonOverviewStats(filterForm.value.seasonId)
          ]);
        } finally {
          await nextTick();
          isPageLoading.value = false;
        }
      } else {
        isPageLoading.value = false;
      }
    });
    
    return {
      currentTab,
      filterForm,
      seasonMatches,
      seasonMapGames,
      seasonTeamScoreStats,
      seasonMapPickStats,
      seasonVisualConfig,
      seasons,
      groupedSeasons,
      activeStage,
      handleDropdownVisible,
      handleSeasonChange,
      chartConfig,
      logoUrl,
      isPageLoading,
      handleTabAfterEnter
    };
  }
};
</script>

<style scoped>
.vis-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  
  background-color: #fafafa;
}

/* 标签页导航样式 */
.vis-tabs-container {
  display: flex;
  margin-top: 0;
  margin-bottom: 32px;
  width: 100%;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.vis-tabs {
  display: flex;
  width: 100%;
}

.vis-tab-item {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 15px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  transition: color 0.2s ease, border-color 0.2s ease;
  user-select: none;
  margin-bottom: -1px;
  outline: none;
}

.vis-tab-item:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.4);
}

.vis-tab-item:hover {
  color: #111;
}

.vis-tab-item.active {
  color: #111;
  font-weight: 600;
  border-bottom: 2px solid #111;
}

.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.vis-header {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  height: 64px;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  box-sizing: border-box;
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
  padding: 48px 32px 32px;
  width: 100%;
  flex: 1;
  box-sizing: border-box;
  position: relative;
}

.page-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  z-index: 10;
}

.loading-panel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(0, 0, 0, 0.05);
  border-top-color: #111;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-size: 14px;
  color: #111;
  font-weight: 500;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.vis-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
}

.overview-section {
  margin-bottom: 16px;
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
  .vis-content {
    padding: 16px 8px;
  }

  .vis-tabs-container {
    margin-top: -14px;
    margin-bottom: 14px;
  }

  .overview-section {
    margin-bottom: 10px;
  }
  
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
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  transition: color 0.3s, border-color 0.3s;
  white-space: nowrap;
  margin-bottom: -1px;
  outline: none;
}

.stage-tab:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.4);
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
  transition: background-color 0.2s ease, color 0.2s ease;
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
  transition: background-color 0.2s ease, color 0.2s ease;
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
