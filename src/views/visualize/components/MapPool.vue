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
import { getMapImageUrl } from '@/utils/mapImages';

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
      return getMapImageUrl(map);
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
/* 去卡片化：标题与内容直接落在页面上，不再使用白卡包裹 */
.map-pool-container {
  margin-bottom: 16px;
}

/* M1 · 斜切标题条：渐变斜块 + Oxanium 斜体 + 1px 浅灰细分隔线 */
.section-title {
  font-family: var(--vis-font-display);
  font-size: 18px;
  font-style: italic;
  color: #111;
  margin: 0 0 14px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--vis-border);
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 9px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.section-title::before {
  content: '';
  width: 4px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant));
}

.map-groups {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x proximity;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.map-groups::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.map-group {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  background: transparent;
  gap: 12px;
  scroll-snap-align: start;
}

.group-header {
  font-family: var(--vis-font-body);
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

/* 模式组头：收敛为黑橙双主轴 + 中性灰（不再使用青/红/紫等杂色） */
.bg-control { background-color: rgba(17, 17, 17, 0.06); color: #111111; border-left: 3px solid #111111; }
.bg-escort { background-color: rgba(255, 106, 0, 0.10); color: #c24e00; border-left: 3px solid #ff6a00; }
.bg-hybrid { background-color: rgba(17, 17, 17, 0.045); color: #303133; border-left: 3px solid #606266; }
.bg-push { background-color: rgba(255, 158, 15, 0.12); color: #a66a00; border-left: 3px solid #ff9e0f; }
.bg-flashpoint { background-color: rgba(17, 17, 17, 0.08); color: #111111; border-left: 3px solid #ffb84d; }

.map-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-card {
  height: 64px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(16, 21, 28, 0.1);
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

.map-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(16, 21, 28, 0.18);
}

.map-pick-rate {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  z-index: 2;
  color: #fff;
  font-family: var(--vis-font-numeric);
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
  height: 72%;
  background: linear-gradient(to top, rgba(16, 21, 28, 0.88) 0%, rgba(16, 21, 28, 0.32) 55%, transparent 100%);
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
    font-size: 16px;
    margin: 0 0 10px 0;
    padding-bottom: 8px;
  }
  .section-title::before {
    height: 14px;
  }
}

@media (max-width: 420px) {
  .section-title {
    font-size: 15px;
  }
}

/* Popover 内容样式（popper  teleport 到 body，容器样式见下方非 scoped 块） */
.map-popover-content {
  font-family: var(--vis-font-body);
}

.popover-title {
  font-size: 14px;
  font-weight: 800;
  font-family: var(--vis-font-display);
  color: #111;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

/* 胜率行：紧凑 + 细线分隔 + 数值列固定宽 */
.popover-stats {
  display: flex;
  flex-direction: column;
  gap: 0;
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
  gap: 10px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f2f5;
}

.stat-row:last-child {
  border-bottom: 0;
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
  flex: 0 0 auto;
  min-width: 96px;
  justify-content: flex-end;
  text-align: right;
  font-weight: 700;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
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

/* 胜率高亮：橙（>=60）/ 红（<40）/ 中性灰，不用蓝 */
.text-success {
  color: #ff6a00;
}

.text-danger {
  color: #dc3545;
}

.text-neutral {
  color: #909399;
}
</style>

<style>
/* el-popover 的 popper  teleport 到 body，容器样式需全局非 scoped 覆写 */
.map-stats-popover.el-popover.el-popper,
.map-stats-popover {
  padding: 12px !important;
  border: 1px solid #ebeef5 !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}
</style>
