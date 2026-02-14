<template>
  <el-card class="filterable-data-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
            <span class="header-title">
              选手个人数据
              <el-tooltip content="展示选手在不同维度的表现分布（默认显示综合数据Top5选手）" placement="top">
                <el-icon class="info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
            <el-radio-group v-model="playerRole" size="small" @change="updatePlayerStatsChart" class="role-radio-group">
                <el-radio-button label="tank">坦克</el-radio-button>
                <el-radio-button label="damage">输出</el-radio-button>
                <el-radio-button label="support">辅助</el-radio-button>
            </el-radio-group>
        </div>
        <div class="card-filter">
          <el-select 
            v-model="playerFilter" 
            placeholder="" 
            :disabled="!seasonId" 
            class="player-select-input"
            multiple
            collapse-tags
            collapse-tags-tooltip
            popper-class="player-select-dropdown"
          >
            <template #prefix>
               <span class="custom-select-placeholder">选手筛选列表</span>
            </template>
            <el-option
              v-for="player in getFilteredPlayers"
              :key="player.id"
              :label="player.name"
              :value="player.id"
            />
          </el-select>
        </div>
      </div>
    </template>
    <div ref="playerStatsChart" class="chart-container"></div>
  </el-card>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { InfoFilled } from '@element-plus/icons-vue';

