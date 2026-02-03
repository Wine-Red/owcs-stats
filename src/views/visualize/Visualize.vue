<template>
  <div class="visualize-container">
    <h2 class="page-title">数据可视化</h2>

    <!-- 筛选条件 -->
    <el-card class="filter-card">
      <!-- 赛季选择 -->
      <div class="season-filter">
        <el-form :model="filterForm" label-position="left">
          <el-form-item label="赛季" style="width: 100%">
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
      
      <!-- 其他筛选条件 -->
      <div class="other-filters">
        <el-form :model="filterForm" inline>
          <el-form-item label="队伍">
          <el-select v-model="filterForm.teamIds" multiple placeholder="请选择队伍" :disabled="!filterForm.seasonId" style="width: 200px">
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="选手">
          <el-select v-model="filterForm.playerIds" multiple placeholder="请选择选手" :disabled="!filterForm.seasonId" style="width: 200px">
            <el-option
              v-for="player in getFilteredPlayers"
              :key="player.id"
              :label="player.name"
              :value="player.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="英雄">
          <el-select v-model="filterForm.heroIds" multiple placeholder="请选择英雄" :disabled="!filterForm.seasonId" style="width: 200px">
            <el-option
              v-for="hero in heroes"
              :key="hero.id"
              :label="hero.name"
              :value="hero.id"
            />
          </el-select>
        </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="updateCharts">
              <el-icon><Search /></el-icon>
              应用筛选
            </el-button>
            <el-button @click="resetFilter">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>

    <!-- 图表区域 -->
    <div class="charts-grid">
      <!-- 队伍对比 -->
      <el-card class="chart-card">
        <template #header>
          <div class="card-header">
            <span>队伍数据对比</span>
          </div>
        </template>
        <div ref="teamComparisonChart" class="chart-container"></div>
      </el-card>

      <!-- 选手数据 -->
      <el-card class="chart-card">
        <template #header>
          <div class="card-header">
            <span>选手数据统计</span>
          </div>
        </template>
        <div ref="playerStatsChart" class="chart-container"></div>
      </el-card>

      <!-- 英雄使用率 -->
      <el-card class="chart-card">
        <template #header>
          <div class="card-header">
            <span>英雄使用率</span>
          </div>
        </template>
        <div ref="heroUsageChart" class="chart-container"></div>
      </el-card>

      <!-- 选手雷达图 -->
      <el-card class="chart-card">
        <template #header>
          <div class="card-header">
            <span>选手能力雷达图</span>
          </div>
        </template>
        <div ref="playerRadarChart" class="chart-container"></div>
      </el-card>
    </div>

    <!-- 数据导出 -->
    <el-card class="export-card" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>数据导出</span>
        </div>
      </template>
      <div class="export-buttons">
        <el-button type="success" @click="exportAsImage">
          <el-icon><Download /></el-icon>
          导出为图片
        </el-button>
        <el-button type="info" @click="exportAsReport">
          <el-icon><Document /></el-icon>
          导出为报告
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import apiService from '@/services/api';

