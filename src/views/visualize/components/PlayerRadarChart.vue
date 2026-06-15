<template>
  <div class="vis-card">
    <SlantedTitle title="选手能力雷达">
      <template #title-suffix>
        <el-tooltip content="展示选手五维能力图（默认显示该职责平均水平，可对比两名选手）" placement="top">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleExportCommand">
          <el-button link class="export-btn">
            <el-icon><Download /></el-icon>
            <span class="export-text">导出</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="poster">导出海报</el-dropdown-item>
              <el-dropdown-item command="transparent">导出透明图表</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
      <template #extra>
        <div class="header-controls">
          <el-radio-group v-model="playerRole" size="small" @change="handleRoleChange" class="role-radio-group">
            <el-radio-button label="tank">
              <div class="role-btn-content">
                <img src="/icons/role/Tank.png" class="role-icon" alt="tank" />
              </div>
            </el-radio-button>
            <el-radio-button label="damage">
              <div class="role-btn-content">
                <img src="/icons/role/DPS.png" class="role-icon" alt="damage" />
              </div>
            </el-radio-button>
            <el-radio-button label="support">
              <div class="role-btn-content">
                <img src="/icons/role/Support.png" class="role-icon" alt="support" />
              </div>
            </el-radio-button>
          </el-radio-group>
          
          <div class="player-selectors">
             <el-select 
              v-model="player1Id" 
              placeholder="" 
              clearable
              class="player-select"
              popper-class="vis-dropdown vis-dropdown-long"
              size="small"
            >
              <template #prefix>
                <span class="custom-select-label">选手1</span>
              </template>
              <el-option
                v-for="player in player1Options"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              >
                <div class="option-with-logo">
                  <img v-if="player.teamLogo" :src="player.teamLogo" class="option-logo" alt="" />
                  <span>{{ player.name }}</span>
                </div>
              </el-option>
            </el-select>
            
            <el-select 
              v-model="player2Id" 
              placeholder="" 
              clearable
              class="player-select"
              popper-class="vis-dropdown vis-dropdown-long"
              size="small"
            >
              <template #prefix>
                <span class="custom-select-label">选手2</span>
              </template>
              <el-option
                v-for="player in player2Options"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              >
                <div class="option-with-logo">
                  <img v-if="player.teamLogo" :src="player.teamLogo" class="option-logo" alt="" />
                  <span>{{ player.name }}</span>
                </div>
              </el-option>
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
    const handleExportCommand = (command) => {
        const season = store.getters.getSeasonById(props.seasonId);
        const seasonName = season ? season.name : '';
        const isTransparent = command === 'transparent';
        handleExportChart(myChart, seasonName, '', isTransparent);
    };

    // 获取当前职责的所有选手
    const rolePlayers = computed(() => {
      const stats = allPlayerStats.value.filter(s => s.role === playerRole.value);
      const uniquePlayers = new Map();
      stats.forEach(s => {
        if (s.playerId && !uniquePlayers.has(s.playerId)) {
          uniquePlayers.set(s.playerId, {
            id: s.playerId,
            name: s.playerName || s.player?.name || '未知选手',
            teamLogo: s.team ? s.team.logo : null
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
                { name: 'K/D', max: getMax('kd') },
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '伤害', max: getMax('damagePer10') },
                { name: '抵挡', max: getMax('mitigationPer10') },
                { name: '生存', max: survivalMax }
            ];
            dataIndex = ['kd', 'elimsPer10', 'damagePer10', 'mitigationPer10', 'deathsPer10'];
        } else if (playerRole.value === 'damage') {
            indicators = [
                { name: 'K/D', max: getMax('kd') },
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '伤害', max: getMax('damagePer10') },
                { name: '助攻', max: getMax('assistsPer10') },
                { name: '生存', max: survivalMax }
            ];
            dataIndex = ['kd', 'elimsPer10', 'damagePer10', 'assistsPer10', 'deathsPer10'];
        } else if (playerRole.value === 'support') {
            indicators = [
                { name: 'KA/D', max: getMax('kad') },
                { name: '消灭', max: getMax('elimsPer10') },
                { name: '治疗', max: getMax('healingPer10') },
                { name: '助攻', max: getMax('assistsPer10') },
                { name: '生存', max: survivalMax }
            ];
            dataIndex = ['kad', 'elimsPer10', 'healingPer10', 'assistsPer10', 'deathsPer10'];
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

        // 选手1
        const p1 = getPlayerStats(player1Id.value);
        if (p1) {
            const originalValues = dataIndex.map(key => p1[key] || 0);
            seriesData.push({
                value: formatRadarData(p1, p1.playerName),
                originalValues: originalValues,
                name: p1.playerName || p1.player?.name,
                itemStyle: { color: '#111' },
                areaStyle: { color: 'rgba(17, 17, 17, 0.16)' }
            });
        }

        // 选手2
        const p2 = getPlayerStats(player2Id.value);
        if (p2) {
            const originalValues = dataIndex.map(key => p2[key] || 0);
            seriesData.push({
                value: formatRadarData(p2, p2.playerName),
                originalValues: originalValues,
                name: p2.playerName || p2.player?.name,
                itemStyle: { color: '#ff6a00' },
                areaStyle: { color: 'rgba(255, 106, 0, 0.18)' }
            });
        }

        // 将选手实际数值注入到 indicators 中，供 axisName formatter 使用
        indicators.forEach((ind, index) => {
            const key = dataIndex[index];
            if (p1) ind.p1Val = p1[key] !== undefined ? p1[key] : 0;
            if (p2) ind.p2Val = p2[key] !== undefined ? p2[key] : 0;
        });

        const formatAxisValue = (val) => {
            const num = Number(val);
            if (!Number.isFinite(num)) return '';
            if (Math.abs(num) >= 100) return String(Math.round(num));
            if (Number.isInteger(num)) return String(num);
            return String(Number(num.toFixed(2)));
        };

        const isMobile = window.innerWidth <= 768;

        const option = {
            tooltip: {
                trigger: 'item',
                confine: true
            },
            legend: {
                bottom: 0,
                itemWidth: isMobile ? 12 : 16,
                itemHeight: isMobile ? 8 : 10,
                textStyle: {
                    fontSize: isMobile ? 11 : 12
                },
                data: seriesData.map(s => s.name)
            },
            radar: {
                indicator: indicators,
                shape: 'polygon',
                splitNumber: 5,
                center: ['50%', isMobile ? '47%' : '50%'],
                radius: isMobile ? '52%' : '60%',
                axisName: {
                    formatter: function (value, indicator) {
                        const p1Val = indicator.p1Val !== undefined ? formatAxisValue(indicator.p1Val) : '';
                        const p2Val = indicator.p2Val !== undefined ? formatAxisValue(indicator.p2Val) : '';
                        const isTopIndicator = indicators[0]?.name === value;

                        if (p1Val !== '' && p2Val !== '') {
                            if (isTopIndicator) {
                                return `{name|${value}}\n{p1|${p1Val}} : {p2|${p2Val}}`;
                            }
                            return `{name|${value}}\n{p1|${p1Val}}\n{p2|${p2Val}}`;
                        } else if (p1Val !== '') {
                            if (isTopIndicator) {
                                return `{name|${value}}\n{p1|${p1Val}}`;
                            }
                            return `{name|${value}}\n{p1|${p1Val}}`;
                        } else if (p2Val !== '') {
                            if (isTopIndicator) {
                                return `{name|${value}}\n{p2|${p2Val}}`;
                            }
                            return `{name|${value}}\n{p2|${p2Val}}`;
                        } else {
                            return `{name|${value}}`;
                        }
                    },
                    rich: {
                        p1: { color: '#111', fontSize: isMobile ? 11 : 13, fontWeight: 'bold', align: 'center', padding: [0, 4] },
                        p2: { color: '#ff6a00', fontSize: isMobile ? 11 : 13, fontWeight: 'bold', align: 'center', padding: [0, 4] },
                        name: { color: '#606266', fontSize: isMobile ? 10 : 12, align: 'center', padding: [2, 0, 0, 0] }
                    }
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
        handleExportCommand
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

/* 强制应用磨砂玻璃风格，文字颜色使用深色以保持对比度 */
:deep(.player-select .el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3) inset !important;
  border-radius: 18px !important;
  padding: 4px 12px !important;
  transition: all 0.3s ease;
}

:deep(.player-select .el-input__wrapper:hover) {
  background-color: rgba(255, 255, 255, 0.25) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5) inset !important;
}

:deep(.player-select .el-input__wrapper.is-focus) {
  background-color: rgba(255, 255, 255, 0.3) !important;
  box-shadow: 0 0 0 1px #FFFFFF inset !important;
}

:deep(.player-select .el-input__inner) {
  color: #303133 !important;
  font-weight: 600;
  text-shadow: none;
}

:deep(.player-select .el-input__inner::placeholder) {
  color: #606266 !important;
  opacity: 0.8;
}

:deep(.player-select .el-input__suffix .el-icon) {
  color: #606266 !important;
}

.custom-select-label {
  color: #606266;
  font-size: 12px;
  margin-right: 8px;
  font-weight: 600;
  text-shadow: none;
  white-space: nowrap;
}

.info-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  /* margin-left: 8px; 移除这里的margin，由父容器padding控制 */
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

/* 添加单选按钮内容的 flex 布局及图标大小控制 */
.role-btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.role-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  /* 默认状态（未激活）：通过极高亮度和零饱和度，强行把任何图标变纯白 */
  filter: brightness(0) invert(1);
  transition: all 0.3s;
}

/* 调整单选按钮的内边距，使其变成更匀称的正方形或小矩形 */
:deep(.el-radio-button__inner) {
  padding: 8px 12px; 
}

/* 当单选按钮被选中时，转换为主题橙色 */
:deep(.el-radio-button.is-active .role-icon) {
  filter: invert(56%) sepia(91%) saturate(1636%) hue-rotate(357deg) brightness(98%) contrast(106%);
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

.vis-card {
  height: auto;
  display: block;
  overflow: visible;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.vis-card:hover {
  box-shadow: none;
}

.card-content {
  min-height: 360px;
  padding: 0;
  display: block;
}

.chart-container {
  width: 100%;
  height: 360px;
}

.info-icon {
  color: #8a8f98;
  font-size: 17px;
}

.info-icon:hover,
.export-btn:hover {
  color: #ff8a00;
}

.export-btn {
  color: #68707d;
  font-size: 13px;
}

.custom-select-label {
  color: #69707d;
  font-weight: 600;
}

.header-controls :deep(.el-radio-group) {
  padding: 2px !important;
  background: #f1f2f4 !important;
  border: 1px solid rgba(17, 17, 17, 0.08) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
}

.header-controls :deep(.el-radio-button__inner) {
  color: #69707d !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

.header-controls :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #111 !important;
  background: #fff !important;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.08) !important;
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

.role-icon {
  opacity: 0.82;
  filter: grayscale(1) contrast(0.35);
}

:deep(.el-radio-button.is-active .role-icon) {
  opacity: 1;
  filter: invert(56%) sepia(91%) saturate(1636%) hue-rotate(357deg) brightness(98%) contrast(106%);
}

@media (max-width: 768px) {
  .card-content {
    min-height: 300px;
  }

  .chart-container {
    height: 330px;
  }

  .header-controls {
    width: 100%;
    margin-top: 0;
    gap: 8px;
  }

  .role-radio-group,
  .player-selectors,
  .player-select {
    width: 100%;
  }

  .header-controls :deep(.el-select .el-input__wrapper) {
    min-height: 36px !important;
    border-radius: 8px !important;
  }
}
</style>