export default {
  name: 'PlayerStatsChart',
  components: {
    InfoFilled
  },
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const playerStatsChart = ref(null);
    const playerFilter = ref([]);
    const playerRole = ref('damage');
    const allPlayerStats = ref([]);
    const teamLogoSizes = ref(new Map());
    let playerChart = null;

    const preloadImage = (url) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };

    const loadTeamLogos = async (stats) => {
      const promises = stats.map(async (item) => {
        const logo = item.team ? item.team.logo : null;
        // 注意：这里我们使用 teamId 作为 key，因为多个选手可能属于同一队
        const teamId = item.team ? item.team.id : null;
        
        if (logo && teamId && !teamLogoSizes.value.has(teamId)) {
           const size = await preloadImage(logo);
           if (size && size.height > 0) {
             const MAX_WIDTH = 35;
             const MAX_HEIGHT = 20;
             
             // 计算缩放比例，同时满足宽和高的限制
             const scale = Math.min(MAX_WIDTH / size.width, MAX_HEIGHT / size.height);
             
             const width = size.width * scale;
             const height = size.height * scale;
             
             teamLogoSizes.value.set(teamId, [width, height]);
           }
        }
      });
      await Promise.all(promises);
    };

    // 根据赛季和队伍筛选选手
    const getFilteredPlayers = computed(() => {
      // 首先根据职责筛选
      let players = store.state.players;
      if (playerRole.value) {
        players = players.filter(p => p.role === playerRole.value);
      }

      if (!props.seasonId) return players;
      
      // 获取当前赛季的所有赛季-队伍关联
      const seasonTeams = store.state.seasonTeams
        .filter(st => st.seasonId === props.seasonId);
      
      const seasonTeamIds = seasonTeams.map(st => st.id);
      
      // 获取这些关联中的所有选手ID
      const playerIds = store.state.seasonTeamPlayers
        .filter(stp => seasonTeamIds.includes(stp.seasonTeamId))
        .map(stp => stp.playerId);
      
      // 返回筛选后的选手
      return players.filter(player => playerIds.includes(player.id));
    });

    // 渲染选手图表（纯前端过滤和渲染）
    const renderPlayerChart = () => {
        if (!playerChart) return;
        
        let filteredStats = [];
        
        if (playerFilter.value && playerFilter.value.length > 0) {
             const selectedIds = playerFilter.value.map(id => Number(id));
             
             filteredStats = allPlayerStats.value.filter(item => {
                 return selectedIds.includes(Number(item.playerId));
             });
        } else {
             filteredStats = allPlayerStats.value;
        }

        let xAxisName = '';
        let yAxisName = '';
        let xKey = '';
        let yKey = '';
        let yInverse = false;
        
        switch (playerRole.value) {
            case 'tank':
                xAxisName = '抵挡/10min';
                yAxisName = '死亡/10min';
                xKey = 'totalMitigation';
                yKey = 'totalDeaths';
                yInverse = true; 
                break;
            case 'damage':
                xAxisName = '伤害/10min';
                yAxisName = '消灭/10min';
                xKey = 'totalDamage';
                yKey = 'totalKills';
                break;
            case 'support':
                xAxisName = '治疗/10min';
                yAxisName = '助攻/10min';
                xKey = 'totalHealing';
                yKey = 'totalAssists';
                break;
            default:
                xAxisName = '伤害/10min';
                yAxisName = '消灭/10min';
                xKey = 'totalDamage';
                yKey = 'totalKills';
        }
        
        // 计算全局最大值用于固定坐标轴
        let globalMaxX = 0;
        let globalMaxY = 0;
        
        allPlayerStats.value.forEach(item => {
            const duration = item.totalDuration || 0;
            if (duration === 0) return;
            
            const xVal = (item[xKey] / duration) * 10;
            const yVal = (item[yKey] / duration) * 10;
            
            if (xVal > globalMaxX) globalMaxX = xVal;
            if (yVal > globalMaxY) globalMaxY = yVal;
        });

        const xMax = Math.ceil(globalMaxX * 1.1); 
        const yMax = Math.ceil(globalMaxY * 1.1); 
        
        const seriesData = filteredStats.map(item => {
            const duration = item.totalDuration || 0; 
            if (duration === 0) return null;
            
            const xVal = parseFloat(((item[xKey] / duration) * 10).toFixed(2));
            const yVal = parseFloat(((item[yKey] / duration) * 10).toFixed(2));
            
            const logo = item.team ? item.team.logo : null;
            const teamId = item.team ? item.team.id : null;
            
            let symbolSize = 10;
            if (logo) {
                symbolSize = teamLogoSizes.value.get(teamId) || 18;
            }

            return {
                name: item.player?.name || '未知选手',
                value: [xVal, yVal, item.player?.name, item.team?.name],
                symbol: logo ? `image://${logo}` : 'circle',
                symbolSize: symbolSize
            };
        }).filter(item => item !== null);
        
        const option = {
          title: {
            text: `选手数据 (${xAxisName} vs ${yAxisName})`,
            left: 'center',
            show: false
          },
          tooltip: {
            trigger: 'item',
            formatter: function (params) {
               return `
                 <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #eee; padding-bottom: 4px;">${params.data.value[2]}</div>
                 <div style="font-size: 12px; color: #666; margin-bottom: 6px;">${params.data.value[3] || '未知队伍'}</div>
                 <div style="display: flex; justify-content: space-between; gap: 15px;">
                   <span>${xAxisName}:</span>
                   <span style="font-weight: bold;">${params.data.value[0]}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; gap: 15px;">
                   <span>${yAxisName}:</span>
                   <span style="font-weight: bold;">${params.data.value[1]}</span>
                 </div>
               `;
            },
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e4e7ed',
            borderWidth: 1,
            textStyle: {
              color: '#303133'
            },
            padding: 12,
            extraCssText: 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); border-radius: 4px;'
          },
          grid: {
            left: '5%',
            right: '10%',
            bottom: '10%',
            top: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: xAxisName,
            nameLocation: 'middle',
            nameGap: 30,
            scale: false,
            min: 0,
            max: xMax > 0 ? xMax : undefined,
            splitLine: {
              lineStyle: {
                type: 'dashed',
                color: '#EBEEF5'
              }
            },
            axisLine: {
              lineStyle: {
                color: '#909399'
              }
            },
            nameTextStyle: {
              color: '#606266',
              fontWeight: 'bold'
            }
          },
          yAxis: {
            type: 'value',
            name: yAxisName,
            inverse: yInverse,
            scale: false, 
            min: 0,
            max: yMax > 0 ? yMax : undefined,
            splitLine: {
              lineStyle: {
                type: 'dashed',
                color: '#EBEEF5'
              }
            },
            axisLine: {
              lineStyle: {
                color: '#909399'
              }
            },
            nameTextStyle: {
              color: '#606266',
              fontWeight: 'bold'
            }
          },
          series: [
            {
              type: 'scatter',
              symbolSize: 15,
              data: seriesData,
              itemStyle: {
                  color: function(params) {
                      const colors = [
                        '#5470c6', '#91cc75', '#fac858', '#ee6666', 
                        '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
                        '#37A2DA', '#32C5E9', '#67E0E3', '#9FE6B8', '#FFDB5C'
                      ];
                      return colors[params.dataIndex % colors.length];
                  },
                  shadowBlur: 5,
                  shadowColor: 'rgba(0, 0, 0, 0.2)'
              },
              label: {
                  show: true,
                  formatter: function(params) {
                      return params.data.value[2];
                  },
                  position: 'top',
                  fontWeight: 'bold',
                  fontSize: 10,
                  color: '#303133',
                  textBorderColor: '#fff',
                  textBorderWidth: 2
              }
            }
          ]
        };
        
        playerChart.setOption(option, true);
    };

    // 更新选手数据图表
    const updatePlayerStatsChart = async () => {
      if (!playerChart) return;
      
      try {
        playerChart.showLoading();
        
        const params = {
          seasonId: props.seasonId || null,
          teamIds: null, // 我们不在这里根据队伍筛选，而是获取所有，前端筛选
          playerIds: null, 
          role: playerRole.value
        };
        
        const response = await apiService.getPlayerStatsData(params);
        allPlayerStats.value = response || [];
        await loadTeamLogos(allPlayerStats.value);
        
        const availablePlayerIds = allPlayerStats.value.map(p => p.playerId);
        
        // 自动选择Top 5逻辑
        // 如果 playerFilter 为空，或者切换了角色（这里假设外部已清空），则进行Top 5选择
        if (playerFilter.value.length === 0) {
            const statsWithScore = allPlayerStats.value.map(item => {
                const duration = item.totalDuration || 0;
                if (duration === 0) return { ...item, score: -Infinity }; 

                let score = 0;
                const per10 = (val) => (val / duration) * 10;

                if (playerRole.value === 'tank') {
                    const mit = per10(item.totalMitigation);
                    const dth = per10(item.totalDeaths);
                    score = mit / (dth + 0.1);
                } else if (playerRole.value === 'damage') {
                    const dmg = per10(item.totalDamage);
                    const elim = per10(item.totalKills);
                    score = elim * 1000 + dmg;
                } else if (playerRole.value === 'support') {
                    const heal = per10(item.totalHealing);
                    const ast = per10(item.totalAssists);
                    score = heal + ast * 1000;
                }

                return { ...item, score };
            });

            statsWithScore.sort((a, b) => b.score - a.score);

            const top5 = statsWithScore.slice(0, 5);
            playerFilter.value = top5.map(p => p.playerId);
            
            if (playerFilter.value.length === 0 && availablePlayerIds.length > 0) {
                 playerFilter.value = availablePlayerIds;
            }
        } else {
             // 过滤掉不再当前列表中的ID
             playerFilter.value = playerFilter.value.filter(id => availablePlayerIds.includes(id));
             
             if (playerFilter.value.length === 0) {
                 const statsWithScore = allPlayerStats.value.map(item => {
                    const duration = item.totalDuration || 0;
                    if (duration === 0) return { ...item, score: -Infinity };

                    let score = 0;
                    const per10 = (val) => (val / duration) * 10;

                    if (playerRole.value === 'tank') {
                        const mit = per10(item.totalMitigation);
                        const dth = per10(item.totalDeaths);
                        score = mit / (dth + 0.1);
                    } else if (playerRole.value === 'damage') {
                        const dmg = per10(item.totalDamage);
                        const elim = per10(item.totalKills);
                        score = elim * 1000 + dmg;
                    } else if (playerRole.value === 'support') {
                        const heal = per10(item.totalHealing);
                        const ast = per10(item.totalAssists);
                        score = heal + ast * 1000;
                    }
                    return { ...item, score };
                });
                statsWithScore.sort((a, b) => b.score - a.score);
                const top5 = statsWithScore.slice(0, 5);
                playerFilter.value = top5.map(p => p.playerId);
                
                if (playerFilter.value.length === 0 && availablePlayerIds.length > 0) {
                    playerFilter.value = availablePlayerIds;
                }
             }
        }
        
        renderPlayerChart();
        
      } catch (error) {
        console.error('获取选手数据失败:', error);
        playerChart.hideLoading();
      } finally {
        playerChart.hideLoading();
      }
    };

    const handleResize = () => {
      playerChart?.resize();
    };

    // 监听 playerFilter 变化，实时更新图表
    watch(playerFilter, () => {
        renderPlayerChart();
    }, { deep: true });

    // 监听 playerRole 变化，重置选手筛选并更新图表
    watch(playerRole, () => {
        playerFilter.value = []; 
        updatePlayerStatsChart();
    });

    // 监听 seasonId 变化
    watch(() => props.seasonId, (newVal) => {
        // 重置筛选
        playerFilter.value = [];
        updatePlayerStatsChart();
    });

    onMounted(async () => {
      await nextTick();
      playerChart = echarts.init(playerStatsChart.value);
      updatePlayerStatsChart();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      playerChart?.dispose();
    });

    return {
      playerStatsChart,
      playerFilter,
      playerRole,
      getFilteredPlayers,
      updatePlayerStatsChart
    };
  }
};
</script>