export default {
  name: 'VisualizeView',
  setup() {
    const store = useStore();
    
    // 筛选表单
    const filterForm = ref({
      seasonId: '',
      teamIds: [],
      playerIds: [],
      heroIds: []
    });
    
    // 图表引用
    const teamComparisonChart = ref(null);
    const playerStatsChart = ref(null);
    const heroUsageChart = ref(null);
    const playerRadarChart = ref(null);
    
    // 图表实例
    let teamChart = null;
    let playerChart = null;
    let heroChart = null;
    let radarChart = null;
    
    // 计算属性
    const seasons = computed(() => store.state.seasons);
    const teams = computed(() => store.state.teams);
    const heroes = computed(() => store.state.heroes);
    
    // 根据赛季和队伍筛选选手
    const getFilteredPlayers = computed(() => {
      if (!filterForm.value.seasonId) return store.state.players;
      
      // 如果没有选择队伍，返回所有选手
      if (!filterForm.value.teamIds || filterForm.value.teamIds.length === 0) {
        return store.state.players;
      }
      
      // 获取选中队伍的所有赛季-队伍关联
      const seasonTeamIds = store.state.seasonTeams
        .filter(st => st.seasonId === filterForm.value.seasonId && filterForm.value.teamIds.includes(st.teamId))
        .map(st => st.id);
      
      // 获取这些关联中的所有选手ID
      const playerIds = store.state.seasonTeamPlayers
        .filter(stp => seasonTeamIds.includes(stp.seasonTeamId))
        .map(stp => stp.playerId);
      
      // 返回筛选后的选手
      return store.state.players.filter(player => playerIds.includes(player.id));
    });
    
    // 初始化图表
    const initCharts = async () => {
      await nextTick();
      
      // 队伍对比图表
      if (teamComparisonChart.value) {
        teamChart = echarts.init(teamComparisonChart.value);
        updateTeamComparisonChart();
      }
      
      // 选手数据图表
      if (playerStatsChart.value) {
        playerChart = echarts.init(playerStatsChart.value);
        updatePlayerStatsChart();
      }
      
      // 英雄使用率图表
      if (heroUsageChart.value) {
        heroChart = echarts.init(heroUsageChart.value);
        updateHeroUsageChart();
      }
      
      // 选手雷达图
      if (playerRadarChart.value) {
        radarChart = echarts.init(playerRadarChart.value);
        updatePlayerRadarChart();
      }
    };
    
    // 更新队伍对比图表
    const updateTeamComparisonChart = async () => {
      if (!teamChart) return;
      
      try {
        // 显示加载动画
        teamChart.showLoading();
        
        // 从API获取队伍统计数据
        const params = {
          seasonId: filterForm.value.seasonId || null,
          teamIds: filterForm.value.teamIds.length > 0 ? filterForm.value.teamIds : null
        };
        const response = await apiService.getTeamStatsData(params);
        
        // 处理数据
        const teamNames = response.slice(0, 5).map(item => item.teamName || '未知队伍');
        const kills = response.slice(0, 5).map(item => item.totalKills || 0);
        const assists = response.slice(0, 5).map(item => item.totalAssists || 0);
        const damage = response.slice(0, 5).map(item => item.totalDamage || 0);
        const healing = response.slice(0, 5).map(item => item.totalHealing || 0);
        
        const option = {
          title: {
            text: '队伍数据对比',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          legend: {
            data: ['击杀', '助攻', '伤害', '治疗'],
            bottom: 0
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: teamNames
          },
          yAxis: {
            type: 'value'
          },
          series: [
            {
              name: '击杀',
              type: 'bar',
              data: kills
            },
            {
              name: '助攻',
              type: 'bar',
              data: assists
            },
            {
              name: '伤害',
              type: 'bar',
              data: damage
            },
            {
              name: '治疗',
              type: 'bar',
              data: healing
            }
          ]
        };
        
        teamChart.setOption(option);
      } catch (error) {
        console.error('获取队伍数据失败:', error);
        
        // 显示默认数据
        const option = {
          title: {
            text: '队伍数据对比',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          legend: {
            data: ['击杀', '助攻', '伤害', '治疗'],
            bottom: 0
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: teams.value.slice(0, 5).map(team => team.name)
          },
          yAxis: {
            type: 'value'
          },
          series: [
            {
              name: '击杀',
              type: 'bar',
              data: [0, 0, 0, 0, 0]
            },
            {
              name: '助攻',
              type: 'bar',
              data: [0, 0, 0, 0, 0]
            },
            {
              name: '伤害',
              type: 'bar',
              data: [0, 0, 0, 0, 0]
            },
            {
              name: '治疗',
              type: 'bar',
              data: [0, 0, 0, 0, 0]
            }
          ]
        };
        
        teamChart.setOption(option);
      } finally {
        teamChart.hideLoading();
      }
    };
    
    // 更新选手数据图表
    const updatePlayerStatsChart = async () => {
      if (!playerChart) return;
      
      try {
        // 显示加载动画
        playerChart.showLoading();
        
        // 从API获取选手统计数据
        const params = {
          seasonId: filterForm.value.seasonId || null,
          teamIds: filterForm.value.teamIds.length > 0 ? filterForm.value.teamIds : null,
          playerIds: filterForm.value.playerIds.length > 0 ? filterForm.value.playerIds : null
        };
        const response = await apiService.getPlayerStatsData(params);
        
        // 处理数据
        const playerNames = response.slice(0, 8).map(item => item.playerName || '未知选手');
        const kills = response.slice(0, 8).map(item => item.totalKills || 0);
        const deaths = response.slice(0, 8).map(item => item.totalDeaths || 0);
        const assists = response.slice(0, 8).map(item => item.totalAssists || 0);
        
        const option = {
          title: {
            text: '选手数据统计',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis'
          },
          legend: {
            data: ['击杀', '死亡', '助攻'],
            bottom: 0
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: playerNames
          },
          yAxis: {
            type: 'value'
          },
          series: [
            {
              name: '击杀',
              type: 'line',
              data: kills
            },
            {
              name: '死亡',
              type: 'line',
              data: deaths
            },
            {
              name: '助攻',
              type: 'line',
              data: assists
            }
          ]
        };
        
        playerChart.setOption(option);
      } catch (error) {
        console.error('获取选手数据失败:', error);
        
        // 显示默认数据
        const option = {
          title: {
            text: '选手数据统计',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis'
          },
          legend: {
            data: ['击杀', '死亡', '助攻'],
            bottom: 0
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: getFilteredPlayers.value.slice(0, 8).map(player => player.name)
          },
          yAxis: {
            type: 'value'
          },
          series: [
            {
              name: '击杀',
              type: 'line',
              data: [0, 0, 0, 0, 0, 0, 0, 0]
            },
            {
              name: '死亡',
              type: 'line',
              data: [0, 0, 0, 0, 0, 0, 0, 0]
            },
            {
              name: '助攻',
              type: 'line',
              data: [0, 0, 0, 0, 0, 0, 0, 0]
            }
          ]
        };
        
        playerChart.setOption(option);
      } finally {
        playerChart.hideLoading();
      }
    };
    
    // 更新英雄使用率图表
    const updateHeroUsageChart = async () => {
      if (!heroChart) return;
      
      try {
        // 显示加载动画
        heroChart.showLoading();
        
        // 从API获取英雄统计数据
        const params = {
          seasonId: filterForm.value.seasonId || null,
          heroIds: filterForm.value.heroIds.length > 0 ? filterForm.value.heroIds : null
        };
        const response = await apiService.getHeroStatsData(params);
        
        // 处理数据
        const heroData = response.slice(0, 10).map(item => ({
          name: item.heroName || '未知英雄',
          value: item.usageCount || 0
        }));
        
        const option = {
          title: {
            text: '英雄使用率',
            left: 'center'
          },
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'vertical',
            left: 'left'
          },
          series: [
            {
              name: '英雄使用率',
              type: 'pie',
              radius: '60%',
              data: heroData,
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }
          ]
        };
        
        heroChart.setOption(option);
      } catch (error) {
        console.error('获取英雄数据失败:', error);
        
        // 显示默认数据
        const option = {
          title: {
            text: '英雄使用率',
            left: 'center'
          },
          tooltip: {
            trigger: 'item'
          },
          legend: {
            orient: 'vertical',
            left: 'left'
          },
          series: [
            {
              name: '英雄使用率',
              type: 'pie',
              radius: '60%',
              data: heroes.value.slice(0, 5).map(hero => ({
                name: hero.name,
                value: 0
              })),
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }
          ]
        };
        
        heroChart.setOption(option);
      } finally {
        heroChart.hideLoading();
      }
    };
    
    // 更新选手雷达图
    const updatePlayerRadarChart = async () => {
      if (!radarChart) return;
      
      try {
        // 显示加载动画
        radarChart.showLoading();
        
        // 从API获取选手对比数据
        const params = {
          seasonId: filterForm.value.seasonId || null,
          teamIds: filterForm.value.teamIds.length > 0 ? filterForm.value.teamIds : null,
          playerIds: filterForm.value.playerIds.length > 0 ? filterForm.value.playerIds : null
        };
        const response = await apiService.getPlayerStatsData(params);
        
        // 处理数据
        const topPlayers = response.slice(0, 2);
        const playerData = topPlayers.map(player => ({
          name: player.playerName || '未知选手',
          value: [
            player.totalKills || 0,
            player.totalAssists || 0,
            player.totalDamage || 0,
            player.totalHealing || 0,
            player.totalTimeAlive || 0,
            player.totalUltimates || 0
          ]
        }));
        
        // 计算最大值用于雷达图刻度
        const maxValues = [20, 30, 20000, 15000, 1000, 10];
        
        const option = {
          title: {
            text: '选手能力雷达图',
            left: 'center'
          },
          tooltip: {},
          legend: {
            data: playerData.map(item => item.name),
            bottom: 0
          },
          radar: {
            indicator: [
              { name: '击杀', max: maxValues[0] },
              { name: '助攻', max: maxValues[1] },
              { name: '伤害', max: maxValues[2] },
              { name: '治疗', max: maxValues[3] },
              { name: '存活时间', max: maxValues[4] },
              { name: '终极技能', max: maxValues[5] }
            ]
          },
          series: [
            {
              name: '选手对比',
              type: 'radar',
              data: playerData
            }
          ]
        };
        
        radarChart.setOption(option);
      } catch (error) {
        console.error('获取选手雷达图数据失败:', error);
        
        // 显示默认数据
        const option = {
          title: {
            text: '选手能力雷达图',
            left: 'center'
          },
          tooltip: {},
          legend: {
            data: ['暂无数据'],
            bottom: 0
          },
          radar: {
            indicator: [
              { name: '击杀', max: 20 },
              { name: '助攻', max: 30 },
              { name: '伤害', max: 20000 },
              { name: '治疗', max: 15000 },
              { name: '存活时间', max: 1000 },
              { name: '终极技能', max: 10 }
            ]
          },
          series: [
            {
              name: '选手对比',
              type: 'radar',
              data: [
                {
                  value: [0, 0, 0, 0, 0, 0],
                  name: '暂无数据'
                }
              ]
            }
          ]
        };
        
        radarChart.setOption(option);
      } finally {
        radarChart.hideLoading();
      }
    };
    
    // 更新所有图表
    const updateCharts = async () => {
      await nextTick();
      
      await Promise.all([
        updateTeamComparisonChart(),
        updatePlayerStatsChart(),
        updateHeroUsageChart(),
        updatePlayerRadarChart()
      ]);
    };
    
    // 处理赛季变化
    const handleSeasonChange = async () => {
      // 当赛季变化时，重置队伍和选手选择
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
      
      // 加载赛季的队伍关联数据
      if (filterForm.value.seasonId) {
        try {
          await store.dispatch('getSeasonTeams', filterForm.value.seasonId);
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
    };
    
    // 重置筛选
    const resetFilter = async () => {
      // 默认选择status为in_progress的赛季
      const inProgressSeason = seasons.value.find(season => season.status === 'in_progress');
      filterForm.value = {
        seasonId: inProgressSeason ? inProgressSeason.id : '',
        teamIds: [],
        playerIds: [],
        heroIds: []
      };
      
      // 加载默认赛季的队伍关联数据
      if (inProgressSeason) {
        try {
          await store.dispatch('getSeasonTeams', inProgressSeason.id);
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
      
      updateCharts();
    };
    
    // 导出为图片
    const exportAsImage = () => {
      if (teamChart) {
        const dataURL = teamChart.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#fff'
        });
        
        // 创建下载链接
        const link = document.createElement('a');
        link.download = 'team-comparison.png';
        link.href = dataURL;
        link.click();
        
        ElMessage.success('图表导出成功');
      }
    };
    
    // 导出为报告
    const exportAsReport = () => {
      ElMessage.info('报告导出功能开发中');
    };
    
    // 响应式调整
    const handleResize = () => {
      teamChart?.resize();
      playerChart?.resize();
      heroChart?.resize();
      radarChart?.resize();
    };
    
    // 组件挂载
    onMounted(async () => {
      await store.dispatch('loadBaseData');
      await nextTick();
      
      // 默认选择status为in_progress的赛季
      const inProgressSeason = seasons.value.find(season => season.status === 'in_progress');
      if (inProgressSeason) {
        filterForm.value.seasonId = inProgressSeason.id;
        
        // 加载默认赛季的队伍关联数据
        try {
          await store.dispatch('getSeasonTeams', inProgressSeason.id);
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
      
      initCharts();
      // 初始化时更新图表
      updateCharts();
      window.addEventListener('resize', handleResize);
    });
    
    // 组件卸载
    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      teamChart?.dispose();
      playerChart?.dispose();
      heroChart?.dispose();
      radarChart?.dispose();
    });
    
    return {
      filterForm,
      seasons,
      teams,
      heroes,
      getFilteredPlayers,
      teamComparisonChart,
      playerStatsChart,
      heroUsageChart,
      playerRadarChart,
      updateCharts,
      handleSeasonChange,
      resetFilter,
      exportAsImage,
      exportAsReport
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

.filter-card {
  margin-bottom: 20px;
}

.season-filter {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e8e8e8;
}

.other-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.el-select {
  min-width: 120px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.chart-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  width: 100%;
  height: 400px;
}

.export-card {
  border-radius: 8px;
}

.export-buttons {
  display: flex;
  gap: 10px;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .el-form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  
  .el-form-item {
    margin-bottom: 15px;
  }
  
  .chart-container {
    height: 300px;
  }
  
  .export-buttons {
    flex-direction: column;
  }
  
  .export-buttons .el-button {
    width: 100%;
  }
}
</style>