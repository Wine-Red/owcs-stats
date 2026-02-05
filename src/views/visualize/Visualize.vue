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

    <!-- 全局数据展示区 -->
    <div class="global-data-section">
      <h3 class="section-title">全局数据统计</h3>
      <div class="global-data-cards">
        <!-- 英雄禁用情况统计 -->
        <el-card class="data-card">
          <template #header>
            <div class="card-header">
              <span>英雄禁用情况统计</span>
            </div>
          </template>
          <div ref="heroBanChart" class="chart-container"></div>
        </el-card>

        <!-- 地图选取情况统计 -->
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>地图选取情况</span>
            </div>
          </template>
          <div class="chart-wrapper map-chart-wrapper" style="position: relative; height: 400px;">
            <div ref="mapPickChart" class="fog-chart" style="width: 100%; height: 100%"></div>
            <div class="map-type-icons-overlay">
              <div 
                v-for="(type, index) in mapPickTypes" 
                :key="type"
                class="map-type-icon-container"
                :style="{ top: `${((mapPickTypes.length - 1 - index) + 0.5) * 100 / mapPickTypes.length}%` }"
              >
                <img :src="getMapTypeIconUrl(type)" class="map-type-icon" :alt="type" />
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 可筛选数据展示区 -->
    <div class="filterable-data-section">
      <h3 class="section-title">详细数据统计</h3>
      
      <!-- 队伍数据卡片 -->
      <el-card class="filterable-data-card">
        <template #header>
          <div class="card-header">
            <span>队伍数据统计</span>
            <div class="card-filter">
              <el-select 
                v-model="teamFilter" 
                placeholder="" 
                :disabled="!filterForm.seasonId" 
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

      <!-- 选手个人数据卡片 -->
      <el-card class="filterable-data-card">
        <template #header>
          <div class="card-header">
            <span>选手个人数据</span>
            <div class="card-filter">
              <el-select v-model="playerFilter" placeholder="选择选手" :disabled="!filterForm.seasonId" style="width: 150px">
                <el-option label="全部选手" value="" />
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
    </div>


  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import apiService from '@/services/api';

