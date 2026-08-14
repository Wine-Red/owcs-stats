<template>
  <div class="visualize-container vis-container">
    <!-- 桌面端产品栏；移动端由紧凑赛事上下文栏承担导航 -->
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
          <section class="mobile-event-context" aria-label="当前赛事">
            <div class="mobile-event-mark" aria-hidden="true">
              <img :src="currentSeasonLogoUrl" alt="" width="36" height="36" />
            </div>
            <button
              type="button"
              class="mobile-season-select-trigger"
              aria-label="切换赛事"
              @click="openMobileSeasonPicker"
            >
              <span class="mobile-event-copy">
                <strong class="mobile-event-name">{{ currentSeasonName }}</strong>
                <span class="mobile-event-meta">
                  <span class="mobile-status-dot" :class="`is-${currentSeasonStatus}`" aria-hidden="true"></span>
                  {{ currentSeasonStatusLabel }}
                  <span class="mobile-meta-separator" aria-hidden="true"></span>
                  {{ seasonVisualConfig.dateRange || currentSeasonStage }}
                </span>
              </span>
              <el-icon class="mobile-season-chevron" aria-hidden="true"><ArrowDown /></el-icon>
            </button>
          </section>

          <el-drawer
            v-model="mobileSeasonPickerOpen"
            class="mobile-season-drawer"
            direction="btt"
            size="min(72dvh, 560px)"
            :show-close="false"
            :append-to-body="true"
          >
            <template #header>
              <div class="mobile-drawer-heading">
                <span class="mobile-drawer-handle" aria-hidden="true"></span>
                <strong>选择赛事</strong>
              </div>
            </template>
            <div class="mobile-season-groups">
              <section
                v-for="group in mobileSeasonGroups"
                :key="group.label"
                class="mobile-season-group"
              >
                <h2>{{ group.label }}</h2>
                <button
                  v-for="season in group.options"
                  :key="season.id"
                  type="button"
                  class="mobile-season-option"
                  :class="{ active: String(season.id) === String(filterForm.seasonId) }"
                  :aria-current="String(season.id) === String(filterForm.seasonId) ? 'true' : undefined"
                  @click="selectMobileSeason(season.id)"
                >
                  <span class="mobile-season-option-copy">
                    <strong>{{ season.name }}</strong>
                    <span>{{ getSeasonStatusLabel(season.status) }}</span>
                  </span>
                  <span class="mobile-option-check" aria-hidden="true"></span>
                </button>
              </section>
            </div>
          </el-drawer>

          <!-- 桌面端赛事概览横幅 -->
          <TournamentBanner 
            class="banner-fullbleed"
            :seasonId="filterForm.seasonId"
            :tags="seasonVisualConfig.tags" 
            :dateRange="seasonVisualConfig.dateRange"
          />

          <!-- 标签页导航 -->
          <div
            class="vis-tabs-container"
          >
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
                赛程列表
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

          <ContentChoiceGroup
            v-if="currentTab === 'stats' && statsCategoryTabs.length"
            class="stats-category-choices"
            :model-value="activeStatsCategory"
            :items="statsCategoryTabs"
            hide-label
            aria-label="赛事数据分类"
            @update:model-value="switchStatsCategory"
          />

          <Transition name="tab-fade" mode="out-in" @after-enter="handleTabAfterEnter">
            <div
              :key="currentTab"
              ref="tabContentRef"
              class="tab-content"
              :class="[
                `is-${currentTab}`,
                { 'is-stats-hero': currentTab === 'stats' && activeStatsCategory === 'hero' }
              ]"
              style="width: 100%;"
            >
              <template v-if="currentTab === 'overview'">
                <div class="overview-section">
                  <RegularSeasonBoard
                    title="阶段排名"
                    :seasonId="filterForm.seasonId"
                    :matches="seasonMatches"
                    :mapGames="seasonMapGames"
                    :template="seasonVisualConfig.standings.template"
                    :score-stats="seasonTeamScoreStats"
                    :stage-overrides="seasonVisualConfig.standings.stageOverrides"
                    :qualification-count="seasonVisualConfig.standings.qualificationCount"
                  />
                </div>
              </template>
              <template v-else-if="currentTab === 'recent'">
                <MatchSchedule
                  :matches="seasonMatches"
                  :mapGames="seasonMapGames"
                  :seasonId="filterForm.seasonId"
                  :liquipedia-tournament-url="seasonVisualConfig.liquipediaTournamentUrl"
                  :showUpcoming="currentSeasonStatus !== 'completed'"
                />
              </template>
              <template v-else>
                <div class="stats-workspace">
                  <Transition name="stats-panel-fade" mode="out-in" @after-enter="handleStatsPanelAfterEnter">
                    <div v-if="activeStatsCategory" :key="activeStatsCategory" class="stats-category-panel">
                      <section v-if="activeStatsCategory === 'team'" class="stats-data-section">
                        <TeamStatsChart :seasonId="filterForm.seasonId" />
                      </section>

                      <section v-else-if="activeStatsCategory === 'player'" class="stats-data-section">
                        <PlayerStatsChart :seasonId="filterForm.seasonId" :show-final-blows="!!(seasonFeatures && seasonFeatures.hasFinalBlows)" />
                      </section>

                      <section v-else-if="activeStatsCategory === 'map'" class="stats-data-section">
                        <MapStatsOverview :map-pick-stats="seasonMapPickStats" :map-games="seasonMapGames" :map-ids="seasonVisualConfig.mapPool.mapIds" :season-id="filterForm.seasonId" />
                      </section>

                      <section v-else-if="activeStatsCategory === 'hero'" class="stats-data-section">
                        <HeroOverviewChart :seasonId="filterForm.seasonId" />
                      </section>

                      <section v-else-if="activeStatsCategory === 'radar'" class="stats-data-section">
                        <PlayerRadarChart :seasonId="filterForm.seasonId" />
                      </section>
                    </div>
                    <div v-else key="empty" class="stats-category-empty">当前赛季暂无可展示的数据分类</div>
                  </Transition>
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
import { ref, computed, onMounted, defineAsyncComponent, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';

const TeamStatsChart = defineAsyncComponent(() => import('./components/TeamStatsChart.vue'));
const PlayerStatsChart = defineAsyncComponent(() => import('./components/PlayerStatsChart.vue'));
const PlayerRadarChart = defineAsyncComponent(() => import('./components/PlayerRadarChart.vue'));
const MapStatsOverview = defineAsyncComponent(() => import('./components/MapStatsOverview.vue'));
const HeroOverviewChart = defineAsyncComponent(() => import('./components/HeroOverviewChart.vue'));

import TournamentBanner from './components/TournamentBanner.vue';
import RegularSeasonBoard from './components/RegularSeasonBoard.vue';
import MatchSchedule from './components/MatchSchedule.vue';
import ContentChoiceGroup from './components/ContentChoiceGroup.vue';

import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  components: {
    TeamStatsChart,
    PlayerStatsChart,
    PlayerRadarChart,
    MapStatsOverview,
    HeroOverviewChart,
    TournamentBanner,
    RegularSeasonBoard,
    MatchSchedule,
    ContentChoiceGroup,
    ArrowDown
  },
  setup() {
    const store = useStore();
    const route = useRoute();
    
    const currentTab = ref(
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
        ? 'recent'
        : 'overview'
    );
    const activeStatsCategory = ref('team');
    const mobileSeasonPickerOpen = ref(false);
    const tabContentRef = ref(null);

    watch(currentTab, (newTab) => {
      trackPublicEvent('首页-切换标签', {
        tab: newTab,
        seasonId: filterForm.value.seasonId,
        stage: activeStage.value
      }, route);
    });

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
    // 赛季数据维度探测结果（ban / 英雄明细 / 最后一击 / 大招充能），null = 尚未加载
    const seasonFeatures = ref(null);
    const isPageLoading = ref(true);

    const handleTabAfterEnter = async () => {
      if (currentTab.value === 'stats') {
        await nextTick();
        window.dispatchEvent(new Event('resize'));
      }
    };

    const handleStatsPanelAfterEnter = async () => {
      await nextTick();
      window.dispatchEvent(new Event('resize'));
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
        // features 独立拉取、独立容错：接口失败（如后端尚未更新）不影响战队/地图数据展示
        try {
          const featuresRes = await apiService.getSeasonFeatures(seasonId);
          seasonFeatures.value = featuresRes && typeof featuresRes === 'object' ? featuresRes : null;
        } catch (featuresError) {
          console.warn('Failed to load season features', featuresError);
          seasonFeatures.value = null;
        }
      } catch (error) {
        console.error('Failed to load season overview stats', error);
        seasonTeamScoreStats.value = [];
        seasonMapPickStats.value = [];
        seasonFeatures.value = null;
      }
    };

    const seasonVisualConfig = ref({
      tags: [],
      dateRange: '',
      mapPool: {
        mapIds: []
      },
      standings: {
        template: 'wl_maps',
        qualificationCount: 0
      },
      liquipediaTournamentUrl: ''
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
            qualificationCount: Number(config?.standings?.qualificationCount) || 0,
            stageOverrides: (config?.standings?.stageOverrides && typeof config.standings.stageOverrides === 'object') ? config.standings.stageOverrides : {}
          },
          liquipediaTournamentUrl: config?.liquipediaTournamentUrl || ''
        };
      } catch (error) {
        seasonVisualConfig.value = {
          tags: [],
          dateRange: '',
          mapPool: { mapIds: [] },
          standings: { template: 'wl_maps', stageOverrides: {}, qualificationCount: 0 },
          liquipediaTournamentUrl: ''
        };
      }
    };

    // 后台 visualize_chart_config 的人工开关（可隐藏某类数据区）
    const chartConfigOverrides = ref({});

    // 门控：英雄 tab 是数据硬门控——只在有 ban 或英雄明细数据的赛季展示（且未被人工关闭）；
    // 地图 tab 全赛季开放。seasonFeatures 为 null（未加载/加载失败）时英雄 tab 隐藏，其余保持原路径。
    const chartConfig = computed(() => {
      const f = seasonFeatures.value;
      const merged = {
        overviewTab: true,
        recentTab: true,
        statsTab: true,
        teamStats: true,
        playerStats: true,
        mapStats: true,
        playerRadar: true,
        ...chartConfigOverrides.value
      };
      // 英雄 tab 纯数据门控：后台旧的 heroBan 人工开关已废弃（历史上仅用于隐藏空 ban 图表），
      // 有 ban 或英雄明细数据即展示，没有即隐藏。
      merged.heroBan = !!(f && (f.hasBans || f.hasHeroStats));
      return merged;
    });

    const statsCategoryTabs = computed(() => [
      chartConfig.value.teamStats && { value: 'team', label: '战队' },
      chartConfig.value.playerStats && { value: 'player', label: '选手' },
      chartConfig.value.mapStats && { value: 'map', label: '地图' },
      chartConfig.value.heroBan && { value: 'hero', label: '英雄' },
      chartConfig.value.playerRadar && { value: 'radar', label: '对比' }
    ].filter(Boolean));

    watch(statsCategoryTabs, (items) => {
      if (!items.some(item => item.value === activeStatsCategory.value)) {
        activeStatsCategory.value = items[0]?.value || '';
      }
    }, { immediate: true });

    const switchStatsCategory = async (category) => {
      if (activeStatsCategory.value === category) return;
      activeStatsCategory.value = category;
      trackPublicEvent('首页-切换赛事数据分类', {
        category,
        seasonId: filterForm.value.seasonId,
        stage: activeStage.value
      }, route);
      if (tabContentRef.value) tabContentRef.value.scrollTop = 0;
      await handleStatsPanelAfterEnter();
    };
    
    const seasons = computed(() => store.state.seasons);
    const OTHER_STAGE_LABEL = '其他赛季';
    const VISUALIZE_STAGE_ORDER_KEY = 'visualize_stage_season_order';
    const visualizeSeasonOrderConfig = ref({});

    const normalizeStageLabel = (stage) => {
      const value = String(stage || '').trim();
      return value || OTHER_STAGE_LABEL;
    };

    const normalizeSeasonOrderConfig = (rawConfig = {}, seasonList = seasons.value) => {
      const stageToIds = new Map();
      seasonList.forEach(season => {
        const stage = normalizeStageLabel(season.stage);
        if (!stageToIds.has(stage)) {
          stageToIds.set(stage, []);
        }
        stageToIds.get(stage).push(Number(season.id));
      });

      const normalized = {};
      stageToIds.forEach((ids, stage) => {
        const allowSet = new Set(ids);
        const configured = Array.isArray(rawConfig?.[stage])
          ? rawConfig[stage].map(v => Number(v)).filter(id => Number.isFinite(id) && allowSet.has(id))
          : [];
        const configuredSet = new Set(configured);
        const remaining = ids.filter(id => !configuredSet.has(id));
        normalized[stage] = configured.concat(remaining);
      });

      return normalized;
    };

    const sortSeasonsByConfiguredOrder = (stage, seasonList) => {
      const orderedIds = normalizeSeasonOrderConfig(visualizeSeasonOrderConfig.value, seasons.value)[stage] || [];
      const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
      return [...seasonList].sort((a, b) => {
        const leftIndex = orderMap.has(Number(a.id)) ? orderMap.get(Number(a.id)) : Number.MAX_SAFE_INTEGER;
        const rightIndex = orderMap.has(Number(b.id)) ? orderMap.get(Number(b.id)) : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { sensitivity: 'base' });
      });
    };

    const loadVisualizeSeasonOrderConfig = async () => {
      try {
        const config = await apiService.getConfig(VISUALIZE_STAGE_ORDER_KEY);
        visualizeSeasonOrderConfig.value = normalizeSeasonOrderConfig(config, seasons.value);
      } catch (error) {
        visualizeSeasonOrderConfig.value = normalizeSeasonOrderConfig({}, seasons.value);
      }
    };

    const currentSeasonStatus = computed(() => {
      const selectedSeason = seasons.value.find(s => String(s.id) === String(filterForm.value.seasonId));
      return selectedSeason ? selectedSeason.status : 'in_progress';
    });

    const currentSeason = computed(() => seasons.value.find(
      season => String(season.id) === String(filterForm.value.seasonId)
    ) || null);

    const currentSeasonName = computed(() => currentSeason.value?.name || '选择赛事');
    const currentSeasonStage = computed(() => normalizeStageLabel(currentSeason.value?.stage));
    const getSeasonStatusLabel = status => {
      if (status === 'completed') return '已结束';
      if (status === 'upcoming') return '即将开始';
      return '进行中';
    };
    const currentSeasonStatusLabel = computed(() => getSeasonStatusLabel(currentSeasonStatus.value));

    const mobileSeasonGroups = computed(() => [...groupedSeasons.value].sort((left, right) => (
      String(right.label).localeCompare(String(left.label), 'zh-CN', {
        numeric: true,
        sensitivity: 'base'
      })
    )));

    const currentSeasonLogoUrl = computed(() => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      const tagsUpper = seasonVisualConfig.value.tags.map(tag => String(tag).toUpperCase());
      const regionTag = ['KR', 'NA', 'CN', 'EMEA'].find(tag => tagsUpper.includes(tag));
      return regionTag
        ? `${baseUrl}icons/areas/${regionTag}_light.png`
        : `${baseUrl}icons/OWCS_Dark.png`;
    });

    const openMobileSeasonPicker = () => {
      handleDropdownVisible(true);
      mobileSeasonPickerOpen.value = true;
    };

    const selectMobileSeason = async seasonId => {
      if (String(seasonId) === String(filterForm.value.seasonId)) {
        mobileSeasonPickerOpen.value = false;
        return;
      }
      filterForm.value.seasonId = seasonId;
      const selectedSeason = seasons.value.find(season => String(season.id) === String(seasonId));
      activeStage.value = normalizeStageLabel(selectedSeason?.stage);
      mobileSeasonPickerOpen.value = false;
      await handleSeasonChange();
    };

    const groupedSeasons = computed(() => {
      const groups = new Map();

      seasons.value.forEach(season => {
        const stage = normalizeStageLabel(season.stage);
        if (!groups.has(stage)) {
          groups.set(stage, []);
        }
        groups.get(stage).push(season);
      });

      return Array.from(groups.entries()).map(([stage, options]) => ({
        label: stage,
        options: sortSeasonsByConfiguredOrder(stage, options)
      }));
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
          activeStage.value = normalizeStageLabel(selectedSeason.stage);
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
      const startTime = performance.now();
      
      trackPublicEvent('首页-切换赛季', {
        seasonId: filterForm.value.seasonId,
        stage: activeStage.value,
        tab: currentTab.value
      }, route);

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
        const duration = performance.now() - startTime;
        trackPerformance('首页切换赛季加载', duration, {
          seasonId: filterForm.value.seasonId,
          stage: activeStage.value,
          tab: currentTab.value
        }, route);
      }
    };
    
    onMounted(async () => {
      isPageLoading.value = true;
      const startTime = performance.now();
      // 等待 Vue DOM 更新
      await nextTick();

      // 优先从后端加载配置
      try {
        const config = await apiService.getConfig('visualize_chart_config');
        if (config && typeof config === 'object') {
          chartConfigOverrides.value = { ...config };
        }
      } catch (error) {
        console.error('加载图表配置失败，尝试使用本地缓存:', error);
        const savedConfig = localStorage.getItem('visualize_chart_config');
        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            if (parsed && typeof parsed === 'object') {
              chartConfigOverrides.value = { ...parsed };
            }
          } catch (e) { /* ignore */ }
        }
      }

      await store.dispatch('loadBaseData');
      await loadVisualizeSeasonOrderConfig();

      const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : '';
      if (['overview', 'recent', 'stats'].includes(requestedTab)) {
        currentTab.value = requestedTab;
      }

      const requestedStatsCategory = typeof route.query.statsView === 'string' ? route.query.statsView : '';
      if (statsCategoryTabs.value.some(item => item.value === requestedStatsCategory)) {
        activeStatsCategory.value = requestedStatsCategory;
      }
      
      const inProgressSeason = seasons.value.find(season => season.status === 'in_progress');
      
      // 1. 如果 URL 中带有指定的 seasonId，优先使用它（这允许从详情页无缝返回到对应赛季）
      if (route.query.seasonId) {
        const targetSeason = seasons.value.find(s => String(s.id) === String(route.query.seasonId));
        if (targetSeason) {
          filterForm.value.seasonId = targetSeason.id;
          activeStage.value = normalizeStageLabel(targetSeason.stage);
        }
      } 
      // 2. 如果没有指定 seasonId，则回退到默认逻辑（找 in_progress 或者第一个）
      else if (inProgressSeason) {
        filterForm.value.seasonId = inProgressSeason.id;
        activeStage.value = normalizeStageLabel(inProgressSeason.stage);
      } else if (seasons.value.length > 0) {
         filterForm.value.seasonId = seasons.value[0].id;
         activeStage.value = normalizeStageLabel(seasons.value[0].stage);
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
          const duration = performance.now() - startTime;
          trackPerformance('首页首次加载', duration, {
            seasonId: filterForm.value.seasonId,
            stage: activeStage.value,
            tab: currentTab.value
          }, route);
        }
      } else {
        isPageLoading.value = false;
        const duration = performance.now() - startTime;
        trackPerformance('首页首次加载', duration, {
          seasonId: filterForm.value.seasonId,
          stage: activeStage.value,
          tab: currentTab.value
        }, route);
      }
    });
    
    return {
      currentTab,
      tabContentRef,
      activeStatsCategory,
      statsCategoryTabs,
      switchStatsCategory,
      filterForm,
      seasonMatches,
      seasonMapGames,
      seasonTeamScoreStats,
      seasonMapPickStats,
      seasonFeatures,
      seasonVisualConfig,
      seasons,
      groupedSeasons,
      mobileSeasonGroups,
      currentSeasonStatus,
      currentSeasonName,
      currentSeasonStage,
      currentSeasonStatusLabel,
      currentSeasonLogoUrl,
      getSeasonStatusLabel,
      mobileSeasonPickerOpen,
      openMobileSeasonPicker,
      selectMobileSeason,
      activeStage,
      handleDropdownVisible,
      handleSeasonChange,
      chartConfig,
      logoUrl,
      isPageLoading,
      handleTabAfterEnter,
      handleStatsPanelAfterEnter
    };
  }
};
</script>

