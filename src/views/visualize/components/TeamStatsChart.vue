<template>
  <div class="vis-card">
    <div class="panel-header">
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
            popper-class="vis-dropdown vis-dropdown-long"
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
            >
              <div class="option-with-logo">
                <img v-if="team.logo" :src="team.logo" class="option-logo" alt="" />
                <span>{{ team.name }}</span>
              </div>
            </el-option>
          </el-select>
        </div>
      </div>
    </div>
    <div class="card-content">
      <div ref="teamComparisonChart" class="chart-container"></div>
      
      <div class="leaderboard-section">
        <div class="leaderboard-header">
          <span class="leaderboard-title">参赛队伍排行榜</span>
          <el-button link class="export-btn-small" @click="handleExportLeaderboard">
            <el-icon><Download /></el-icon> 导出
          </el-button>
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
              <div class="team-cell team-cell-clickable" @click="goToTeamDetail(scope.row)" role="button" tabindex="0">
                <img v-if="scope.row.logo" :src="scope.row.logo" class="team-logo-small" alt="" />
                <span class="team-name" :title="scope.row.teamName">{{ scope.row.teamName }}</span>
                <span class="team-roster-cue" aria-hidden="true">›</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="kd" label="K/D" width="100" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="scope">
              <span :class="{ 'stat-highlight': sortState.prop === 'kd' }">{{ scope.row.kd }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="damagePer10" label="伤害/10min" width="120" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="scope">
              <span :class="{ 'stat-highlight': sortState.prop === 'damagePer10' }">{{ scope.row.damagePer10 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="healingPer10" label="治疗/10min" width="120" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
            <template #default="scope">
              <span :class="{ 'stat-highlight': sortState.prop === 'healingPer10' }">{{ scope.row.healingPer10 }}</span>
            </template>
          </el-table-column>
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
    <ChartExportPreview v-model="showPreview" :image-url="previewImage" />
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { ArrowDown, ArrowUp, Download } from '@element-plus/icons-vue';
import ChartExportPreview from './ChartExportPreview.vue';
import { useChartExport } from '@/composables/useChartExport';
import { trackPublicEvent } from '@/utils/analytics';
import { escapeHtml } from '@/utils/security';

export default {
  name: 'TeamStatsChart',
  components: {
    ArrowDown,
    ArrowUp,
    Download,
    ChartExportPreview
  },
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const teamComparisonChart = ref(null);
    const teamFilter = ref([]);
    const allTeamStats = ref([]);
    const teamLogoSizes = ref(new Map());
    const isExpanded = ref(false);
    let teamChart = null;

    const router = useRouter();

    const goToTeamDetail = (row) => {
      if (!row || !row.teamId || !props.seasonId) return;
      trackPublicEvent('首页-打开战队详情', {
        source: 'team_stats_chart',
        seasonId: props.seasonId,
        teamId: row.teamId
      }, route);

      router.push({
        path: '/visualize/team-detail',
        query: { seasonId: props.seasonId, teamId: row.teamId }
      });
    };

    const { showPreview, previewImage, handleExportChart, handleExportTable } = useChartExport();
    const handleExport = () => {
        const season = store.getters.getSeasonById(props.seasonId);
        const seasonName = season ? season.name : '';
        handleExportChart(teamChart, seasonName, '参赛队伍表现分布', false, { seasonId: props.seasonId });
    };

    const handleExportLeaderboard = () => {
        const season = store.getters.getSeasonById(props.seasonId);
        const seasonName = season ? season.name : '';
        const columns = [
            { prop: 'rank', label: '排名', width: 80, weight: 0.8 },
            { prop: 'teamName', label: '队伍', align: 'left', isTeam: true, weight: 2 },
            { prop: 'kd', label: 'K/D', highlight: sortState.value.prop === 'kd', weight: 1 },
            { prop: 'damagePer10', label: '伤害/10min', highlight: sortState.value.prop === 'damagePer10', weight: 1.2 },
            { prop: 'healingPer10', label: '治疗/10min', highlight: sortState.value.prop === 'healingPer10', weight: 1.2 },
            { prop: 'duration', label: '总时长(分)', weight: 1 }
        ];
        // Export all teams depending on requirement.
        const exportData = teamLeaderboardData.value;
        handleExportTable('参赛队伍排行榜', columns, exportData, seasonName, { seasonId: props.seasonId });
    };

    const sortState = ref({ prop: 'kd', order: 'descending' });

    const handleSortChange = ({ prop, order }) => {
      sortState.value = { prop, order };
    };

    const teamLeaderboardData = computed(() => {
        const stats = allTeamStats.value.map(item => {
            const duration = item.totalDuration || 0;
            if (duration === 0) return { ...item, kd: 0, damagePer10: 0, healingPer10: 0 };

            const damagePer10 = parseFloat(((item.totalDamage / duration) * 10).toFixed(2));
            const healingPer10 = parseFloat((((item.totalHealing || 0) / duration) * 10).toFixed(2));
            const kills = item.totalKills || 0;
            const deaths = item.totalDeaths || 0;
            
            let kd = kills;
            if (deaths > 0) {
                kd = parseFloat((kills / deaths).toFixed(2));
            }

            return {
                teamId: item.teamId,
                teamName: item.teamName,
                kd,
                damagePer10,
                healingPer10,
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
            const MAX_SIZE = 20;
            const scale = Math.min(MAX_SIZE / size.width, MAX_SIZE / size.height);
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
        
        // 处理当前筛选出的数据 for Scatter Plot
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
            const symbolSize = teamLogoSizes.value.get(item.teamId) || 20;
            
            return {
                name: teamName,
                value: [damagePer10, kd, teamName],
                teamId: item.teamId,
                symbol: logo ? `image://${logo}` : 'circle',
                symbolSize: symbolSize
            };
        });

        // 坐标轴范围按“当前展示的点”计算（此前按全部队伍算，Top 筛选后大片留白、点挤成一团）
        let minDamage = Infinity, maxDamage = -Infinity, minKD = Infinity, maxKD = -Infinity;
        seriesData.forEach(d => {
            const dx = d.value[0];
            const dy = d.value[1];
            if (dx < minDamage) minDamage = dx;
            if (dx > maxDamage) maxDamage = dx;
            if (dy < minKD) minKD = dy;
            if (dy > maxKD) maxKD = dy;
        });
        if (maxDamage === -Infinity) { minDamage = 0; maxDamage = 1000; }
        if (maxKD === -Infinity) { minKD = 0; maxKD = 5; }

        // 15% padding 给顶部标签留位；全点重合时给最小跨度避免坐标轴退化
        const damagePadding = (maxDamage - minDamage) * 0.15 || Math.max(maxDamage * 0.05, 100);
        const kdPadding = (maxKD - minKD) * 0.15 || 0.5;

        const xMin = Math.max(0, Math.floor((minDamage - damagePadding) / 100) * 100);
        const xMax = Math.ceil((maxDamage + damagePadding) / 100) * 100;
        const yMin = Math.max(0, Math.floor((minKD - kdPadding) * 10) / 10);
        const yMax = Math.ceil((maxKD + kdPadding) * 10) / 10;

        const option = {
          title: {
            show: false
          },
          tooltip: {
            trigger: 'item',
            formatter: function (params) {
               const logo = params.data.symbol.replace('image://', '');
               const logoHtml = logo && logo !== 'circle' 
                 ? `<img src="${escapeHtml(logo)}" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; margin-right: 8px;">` 
                 : '';
               
               return `
                 <div style="font-weight: 500; margin-bottom: 8px; color: #303133; font-size: 14px; border-bottom: 1px solid #EBEEF5; padding-bottom: 4px; display: flex; align-items: center;">
                   ${logoHtml}
                   <span>${escapeHtml(params.data.name)}</span>
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
              fontFamily: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", SimHei, sans-serif'
            },
            axisLabel: {
              fontFamily: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", SimHei, sans-serif',
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
              fontFamily: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", SimHei, sans-serif'
            },
            axisLabel: {
              fontFamily: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", SimHei, sans-serif'
            }
          },
          series: [
            {
              type: 'scatter',
              symbolSize: 20,
              data: seriesData,
              labelLayout: {
                  moveOverlap: 'shiftY'
              },
              label: {
                  show: true,
                  formatter: '{b}',
                  position: 'top',
                  fontWeight: 'bold',
                  color: '#303133',
                  fontSize: 12,
                  textBorderColor: '#fff',
                  textBorderWidth: 2,
                  fontFamily: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", SimHei, sans-serif'
              },
              itemStyle: {
                color: function(params) {
                  // 黑橙双主轴 + 中性灰色板（替代旧版蓝/绿/红杂色）
                  const colors = [
                    '#FF6A00', '#111111', '#FF9E0F', '#606266',
                    '#FFB84D', '#303133', '#909399', '#C0C4CC'
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
                   top: '14%',
                   left: '9%',
                   right: '6%',
                   bottom: '10%',
                   containLabel: true
                },
                xAxis: {
                   nameGap: 18,
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
        // 因为每个选手的数据里都包含了他打的时长，一个队伍5个人打一局，时间会累加5次
        // 为了计算队伍真正的“10分钟数据”，我们需要取队伍中上场时间最长的人的时间作为这局队伍的游戏时间，或者粗略地将总时间除以 5。
        // 由于这里返回的是每个选手的聚合数据，我们使用最大上场时间代表队伍比赛时间
        response.forEach(p => {
            if (!p.teamId) return;
            if (!teamStatsMap.has(p.teamId)) {
                teamStatsMap.set(p.teamId, {
                    teamId: p.teamId,
                    teamName: p.teamName || p.team?.name || '未知队伍',
                    team: p.team, // 保留 team 对象以获取 logo
                    totalDamage: 0,
                    totalHealing: 0,
                    totalDeaths: 0,
                    totalKills: 0,
                    totalDuration: 0 // minutes
                });
            }
            const teamStat = teamStatsMap.get(p.teamId);
            teamStat.totalDamage += (p.damage || 0);
            teamStat.totalHealing += (p.healing || 0);
            teamStat.totalDeaths += (p.deaths || 0);
            teamStat.totalKills += (p.elims || 0);
            // 队伍的比赛时间应该是该队任一选手打的时间的最大值，而不是所有选手时间相加
            if ((p.gameTime || 0) > teamStat.totalDuration) {
                teamStat.totalDuration = (p.gameTime || 0);
            }
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

                // 队伍的伤害一般在 60000~90000 之间，而 KD 一般在 1~3 之间
                // 为了让 KD 的权重更高，将 KD 的放大系数从 1000 提升到 30000，使其成为主要决定因素
                const score = kd * 30000 + damagePer10;

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
      handleSortChange,
      showPreview,
      previewImage,
      handleExport,
      handleExportLeaderboard,
      goToTeamDetail,
      sortState
    };
  }
};
</script>

<style scoped>
/* 去卡片化：无缝直排，标题+内容直接落在页面上（对齐积分榜风格） */
.vis-card {
  position: relative;
  height: auto;
  display: block;
  overflow: visible;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
}

.leaderboard-section {
  margin-top: 12px; /* 缩减上边距 24px -> 12px */
  /* 更淡的分隔阴影，营造轻微的层级感 */
  box-shadow: 0 -4px 12px -2px rgba(0, 0, 0, 0.03); 
  border-top: 1px solid #EBEEF5; /* 极淡的边框 */
  padding-top: 20px; /* 稍微缩减内边距 24px -> 20px */
  background: linear-gradient(to bottom, #fafafa, #ffffff 12px); /* 顶部微弱的浅灰过渡 */
}

.leaderboard-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  padding-left: 12px;
}

/* 左侧短橙条，强化标题区 */
.leaderboard-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  background: #FF9E0F;
  border-radius: 0 4px 4px 0; /* 改为半圆角 */
}

.leaderboard-title {
  font-size: 16px; /* 稍微加大字号 */
  font-weight: 700;
  color: #1a1a1a; /* 更深的颜色，增加对比 */
  font-family: var(--vis-font-body);
  letter-spacing: 0.5px;
}

.export-btn-small {
  font-size: 13px;
  color: #909399;
}
.export-btn-small:hover {
  color: #FF9E0F;
}

.leaderboard-footer {
  margin-top: 12px;
  text-align: center;
}

/* 清除 Element 默认蓝：展开/收起链接按钮 */
.leaderboard-footer :deep(.el-button.is-link),
.leaderboard-footer :deep(.el-button.is-link:hover),
.leaderboard-footer :deep(.el-button.is-link:focus) {
  color: #ff6a00;
  font-weight: 600;
}

/* 清除 Element 默认蓝：表格排序箭头激活态 */
.leaderboard-section :deep(.el-table .ascending .sort-caret.ascending) {
  border-bottom-color: #ff6a00;
}

.leaderboard-section :deep(.el-table .descending .sort-caret.descending) {
  border-top-color: #ff6a00;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.team-cell-clickable {
  margin: -4px -8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.team-cell-clickable:hover {
  background: rgba(255, 158, 15, 0.08);
}

.team-cell-clickable:active {
  transform: translateY(1px);
}

.team-cell-clickable .team-name {
  color: #111;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.18);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.team-cell-clickable:active .team-name {
  color: #ff6a00;
  text-decoration-color: rgba(255, 106, 0, 0.55);
}

.team-roster-cue {
  flex: 0 0 auto;
  color: #ff8a00;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  opacity: 0.72;
  transform: translateY(-1px);
}

.team-logo-small {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.team-name {
  font-family: var(--vis-font-body);
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

/* M4 · 排名前三：渐变橙斜体数字 */
/* 修复：渐变裁剪区域（background-clip:text 只覆盖 padding box）小于
   斜体字形墨迹范围时，数字底部与右侧斜伸部分会被裁掉。
   通过加大 line-height + 四周 padding 扩大绘制区域，保证完整显示。 */
.rank-1,
.rank-2,
.rank-3 {
  display: inline-block;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-weight: 900;
  font-size: 16px;
  color: transparent;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: var(--vis-primary-gradient);
  background-size: 100% 100%;
  line-height: 1.4;
  padding: 2px 3px 3px 1px;
  overflow: visible;
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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
  /* margin-left: 8px; Removed */
}

.info-icon:hover {
  color: #FFFFFF;
}

.export-btn {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
  padding: 0;
  height: auto;
}
.export-btn:hover {
  color: #FFFFFF;
}
.export-text {
  font-weight: 500;
}
@media (max-width: 768px) {
  .export-text {
    display: none; /* Hide text on mobile if needed, or keep it */
  }
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
.option-with-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.leaderboard-section {
  min-width: 0;
  margin-top: 0;
  padding: 4px 0 0 28px;
  background: transparent;
  border-top: 0;
  border-left: 1px solid rgba(17, 17, 17, 0.08);
  box-shadow: none;
}

.leaderboard-header {
  margin-bottom: 12px;
  padding-left: 12px;
}

/* M1 · 斜切标题条：渐变斜块 */
.leaderboard-header::before {
  display: block;
  background: var(--vis-primary-gradient);
  border-radius: 1px;
  transform: translateY(-50%) skewX(var(--vis-slant));
}

.leaderboard-title {
  color: #111;
  font-family: var(--vis-font-display);
  font-size: 15px;
  font-style: italic;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.export-btn-small,
.export-btn {
  color: #68707d;
  font-size: 13px;
}

.export-btn-small:hover,
.export-btn:hover,
.info-icon:hover {
  color: #ff8a00;
}

.info-icon {
  color: #8a8f98;
  font-size: 17px;
}

.card-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.86fr);
  gap: 32px;
  align-items: start;
  padding: 0;
}

.chart-container {
  position: relative;
  height: 420px;
  min-height: 360px;
}

.custom-select-label {
  color: #69707d;
  font-weight: 600;
}

.header-controls :deep(.el-select .el-input__wrapper) {
  padding: 2px 10px !important;
  background: #fff !important;
  border-radius: 10px !important;
  box-shadow: 0 0 0 1px rgba(17, 17, 17, 0.08) inset !important;
}

.header-controls :deep(.el-select .el-input__wrapper:hover),
.header-controls :deep(.el-select .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px rgba(255, 138, 0, 0.55) inset !important;
}

.header-controls :deep(.el-input__inner),
.header-controls :deep(.el-input__suffix .el-icon) {
  color: #303133 !important;
  text-shadow: none;
}

.leaderboard-section :deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(17, 17, 17, 0.035);
  background: transparent;
  border-top: 1px solid rgba(17, 17, 17, 0.06);
}

.leaderboard-section :deep(.el-table::before) {
  background-color: rgba(17, 17, 17, 0.06);
}

.leaderboard-section :deep(.el-table th.el-table__cell) {
  color: #7a7f89;
  font-size: 12px;
  font-weight: 700;
  background: #fafafa !important;
}

.leaderboard-section :deep(.el-table__header-wrapper),
.leaderboard-section :deep(.el-table__fixed-header-wrapper),
.leaderboard-section :deep(.el-table__header),
.leaderboard-section :deep(.el-table__header tr),
.leaderboard-section :deep(.el-table__header th.el-table__cell),
.leaderboard-section :deep(.el-table__header th.el-table__cell.is-fixed),
.leaderboard-section :deep(.el-table__fixed-right-patch),
.leaderboard-section :deep(.el-table__cell.gutter) {
  background-color: #fafafa !important;
  background-image: none !important;
}

.leaderboard-section :deep(.el-table__header th.el-table-fixed-column--left.is-last-column::before),
.leaderboard-section :deep(.el-table__header th.el-table-fixed-column--right.is-first-column::before) {
  background: transparent !important;
}

.leaderboard-section :deep(.el-table td.el-table__cell) {
  background: transparent;
}

:deep(.el-table .el-table__cell.is-fixed),
:deep(.el-table .el-table__fixed-right-patch),
:deep(.el-table__body tr > td:first-child),
:deep(.el-table__body tr > td:nth-child(2)) {
  background-color: #fafafa !important;
}

:deep(.el-table__body tr.top-rank-row > td.el-table__cell),
:deep(.el-table__body tr.top-rank-row.hover-row > td.el-table__cell),
:deep(.el-table__body tr.top-rank-row:hover > td.el-table__cell) {
  background-color: #fff2df !important;
  background-image: none !important;
}

:deep(.el-table__body tr.top-rank-row > td.el-table__cell .cell) {
  background-color: transparent !important;
}

:deep(.el-table__body tr.top-rank-row > td.el-table-fixed-column--left.is-last-column::before),
:deep(.el-table__body tr.top-rank-row > td.el-table-fixed-column--right.is-first-column::before) {
  background: transparent !important;
}

@media (max-width: 1200px) {
  .card-content {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .leaderboard-section {
    padding: 22px 0 0;
    border-top: 1px solid rgba(17, 17, 17, 0.08);
    border-left: 0;
  }

}

@media (max-width: 768px) {
  .vis-card {
    padding: 0;
  }

  .card-content {
    padding: 0;
  }

  .chart-container {
    height: 270px;
    min-height: 250px;
  }

  .header-controls {
    width: 100%;
    margin-top: 0;
  }

  .select-wrapper,
  .team-select-input {
    width: 100%;
  }

  .header-controls :deep(.el-select .el-input__wrapper) {
    min-height: 36px !important;
    border-radius: 8px !important;
  }

  .card-content {
    gap: 16px;
  }

  .leaderboard-section {
    padding-top: 16px;
  }

  .leaderboard-header {
    min-height: 32px;
    margin-bottom: 8px;
  }

  .leaderboard-title {
    font-size: 18px;
  }

  .leaderboard-footer {
    margin-top: 8px;
  }

  .team-cell {
    gap: 6px;
  }

  .team-logo-small {
    width: 18px;
    height: 18px;
  }

}
</style>

<style>
/* el-select 的 popper 会 teleport 到 body，需非 scoped 覆写选中态（清除 Element 默认蓝） */
.vis-dropdown .el-select-dropdown__item.is-selected {
  color: #ff6a00;
  font-weight: 700;
}
</style>
