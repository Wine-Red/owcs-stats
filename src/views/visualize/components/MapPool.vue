<template>
  <div class="map-pool-container">
    <h3 class="section-title">地图池</h3>
    <div class="map-groups">
      <div 
        v-for="group in mapGroups" 
        :key="group.type" 
        class="map-group"
        v-show="group.maps.length > 0"
      >
        <div class="group-header" :class="group.cssClass">
          <span>{{ group.label }}</span>
          <div class="group-icon-mask" :style="{ WebkitMaskImage: `url(${getGroupIcon(group.type)})`, maskImage: `url(${getGroupIcon(group.type)})` }"></div>
        </div>
        <div class="map-cards">
          <el-popover
            v-for="map in group.maps" 
            :key="map.id"
            placement="top"
            trigger="hover"
            :width="220"
            popper-class="map-stats-popover"
            :show-after="200"
            :hide-after="200"
          >
            <template #reference>
              <div 
                class="map-card"
                :style="{ backgroundImage: `url(${getMapImage(map)})` }"
              >
                <div class="map-pick-rate">{{ getPickRateText(map) }}</div>
                <div class="map-name">{{ map.name }}</div>
              </div>
            </template>
            <!-- Popover Content -->
            <div class="map-popover-content">
              <div class="popover-title">{{ map.name }} - 队伍胜率</div>
              <div class="popover-stats" v-if="getStatsForMap(map).length > 0">
                <div class="stat-row" v-for="stat in getStatsForMap(map)" :key="stat.team.id">
                  <span class="stat-team">{{ stat.team.name }}</span>
                  <span class="stat-winrate" :class="getWinRateClass(stat.winRate)">
                    {{ stat.winRate.toFixed(1) }}% <span class="stat-detail">({{ stat.won }}W - {{ stat.lost }}L)</span>
                  </span>
                </div>
              </div>
              <div v-else class="popover-no-data">暂无比赛数据</div>
            </div>
          </el-popover>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'MapPool',
  props: {
    seasonId: {
      type: [Number, String],
      required: true
    },
    mapIds: {
      type: Array,
      default: () => []
    },
    mapPickStats: {
      type: Array,
      default: () => []
    },
    mapGames: {
      type: Array,
      default: () => []
    }
  },
  setup(props) {
    const store = useStore();

    const maps = computed(() => {
      const allMaps = store.state.maps || [];
      const ids = Array.isArray(props.mapIds) ? props.mapIds.map(v => Number(v)).filter(v => Number.isFinite(v)) : [];
      if (ids.length === 0) return allMaps;
      const set = new Set(ids);
      return allMaps.filter(m => set.has(Number(m.id)));
    });

    const pickCountByMapId = computed(() => {
      const m = new Map();
      (Array.isArray(props.mapPickStats) ? props.mapPickStats : []).forEach(row => {
        const id = Number(row.mapId);
        const count = Number(row.pickCount);
        if (Number.isFinite(id) && Number.isFinite(count)) {
          m.set(id, Math.trunc(count));
        }
      });
      return m;
    });

    const totalPickCountByMode = computed(() => {
      const totals = {};
      (Array.isArray(props.mapPickStats) ? props.mapPickStats : []).forEach(row => {
        const mode = String(row.mapType || row.map?.type || '').trim();
        const count = Number(row.pickCount);
        if (!mode || !Number.isFinite(count)) return;
        totals[mode] = (totals[mode] || 0) + Math.trunc(count);
      });
      return totals;
    });

    const getPickRateText = (map) => {
      const count = pickCountByMapId.value.get(Number(map.id)) || 0;
      const total = totalPickCountByMode.value[map.type] || 0;
      if (!total || !count) return '0%';
      const pct = Math.round((count / total) * 100);
      return `${pct}%`;
    };

    const getPickRateValue = (map) => {
      const count = pickCountByMapId.value.get(Number(map.id)) || 0;
      const total = totalPickCountByMode.value[map.type] || 0;
      if (!total || !count) return 0;
      return (count / total) * 100;
    };

    const mapGroups = computed(() => {
      const groups = [
        { type: '占领要点', label: '占领要点', cssClass: 'bg-control', maps: [] },
        { type: '运载目标', label: '运载目标', cssClass: 'bg-escort', maps: [] },
        { type: '攻击/护送', label: '攻击/护送', cssClass: 'bg-hybrid', maps: [] },
        { type: '机动推进', label: '机动推进', cssClass: 'bg-push', maps: [] },
        { type: '闪点作战', label: '闪点作战', cssClass: 'bg-flashpoint', maps: [] }
      ];

      maps.value.forEach(map => {
        const group = groups.find(g => g.type === map.type);
        if (group) {
          group.maps.push(map);
        }
      });

      groups.forEach(group => {
        group.maps.sort((a, b) => getPickRateValue(b) - getPickRateValue(a));
      });

      return groups;
    });

    const getMapImage = (map) => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
      
      const typeFolderMap = {
        '占领要点': 'control',
        '运载目标': 'escort',
        '攻击/护送': 'hybrid',
        '机动推进': 'push',
        '闪点作战': 'flashpoint'
      };
      
      const folder = typeFolderMap[map.type] || 'control';
      
      // Known file mapping to handle inconsistencies in naming and Chinese names
      const fileMap = {
        '南极半岛': 'Antarctic_Peninsula.jpg',
        '釜山': 'Busan.jpg',
        '伊利奥斯': 'Ilios.jpg',
        '漓江塔': 'Lijiang-tower.jpg',
        '尼泊尔': 'Nepal.jpg',
        '绿洲城': 'Oasis.jpg',
        '萨摩亚': 'Samoa.jpg',
        '香巴里寺院': '1067px-Shambali.jpg',
        '多拉多': 'Dorado.jpg',
        '哈瓦那': 'Havana.jpg',
        '渣客镇': 'Junkertown.jpg',
        '皇家赛道': 'Monte_Carlo.jpg', 
        '里阿尔托': 'Rialto.jpg',
        '66号公路': 'Route-66.jpg',
        '监测站：直布罗陀': 'Watchpoint-gibraltar.jpg',
        '暴雪世界': 'Blizzard-world.jpg',
        '艾兴瓦尔德': 'Eichenwalde.jpg',
        '好莱坞': 'Hollywood.jpg',
        '国王大道': 'Kings-row.jpg',
        '中城': 'Midtown.jpg',
        '努巴尼': 'Numbani.jpg',
        '帕拉伊索': 'Paraiso.jpg',
        '帕拉伊苏': 'Paraiso.jpg',
        '斗兽场': 'Colosseo.jpg',
        '埃斯佩兰萨': 'Esperanca.jpg',
        '新皇后街': 'NewQueenStreet.jpg',
        '卢纳萨皮': 'Runasapi.jpg',
        '鲁纳塞彼': 'Runasapi.jpg',
        '新渣客城': 'New_Junk_City.jpg',
        '苏拉瓦萨': 'Suravasa.jpg',
        '阿特利斯': 'Aatlis.jpg',
        
        // English fallbacks just in case
        'Antarctic Peninsula': 'Antarctic_Peninsula.jpg',
        'Busan': 'Busan.jpg',
        'Ilios': 'Ilios.jpg',
        'Lijiang Tower': 'Lijiang-tower.jpg',
        'Nepal': 'Nepal.jpg',
        'Oasis': 'Oasis.jpg',
        'Samoa': 'Samoa.jpg',
        'Shambali Monastery': '1067px-Shambali.jpg',
        'Dorado': 'Dorado.jpg',
        'Havana': 'Havana.jpg',
        'Junkertown': 'Junkertown.jpg',
        'Circuit royal': 'Monte_Carlo.jpg',
        'Rialto': 'Rialto.jpg',
        'Route 66': 'Route-66.jpg',
        'Watchpoint: Gibraltar': 'Watchpoint-gibraltar.jpg',
        'Blizzard World': 'Blizzard-world.jpg',
        'Eichenwalde': 'Eichenwalde.jpg',
        'Hollywood': 'Hollywood.jpg',
        'King\'s Row': 'Kings-row.jpg',
        'Midtown': 'Midtown.jpg',
        'Numbani': 'Numbani.jpg',
        'Paraíso': 'Paraiso.jpg',
        'Colosseo': 'Colosseo.jpg',
        'Esperança': 'Esperanca.jpg',
        'New Queen Street': 'NewQueenStreet.jpg',
        'Runasapi': 'Runasapi.jpg',
        'New Junk City': 'New_Junk_City.jpg',
        'Suravasa': 'Suravasa.jpg'
      };

      // Fallback: replace spaces with hyphens
      let filename = fileMap[map.name];
      if (!filename) {
        filename = `${map.name.replace(/ /g, '-')}.jpg`;
      }

      return `${baseUrl}maps/${folder}/${filename}`;
    };

    const getGroupIcon = (type) => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : `${import.meta.env.BASE_URL}/`;
        
      const iconMap = {
        '占领要点': 'control.png',
        '运载目标': 'escort.png',
        '攻击/护送': 'hybrid.png',
        '机动推进': 'push.png',
        '闪点作战': 'flashpoint.png'
      };
      
      const filename = iconMap[type] || 'control.png';
      return `${baseUrl}maps/logo/${filename}`;
    };

    const allMapTeamStats = computed(() => {
      if (!props.mapGames || props.mapGames.length === 0) return {};
      
      const statsByMap = {};
      const teams = store.state.teams || [];

      props.mapGames.forEach(game => {
        const mapId = Number(game.mapId);
        if (!mapId || !game.team1Id || !game.team2Id || !game.winnerId) return;

        if (!statsByMap[mapId]) {
          statsByMap[mapId] = new Map();
        }
        const teamStatsMap = statsByMap[mapId];

        const processTeam = (teamId, isWinner) => {
          if (!teamStatsMap.has(teamId)) {
            let teamData = store.getters.getTeamById ? store.getters.getTeamById(teamId) : null;
            if (!teamData) {
              teamData = teams.find(t => t.id === teamId) || { id: teamId, name: `Team ${teamId}`, logo: null };
            }
            teamStatsMap.set(teamId, {
              team: teamData,
              played: 0,
              won: 0,
              lost: 0
            });
          }
          const stat = teamStatsMap.get(teamId);
          stat.played++;
          if (isWinner) {
            stat.won++;
          } else {
            stat.lost++;
          }
        };

        processTeam(game.team1Id, game.winnerId === game.team1Id);
        processTeam(game.team2Id, game.winnerId === game.team2Id);
      });

      const result = {};
      for (const [mapId, teamStatsMap] of Object.entries(statsByMap)) {
        const arr = Array.from(teamStatsMap.values()).map(stat => ({
          ...stat,
          winRate: stat.played > 0 ? (stat.won / stat.played) * 100 : 0
        }));

        // Sort by Win Rate (desc), then Matches Played (desc), then Wins (desc)
        arr.sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          if (b.played !== a.played) return b.played - a.played;
          if (b.won !== a.won) return b.won - a.won;
          return a.team.name.localeCompare(b.team.name);
        });

        result[mapId] = arr;
      }

      return result;
    });

    const getStatsForMap = (map) => {
      return allMapTeamStats.value[map.id] || [];
    };

    const getWinRateClass = (winRate) => {
      if (winRate >= 60) return 'text-success';
      if (winRate < 40) return 'text-danger';
      return 'text-neutral';
    };

    return {
      mapGroups,
      getPickRateText,
      getMapImage,
      getGroupIcon,
      getStatsForMap,
      getWinRateClass
    };
  }
};
</script>

