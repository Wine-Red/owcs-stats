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
            <div class="header-left">
                <span class="header-title">队伍数据</span>
            </div>
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
            <div class="header-left">
                <span class="header-title">选手个人数据</span>
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
                :disabled="!filterForm.seasonId" 
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
    const playerFilter = ref([]);
    const playerRole = ref('damage');
    
    // 图表引用
    const heroBanChart = ref(null);
    const mapPickChart = ref(null);
    const mapPickTypes = ref([]);
    const teamComparisonChart = ref(null);
    const playerStatsChart = ref(null);
    
    // 数据缓存
    const allTeamStats = ref([]);
    const allPlayerStats = ref([]);

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
    const teams = computed(() => {
      if (filterForm.value.seasonId) {
        return store.getters.getTeamsBySeasonId(filterForm.value.seasonId);
      }
      return store.state.teams;
    });
    const heroes = computed(() => store.state.heroes);
    
    // 根据赛季和队伍筛选选手
    const getFilteredPlayers = computed(() => {
      // 首先根据职责筛选
      let players = store.state.players;
      if (playerRole.value) {
        players = players.filter(p => p.role === playerRole.value);
      }

      if (!filterForm.value.seasonId) return players;
      
      // 获取当前赛季的所有赛季-队伍关联
      const seasonTeams = store.state.seasonTeams
        .filter(st => st.seasonId === filterForm.value.seasonId);
      
      const seasonTeamIds = seasonTeams.map(st => st.id);
      
      // 获取这些关联中的所有选手ID
      const playerIds = store.state.seasonTeamPlayers
        .filter(stp => seasonTeamIds.includes(stp.seasonTeamId))
        .map(stp => stp.playerId);
      
      // 返回筛选后的选手
      return players.filter(player => playerIds.includes(player.id));
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
    
    // 渲染选手图表（纯前端过滤和渲染）
    const renderPlayerChart = () => {
        if (!playerChart) return;
        
        // 1. 获取当前数据源 (可能是API返回的完整列表，或者我们需要先获取一次)
        // 注意：由于后端现在支持筛选，我们最好是先获取该角色下的所有选手数据，然后在前端进行筛选
        // 这样可以避免每次勾选都请求API
        
        // 我们需要一个变量来存储当前角色的所有选手数据
        // 在 updatePlayerStatsChart 中获取并存储
        
        // 这里假设 updatePlayerStatsChart 已经获取了数据并存储在 allPlayerStats 中
        // 我们需要在 setup 中增加 allPlayerStats
        
        let filteredStats = [];
        
        // 检查 playerFilter 是否有值
        if (playerFilter.value && playerFilter.value.length > 0) {
             const selectedIds = playerFilter.value.map(id => Number(id));
             
             filteredStats = allPlayerStats.value.filter(item => {
                 return selectedIds.includes(Number(item.playerId));
             });
        } else {
             // 如果未选中任何选手，显示空还是显示全部？
             // 队伍图表是未选中显示空。
             // 但根据“默认显示输出选手图表”的需求，初始加载时应该显示所有。
             // 用户交互后，如果清空了筛选，通常也是显示全部或空。
             // 队伍图表那里逻辑是：teamFilter默认全选。
             // 让我们让 playerFilter 默认全选。
             filteredStats = allPlayerStats.value;
        }

        // 定义轴标签和数据映射键
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
        // 1. 遍历当前职责下的所有选手（allPlayerStats），找出最大值
        let globalMaxX = 0;
        let globalMaxY = 0;
        
        allPlayerStats.value.forEach(item => {
            const duration = item.totalDuration || 0;
            if (duration === 0) return;
            
            // 计算每个选手的 X 和 Y 值
            const xVal = (item[xKey] / duration) * 10;
            const yVal = (item[yKey] / duration) * 10;
            
            if (xVal > globalMaxX) globalMaxX = xVal;
            if (yVal > globalMaxY) globalMaxY = yVal;
        });

        // 稍微放大一点作为最大刻度
        const xMax = Math.ceil(globalMaxX * 1.1); 
        const yMax = Math.ceil(globalMaxY * 1.1); 
        
        const seriesData = filteredStats.map(item => {
            const duration = item.totalDuration || 0; 
            if (duration === 0) return null;
            
            const xVal = parseFloat(((item[xKey] / duration) * 10).toFixed(2));
            const yVal = parseFloat(((item[yKey] / duration) * 10).toFixed(2));
            
            return {
                name: item.player?.name || '未知选手',
                value: [xVal, yVal, item.player?.name, item.team?.name]
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
               return `<b>${params.data.value[2]}</b> (${params.data.value[3]})<br/>` +
                      `${xAxisName}: ${params.data.value[0]}<br/>` +
                      `${yAxisName}: ${params.data.value[1]}`;
            }
          },
          grid: {
            left: '5%',
            right: '10%',
            bottom: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'value',
            name: xAxisName,
            nameLocation: 'middle',
            nameGap: 30,
            scale: false, // 禁用自动缩放
            min: 0,
            max: xMax > 0 ? xMax : undefined
          },
          yAxis: {
            type: 'value',
            name: yAxisName,
            inverse: yInverse,
            scale: false, // 禁用自动缩放
            min: 0,
            max: yMax > 0 ? yMax : undefined
          },
          series: [
            {
              type: 'scatter',
              symbolSize: 15,
              data: seriesData,
              itemStyle: {
                  color: function(params) {
                      const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
                      return colors[params.dataIndex % colors.length];
                  }
              },
              label: {
                  show: true,
                  formatter: function(params) {
                      return params.data.value[2];
                  },
                  position: 'top',
                  fontWeight: 'bold',
                  fontSize: 10
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
        
        // 获取当前角色下的所有选手数据（不传具体playerIds，只传role）
        const params = {
          seasonId: filterForm.value.seasonId || null,
          teamIds: filterForm.value.teamIds.length > 0 ? filterForm.value.teamIds : null,
          playerIds: null, // 获取所有，前端筛选
          role: playerRole.value
        };
        
        const response = await apiService.getPlayerStatsData(params);
        allPlayerStats.value = response || [];
        
        // 默认全选当前获取到的选手
        // 获取当前筛选出的选手列表 (getFilteredPlayers 已经根据 role 筛选了)
        // 我们需要确保 playerFilter 中的 ID 是当前 allPlayerStats 中存在的
        
        const availablePlayerIds = allPlayerStats.value.map(p => p.playerId);
        
        // 自动选择Top 5逻辑
        // 如果 playerFilter 为空，或者切换了角色（这里假设外部已清空），则进行Top 5选择
        if (playerFilter.value.length === 0) {
            // 计算每个选手的排序指标
            const statsWithScore = allPlayerStats.value.map(item => {
                const duration = item.totalDuration || 0;
                if (duration === 0) return { ...item, score: -Infinity }; // 无数据排最后

                let score = 0;
                // 数据标准化为每10分钟
                const per10 = (val) => (val / duration) * 10;

                if (playerRole.value === 'tank') {
                    // 坦克：死亡少（越小越好）、抵挡多（越大越好）
                    // 评分公式：抵挡/10min - (死亡/10min * 权重)
                    // 或者简单点：优先按抵挡排序，死亡作为次要？
                    // 用户需求：“每个图表都是越往右上角越厉害”，意味着X轴（抵挡）越大越好，Y轴（死亡）越小越好（坐标轴已反转）。
                    // 综合评分：可以简单用 (抵挡/10min) / (死亡/10min + 1) 或者 抵挡 - 死亡*1000
                    // 让我们用一个加权分数：抵挡分 - 死亡分。
                    // 假设平均抵挡 10000，平均死亡 5。
                    // 抵挡权重 1，死亡权重 2000？
                    // 简单粗暴点：按 (抵挡/10min) 降序排。如果抵挡接近，看死亡。
                    // 为了选出“右上角”的选手，应该是抵挡高且死亡低的。
                    // Score = (Mitigation per 10) - (Deaths per 10 * 1000) (假设1死抵消1000抵挡)
                    // 但实际上，死亡通常是个位数，抵挡是万级。
                    // 让我们尝试：Score = (Mitigation per 10) / (Deaths per 10 + 0.1)
                    const mit = per10(item.totalMitigation);
                    const dth = per10(item.totalDeaths);
                    score = mit / (dth + 0.1);
                } else if (playerRole.value === 'damage') {
                    // 输出：伤害高、消灭多
                    // 优先消灭？还是伤害？通常消灭更重要。
                    // Score = (Elims per 10) * 1000 + (Damage per 10)
                    const dmg = per10(item.totalDamage);
                    const elim = per10(item.totalKills);
                    score = elim * 1000 + dmg;
                } else if (playerRole.value === 'support') {
                    // 辅助：治疗高、助攻多
                    // Score = (Healing per 10) + (Assists per 10 * 1000)
                    const heal = per10(item.totalHealing);
                    const ast = per10(item.totalAssists);
                    score = heal + ast * 1000;
                }

                return { ...item, score };
            });

            // 降序排序
            statsWithScore.sort((a, b) => b.score - a.score);

            // 取前5名
            const top5 = statsWithScore.slice(0, 5);
            playerFilter.value = top5.map(p => p.playerId);
            
            // 如果不足5人，就全选
            if (playerFilter.value.length === 0 && availablePlayerIds.length > 0) {
                 playerFilter.value = availablePlayerIds;
            }
        } else {
             // 过滤掉不再当前列表中的ID (比如切换了赛季或队伍)
             playerFilter.value = playerFilter.value.filter(id => availablePlayerIds.includes(id));
             // 如果过滤后为空，重新触发Top 5逻辑（递归调用或者直接复制上面的逻辑）
             // 简单起见，如果为空，就全选所有（或者也可以Top 5，看用户习惯，这里保持全选作为兜底）
             if (playerFilter.value.length === 0) {
                 // 复制上面的Top 5逻辑
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
      playerFilter.value = []; // should be array
      
      // 加载赛季的队伍关联数据
      if (filterForm.value.seasonId) {
        try {
          await store.dispatch('getSeasonTeams', filterForm.value.seasonId);
          
          // 默认全选该赛季的队伍
          const seasonTeams = store.state.seasonTeams.filter(st => st.seasonId === filterForm.value.seasonId);
          const teamIdsInSeason = seasonTeams.map(st => st.teamId);
          teamFilter.value = teamIdsInSeason;
          
          // 更新所有图表
          updateCharts();
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

    // 监听 playerFilter 变化，实时更新图表
    watch(playerFilter, () => {
        renderPlayerChart();
    }, { deep: true });

    // 监听 playerRole 变化，重置选手筛选并更新图表
    watch(playerRole, () => {
        playerFilter.value = []; // 清空筛选，updatePlayerStatsChart 会处理默认全选
        updatePlayerStatsChart();
    });

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
      playerRole,
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
  flex-wrap: wrap; /* Allow wrapping on small screens */
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

.player-select-input {
  width: 400px;
}

@media (max-width: 768px) {
  .player-select-input {
    width: 100% !important;
  }
}

/* Hide the default tags in the select input - Deprecated here, moved to global style but keeping for scoped safety */
.player-select-input :deep(.el-select__tags) {
  display: none;
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

/* Player Filter Styles - Mirroring Team Filter */
.player-select-input .el-select__tags {
  display: none !important;
}

.player-select-input .el-select__selection {
  display: none !important;
}

.player-select-dropdown .el-select-dropdown__list {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important; /* 3列显示，更紧凑 */
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

  .player-select-dropdown .el-select-dropdown__list {
    min-width: unset !important;
    width: 100%;
    grid-template-columns: repeat(2, 1fr) !important; /* 移动端改为2列 */
  }
  
  .player-select-dropdown {
    width: 90vw !important;
    left: 5vw !important;
    margin: 0 !important; /* Remove margin to fix spacing */
  }
  
  .player-select-dropdown .el-scrollbar {
      padding-right: 0 !important; /* Remove potential scrollbar padding */
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
</style>