<style scoped>
.vis-container {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  font-family: var(--vis-font-body);
  background-color: #fafafa;
  position: relative;
  overflow: hidden;
}

.vis-body {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.mobile-event-context {
  display: none;
}

/* 深色赛事横幅全宽贴边：抵消 vis-content 留白，直达页面左/右/顶部边缘 */
.vis-body > .banner-fullbleed {
  flex: 0 0 auto;
  margin: -24px -32px 0;
}

/* 标签页导航样式：标签型按钮（激活 = 深色字 + 渐变斜切下划线） */
.vis-tabs-container {
  flex: 0 0 auto;
  display: flex;
  margin-top: 0;
  margin-bottom: 0;
  /* 全宽贴边：下划线/背景延伸至页面边缘，文字 padding 不变 */
  margin-left: -32px;
  margin-right: -32px;
  border-bottom: 1px solid rgba(17, 17, 17, 0.08);
}

.vis-tabs {
  display: flex;
  width: 100%;
}

.vis-tab-item {
  position: relative;
  flex: 1;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--vis-text-tertiary);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: color var(--vis-dur-fast) var(--vis-ease);
  user-select: none;
  margin-bottom: -1px;
  outline: none;
  white-space: nowrap;
}

/* M1 · 渐变斜切下划线（激活态滑入） */
.vis-tab-item::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -1px;
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--vis-primary-gradient);
  transform: translateX(-50%) skewX(var(--vis-slant)) scaleX(0);
  transform-origin: center;
  transition: transform var(--vis-dur) var(--vis-ease);
  pointer-events: none;
}