// 地图名称到文件名的映射
const mapNameToFileName = {
  // 控制地图
  '南极半岛': 'Antarctic_Peninsula',
  '釜山': 'Busan',
  '伊利奥斯': 'Ilios',
  '漓江塔': 'Lijiang-tower',
  '尼泊尔': 'Nepal',
  '绿洲城': 'Oasis',
  '萨摩亚': 'Samoa',
  // 护送地图
  '香巴里寺院': '1067px-Shambali',
  '多拉多': 'Dorado',
  '哈瓦那': 'Havana',
  '渣客镇': 'Junkertown',
  '皇家赛道': 'Monte_Carlo',
  '里阿尔托': 'Rialto',
  '66号公路': 'Route-66',
  '监测站：直布罗陀': 'Watchpoint-gibraltar',
  // 闪点地图
  '阿特利斯': 'Aatlis',
  '新渣客城': 'New_Junk_City',
  '苏拉瓦萨': 'Suravasa',
  // 混合地图
  '暴雪世界': 'Blizzard-world',
  '艾兴瓦尔德': 'Eichenwalde',
  '好莱坞': 'Hollywood',
  '国王大道': 'Kings-row',
  '中城': 'Midtown',
  '努巴尼': 'Numbani',
  '帕拉伊苏': 'Paraiso',
  // 推进地图
  '斗兽场': 'Colosseo',
  '埃斯佩兰萨': 'Esperanca',
  '新皇后街': 'NewQueenStreet',
  '鲁纳塞彼': 'Runasapi'
};

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
    
    // 卡片独立筛选
    const teamFilter = ref([]);
    const playerFilter = ref('');
    
    // 图表引用
    const heroBanChart = ref(null);
    const mapPickChart = ref(null);
    const mapPickTypes = ref([]);
    const teamComparisonChart = ref(null);
    const playerStatsChart = ref(null);
    
    // 数据缓存
    const allTeamStats = ref([]);

    // 图表实例
    let heroBanChartInstance = null;
    let mapPickChartInstance = null;
    
    // 辅助函数：获取地图类型图标URL
    const getMapTypeIconUrl = (mapType) => {
      let logoFileName = 'control.png';
      switch(mapType) {
        case '闪点': logoFileName = 'flashpoint.png'; break;
        case '推进': logoFileName = 'push.png'; break;
        case '混合': logoFileName = 'hybrid.png'; break;
        case '护送': logoFileName = 'escort.png'; break;
        case '控制': logoFileName = 'control.png'; break;
      }
      return `/maps/logo/${logoFileName}`;
    };
    let teamChart = null;
    let playerChart = null;
    
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
      
      // 英雄禁用情况图表
      if (heroBanChart.value) {
        heroBanChartInstance = echarts.init(heroBanChart.value);
        updateHeroBanChart();
      }
      
      // 地图选取情况图表
      if (mapPickChart.value) {
        mapPickChartInstance = echarts.init(mapPickChart.value);
        updateMapPickChart();
      }
      
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
    };
    
    // 渲染队伍图表（纯前端过滤和渲染）
    const renderTeamChart = () => {
        if (!teamChart) return;

        // 根据 teamFilter 过滤数据
        // 注意：teamFilter 是 ref，包含了选中的 teamId 数组
        // allTeamStats 包含了所有队伍的数据
        
        let filteredStats = [];
        
        // 检查 teamFilter 是否有值
        if (teamFilter.value && teamFilter.value.length > 0) {
            // 将 teamFilter 中的值转换为数字（如果是字符串的话），以防类型不匹配
            // 通常 el-select 的 value 绑定的是 ID，类型应该一致，但为了保险起见
            const selectedIds = teamFilter.value.map(id => Number(id));
            
            filteredStats = allTeamStats.value.filter(item => {
                // 确保 item.teamId 和 selectedIds 中的 ID 类型一致
                return selectedIds.includes(Number(item.teamId));
            });
        } else {
            // 如果未选中任何队伍，则显示为空
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

        // 稍微放大一点作为最大刻度，保持美观 (例如增加 5-10% 的余量，并取整)
        const xMax = Math.ceil(globalMaxDamage * 1.1 / 100) * 100; // 向上取整到百位
        const yMax = Math.ceil(globalMaxKD * 1.1 * 10) / 10;       // 向上取整到0.1位

        // 2. 处理当前筛选出的数据 for Scatter Plot
        const seriesData = filteredStats.map(item => {
            const teamName = item.team ? item.team.name : (item.teamName || '未知队伍');
            
            // totalDuration is in minutes (based on user input).
            const durationMinutes = item.totalDuration || 0;
            
            let damagePer10 = 0;
            let kd = 0;

            if (durationMinutes > 0) {
                // Formula: (Total Damage / Total Minutes) * 10
                // Total Damage is already the sum of all players' damage (backend aggregation)
                // Total Minutes is the sum of match durations the team played
                damagePer10 = parseFloat(((item.totalDamage / durationMinutes) * 10).toFixed(2));
            }

            const deaths = item.totalDeaths || 0;
            const kills = item.totalKills || 0;
            
            if (deaths > 0) {
                kd = parseFloat((kills / deaths).toFixed(2));
            } else {
                kd = kills; // 如果死亡为0，暂且用击杀数代替K/D
            }
            
            return {
                name: teamName,
                value: [damagePer10, kd, teamName],
                // Add teamId to data item for filtering/identification if needed
                teamId: item.teamId
            };
        });

        const option = {
          title: {
            show: false, // 隐藏标题
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
            scale: false, // 禁用自动缩放，使用固定的 min/max
            min: 0,
            max: xMax > 0 ? xMax : undefined // 如果没有数据，就不设置 max
          },
          yAxis: {
            type: 'value',
            name: 'K/D',
            scale: false, // 禁用自动缩放，使用固定的 min/max
            min: 0,
            max: yMax > 0 ? yMax : undefined // 如果没有数据，就不设置 max
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
                  // Generate a color based on index or name if needed, or use default
                  const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
                  return colors[params.dataIndex % colors.length];
                }
              }
            }
          ],
          // Responsive configuration
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
                        // label: {
                        //     show: false // Hide labels on small screens to avoid clutter
                        // }
                    }
                ]
              }
            }
          ]
        };
        
        teamChart.setOption(option, true); // true implies notMerge, completely reset option
    };

    // 更新队伍对比图表 (获取数据并渲染)
    const updateTeamComparisonChart = async () => {
      if (!teamChart) return;
      
      try {
        // 显示加载动画
        teamChart.showLoading();
        
        // 从API获取队伍统计数据 (获取该赛季所有队伍的数据，不做筛选)
        const params = {
          seasonId: filterForm.value.seasonId || null,
          teamIds: null // 获取所有队伍
        };
        const response = await apiService.getTeamStatsData(params);
        
        // 缓存数据
        allTeamStats.value = response;
        
        // 渲染图表
        renderTeamChart();
      } catch (error) {
        console.error('获取队伍数据失败:', error);
        
        // 显示默认数据
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
    

    
    // 更新英雄禁用情况图表
    const updateHeroBanChart = async () => {
      if (!heroBanChartInstance) return;
      
      try {
        // 显示加载动画
        heroBanChartInstance.showLoading();
        
        // 从API获取英雄禁用数据
        const params = {
          seasonId: filterForm.value.seasonId || null
        };
        const response = await apiService.getHeroBanStatsData(params);
        
        // 处理数据
        const heroDataRaw = response.data || [];
        const heroDataSorted = [...heroDataRaw].sort((a, b) => (b.banCount || 0) - (a.banCount || 0));
        const heroNames = heroDataSorted.map(item => item.heroName || '未知英雄');
        const banCounts = heroDataSorted.map(item => item.banCount || 0);
        
        // 显示数据
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: function(params) {
              const idx = params[0].dataIndex;
              const d = heroDataSorted[idx];
              return `${d.heroName}<br/>禁用次数: ${d.banCount}<br/>禁用率: ${d.banRate}%`;
            },
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderColor: '#ccc',
            textStyle: {
              color: '#fff'
            }
          },
          grid: {
            left: '2%',
            right: '10%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '禁用次数',
            nameLocation: 'middle',
            nameGap: 30,
            min: 0,
            minInterval: 1,
            axisLabel: {
              formatter: v => Math.floor(v)
            },
            splitLine: {
              lineStyle: {
                type: 'dashed'
              }
            }
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: heroNames,
            axisLabel: {
              interval: 0,
              rotate: 0,
              fontSize: 12,
              margin: 10
            },
            axisTick: {
              alignWithLabel: true
            }
          },
          series: [
            {
              name: '禁用次数',
              type: 'bar',
              data: banCounts,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#ff4d4f' },
                  { offset: 1, color: '#ff7875' }
                ]),
                borderRadius: [0, 4, 4, 0]
              },
              label: {
                show: true,
                position: 'right',
                formatter: function(params) {
                  const heroIndex = params.dataIndex;
                  return heroDataSorted[heroIndex].banCount;
                },
                fontSize: 12,
                fontWeight: 'bold'
              },
              animationDelay: function(idx) {
                return idx * 100;
              }
            }
          ],

          animationEasing: 'elasticOut',
          animationDelayUpdate: function(idx) {
            return idx * 5;
          },
          // 响应式配置
          media: [
            {
              query: { maxWidth: 768 },
              option: {
                grid: {
                  left: 0,
                  right: '10%',
                  bottom: 0,
                  top: 0
                }
              }
            }
          ]
        };
        
        heroBanChartInstance.setOption(option);
      } catch (error) {
        console.error('获取英雄禁用数据失败:', error);
        
        // 显示默认数据或空数据状态
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          grid: {
            left: '2%',
            right: '10%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: '禁用次数',
            nameLocation: 'middle',
            nameGap: 30,
            min: 0,
            minInterval: 1,
            axisLabel: {
              formatter: function(value) {
                return Math.max(1, Math.floor(value));
              }
            }
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: [],
            axisLabel: {
              interval: 0,
              margin: 10
            },
            axisTick: {
              alignWithLabel: true
            }
          },
          series: [
            {
              name: '禁用次数',
              type: 'bar',
              data: [],
              itemStyle: {
                color: '#ff4d4f'
              }
            }
          ],
          graphic: {
            elements: [
              {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                  text: '暂无英雄禁用数据',
                  fontSize: 16,
                  fontWeight: 'bold',
                  fill: '#999'
                }
              }
            ]
          }
        };
        
        heroBanChartInstance.setOption(option, true);
      } finally {
        heroBanChartInstance.hideLoading();
      }
    };
    
    // 更新地图选取情况图表
    const updateMapPickChart = async () => {
      if (!mapPickChartInstance) return;
      
      try {
        // 显示加载动画
        mapPickChartInstance.showLoading();
        
        // 从API获取地图选取数据
        const params = {
          seasonId: filterForm.value.seasonId || null
        };
        const response = await apiService.getMapPickStatsData(params);
        
        // 处理数据
        const mapData = response.data || [];
        
        // 准备图表数据
        const mapTypes = mapData.map(item => item.mapType);
        mapPickTypes.value = mapTypes; // Update reactive ref
        const series = [];
        const legendData = [];
        
        // 辅助函数：获取地图图片URL
        const getMapImageUrl = (mapName, mapType) => {
          let mapTypeFolder = '';
          
          // 根据地图类型确定文件夹
          switch(mapType) {
            case '控制':
              mapTypeFolder = 'control';
              break;
            case '护送':
              mapTypeFolder = 'escort';
              break;
            case '混合':
              mapTypeFolder = 'hybrid';
              break;
            case '推进':
              mapTypeFolder = 'push';
              break;
            case '闪点':
              mapTypeFolder = 'flashpoint';
              break;
            default:
              mapTypeFolder = 'control';
          }
          
          // 根据地图名称构建图片文件名
          let imgName = mapName;
          
          if (mapNameToFileName[imgName]) {
            imgName = mapNameToFileName[imgName];
          } else {
            // 对于未映射的地图，使用默认处理
            imgName = imgName.replace(/\s+/g, '_');
          }
          
          return `/maps/${mapTypeFolder}/${imgName}.jpg`;
        };
        
        // 为每个地图类型创建一个堆叠组
        mapData.forEach((typeData, index) => {
          typeData.maps.forEach(map => {
            // 检查地图是否已经在图例中
            if (!legendData.includes(map.mapName)) {
              legendData.push(map.mapName);
            }
            
            // 创建或更新该地图的系列数据
            let mapSeries = series.find(s => s.name === map.mapName);
            if (!mapSeries) {
              // 在创建series时就计算好图片URL
              const imgUrl = getMapImageUrl(map.mapName, typeData.mapType);
              
              mapSeries = {
                name: map.mapName,
                type: 'bar',
                stack: 'total',
                emphasis: {
                  focus: 'series'
                },
                data: new Array(mapData.length).fill(0),
                itemStyle: {
                  // 直接使用URL字符串作为pattern
                  color: {
                    type: 'pattern',
                    image: imgUrl,
                    repeat: 'repeat-x',
                    imageHeight: '100%'
                  },
                  opacity: 0.8
                }
              };
              series.push(mapSeries);
            }
            
            // 设置该地图在对应类型中的选取率
            mapSeries.data[index] = parseFloat(map.pickRate);
          });
        });

        // 预处理：为每张地图图片添加CSS滤镜效果
        // 注意：由于ECharts不支持直接对pattern图片应用CSS滤镜，
        // 我们需要通过Canvas预处理图片来实现"轻微模糊+提亮+降饱和"的效果
        const processMapImage = (imgUrl) => {
          return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = img.width;
              canvas.height = img.height;
              
              // 应用滤镜: 模糊2px, 亮度1.1, 饱和度0.6, 对比度0.8
              ctx.filter = 'blur(1.8px) brightness(0.9) saturate(1.2) contrast(0.9)';
              ctx.drawImage(img, 0, 0);
              
              resolve(canvas.toDataURL());
            };
            img.onerror = () => {
              // 如果加载失败，回退到原始URL
              resolve(imgUrl);
            };
            img.src = imgUrl;
          });
        };

        // 异步加载并处理所有图片
        const processedSeries = await Promise.all(series.map(async (s) => {
          const originalImgUrl = s.itemStyle.color.image;
          const processedUrl = await processMapImage(originalImgUrl);
          
          return {
            ...s,
            itemStyle: {
              ...s.itemStyle,
              color: {
                ...s.itemStyle.color,
                image: processedUrl
              }
            }
          };
        }));
        
        // 显示数据
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: function(params) {
              let result = `${params[0].axisValue}<br/>`;
              
              params.forEach(param => {
                if (param.value > 0) {
                  result += `${param.marker}${param.seriesName}: ${param.value}%<br/>`;
                }
              });
              
              return result;
            }
          },
          grid: {
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            containLabel: false
          },
          xAxis: {
            type: 'value',
            max: 100,
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          yAxis: {
            type: 'category',
            data: mapTypes,
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          // 添加地图类型logo图片
          graphic: [
            {
              type: 'rect',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              style: {
                fill: 'rgba(255, 255, 255, 0.2)'
              },
              z: 5,
              silent: true
            }
          ],
          series: processedSeries.map(item => ({
            ...item,
            barWidth: '100%', // 使条形图占满整个y轴刻度，消除间距
            itemStyle: {
              ...item.itemStyle,
              borderRadius: 0,
              borderColor: '#ffffff',
              borderWidth: 2
            }
          })),
          animationEasing: 'elasticOut',
          animationDelayUpdate: function(idx) {
            return idx * 5;
          },
          // 响应式配置
          media: [
            {
              query: { maxWidth: 768 },
              option: {
                grid: {
                  left: 0,
                  right: 0,
                  bottom: 0,
                  top: 0
                }
              }
            }
          ]
        };
        
        mapPickChartInstance.setOption(option);
      } catch (error) {
        console.error('获取地图选取数据失败:', error);
        
        // 显示默认数据
        const option = {
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          grid: {
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            containLabel: false
          },
          xAxis: {
            type: 'value',
            max: 100,
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          yAxis: {
            type: 'category',
            data: ['推进', '护送', '控制', '混合', '闪点'],
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
          },
          series: [],
          graphic: {
            elements: [
              {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                  text: '暂无地图选取数据',
                  fontSize: 16,
                  fontWeight: 'bold',
                  fill: '#999'
                }
              }
            ]
          }
        };
        
        mapPickChartInstance.setOption(option);
      } finally {
        mapPickChartInstance.hideLoading();
      }
    };
    
    // 更新所有图表
    const updateCharts = async () => {
      await nextTick();
      
      await Promise.all([
        updateHeroBanChart(),
        updateMapPickChart(),
        updateTeamComparisonChart(),
        updatePlayerStatsChart()
      ]);
    };
    
    // 处理赛季变化
    const handleSeasonChange = async () => {
      // 当赛季变化时，重置所有筛选选择
      filterForm.value.teamIds = [];
      filterForm.value.playerIds = [];
      filterForm.value.heroIds = [];
      teamFilter.value = [];
      playerFilter.value = '';
      
      // 加载赛季的队伍关联数据
      if (filterForm.value.seasonId) {
        try {
          await store.dispatch('getSeasonTeams', filterForm.value.seasonId);
          
          // 默认全选该赛季的队伍
          const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === filterForm.value.seasonId);
          const teamIdsInSeason = seasonTeams.map(st => st.teamId);
          teamFilter.value = teamIdsInSeason;
          
          // 更新图表
          updateTeamComparisonChart();
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
      
      // 重置卡片独立筛选
      teamFilter.value = [];
      playerFilter.value = '';
      
      // 加载默认赛季的队伍关联数据
      if (inProgressSeason) {
        try {
          await store.dispatch('getSeasonTeams', inProgressSeason.id);
          
          // 默认全选该赛季的队伍
          const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === inProgressSeason.id);
          const teamIdsInSeason = seasonTeams.map(st => st.teamId);
          teamFilter.value = teamIdsInSeason;
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
      
      updateCharts();
    };
    

    
    // 响应式调整
    const handleResize = () => {
      heroBanChartInstance?.resize();
      mapPickChartInstance?.resize();
      teamChart?.resize();
      playerChart?.resize();
    };
    
    // 监听 teamFilter 变化，实时更新图表
    watch(teamFilter, () => {
        renderTeamChart();
    }, { deep: true });

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
          
          // 默认全选该赛季的队伍
          const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === inProgressSeason.id);
          const teamIdsInSeason = seasonTeams.map(st => st.teamId);
          teamFilter.value = teamIdsInSeason;
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
      heroBanChartInstance?.dispose();
      mapPickChartInstance?.dispose();
      teamChart?.dispose();
      playerChart?.dispose();
    });
    
    return {
      filterForm,
      teamFilter,
      playerFilter,
      seasons,
      teams,
      heroes,
      getFilteredPlayers,
      heroBanChart,
      mapPickChart,
      mapPickTypes,
      getMapTypeIconUrl,
      teamComparisonChart,
      playerStatsChart,
      updateCharts,
      handleSeasonChange,
      resetFilter
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

.filterable-data-card {
  margin-bottom: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

/* 卡片通用样式 */
.data-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
}

.card-filter {
  display: flex;
  gap: 10px;
}

/* 图表容器样式 */
.chart-container {
  width: 100%;
  height: 400px;
}

.map-type-icons-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让鼠标事件穿透到下层图表 */
  z-index: 10;
}

