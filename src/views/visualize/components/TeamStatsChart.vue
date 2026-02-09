<template>
  <el-card class="filterable-data-card">
    <template #header>
      <div class="card-header">
        <div class="header-left">
            <span class="header-title">队伍数据</span>
        </div>
        <div class="card-filter">
          <el-select 
            v-model="teamFilter" 
            placeholder="" 
            :disabled="!seasonId" 
            class="team-select-input"
            multiple
            collapse-tags
            collapse-tags-tooltip
            popper-class="team-select-dropdown"
          >
            <template #prefix>
               <span class="custom-select-placeholder">队伍筛选列表</span>
            </template>
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
          </el-select>
        </div>
      </div>
    </template>
    <div ref="teamComparisonChart" class="chart-container"></div>
  </el-card>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import * as echarts from 'echarts';
import apiService from '@/services/api';

export default {
  name: 'TeamStatsChart',
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const teamComparisonChart = ref(null);
    const teamFilter = ref([]);
    const allTeamStats = ref([]);
    let teamChart = null;

    // 计算当前赛季的队伍列表
    const teams = computed(() => {
      if (props.seasonId) {
        return store.getters.getTeamsBySeasonId(props.seasonId);
      }
      return store.state.teams;
    });

    // 渲染队伍图表（纯前端过滤和渲染）
    const renderTeamChart = () => {
        if (!teamChart) return;

        let filteredStats = [];
        
        if (teamFilter.value && teamFilter.value.length > 0) {
            const selectedIds = teamFilter.value.map(id => Number(id));
            filteredStats = allTeamStats.value.filter(item => {
                return selectedIds.includes(Number(item.teamId));
            });
        } else {
            filteredStats = [];
        }

        // 1. 先计算所有队伍（allTeamStats）的数据，找出全局最大值
        let globalMaxDamage = 0;
        let globalMaxKD = 0;

        allTeamStats.value.forEach(item => {
            const durationMinutes = item.totalDuration || 0;
            
            let damagePer10 = 0;
            let kd = 0;

            if (durationMinutes > 0) {
                damagePer10 = parseFloat(((item.totalDamage / durationMinutes) * 10).toFixed(2));
            }

            const deaths = item.totalDeaths || 0;
            const kills = item.totalKills || 0;
            
            if (deaths > 0) {
                kd = parseFloat((kills / deaths).toFixed(2));
            } else {
                kd = kills;
            }

            if (damagePer10 > globalMaxDamage) globalMaxDamage = damagePer10;
            if (kd > globalMaxKD) globalMaxKD = kd;
        });

        const xMax = Math.ceil(globalMaxDamage * 1.1 / 100) * 100; // 向上取整到百位
        const yMax = Math.ceil(globalMaxKD * 1.1 * 10) / 10;       // 向上取整到0.1位

        // 2. 处理当前筛选出的数据 for Scatter Plot
        const seriesData = filteredStats.map(item => {
            const teamName = item.team ? item.team.name : (item.teamName || '未知队伍');
            const durationMinutes = item.totalDuration || 0;
            
            let damagePer10 = 0;
            let kd = 0;

            if (durationMinutes > 0) {
                damagePer10 = parseFloat(((item.totalDamage / durationMinutes) * 10).toFixed(2));
            }

            const deaths = item.totalDeaths || 0;
            const kills = item.totalKills || 0;
            
            if (deaths > 0) {
                kd = parseFloat((kills / deaths).toFixed(2));
            } else {
                kd = kills; 
            }
            
            return {
                name: teamName,
                value: [damagePer10, kd, teamName],
                teamId: item.teamId
            };
        });

        const option = {
          title: {
            show: false,
            text: '队伍数据散点图 (K/D vs 伤害/10min)',
            left: 'center'
          },
          tooltip: {
            trigger: 'item',
            formatter: function (params) {
               return `<b>${params.data.name}</b><br/>` +
                      `伤害/10min: ${params.data.value[0]}<br/>` +
                      `K/D: ${params.data.value[1]}`;
            }
          },
          grid: {
            left: '3%',
            right: '7%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '伤害/10min',
            nameLocation: 'middle',
            nameGap: 30,
            scale: false, 
            min: 0,
            max: xMax > 0 ? xMax : undefined
          },
          yAxis: {
            type: 'value',
            name: 'K/D',
            scale: false,
            min: 0,
            max: yMax > 0 ? yMax : undefined
          },
          series: [
            {
              type: 'scatter',
              symbolSize: 20,
              data: seriesData,
              label: {
                  show: true,
                  formatter: '{b}',
                  position: 'top',
                  fontWeight: 'bold'
              },
              itemStyle: {
                color: function(params) {
                  const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
                  return colors[params.dataIndex % colors.length];
                }
              }
            }
          ],
          media: [
            {
              query: { maxWidth: 768 },
              option: {
                grid: {
                   top: '10%',
                   left: '5%',
                   right: '5%',
                   containLabel: true
                },
                series: [
                    {
                    }
                ]
              }
            }
          ]
        };
        
        teamChart.setOption(option, true);
    };

    // 更新队伍对比图表 (获取数据并渲染)
    const updateTeamComparisonChart = async () => {
      if (!teamChart) return;
      
      try {
        teamChart.showLoading();
        
        const params = {
          seasonId: props.seasonId || null,
          teamIds: null 
        };
        const response = await apiService.getTeamStatsData(params);
        
        allTeamStats.value = response;
        
        // 默认全选该赛季的队伍（如果是首次加载或赛季切换）
        // 只有当 teamFilter 为空时才自动全选，或者我们可以强制全选
        // 原有逻辑是：赛季变化时，handleSeasonChange 会全选。
        // 这里我们在 watch seasonId 时处理全选逻辑。
        
        renderTeamChart();
      } catch (error) {
        console.error('获取队伍数据失败:', error);
        
        const option = {
          title: {
            text: '队伍数据散点图',
            left: 'center'
          },
           xAxis: { type: 'value', name: '总伤害/10min' },
           yAxis: { type: 'value', name: 'K/D' },
           series: [{ type: 'scatter', data: [] }]
        };
        
        teamChart.setOption(option, true);
      } finally {
        teamChart.hideLoading();
      }
    };

    const handleResize = () => {
      teamChart?.resize();
    };

    // 监听 teamFilter 变化，实时更新图表
    watch(teamFilter, () => {
        renderTeamChart();
    }, { deep: true });

    // 监听 seasonId 变化
    watch(() => props.seasonId, async (newVal) => {
      if (newVal) {
        // 更新图表数据
        await updateTeamComparisonChart();
        
        // 更新默认选中：全选当前赛季的队伍
        // 注意：store.state.seasonTeams 应该已经在 parent 组件或者全局被加载了
        // 如果没有被加载，可能需要 dispatch。
        // Visualize.vue 中 handleSeasonChange 调用了 dispatch('getSeasonTeams')。
        // 我们最好在这里也调用一下，或者假设 store 已经有数据。
        // 安全起见，这里 dispatch 一下。
        await store.dispatch('getSeasonTeams', newVal);
        const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === newVal);
        const teamIdsInSeason = seasonTeams.map(st => st.teamId);
        teamFilter.value = teamIdsInSeason;
      } else {
          // 如果没有赛季ID，清空或显示所有
          teamFilter.value = [];
          updateTeamComparisonChart();
      }
    });

    onMounted(async () => {
      await nextTick();
      teamChart = echarts.init(teamComparisonChart.value);
      
      // 初始化数据
      if (props.seasonId) {
          // 触发一次加载
          await updateTeamComparisonChart();
           // 初始化选中
          await store.dispatch('getSeasonTeams', props.seasonId);
          const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === props.seasonId);
          const teamIdsInSeason = seasonTeams.map(st => st.teamId);
          teamFilter.value = teamIdsInSeason;
      } else {
          updateTeamComparisonChart();
      }
      
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      teamChart?.dispose();
    });

    return {
      teamComparisonChart,
      teamFilter,
      teams
    };
  }
};
</script>

