<template>
  <div class="visualize-container">
    <h2 class="page-title">数据可视化</h2>

    <!-- 顶部赛季全局筛选功能 -->
    <el-card class="global-filter-card">
      <div class="global-filter-content">
        <el-form :model="filterForm" label-position="left" inline>
          <el-form-item label="赛季">
            <el-select v-model="filterForm.seasonId" placeholder="请选择赛季" @change="handleSeasonChange" style="width: 200px">
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

    <!-- 全局数据展示区 -->
    <div class="global-data-section" v-if="chartConfig.heroBan || chartConfig.mapPick">
      <h3 class="section-title">全局数据统计</h3>
      <div class="global-data-cards" :class="{ 'single-card': (chartConfig.heroBan && !chartConfig.mapPick) || (!chartConfig.heroBan && chartConfig.mapPick) }">
        <!-- 英雄禁用情况统计 -->
        <HeroBanChart :seasonId="filterForm.seasonId" v-if="chartConfig.heroBan" />

        <!-- 地图选取情况统计 -->
        <MapPickChart :seasonId="filterForm.seasonId" v-if="chartConfig.mapPick" />
      </div>
    </div>

    <!-- 可筛选数据展示区 -->
    <div class="filterable-data-section" v-if="chartConfig.teamStats || chartConfig.playerStats">
      <h3 class="section-title">详细数据统计</h3>
      
      <div class="filterable-data-cards">
        <!-- 队伍数据卡片 -->
        <TeamStatsChart :seasonId="filterForm.seasonId" v-if="chartConfig.teamStats" />

        <!-- 选手个人数据卡片 -->
        <PlayerStatsChart :seasonId="filterForm.seasonId" v-if="chartConfig.playerStats" />
      </div>
    </div>
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
  padding: 20px 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 30px;
  color: #333;
}

/* 顶部全局筛选栏样式 */
.global-filter-card {
  margin-bottom: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.global-filter-content {
  padding: 15px 20px;
}

/* 区域标题样式 */
.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
  border-left: 4px solid #1890ff;
  padding-left: 10px;
}

/* 全局数据展示区样式 */
.global-data-section {
  margin-bottom: 30px;
}

.global-data-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

/* 可筛选数据展示区样式 */
.filterable-data-section {
  margin-bottom: 30px;
}

.filterable-data-cards {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
    padding: 10px 0;
  }
  
  .page-title {
    font-size: 20px;
    margin-bottom: 20px;
  }
  
  .section-title {
    font-size: 16px;
    margin-bottom: 15px;
  }
  
  .global-filter-content {
    padding: 10px;
  }
  
  .el-form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  
  .el-form-item {
    margin-bottom: 10px;
  }
  
  .el-select {
    width: 100% !important;
  }
}
</style>
