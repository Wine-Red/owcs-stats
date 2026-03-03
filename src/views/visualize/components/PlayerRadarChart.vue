<template>
  <div class="vis-card">
    <SlantedTitle title="选手能力雷达">
      <template #title-suffix>
        <el-tooltip content="展示选手五维能力图（默认显示该职责平均水平，可对比两名选手）" placement="top">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
        <el-button 
          link 
          class="export-btn" 
          @click="handleExport"
        >
          <el-icon><Download /></el-icon>
          <span class="export-text">导出</span>
        </el-button>
      </template>
      <template #extra>
        <div class="header-controls">
          <el-radio-group v-model="playerRole" size="small" @change="handleRoleChange" class="role-radio-group">
            <el-radio-button label="tank">坦克</el-radio-button>
            <el-radio-button label="damage">输出</el-radio-button>
            <el-radio-button label="support">辅助</el-radio-button>
          </el-radio-group>
          
          <div class="player-selectors">
             <el-select 
              v-model="player1Id" 
              placeholder="选择选手1 (红)" 
              clearable
              class="player-select player-select-red"
              size="small"
            >
              <el-option
                v-for="player in player1Options"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              />
            </el-select>
            
            <el-select 
              v-model="player2Id" 
              placeholder="选择选手2 (蓝)" 
              clearable
              class="player-select player-select-blue"
              size="small"
            >
              <el-option
                v-for="player in player2Options"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              />
            </el-select>
          </div>
        </div>
      </template>
    </SlantedTitle>
    
    <div class="card-content">
      <div ref="radarChart" class="chart-container"></div>
    </div>
    <ChartExportPreview v-model="showPreview" :image-url="previewImage" />
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { InfoFilled, Download } from '@element-plus/icons-vue';
import SlantedTitle from './SlantedTitle.vue';
import ChartExportPreview from './ChartExportPreview.vue';
import { useChartExport } from '@/composables/useChartExport';

