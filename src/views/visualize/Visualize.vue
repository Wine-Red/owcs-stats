<template>
  <div class="visualize-container">
    <div class="page-header">
      <h2 class="page-title">数据可视化</h2>
    </div>

    <!-- 顶部赛季全局筛选功能 -->
    <div class="filter-section">
      <el-card class="global-filter-card" shadow="hover">
        <div class="global-filter-content">
          <el-form :model="filterForm" label-position="left" inline class="filter-form">
            <el-form-item label="选择赛季" class="season-filter-item">
              <el-select v-model="filterForm.seasonId" placeholder="请选择赛季" @change="handleSeasonChange" class="season-select" size="large">
                <el-option
                  v-for="season in seasons"
                  :key="season.id"
                  :label="season.name"
                  :value="season.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </el-card>
    </div>

    <!-- 全局数据展示区 -->
    <transition-group name="fade-up" tag="div">
      <div class="global-data-section" v-if="chartConfig.heroBan || chartConfig.mapPick" key="global-section">
        <h3 class="section-title">
          <span class="title-icon"></span> 全局概览
        </h3>
        <div class="global-data-cards" :class="{ 'single-card': (chartConfig.heroBan && !chartConfig.mapPick) || (!chartConfig.heroBan && chartConfig.mapPick) }">
          <!-- 英雄禁用情况统计 -->
          <HeroBanChart :seasonId="filterForm.seasonId" v-if="chartConfig.heroBan" />

          <!-- 地图选取情况统计 -->
          <MapPickChart :seasonId="filterForm.seasonId" v-if="chartConfig.mapPick" />
        </div>
      </div>

      <!-- 可筛选数据展示区 -->
      <div class="filterable-data-section" v-if="chartConfig.teamStats || chartConfig.playerStats" key="detail-section">
        <h3 class="section-title">
          <span class="title-icon"></span> 详细分析
        </h3>
        
        <div class="filterable-data-cards">
          <!-- 队伍数据卡片 -->
          <TeamStatsChart :seasonId="filterForm.seasonId" v-if="chartConfig.teamStats" />

          <!-- 选手个人数据卡片 -->
          <PlayerStatsChart :seasonId="filterForm.seasonId" v-if="chartConfig.playerStats" />
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import HeroBanChart from './components/HeroBanChart.vue';
import MapPickChart from './components/MapPickChart.vue';
import TeamStatsChart from './components/TeamStatsChart.vue';
import PlayerStatsChart from './components/PlayerStatsChart.vue';

export default {
  name: 'VisualizeView',
  components: {
    HeroBanChart,
    MapPickChart,
    TeamStatsChart,
    PlayerStatsChart
  },
  setup() {
    const store = useStore();
    
    // 筛选表单
    const filterForm = ref({
      seasonId: '',
      teamIds: [],
      playerIds: [],
      heroIds: []
    });

    // 图表显示配置
    const chartConfig = ref({
      heroBan: true,
      mapPick: true,
      teamStats: true,
      playerStats: true
    });
    
    // 计算属性
    const seasons = computed(() => store.state.seasons);
    
    // 处理赛季变化
    const handleSeasonChange = async () => {
      // 赛季变化时，重置其他筛选（虽然目前主要只用seasonId）
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
      
      // 子组件会监听 seasonId 变化并自行更新数据
    };
    
    // 组件挂载
    onMounted(async () => {
      // 加载图表配置
      const savedConfig = localStorage.getItem('visualize_chart_config');
      if (savedConfig) {
        try {
          chartConfig.value = JSON.parse(savedConfig);
        } catch (e) {
          console.error('Failed to parse chart config', e);
        }
      }

      await store.dispatch('loadBaseData');
      
      // 默认选择status为in_progress的赛季
      const inProgressSeason = seasons.value.find(season => season.status === 'in_progress');
      if (inProgressSeason) {
        filterForm.value.seasonId = inProgressSeason.id;
        // 初始赋值也会触发子组件的watch（如果它们immediate: true或者在mounted中处理）
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
.visualize-container {
  padding: 24px 32px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 14px;
  color: #606266;
  margin: 0;
}

/* 顶部全局筛选栏样式 */
.filter-section {
  margin-bottom: 32px;
}

.global-filter-card {
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  background: #ffffff;
  transition: all 0.3s ease;
}

.global-filter-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.global-filter-content {
  padding: 12px 0;
}

.filter-form {
  margin: 0;
}

.season-filter-item {
  margin-bottom: 0;
  display: flex;
  align-items: center;
}

.season-select {
  width: 240px;
}

:deep(.el-form-item__label) {
  font-weight: 600;
  color: #303133;
}

/* 区域标题样式 */
.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #303133;
  display: flex;
  align-items: center;
  padding-left: 0;
  border-left: none;
}

.title-icon {
  margin-right: 12px;
  font-size: 20px;
}

/* 全局数据展示区样式 */
.global-data-section {
  margin-bottom: 40px;
}

.global-data-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

/* 可筛选数据展示区样式 */
.filterable-data-section {
  margin-bottom: 40px;
}

.filterable-data-cards {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 动画效果 */
.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.5s ease;
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .global-data-cards {
    grid-template-columns: 1fr;
  }
}

.single-card {
  grid-template-columns: 1fr !important;
}

@media (max-width: 768px) {
  .visualize-container {
    padding: 16px;
  }
  
  .page-title {
    font-size: 24px;
  }
  
  .section-title {
    font-size: 18px;
    margin-bottom: 16px;
  }
  
  .season-select {
    width: 100% !important;
  }
  
  .global-filter-content {
    padding: 0;
  }
  
  .el-form-item {
    margin-right: 0;
    margin-bottom: 0;
    width: 100%;
  }
  
  :deep(.el-form-item__content) {
    width: 100%;
  }
}
</style>