.map-type-icon-container {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  /* 初始位置修正，根据图表逻辑 */
}

.map-type-icon {
  width: 45px;
  height: 45px;
  /* 图标保持清晰，不继承父级filter，因为父级filter在.fog-chart上 */
}

/* 卡片内边距调整，确保图表完全填充 */
.el-card__body {
  padding: 0 !important;
}

/* 导出卡片样式 */
.export-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.export-buttons {
  display: flex;
  gap: 10px;
  padding: 15px 0;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .global-data-cards {
    grid-template-columns: 1fr;
  }
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
  
  .chart-container {
    height: 400px;
  }
  
  .export-buttons {
    flex-direction: column;
  }
  
  .export-buttons .el-button {
    width: 100%;
  }
}

.team-select-input {
  width: 400px;
}

@media (max-width: 768px) {
  .team-select-input {
    width: 100% !important;
  }
}

/* Hide the default tags in the select input - Deprecated here, moved to global style but keeping for scoped safety */
.team-select-input :deep(.el-select__tags) {
  display: none;
}

/* Ensure the placeholder is visible even when items are selected */
.custom-select-placeholder {
  color: #606266;
  font-size: 14px;
  line-height: 32px; /* Match standard input height */
  margin-left: 4px;
}
</style>

<style>
/* Global styles override to forcefully hide tags in the team select input */
.team-select-input .el-select__tags {
  display: none !important;
}

.team-select-input .el-select__selection {
  display: none !important;
}

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

/* Increase max-height to avoid scrolling */
.team-select-dropdown .el-select-dropdown__wrap {
  max-height: 600px !important;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .team-select-dropdown .el-select-dropdown__list {
    min-width: unset !important;
    width: 100%;
    /* Keep 2 columns on mobile if possible, otherwise it will just stack if we change it */
    /* If the screen is very narrow, 2 columns might be too tight. Let's adjust min-width. */
  }
  
  .team-select-dropdown {
    width: 90vw !important;
    left: 5vw !important;
  }
}
</style>