<style scoped>
.filterable-data-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  flex-wrap: wrap;
  gap: 10px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 15px;
}

.header-title {
    font-weight: bold;
}

.card-filter {
  display: flex;
  gap: 10px;
}

.chart-container {
  width: 100%;
  height: 400px;
}

.team-select-input {
  width: 400px;
}

.custom-select-placeholder {
  color: #606266;
  font-size: 14px;
  line-height: 32px;
  margin-left: 4px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .team-select-input {
    width: 100% !important;
  }
  
  .card-header {
      flex-direction: column;
      align-items: flex-start;
  }

  .header-left {
      width: 100%;
      justify-content: space-between;
      margin-bottom: 5px;
  }

  .card-filter {
      width: 100%;
  }
}

/* 隐藏Select中的Tags */
:deep(.team-select-input .el-select__tags) {
  display: none !important;
}
:deep(.team-select-input .el-select__selection) {
    display: none !important;
}
</style>

<style>
/* Global styles for the team select dropdown */
.team-select-dropdown .el-select-dropdown__list {
  display: grid !important;
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 10px;
  padding: 10px;
  min-width: 400px;
}

.team-select-dropdown .el-select-dropdown__item {
  height: auto;
  line-height: 2;
}

.team-select-dropdown .el-select-dropdown__wrap {
  max-height: 600px !important;
}

@media (max-width: 768px) {
  .team-select-dropdown .el-select-dropdown__list {
    min-width: unset !important;
    width: 100%;
  }
  
  .team-select-dropdown {
    width: 90vw !important;
    left: 5vw !important;
  }
}
</style>