<style scoped>
.map-pool-container {
  margin-bottom: 16px;
}

.section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  color: #1a1a1a;
  margin: 0 0 12px 0;
  font-weight: 700;
}

.map-groups {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.map-group {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: transparent;
  gap: 12px;
}

.group-header {
  font-family: 'Inter', -apple-system, sans-serif;
  font-weight: 800;
  font-size: 15px;
  padding: 8px 12px;
  color: #111;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 6px;
}

.group-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  /* Filter to colorize the icon based on the parent's color.
     We start with a white or black icon and use CSS filters to tint it.
     Alternatively, if the original icon is colored, it might just display as is. 
     If it's black/white, we can force a mask or filter, but simplest is relying on the image.
     Since we want it to match the text color and CSS filters are complex to get exact hex values, 
     a CSS trick is to use it as a mask, but `mask-image` is better. */
}

/* We use mask-image to make the icon take the color of the text (currentColor) */
.group-icon-mask {
  width: 20px;
  height: 20px;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}

.bg-control { background-color: rgba(0, 230, 230, 0.12); color: #008080; border-left: 3px solid #008080; }
.bg-escort { background-color: rgba(255, 77, 77, 0.12); color: #cc0000; border-left: 3px solid #cc0000; }
.bg-hybrid { background-color: rgba(153, 51, 255, 0.12); color: #6600cc; border-left: 3px solid #6600cc; }
.bg-push { background-color: rgba(255, 26, 140, 0.12); color: #cc0066; border-left: 3px solid #cc0066; }
.bg-flashpoint { background-color: rgba(230, 230, 0, 0.15); color: #999900; border-left: 3px solid #999900; }

.map-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-card {
  height: 64px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.map-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.map-pick-rate {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  z-index: 2;
  color: #fff;
  font-family: 'Oxanium', sans-serif;
  font-size: 20px;
  font-weight: 900;
  font-style: italic;
  line-height: 1;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}

.map-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
  z-index: 1;
}

.map-name {
  position: relative;
  z-index: 2;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 8px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

@media (max-width: 768px) {
  .map-pool-container {
    margin-bottom: 12px;
  }
  .section-title {
    margin: 0 0 10px 0;
  }
}

/* Popover Styles */
:deep(.map-stats-popover) {
  padding: 12px !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1) !important;
}

.map-popover-content {
  font-family: 'Inter', -apple-system, sans-serif;
}

.popover-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.popover-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.popover-stats::-webkit-scrollbar {
  width: 4px;
}

.popover-stats::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 2px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.stat-team {
  color: #606266;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.stat-winrate {
  font-weight: 700;
  font-family: 'Mono', sans-serif;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-detail {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.popover-no-data {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 12px 0;
}

.text-success {
  color: #e6a23c; /* Match requested orange/yellow highlight style */
}

.text-danger {
  color: #f56c6c;
}

.text-neutral {
  color: #909399;
}
</style>