export default {
  name: 'PlayerRadarChart',
  components: {
    InfoFilled,
    SlantedTitle,
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
    const radarChart = ref(null);
    const playerRole = ref('tank'); // 默认为坦克
    const player1Id = ref('');
    const player2Id = ref('');
    const allPlayerStats = ref([]);
    let myChart = null;

    const { showPreview, previewImage, handleExportChart } = useChartExport();
    const handleExport = () => {
        const season = store.getters.getSeasonById(props.seasonId);
        const seasonName = season ? season.name : '';
        handleExportChart(myChart, seasonName);
    };

    // 获取当前职责的所有选手
    const rolePlayers = computed(() => {
      const stats = allPlayerStats.value.filter(s => s.role === playerRole.value);
      const uniquePlayers = new Map();
      stats.forEach(s => {
        if (s.playerId && !uniquePlayers.has(s.playerId)) {
          uniquePlayers.set(s.playerId, {
            id: s.playerId,
            name: s.playerName || s.player?.name || '未知选手'
          });
        }
      });
      return Array.from(uniquePlayers.values());
    });

    // 过滤后的选手选项（互斥）
    const player1Options = computed(() => {
        return rolePlayers.value.filter(p => p.id !== player2Id.value);
    });

    const player2Options = computed(() => {
        return rolePlayers.value.filter(p => p.id !== player1Id.value);
    });

    // 计算每10分钟数据及其他指标
    const processStats = (item) => {
        if (!item) return null;
        const duration = item.gameTime || 0;
        if (duration === 0) return null;
        
        const p10 = (val) => parseFloat(((val || 0) / duration * 10).toFixed(2));
        
        const kills = item.elims || 0;
        const deaths = item.deaths || 0;
        const assists = item.assists || 0;
        
        let kd = kills;
        if (deaths > 0) kd = parseFloat((kills / deaths).toFixed(2));
        
        let kad = kills + assists;
        if (deaths > 0) kad = parseFloat(((kills + assists) / deaths).toFixed(2));
        
        return {
            ...item,
            elimsPer10: p10(item.elims),
            damagePer10: p10(item.damage),
            deathsPer10: p10(item.deaths),
            assistsPer10: p10(item.assists),
            healingPer10: p10(item.healing),
            mitigationPer10: p10(item.mitigation),
            kd,
            kad
        };
    };

    // 获取特定选手的处理后数据
    const getPlayerStats = (pid) => {
        if (!pid) return null;
        const raw = allPlayerStats.value.find(s => s.playerId === pid && s.role === playerRole.value);
        return processStats(raw);
    };

    const handleRoleChange = () => {
        player1Id.value = '';
        player2Id.value = '';
        updateChart();
    };

    const updateChart = async () => {
        if (!myChart) return;
        
        // 准备数据
        const currentRoleStatsRaw = allPlayerStats.value.filter(s => s.role === playerRole.value);
        const currentRoleStats = currentRoleStatsRaw.map(processStats).filter(s => s !== null);
        
        if (currentRoleStats.length === 0) {
            myChart.clear();
            return;
        }

        // 定义维度配置
        let indicators = [];
        let dataIndex = []; // 存储每个维度的key，方便取值

        // 计算各维度的最大值，用于归一化
        const getMax = (key) => {
            const maxVal = Math.max(...currentRoleStats.map(s => s[key] || 0));
            return maxVal === 0 ? 10 : Math.ceil(maxVal * 1.1); // 留出一点余量
        };

        // 生存指标特殊处理：最大死亡数
        const maxDeathsPer10 = Math.max(...currentRoleStats.map(s => s.deathsPer10 || 0));
        // 生存分 = maxDeathsPer10 - currentDeathsPer10
        // 如果 maxDeathsPer10 是 10，某人死 2，生存分 8。某人死 10，生存分 0。
        // 雷达图最大值设为 maxDeathsPer10
        const survivalMax = maxDeathsPer10 === 0 ? 10 : Math.ceil(maxDeathsPer10 * 1.1);

        if (playerRole.value === 'tank') {
            indicators = [
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '伤害', max: getMax('damagePer10') },
                { name: '抵挡', max: getMax('mitigationPer10') },
                { name: '生存', max: survivalMax },
                { name: 'K/D', max: getMax('kd') }
            ];
            dataIndex = ['elimsPer10', 'damagePer10', 'mitigationPer10', 'deathsPer10', 'kd'];
        } else if (playerRole.value === 'damage') {
            indicators = [
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '伤害', max: getMax('damagePer10') },
                { name: '助攻', max: getMax('assistsPer10') },
                { name: '生存', max: survivalMax },
                { name: 'K/D', max: getMax('kd') }
            ];
            dataIndex = ['elimsPer10', 'damagePer10', 'assistsPer10', 'deathsPer10', 'kd'];
        } else if (playerRole.value === 'support') {
            indicators = [
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '治疗', max: getMax('healingPer10') },
                { name: '助攻', max: getMax('assistsPer10') },
                { name: '生存', max: survivalMax },
                { name: 'KA/D', max: getMax('kad') }
            ];
            dataIndex = ['elimsPer10', 'healingPer10', 'assistsPer10', 'deathsPer10', 'kad'];
        }

        // 1. 计算平均值 (灰色)
        const avgStats = {};
        dataIndex.forEach(key => {
            const sum = currentRoleStats.reduce((acc, cur) => acc + (cur[key] || 0), 0);
            avgStats[key] = sum / currentRoleStats.length;
        });
        
        // 转换数据为雷达图数组
        const formatRadarData = (stats) => {
            if (!stats) return null;
            return dataIndex.map((key) => {
                if (key === 'deathsPer10') {
                    // 生存 = max - deaths
                    // 注意：这里的 max 应该是我们设定的 survivalMax，或者该次计算中使用的基准
                    // 为了统一，我们使用 survivalMax 作为基准。
                    // 但是如果 survivalMax 比实际最大值大很多，会导致所有人都很小。
                    // 简单起见，生存值 = survivalMax - deathsPer10.
                    // 这样死亡越少，值越大，越接近 survivalMax (外圈)。
                    return Math.max(0, survivalMax - (stats[key] || 0));
                }
                return stats[key] || 0;
            });
        };

        const seriesData = [];
        
        // 平均值 (作为背景参考，不显示数值)
        seriesData.push({
            value: formatRadarData(avgStats, '平均水平'),
            name: '该职责平均',
            itemStyle: { color: '#909399' },
            lineStyle: { type: 'dashed' },
            areaStyle: { color: 'rgba(144, 147, 153, 0.2)' },
            silent: true, // 不触发鼠标事件
            tooltip: { show: false } // 不显示 Tooltip
        });

        // 选手1 (红)
        const p1 = getPlayerStats(player1Id.value);
        if (p1) {
            seriesData.push({
                value: formatRadarData(p1, p1.playerName),
                name: p1.playerName || p1.player?.name,
                itemStyle: { color: '#F56C6C' },
                areaStyle: { color: 'rgba(245, 108, 108, 0.2)' }
            });
        }

        // 选手2 (蓝)
        const p2 = getPlayerStats(player2Id.value);
        if (p2) {
            seriesData.push({
                value: formatRadarData(p2, p2.playerName),
                name: p2.playerName || p2.player?.name,
                itemStyle: { color: '#409EFF' },
                areaStyle: { color: 'rgba(64, 158, 255, 0.2)' }
            });
        }

        const option = {
            tooltip: {
                trigger: 'item',
                confine: true
            },
            legend: {
                bottom: 0,
                data: seriesData.map(s => s.name)
            },
            radar: {
                indicator: indicators,
                shape: 'polygon',
                splitNumber: 5,
                axisName: {
                    color: '#606266',
                    fontSize: 12
                },
                splitLine: {
                    lineStyle: {
                        color: [
                            'rgba(238, 197, 102, 0.1)', 'rgba(238, 197, 102, 0.2)',
                            'rgba(238, 197, 102, 0.4)', 'rgba(238, 197, 102, 0.6)',
                            'rgba(238, 197, 102, 0.8)', 'rgba(238, 197, 102, 1)'
                        ].reverse()
                    }
                },
                splitArea: {
                    show: false
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(238, 197, 102, 0.5)'
                    }
                }
            },
            series: [
                {
                    name: '选手能力对比',
                    type: 'radar',
                    data: seriesData,
                    symbol: 'circle',
                    symbolSize: 6
                }
            ]
        };

        myChart.setOption(option, true);
    };

    const loadData = async () => {
        if (!props.seasonId) return;
        
        try {
            myChart?.showLoading({
                color: '#FF9E0F',
                textColor: '#FF9E0F',
                maskColor: 'rgba(255, 255, 255, 0.8)'
            });
            const response = await apiService.getSeasonPlayerStats(props.seasonId);
            allPlayerStats.value = response || [];
            updateChart();
        } catch (error) {
            console.error('Fetch radar data failed:', error);
        } finally {
            myChart?.hideLoading();
        }
    };

    const handleResize = () => {
        myChart?.resize();
    };

    watch(() => props.seasonId, () => {
        player1Id.value = '';
        player2Id.value = '';
        loadData();
    });

    watch([player1Id, player2Id], () => {
        updateChart();
    });

    onMounted(async () => {
        await nextTick();
        myChart = echarts.init(radarChart.value);
        loadData();
        window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', handleResize);
        myChart?.dispose();
    });

    return {
        radarChart,
        playerRole,
        player1Id,
        player2Id,
        rolePlayers,
        player1Options,
        player2Options,
        handleRoleChange,
        showPreview,
        previewImage,
        handleExport
    };
  }
};
</script>

<style scoped>
.vis-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-content {
  padding: 24px;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chart-container {
  width: 100%;
  height: 400px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.player-selectors {
  display: flex;
  gap: 8px;
}

.player-select {
  width: 140px;
}

/* 自定义选框颜色 */
:deep(.player-select-red .el-input__inner) {
    color: #F56C6C;
}
:deep(.player-select-blue .el-input__inner) {
    color: #409EFF;
}

.info-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  margin-left: 8px;
}
.info-icon:hover {
  color: #fff;
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
    display: none;
  }
}

@media (max-width: 768px) {
  .header-controls {
    flex-direction: column;
    align-items: flex-start;
    margin-top: 8px;
    width: 100%;
  }
  
  .player-selectors {
    width: 100%;
    flex-direction: column;
  }
  
  .player-select {
    width: 100%;
  }
  
  .role-radio-group {
    width: 100%;
    display: flex;
  }
  
  :deep(.role-radio-group .el-radio-button) {
    flex: 1;
  }
  
  :deep(.role-radio-group .el-radio-button__inner) {
    width: 100%;
  }
}
</style>