.vis-tab-item:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.4);
}

.vis-tab-item.active {
  color: var(--vis-text-strong);
  font-weight: 800;
}

.vis-tab-item.active::after {
  transform: translateX(-50%) skewX(var(--vis-slant)) scaleX(1);
}

@media (hover: hover) and (pointer: fine) {
  .vis-tab-item:hover {
    color: var(--vis-text-strong);
  }
}

@media (hover: none) {
  .vis-tab-item:hover {
    color: var(--vis-text-tertiary);
  }

  .vis-tab-item.active:hover {
    color: var(--vis-text-strong);
  }
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
  flex: 0 0 64px;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
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
  font-family: var(--vis-font-display);
  font-size: 28px;
  font-weight: 800;
  color: var(--vis-text-strong);
  margin: 0;
  letter-spacing: 1px;
}

.vis-title .subtitle {
  color: var(--vis-primary);
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
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 24px 32px 0;
  width: 100%;
  flex: 1;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.tab-content {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding-top: 0;
  padding-bottom: 32px;
  scrollbar-gutter: stable;
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
  width: min(1180px, 100%);
  margin: 0 auto 16px;
}

.stats-workspace {
  max-width: 1480px;
  margin: 0 auto;
}

.stats-category-choices {
  flex: 0 0 auto;
  width: calc(100% + 64px);
  margin: 0 -32px;
  background: #fff;
}

.stats-category-panel {
  min-width: 0;
}

.stats-panel-fade-enter-active,
.stats-panel-fade-leave-active {
  transition: opacity 0.18s var(--vis-ease), transform 0.18s var(--vis-ease);
}

.stats-panel-fade-enter-from,
.stats-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

.stats-category-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  color: var(--vis-text-tertiary);
  font-size: 13px;
  font-weight: 650;
}

