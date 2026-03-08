<template>
  <div class="vis-card">
    <SlantedTitle title="选手个人数据">
      <template #title-suffix>
        <el-tooltip content="展示选手在不同维度的表现分布（默认显示综合数据Top5选手）" placement="top">
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
          <el-radio-group v-model="playerRole" size="small" @change="updatePlayerStatsChart" class="role-radio-group">
            <el-radio-button label="tank">坦克</el-radio-button>
            <el-radio-button label="damage">输出</el-radio-button>
            <el-radio-button label="support">辅助</el-radio-button>
          </el-radio-group>
          <div class="select-wrapper">
            <el-select 
              v-model="playerFilter" 
              placeholder="" 
              :disabled="!seasonId" 
              class="player-select-input"
              multiple
              collapse-tags
              collapse-tags-tooltip
              popper-class="player-select-dropdown"
              size="small"
            >
              <template #prefix>
                <span class="custom-select-label">选手筛选列表</span>
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
    </SlantedTitle>
    <div class="card-content">
      <div ref="playerStatsChart" class="chart-container"></div>
      
      <div class="leaderboard-section">
        <div class="leaderboard-header">
          <span class="leaderboard-title" v-if="playerRole === 'tank'">坦克选手排行榜</span>
          <span class="leaderboard-title" v-else-if="playerRole === 'damage'">输出选手排行榜</span>
          <span class="leaderboard-title" v-else-if="playerRole === 'support'">辅助选手排行榜</span>
        </div>
        
        <el-table 
          ref="playerStatsTable"
          :data="displayedPlayerLeaderboard" 
          style="width: 100%" 
          size="small"
          :row-class-name="tableRowClassName"
          @sort-change="handleSortChange"
        >
          <el-table-column type="index" label="排名" width="60" align="center" fixed>
            <template #default="scope">
              <span :class="getRankClass(scope.$index)">{{ scope.$index + 1 }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="playerName" label="选手" min-width="120" fixed>
            <template #default="scope">
              <div class="player-cell">
                <img v-if="scope.row.logo" :src="scope.row.logo" class="team-logo-small" alt="" />
                <div class="player-info">
                  <span class="player-name">{{ scope.row.playerName }}</span>
                  <span class="team-name-sub">{{ scope.row.teamName }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <!-- Tank Columns -->
          <template v-if="playerRole === 'tank'">
            <el-table-column key="tank-mit" prop="mitigationPer10" label="抵挡/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
               <template #default="scope">
                 <span class="stat-highlight">{{ scope.row.mitigationPer10 }}</span>
               </template>
            </el-table-column>
            <el-table-column key="tank-kd" prop="kd" label="K/D" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="tank-dmg" prop="damagePer10" label="伤害/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="tank-elims" prop="elimsPer10" label="消灭/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="tank-assists" prop="assistsPer10" label="助攻/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
          </template>

          <!-- Damage Columns -->
          <template v-else-if="playerRole === 'damage'">
            <el-table-column key="dmg-elims" prop="elimsPer10" label="消灭/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
               <template #default="scope">
                 <span class="stat-highlight">{{ scope.row.elimsPer10 }}</span>
               </template>
            </el-table-column>
            <el-table-column key="dmg-kd" prop="kd" label="K/D" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="dmg-dmg" prop="damagePer10" label="伤害/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="dmg-deaths" prop="deathsPer10" label="死亡/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
          </template>

          <!-- Support Columns -->
          <template v-else-if="playerRole === 'support'">
            <el-table-column key="supp-kad" prop="kad" label="KA/D" width="80" align="center" sortable="custom" :sort-orders="['descending', 'ascending']">
               <template #default="scope">
                 <span class="stat-highlight">{{ scope.row.kad }}</span>
               </template>
            </el-table-column>
            <el-table-column key="supp-dmg" prop="damagePer10" label="伤害/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="supp-heal" prop="healingPer10" label="治疗/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="supp-elims" prop="elimsPer10" label="消灭/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
            <el-table-column key="supp-assists" prop="assistsPer10" label="助攻/10min" width="110" align="center" sortable="custom" :sort-orders="['descending', 'ascending']" />
          </template>
          
          <el-table-column prop="duration" label="时长(分)" width="90" align="center" />
        </el-table>
        
        <div class="leaderboard-footer" v-if="playerLeaderboardData.length > 3">
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
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { InfoFilled, ArrowDown, ArrowUp, Download } from '@element-plus/icons-vue';
import SlantedTitle from './SlantedTitle.vue';
import ChartExportPreview from './ChartExportPreview.vue';
import { useChartExport } from '@/composables/useChartExport';

export default {
  name: 'PlayerStatsChart',
  components: {
    InfoFilled,
    SlantedTitle,
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
    const playerStatsChart = ref(null);
    const playerFilter = ref([]);
    const playerRole = ref('damage');
    const allPlayerStats = ref([]);
    const teamLogoSizes = ref(new Map());
    const isExpanded = ref(false);
    const sortState = ref({ prop: '', order: '' });
    const playerStatsTable = ref(null);
    let playerChart = null;

    const { showPreview, previewImage, handleExportChart } = useChartExport();
    const handleExport = () => {
        const season = store.getters.getSeasonById(props.seasonId);
        const seasonName = season ? season.name : '';
        handleExportChart(playerChart, seasonName);
    };
    
    // 初始化默认排序
    const setDefaultSort = () => {
        if (playerRole.value === 'tank') {
            sortState.value = { prop: 'mitigationPer10', order: 'descending' };
        } else if (playerRole.value === 'damage') {
            sortState.value = { prop: 'elimsPer10', order: 'descending' };
        } else if (playerRole.value === 'support') {
            sortState.value = { prop: 'kad', order: 'descending' };
        }
    };
    
    // 监听角色变化，重置默认排序
    watch(playerRole, async () => {
        setDefaultSort();
        await nextTick();
        if (playerStatsTable.value) {
            const { prop, order } = sortState.value;
            playerStatsTable.value.sort(prop, order);
        }
    }, { immediate: true });

    const handleSortChange = ({ prop, order }) => {
        sortState.value = { prop, order };
    };

    const playerLeaderboardData = computed(() => {
        let stats = allPlayerStats.value.filter(s => s.role === playerRole.value);
        
        // Calculate stats
        const processed = stats.map(item => {
            const duration = item.gameTime || 0;
            if (duration === 0) return null;
            
            // Helper for per 10min
            const p10 = (val) => parseFloat(((val || 0) / duration * 10).toFixed(2));
            
            const deaths = item.deaths || 0;
            const kills = item.elims || 0;
            const assists = item.assists || 0;
            
            let kd = kills;
            if (deaths > 0) kd = parseFloat((kills / deaths).toFixed(2));
            
            let kad = kills + assists;
            if (deaths > 0) kad = parseFloat(((kills + assists) / deaths).toFixed(2));

            return {
                ...item,
                playerName: item.playerName || item.player?.name || '未知选手',
                teamName: item.teamName || item.team?.name || '未知队伍',
                logo: item.team ? item.team.logo : null,
                duration: Math.round(duration),
                
                // Common stats
                kd,
                kad,
                damagePer10: p10(item.damage),
                elimsPer10: p10(item.elims),
                deathsPer10: p10(item.deaths),
                assistsPer10: p10(item.assists),
                healingPer10: p10(item.healing),
                mitigationPer10: p10(item.mitigation)
            };
        }).filter(s => s !== null);

        // Dynamic sorting
        const { prop, order } = sortState.value;
        if (!prop || !order) {
             // Fallback to default sort based on role
             if (playerRole.value === 'tank') {
                 return processed.sort((a, b) => b.mitigationPer10 - a.mitigationPer10);
             } else if (playerRole.value === 'damage') {
                 return processed.sort((a, b) => b.elimsPer10 - a.elimsPer10);
             } else if (playerRole.value === 'support') {
                 return processed.sort((a, b) => b.kad - a.kad);
             }
             return processed;
        }

        return processed.sort((a, b) => {
            let result = 0;
            if (a[prop] > b[prop]) result = 1;
            else if (a[prop] < b[prop]) result = -1;
            
            return order === 'descending' ? -result : result;
        });
    });

    const displayedPlayerLeaderboard = computed(() => {
        if (isExpanded.value) {
            return playerLeaderboardData.value;
        }
        return playerLeaderboardData.value.slice(0, 3);
    });

    const getRankClass = (index) => {
        if (index === 0) return 'rank-1';
        if (index === 1) return 'rank-2';
        if (index === 2) return 'rank-3';
        return 'rank-normal';
    };

    const tableRowClassName = ({ rowIndex }) => {
        if (rowIndex < 3) return 'top-rank-row';
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
        // 注意：这里我们使用 teamId 作为 key，因为多个选手可能属于同一队
        const teamId = item.team ? item.team.id : null;
        
        if (logo && teamId && !teamLogoSizes.value.has(teamId)) {
           const size = await preloadImage(logo);
           if (size && size.height > 0) {
             const MAX_WIDTH = 25;
             const MAX_HEIGHT = 15;
             
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
      // 从 allPlayerStats 中提取选手信息
      let stats = allPlayerStats.value;
      
      if (playerRole.value) {
        stats = stats.filter(s => s.role === playerRole.value);
      }
      
      // 去重并返回格式化后的选手列表
      const playersMap = new Map();
      stats.forEach(s => {
        if (s.playerId && !playersMap.has(s.playerId)) {
          playersMap.set(s.playerId, {
            id: s.playerId,
            name: s.playerName || s.player?.name || '未知选手'
          });
        }
      });
      
      return Array.from(playersMap.values());
    });

    // 渲染选手图表（纯前端过滤和渲染）
    const renderPlayerChart = () => {
        if (!playerChart) return;
        
        let filteredStats = [];
        
        // 确保只显示当前角色的数据
        let roleStats = allPlayerStats.value;
        if (playerRole.value) {
            roleStats = roleStats.filter(s => s.role === playerRole.value);
        }
        
        if (playerFilter.value && playerFilter.value.length > 0) {
             const selectedIds = playerFilter.value.map(id => Number(id));
             
             filteredStats = roleStats.filter(item => {
                 return selectedIds.includes(Number(item.playerId));
             });
        } else {
             filteredStats = roleStats;
        }

        let xAxisName = '';
        let yAxisName = '';
        let xKey = '';
        let calculateY = () => 0;
        let yInverse = false;
        
        switch (playerRole.value) {
            case 'tank':
                xAxisName = '抵挡/10min';
                yAxisName = 'K/D';
                xKey = 'mitigationPerMin';
                calculateY = (item) => item.kd || 0;
                break;
            case 'damage':
                xAxisName = '伤害/10min';
                yAxisName = 'K/D';
                xKey = 'damagePerMin';
                calculateY = (item) => item.kd || 0;
                break;
            case 'support':
                xAxisName = '治疗/10min';
                yAxisName = 'KA/D';
                xKey = 'healingPerMin';
                calculateY = (item) => item.kad || 0;
                break;
            default:
                xAxisName = '伤害/10min';
                yAxisName = 'K/D';
                xKey = 'damagePerMin';
                calculateY = (item) => item.kd || 0;
        }
        
        // 计算全局最大值和最小值用于固定坐标轴
        // 初始化为极端值
        let globalMaxX = -Infinity;
        let globalMinX = Infinity;
        let globalMaxY = -Infinity;
        let globalMinY = Infinity;
        
        roleStats.forEach(item => {
            const xVal = item[xKey] * 10;
            const yVal = calculateY(item);
            
            if (xVal > globalMaxX) globalMaxX = xVal;
            if (xVal < globalMinX) globalMinX = xVal;
            
            if (yVal > globalMaxY) globalMaxY = yVal;
            if (yVal < globalMinY) globalMinY = yVal;
        });

        // 如果没有数据，重置为默认值
        if (globalMaxX === -Infinity) { globalMaxX = 100; globalMinX = 0; }
        if (globalMaxY === -Infinity) { globalMaxY = 100; globalMinY = 0; }

        // 计算 padding，使散点不贴边
        const xPadding = (globalMaxX - globalMinX) * 0.1 || 10;
        const yPadding = (globalMaxY - globalMinY) * 0.1 || 10;

        // 设置坐标轴范围
        // 确保 min 不小于 0 (除非有负数数据，这里假设没有)
        const xMin = Math.max(0, Math.floor((globalMinX - xPadding) * 100) / 100); 
        const xMax = Math.ceil((globalMaxX + xPadding) * 100) / 100;
        
        const yMin = Math.max(0, Math.floor((globalMinY - yPadding) * 100) / 100);
        const yMax = Math.ceil((globalMaxY + yPadding) * 100) / 100;
        
        const seriesData = filteredStats.map(item => {
            const xVal = parseFloat((item[xKey] * 10).toFixed(2));
            const yVal = parseFloat(calculateY(item).toFixed(2));
            
            // 使用新数据的关联对象，或者回退到直接存储的字段
            const logo = item.team ? item.team.logo : null;
            const teamId = item.team ? item.team.id : item.teamId;
            const playerName = item.playerName || item.player?.name || '未知选手';
            const teamName = item.teamName || item.team?.name || '未知队伍';
            
            let symbolSize = 8;
            if (logo) {
                symbolSize = teamLogoSizes.value.get(teamId) || 12;
            }

            return {
                name: playerName,
                value: [xVal, yVal, playerName, teamName],
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
               const logo = params.data.symbol.replace('image://', '');
               const logoHtml = logo && logo !== 'circle' 
                 ? `<img src="${logo}" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; margin-right: 8px;">` 
                 : '';

               return `
                 <div style="font-weight: 500; margin-bottom: 8px; border-bottom: 1px solid #EBEEF5; padding-bottom: 4px; display: flex; align-items: center;">
                   ${logoHtml}
                   <div style="display: flex; flex-direction: column; line-height: 1.2;">
                     <span style="font-weight: 600; color: #303133; font-size: 13px;">${params.data.value[2]}</span>
                     <span style="font-size: 11px; color: #909399;">${params.data.value[3] || '未知队伍'}</span>
                   </div>
                 </div>
                 <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 4px;">
                   <span style="color: #606266;">${xAxisName}:</span>
                   <span style="font-weight: bold; color: #FF9E0F;">${params.data.value[0]}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; gap: 15px;">
                   <span style="color: #606266;">${yAxisName}:</span>
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
            name: yAxisName,
            inverse: yInverse,
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
              symbolSize: 10,
              data: seriesData,
              itemStyle: {
                  color: function(params) {
                      const colors = [
                        '#FF9E0F', '#FF6A00', '#F56C6C', '#E6A23C', 
                        '#409EFF', '#67C23A', '#909399', '#303133'
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
                  textBorderWidth: 2,
                  fontFamily: 'Inter, sans-serif'
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
                series: []
              }
            }
          ]
        };
        
        playerChart.setOption(option, true);
    };

    // 更新选手数据图表
    const updatePlayerStatsChart = async () => {
      if (!playerChart) return;
      
      if (!props.seasonId) return;

      try {
        playerChart.showLoading({
          color: '#FF9E0F',
          textColor: '#FF9E0F',
          maskColor: 'rgba(255, 255, 255, 0.8)'
        });
        
        // 使用新的赛季数据接口
        const response = await apiService.getSeasonPlayerStats(props.seasonId);
        
        // Pre-calculate stats from primary data (ignoring backend pre-calculated fields)
        const processedResponse = (response || []).map(item => {
            const duration = item.gameTime || 0;
            const perMin = (val) => duration > 0 ? (val || 0) / duration : 0;
            
            // Calculate totals for KD/KAD
            const kills = item.elims || 0;
            const deaths = item.deaths || 0;
            const assists = item.assists || 0;
            
            let kd = kills;
            if (deaths > 0) kd = kills / deaths;
            
            let kad = kills + assists;
            if (deaths > 0) kad = (kills + assists) / deaths;

            return {
                ...item,
                // Overwrite pre-calculated fields with on-the-fly calculations
                mitigationPerMin: perMin(item.mitigation),
                elimsPerMin: perMin(item.elims),
                deathsPerMin: perMin(item.deaths),
                damagePerMin: perMin(item.damage),
                healingPerMin: perMin(item.healing),
                assistsPerMin: perMin(item.assists),
                // Ensure KD/KAD are consistent
                kd: parseFloat(kd.toFixed(2)),
                kad: parseFloat(kad.toFixed(2))
            };
        });

        allPlayerStats.value = processedResponse;
        await loadTeamLogos(allPlayerStats.value);
        
        // 获取当前角色的所有数据用于计算Top 5
        const roleStats = allPlayerStats.value.filter(s => s.role === playerRole.value);
        const availablePlayerIds = roleStats.map(p => p.playerId).filter(id => id);
        
        // 自动选择Top 5逻辑
        if (playerFilter.value.length === 0) {
            const statsWithScore = roleStats.map(item => {
                let score = 0;
                // 数据已经是每分钟，转换为每10分钟以保持逻辑一致
                const per10 = (val) => (val || 0) * 10;

                if (playerRole.value === 'tank') {
                    const mit = per10(item.mitigationPerMin);
                    const dth = per10(item.deathsPerMin);
                    score = mit / (dth + 0.1);
                } else if (playerRole.value === 'damage') {
                    const dmg = per10(item.damagePerMin);
                    const elim = per10(item.elimsPerMin);
                    score = elim * 1000 + dmg;
                } else if (playerRole.value === 'support') {
                    const heal = per10(item.healingPerMin);
                    const ast = per10(item.assistsPerMin);
                    score = heal + ast * 1000;
                }

                return { ...item, score };
            });

            statsWithScore.sort((a, b) => b.score - a.score);

            const top5 = statsWithScore.slice(0, 5);
            playerFilter.value = top5.map(p => p.playerId).filter(id => id);
            
            if (playerFilter.value.length === 0 && availablePlayerIds.length > 0) {
                 playerFilter.value = availablePlayerIds;
            }
        } else {
             // 过滤掉不再当前列表中的ID
             // 注意：这里需要检查所有 allPlayerStats 中的ID，因为 playerFilter 可能包含其他角色的ID（虽然切换角色会重置，但为了健壮性）
             const allIds = allPlayerStats.value.map(p => p.playerId);
             playerFilter.value = playerFilter.value.filter(id => allIds.includes(Number(id)));
             
             if (playerFilter.value.length === 0) {
                 // 如果过滤后为空，重新计算Top 5
                 const statsWithScore = roleStats.map(item => {
                    let score = 0;
                    const per10 = (val) => (val || 0) * 10;

                    if (playerRole.value === 'tank') {
                        const mit = per10(item.mitigationPerMin);
                        const dth = per10(item.deathsPerMin);
                        score = mit / (dth + 0.1);
                    } else if (playerRole.value === 'damage') {
                        const dmg = per10(item.damagePerMin);
                        const elim = per10(item.elimsPerMin);
                        score = elim * 1000 + dmg;
                    } else if (playerRole.value === 'support') {
                        const heal = per10(item.healingPerMin);
                        const ast = per10(item.assistsPerMin);
                        score = heal + ast * 1000;
                    }
                    return { ...item, score };
                });
                statsWithScore.sort((a, b) => b.score - a.score);
                const top5 = statsWithScore.slice(0, 5);
                playerFilter.value = top5.map(p => p.playerId).filter(id => id);
                
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
    watch(() => props.seasonId, () => {
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
      updatePlayerStatsChart,
      playerLeaderboardData,
      displayedPlayerLeaderboard,
      isExpanded,
      getRankClass,
      tableRowClassName,
      handleSortChange,
      showPreview,
      previewImage,
      handleExport
    };
  }
};
</script>

<style scoped>
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

.player-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-logo-small {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.player-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.player-name {
  font-weight: 600;
  color: #303133;
  font-size: 13px;
}

.team-name-sub {
  font-size: 11px;
  color: #909399;
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
  font-size: 18px; /* 稍微调大一点 */
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: color 0.3s;
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
    display: none;
  }
}

.chart-container {
  width: 100%;
  height: 450px;
}

.player-select-input {
  width: 200px;
}

.role-radio-group {
  margin-right: 8px;
}

.custom-select-label {
  color: #606266;
  font-size: 12px;
  line-height: 24px; /* Match small size input height approx */
  white-space: nowrap;
}

@media (max-width: 768px) {
  .header-controls {
    display: flex; /* 改回 flex 以便控制换行 */
    flex-wrap: wrap;
    width: 100%;
    margin-top: 8px;
    gap: 8px;
  }
  
  .role-radio-group {
    margin-right: 0;
    width: 100%; /* 独占一行 */
    display: flex;
  }
  
  /* 让 Radio Button 充满宽度 */
  :deep(.el-radio-group) {
    width: 100%;
    display: flex;
  }
  :deep(.el-radio-button) {
    flex: 1;
  }
  :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 8px 0;
    text-align: center;
  }

  .select-wrapper {
    width: 100%; /* Select 独占一行 */
    margin-top: 4px;
  }

  .player-select-input {
    width: 100%;
  }

  .card-content {
    padding: 16px;
  }
  
  /* 调整 Radio Button 在移动端的样式 */
  :deep(.el-radio-button__inner) {
    padding: 6px 10px;
    font-size: 12px;
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