<style scoped>
.filterable-data-card {
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  background: #ffffff;
  transition: all 0.3s ease;
}

.filterable-data-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  flex-wrap: wrap;
  gap: 10px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 15px;
}

.header-title {
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    border-left: 4px solid #409EFF;
    padding-left: 12px;
    line-height: 1.2;
    display: flex;
    align-items: center;
}

.info-icon {
  margin-left: 8px;
  font-size: 16px;
  color: #909399;
  cursor: pointer;
  transition: color 0.3s;
}

.info-icon:hover {
  color: #409EFF;
}

.card-filter {
  display: flex;
  gap: 10px;
}

.chart-container {
  width: 100%;
  height: 450px;
}

.player-select-input {
  width: 400px;
}

.custom-select-placeholder {
  color: #606266;
  font-size: 14px;
  line-height: 32px;
  margin-left: 4px;
}

@media (max-width: 768px) {
  .player-select-input {
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

:deep(.player-select-input .el-select__tags) {
  display: none !important;
}
:deep(.player-select-input .el-select__selection) {
  display: none !important;
}
</style>

<style>
/* Player Filter Styles */
.player-select-dropdown .el-select-dropdown__list {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 10px;
  padding: 10px;
  min-width: 400px;
}

.player-select-dropdown .el-select-dropdown__item {
  height: auto;
  line-height: 2;
}

.player-select-dropdown .el-select-dropdown__wrap {
  max-height: 600px !important;
}

@media (max-width: 768px) {
  .player-select-dropdown .el-select-dropdown__list {
    min-width: unset !important;
    width: 100%;
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  .player-select-dropdown {
    width: 90vw !important;
    left: 5vw !important;
    margin: 0 !important;
  }
  
  .player-select-dropdown .el-scrollbar {
      padding-right: 0 !important;
  }
}
</style>