/* 赛事数据区去容器化：区块直排落地，仅靠间距节奏分隔，无卡片底色/分隔线/内补白 */
.stats-data-section {
  min-width: 0;
}

/* 英雄分类还有一层筛选栏：外层停止滚动，由英雄列表接管滚动。 */
.tab-content.is-stats-hero {
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
}

.tab-content.is-stats-hero .stats-workspace,
.tab-content.is-stats-hero .stats-category-panel,
.tab-content.is-stats-hero .stats-data-section {
  width: 100%;
  min-height: 0;
  height: 100%;
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
  .vis-container {
    height: 100%;
    min-height: 0;
    --vis-safe-area-top: env(safe-area-inset-top);
    background: #fff;
  }

  :global(html.is-embedded-webview) .vis-container {
    --vis-safe-area-top: 0px;
  }

  .vis-content {
    padding: 0 10px;
  }

  .vis-body > .banner-fullbleed {
    display: none;
  }

  .vis-header {
    display: none;
  }

  .tab-fade-enter-active,
  .tab-fade-leave-active {
    transition: opacity 160ms ease;
  }

  .tab-fade-enter-from,
  .tab-fade-leave-to {
    transform: none;
  }

  .mobile-event-context {
    position: relative;
    z-index: 42;
    display: flex;
    flex: 0 0 auto;
    min-height: 66px;
    align-items: center;
    gap: 10px;
    margin: 0 -10px;
    padding: calc(7px + var(--vis-safe-area-top)) 10px 7px 12px;
    border-bottom: 1px solid rgba(17, 17, 17, 0.09);
    background:
      linear-gradient(105deg, rgba(255, 106, 0, 0.08), rgba(255, 255, 255, 0) 38%),
      rgba(255, 255, 255, 0.96);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.78) inset;
  }

  .mobile-event-context::before {
    content: '';
    position: absolute;
    top: calc(12px + var(--vis-safe-area-top));
    bottom: 12px;
    left: 0;
    width: 3px;
    background: var(--vis-primary-gradient);
  }

  .mobile-event-mark {
    width: 46px;
    height: 46px;
    flex: 0 0 46px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
  }

  .mobile-event-mark img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }

  .mobile-season-select-trigger {
    min-width: 0;
    min-height: 48px;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0 2px 2px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
    touch-action: manipulation;
    transition: background-color 120ms ease;
  }

  .mobile-season-select-trigger:active {
    background: rgba(17, 17, 17, 0.045);
  }

  .mobile-season-select-trigger:focus-visible {
    outline: 2px solid var(--vis-accent);
    outline-offset: 2px;
  }

  .mobile-event-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }

  .mobile-event-name {
    overflow: hidden;
    color: var(--vis-text-strong);
    font-family: var(--vis-font-display);
    font-size: 15px;
    font-weight: 800;
    line-height: 20px;
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-event-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: #6f7680;
    font-size: 11px;
    font-weight: 500;
    line-height: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-status-dot {
    width: 5px;
    height: 5px;
    flex: 0 0 5px;
    border-radius: 50%;
    background: #20a366;
    box-shadow: 0 0 0 3px rgba(32, 163, 102, 0.1);
  }

  .mobile-status-dot.is-completed {
    background: #949ba5;
    box-shadow: none;
  }

  .mobile-status-dot.is-upcoming {
    background: #ff7900;
    box-shadow: 0 0 0 3px rgba(255, 121, 0, 0.1);
  }

  .mobile-meta-separator {
    width: 1px;
    height: 9px;
    flex: 0 0 1px;
    background: #d8dce1;
  }

  .mobile-season-chevron {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    color: #8b919a;
    font-size: 13px;
    transition: color 120ms ease;
  }

  .vis-tabs-container {
    position: relative;
    z-index: 40;
    margin-top: 0;
    margin-bottom: 0;
    margin-left: -10px;
    margin-right: -10px;
    border-bottom-color: #e1e4e8;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 2px 8px rgba(17, 17, 17, 0.035);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .tab-content {
    padding-top: 0;
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
    scrollbar-gutter: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tab-content::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .vis-tab-item {
    min-height: 46px;
    padding: 8px 6px 7px;
    font-family: var(--vis-font-body);
    font-style: normal;
    font-size: 13px;
    font-weight: 600;
    touch-action: manipulation;
  }

  .vis-tab-item.active {
    font-weight: 700;
  }

  .vis-tab-item::after {
    bottom: 0;
    width: 30px;
    height: 2px;
  }

  .overview-section {
    margin-bottom: 10px;
  }

  .stats-category-choices {
    width: calc(100% + 20px);
    margin: 0 -10px;
  }

}

@media (max-width: 420px) {
  .vis-content {
    padding: 0 10px;
  }

  .tab-content {
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
  }

  .vis-body > .banner-fullbleed {
    display: none;
  }

  .vis-tab-item {
    padding: 8px 4px;
    font-size: 12.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stats-panel-fade-enter-active,
  .stats-panel-fade-leave-active {
    transition: none;
  }

}

/* 全局覆盖 Select 下拉框样式以确保内容显示完整 */
:deep(.vis-season-select .el-input__inner) {
  text-overflow: ellipsis;
}

</style>

<style>
@media (max-width: 768px) {
  .mobile-season-drawer.el-drawer {
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    background: #f6f7f9;
    box-shadow: 0 -12px 40px rgba(17, 17, 17, 0.18);
    font-family: var(--vis-font-body);
  }

  .mobile-season-drawer .el-drawer__header {
    min-height: 58px;
    margin: 0;
    padding: 8px 16px 10px;
    border-bottom: 1px solid #e4e7eb;
    background: #fff;
  }

  .mobile-season-drawer .el-drawer__body {
    padding: 0 12px calc(20px + env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  .mobile-drawer-heading {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 12px 24px;
    align-items: end;
  }

  .mobile-drawer-handle {
    grid-column: 1 / -1;
    justify-self: center;
    width: 34px;
    height: 4px;
    border-radius: 999px;
    background: #d7dbe0;
  }

  .mobile-drawer-heading strong {
    color: #15171a;
    font-size: 17px;
    font-weight: 700;
    line-height: 22px;
  }

  .mobile-season-groups {
    padding: 8px 0 4px;
  }

  .mobile-season-group + .mobile-season-group {
    margin-top: 12px;
  }

  .mobile-season-group h2 {
    margin: 0;
    padding: 8px 4px 6px;
    color: #7a818b;
    font-size: 11px;
    font-weight: 600;
  }

  .mobile-season-option {
    width: 100%;
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border: 0;
    border-bottom: 1px solid #eceef1;
    background: #fff;
    color: #1c1f23;
    cursor: pointer;
    font: inherit;
    text-align: left;
    touch-action: manipulation;
  }

  .mobile-season-option:first-of-type {
    border-radius: 10px 10px 0 0;
  }

  .mobile-season-option:last-of-type {
    border-bottom: 0;
    border-radius: 0 0 10px 10px;
  }

  .mobile-season-option:first-of-type:last-of-type {
    border-radius: 10px;
  }

  .mobile-season-option:active {
    background: #f7f8f9;
  }

  .mobile-season-option.active {
    background: linear-gradient(90deg, rgba(255, 106, 0, 0.075), #fff 46%);
  }

  .mobile-season-option-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .mobile-season-option-copy strong {
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    line-height: 19px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-season-option-copy span {
    color: #8a919b;
    font-size: 10px;
    line-height: 14px;
  }

  .mobile-option-check {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    border: 1px solid #d9dde2;
    border-radius: 50%;
    background: #fff;
  }

  .mobile-season-option.active .mobile-option-check {
    border: 4px solid #fff;
    background: var(--vis-accent);
    box-shadow: 0 0 0 1px var(--vis-accent);
  }

}

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
  position: relative;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  border: none;
  background: transparent;
  transition: color 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  white-space: nowrap;
  margin-bottom: -1px;
  outline: none;
}

/* M1 · 下拉赛段标签：激活 = 深色字 + 渐变下划线 */
.stage-tab::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 22px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, #ff6a00 0%, #ff9e0f 100%);
  transform: translateX(-50%) scaleX(0);
  transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  pointer-events: none;
}

.stage-tab:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.4);
}

.stage-tab:hover {
  color: #111;
}

.stage-tab.active {
  color: #111;
  font-weight: 800;
}

.stage-tab.active::after {
  transform: translateX(-50%) scaleX(1);
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
