<template>
  <div class="vis-card">
    <SlantedTitle title="队伍数据对比">
      <template #title-suffix>
        <el-tooltip content="对比各队伍的输出与生存能力（默认显示综合数据Top5队伍）" placement="top">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </template>
      <template #extra>
        <div class="header-controls">
          <div class="select-wrapper">
            <el-select 
              v-model="teamFilter" 
              placeholder="" 
              :disabled="!seasonId" 
              class="team-select-input"
              multiple
              collapse-tags
              collapse-tags-tooltip
              popper-class="team-select-dropdown"
              size="small"
            >
              <template #prefix>
                <span class="custom-select-label">队伍筛选列表</span>
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
    </SlantedTitle>
    <div class="card-content">
      <div ref="teamComparisonChart" class="chart-container"></div>
      
      <div class="leaderboard-section">
        <div class="leaderboard-header">
          <span class="leaderboard-title">队伍排行榜</span>
        </div>
        
        <el-table 
          :data="displayedTeamLeaderboard" 
          style="width: 100%" 
          size="small"
          :row-class-name="tableRowClassName"
          @sort-change="handleSortChange"
          :default-sort="{ prop: 'kd', order: 'descending' }"
        >
          <el-table-column type="index" label="排名" width="60" align="center" fixed>
            <template #default="scope">
              <span :class="getRankClass(scope.$index)">{{ scope.$index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="teamName" label="队伍" min-width="120" fixed>
            <template #default="scope">
              <div class="team-cell">
                <img v-if="scope.row.logo" :src="scope.row.logo" class="team-logo-small" alt="" />
                <span class="team-name" :title="scope.row.teamName">{{ scope.row.teamName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="kd" label="K/D" width="100" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="scope">
              <span class="stat-highlight">{{ scope.row.kd }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="damagePer10" label="伤害/10min" width="120" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
          <el-table-column prop="duration" label="总时长(分)" width="100" align="center" />
        </el-table>
        
        <div class="leaderboard-footer" v-if="teamLeaderboardData.length > 3">
          <el-button link type="primary" @click="isExpanded = !isExpanded">
            {{ isExpanded ? '收起全部' : '查看全部' }}
            <el-icon class="el-icon--right">
              <component :is="isExpanded ? 'ArrowUp' : 'ArrowDown'" />
            </el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { InfoFilled, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import SlantedTitle from './SlantedTitle.vue';

export default {
  name: 'TeamStatsChart',
  components: {
    InfoFilled,
    SlantedTitle,
    ArrowDown,
    ArrowUp
  },
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
    const teamLogoSizes = ref(new Map());
    const isExpanded = ref(false);
    let teamChart = null;

    const sortState = ref({ prop: 'kd', order: 'descending' });

    const handleSortChange = ({ prop, order }) => {
      sortState.value = { prop, order };
    };

    const teamLeaderboardData = computed(() => {
        const stats = allTeamStats.value.map(item => {
            const duration = item.totalDuration || 0;
            if (duration === 0) return { ...item, kd: 0, damagePer10: 0 };

            const damagePer10 = parseFloat(((item.totalDamage / duration) * 10).toFixed(2));
            const kills = item.totalKills || 0;
            const deaths = item.totalDeaths || 0;
            
            let kd = kills;
            if (deaths > 0) {
                kd = parseFloat((kills / deaths).toFixed(2));
            }

            return {
                teamName: item.teamName,
                kd,
                damagePer10,
                duration: Math.round(duration),
                logo: item.team ? item.team.logo : null
            };
        });
        
        // Dynamic sorting based on sortState
        const { prop, order } = sortState.value;
        if (!prop || !order) {
            // Default fallback sort if no sort state (though we set default)
            return stats.sort((a, b) => b.kd - a.kd);
        }

        return stats.sort((a, b) => {
            let result = 0;
            if (a[prop] > b[prop]) result = 1;
            else if (a[prop] < b[prop]) result = -1;
            
            return order === 'descending' ? -result : result;
        });
    });

    const displayedTeamLeaderboard = computed(() => {
        if (isExpanded.value) {
            return teamLeaderboardData.value;
        }
        return teamLeaderboardData.value.slice(0, 3);
    });

    const getRankClass = (index) => {
        if (index === 0) return 'rank-1';
        if (index === 1) return 'rank-2';
        if (index === 2) return 'rank-3';
        return 'rank-normal';
    };

    const tableRowClassName = ({ rowIndex }) => {
        if (rowIndex < 3) {
            return 'top-rank-row';
        }
        return '';
    };

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
        if (logo && !teamLogoSizes.value.has(item.teamId)) {
           const size = await preloadImage(logo);
           if (size && size.height > 0) {
             const MAX_WIDTH = 25;
             const MAX_HEIGHT = 15;
             
             // 计算缩放比例，同时满足宽和高的限制
             const scale = Math.min(MAX_WIDTH / size.width, MAX_HEIGHT / size.height);
             
             const width = size.width * scale;
             const height = size.height * scale;
             
             teamLogoSizes.value.set(item.teamId, [width, height]);
           }
        }
      });
      await Promise.all(promises);
    };

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

        // 1. 先计算所有队伍（allTeamStats）的数据，找出全局最大值和最小值
        // 初始化为极端值
        let globalMaxDamage = -Infinity;
        let globalMinDamage = Infinity;
        let globalMaxKD = -Infinity;
        let globalMinKD = Infinity;

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
            if (damagePer10 < globalMinDamage) globalMinDamage = damagePer10;
            
            if (kd > globalMaxKD) globalMaxKD = kd;
            if (kd < globalMinKD) globalMinKD = kd;
        });
        
        // 如果没有数据，重置为默认值
        if (globalMaxDamage === -Infinity) { globalMaxDamage = 1000; globalMinDamage = 0; }
        if (globalMaxKD === -Infinity) { globalMaxKD = 5; globalMinKD = 0; }

        // 计算 padding，使散点不贴边
        const damagePadding = (globalMaxDamage - globalMinDamage) * 0.1 || 100;
        const kdPadding = (globalMaxKD - globalMinKD) * 0.1 || 0.5;

        // 设置坐标轴范围
        // 确保 min 不小于 0 (除非有负数数据，这里假设没有)
        const xMin = Math.max(0, Math.floor((globalMinDamage - damagePadding) / 100) * 100); 
        const xMax = Math.ceil((globalMaxDamage + damagePadding) / 100) * 100;
        
        const yMin = Math.max(0, Math.floor((globalMinKD - kdPadding) * 10) / 10);
        const yMax = Math.ceil((globalMaxKD + kdPadding) * 10) / 10;

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
            
            const logo = item.team ? item.team.logo : null;
            const symbolSize = teamLogoSizes.value.get(item.teamId) || 18;
            
            return {
                name: teamName,
                value: [damagePer10, kd, teamName],
                teamId: item.teamId,
                symbol: logo ? `image://${logo}` : 'circle',
                symbolSize: symbolSize
            };
        });

        const option = {
          title: {
            show: false
          },
          tooltip: {
            trigger: 'item',
            formatter: function (params) {
               const logo = params.data.symbol.replace('image://', '');
               const logoHtml = logo && logo !== 'circle' 
                 ? `<img src="${logo}" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; margin-right: 8px;">` 
                 : '';
               
               return `
                 <div style="font-weight: 500; margin-bottom: 8px; color: #303133; font-size: 14px; border-bottom: 1px solid #EBEEF5; padding-bottom: 4px; display: flex; align-items: center;">
                   ${logoHtml}
                   <span>${params.data.name}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 4px;">
                   <span style="color: #606266;">伤害/10min:</span>
                   <span style="font-weight: bold; color: #FF9E0F;">${params.data.value[0]}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; gap: 15px;">
                   <span style="color: #606266;">K/D:</span>
                   <span style="font-weight: bold; color: #1A1A1A;">${params.data.value[1]}</span>
                 </div>
               `;
            },
            backgroundColor: '#FFFFFF',
            borderColor: '#EBEEF5',
            borderWidth: 1,
            textStyle: {
              color: '#303133'
            },
            padding: [12, 16],
            extraCssText: 'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); border-radius: 8px;'
          },
          grid: {
            left: '3%',
            right: '7%',
            bottom: '10%',
            top: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '伤害/10min',
            nameLocation: 'middle',
            nameGap: 30,
            scale: false, 
            min: xMin,
            max: xMax,
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
              fontWeight: 'bold',
              fontFamily: 'Inter, sans-serif'
            },
            axisLabel: {
              fontFamily: 'Inter, sans-serif',
              hideOverlap: true
            }
          },
          yAxis: {
            type: 'value',
            name: 'K/D',
            scale: false,
            min: yMin,
            max: yMax,
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
              fontWeight: 'bold',
              fontFamily: 'Inter, sans-serif'
            },
            axisLabel: {
              fontFamily: 'Inter, sans-serif'
            }
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
                  fontWeight: 'bold',
                  color: '#303133',
                  fontSize: 12,
                  textBorderColor: '#fff',
                  textBorderWidth: 2,
                  fontFamily: 'Inter, sans-serif'
              },
              itemStyle: {
                color: function(params) {
                  // 使用更现代的配色 (Orange-themed palette + accents)
                  const colors = [
                    '#FF9E0F', '#FF6A00', '#F56C6C', '#E6A23C', 
                    '#409EFF', '#67C23A', '#909399', '#303133'
                  ];
                  return colors[params.dataIndex % colors.length];
                },
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.2)'
              }
            }
          ],
          media: [
            {
              query: { maxWidth: 768 },
              option: {
                grid: {
                   top: '15%',
                   left: '8%',
                   right: '8%',
                   bottom: '10%',
                   containLabel: true
                },
                xAxis: {
                   nameGap: 25,
                   splitNumber: 3,
                   axisLabel: {
                      rotate: 0,
                      fontSize: 10
                   }
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
      
      if (!props.seasonId) return;

      try {
        teamChart.showLoading({
          color: '#FF9E0F',
          textColor: '#FF9E0F',
          maskColor: 'rgba(255, 255, 255, 0.8)'
        });
        
        // 使用新的赛季数据接口并聚合
        const response = await apiService.getSeasonPlayerStats(props.seasonId);
        
        const teamStatsMap = new Map();
        response.forEach(p => {
            if (!p.teamId) return;
            if (!teamStatsMap.has(p.teamId)) {
                teamStatsMap.set(p.teamId, {
                    teamId: p.teamId,
                    teamName: p.teamName || p.team?.name || '未知队伍',
                    team: p.team, // 保留 team 对象以获取 logo
                    totalDamage: 0,
                    totalDeaths: 0,
                    totalKills: 0,
                    totalDuration: 0 // minutes
                });
            }
            const teamStat = teamStatsMap.get(p.teamId);
            teamStat.totalDamage += (p.damage || 0);
            teamStat.totalDeaths += (p.deaths || 0);
            teamStat.totalKills += (p.elims || 0);
            teamStat.totalDuration += (p.gameTime || 0);
        });
        
        allTeamStats.value = Array.from(teamStatsMap.values());
        await loadTeamLogos(allTeamStats.value);
        
        // 自动选择 Top 5 逻辑
        if (teamFilter.value.length === 0) {
            const statsWithScore = allTeamStats.value.map(item => {
                const duration = item.totalDuration || 0;
                if (duration === 0) return { ...item, score: -Infinity };

                const damagePer10 = (item.totalDamage / duration) * 10;
                const kills = item.totalKills || 0;
                const deaths = item.totalDeaths || 0;
                
                let kd = kills;
                if (deaths > 0) {
                    kd = kills / deaths;
                }

                const score = kd * 1000 + damagePer10;

                return { ...item, score };
            });

            statsWithScore.sort((a, b) => b.score - a.score);
            const top5 = statsWithScore.slice(0, 5);
            
            teamFilter.value = top5.map(t => t.teamId);

            const availableTeamIds = allTeamStats.value.map(t => t.teamId);
            if (teamFilter.value.length === 0 && availableTeamIds.length > 0) {
                teamFilter.value = availableTeamIds;
            }
        }
        
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
        teamFilter.value = [];
        await updateTeamComparisonChart();
        await store.dispatch('getSeasonTeams', newVal);
      } else {
          teamFilter.value = [];
          updateTeamComparisonChart();
      }
    });

    onMounted(async () => {
      await nextTick();
      teamChart = echarts.init(teamComparisonChart.value);
      
      if (props.seasonId) {
          await updateTeamComparisonChart();
          await store.dispatch('getSeasonTeams', props.seasonId);
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
      teams,
      teamLeaderboardData,
      displayedTeamLeaderboard,
      isExpanded,
      getRankClass,
      tableRowClassName,
      handleSortChange
    };
  }
};
</script>

<style scoped>
.leaderboard-section {
  margin-top: 24px;
  border-top: 1px solid #EBEEF5;
  padding-top: 20px;
}

.leaderboard-header {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.leaderboard-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
  font-family: 'Inter', sans-serif;
}

.leaderboard-footer {
  margin-top: 12px;
  text-align: center;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.team-logo-small {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.team-name {
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.stat-highlight {
  font-weight: 700;
  color: #FF9E0F;
}

.rank-1 {
  color: #FFD700;
  font-weight: 800;
  font-size: 16px;
}

.rank-2 {
  color: #C0C0C0;
  font-weight: 800;
  font-size: 16px;
}

.rank-3 {
  color: #CD7F32;
  font-weight: 800;
  font-size: 16px;
}

.rank-normal {
  color: #909399;
  font-weight: 600;
}

:deep(.top-rank-row) {
  background-color: rgba(255, 158, 15, 0.05);
}

.card-content {
  padding: 24px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: color 0.3s;
}

.info-icon:hover {
  color: #FFFFFF;
}

.chart-container {
  width: 100%;
  height: 450px;
}

.team-select-input {
  width: 240px;
}

.custom-select-label {
  color: #606266;
  font-size: 12px;
  line-height: 24px;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .header-controls {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    margin-top: 8px;
  }

  .select-wrapper {
    width: 100%;
    margin-top: 4px;
  }

  .team-select-input {
    width: 100%;
  }

  .card-content {
    padding: 16px;
  }
}

/* 隐藏Select中的Tags */
:deep(.team-select-input .el-select__tags) {
  display: none !important;
}
:deep(.team-select-input .el-select__selection) {
    display: none !important;
}

/* 确保固定列有不透明背景 */
:deep(.el-table .el-table__cell.is-fixed),
:deep(.el-table .el-table__fixed-right-patch),
:deep(.el-table__body tr > td:first-child),
:deep(.el-table__body tr > td:nth-child(2)) {
  background-color: #ffffff;
}

/* 修复前三名高亮行在固定列时的背景色问题 */
:deep(.el-table__body tr.top-rank-row > td.el-table__cell.is-fixed),
:deep(.el-table__body tr.top-rank-row > td:first-child),
:deep(.el-table__body tr.top-rank-row > td:nth-child(2)) {
  background-color: #fff9e6 !important;
}
:deep(.el-table__body tr.top-rank-row.hover-row > td.el-table__cell.is-fixed),
:deep(.el-table__body tr.top-rank-row:hover > td.el-table__cell.is-fixed),
:deep(.el-table__body tr.top-rank-row.hover-row > td:first-child),
:deep(.el-table__body tr.top-rank-row:hover > td:first-child),
:deep(.el-table__body tr.top-rank-row.hover-row > td:nth-child(2)),
:deep(.el-table__body tr.top-rank-row:hover > td:nth-child(2)) {
  background-color: #fff9e6 !important; /* 保持高亮背景色，或根据需要调整 hover 颜色 */
}

:deep(.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background-color: var(--el-table-row-hover-bg-color);
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
