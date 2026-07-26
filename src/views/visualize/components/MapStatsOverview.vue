<template>
  <div class="map-stats-overview">
    <div v-if="groups.length" class="map-groups">
      <div v-for="group in groups" :key="group.type" class="map-group">
        <div class="group-header" :class="group.cssClass">
          <span class="group-label">
            <span
              v-if="group.iconUrl"
              class="mode-icon"
              :style="{
                WebkitMaskImage: `url(${group.iconUrl})`,
                maskImage: `url(${group.iconUrl})`
              }"
            ></span>
            <span>{{ group.label }}</span>
          </span>
          <span class="group-total">{{ group.totalCount }} 场</span>
        </div>
        <div class="map-rows">
          <div v-for="row in group.rows" :key="row.mapId" class="map-item">
            <button type="button" class="map-row" :class="{ 'not-expandable': !canExpand(row) }" @click="toggleExpand(row)">
              <div class="map-thumb" :style="{ backgroundImage: `url(${row.imageUrl})` }"></div>
              <div class="map-main">
                <div class="map-line1">
                  <span class="map-name">{{ row.mapName }}</span>
                  <span class="map-pick-count">{{ row.pickCount }} 场</span>
                </div>
                <div class="map-line2">
                  <div class="pick-bar-track">
                    <div class="pick-bar-fill" :style="{ width: row.pickRatePct + '%' }"></div>
                  </div>
                  <span class="pick-rate-text">{{ row.pickRatePct.toFixed(0) }}%</span>
                </div>
              </div>
              <el-icon v-if="canExpand(row)" class="expand-icon" :class="{ expanded: isExpanded(row.mapId) }"><ArrowDown /></el-icon>
            </button>

            <div v-if="isExpanded(row.mapId)" class="map-detail">
              <div class="detail-block">
                <div class="detail-title">各队胜率</div>
                <div v-if="row.teamStats.length" class="team-stats">
                  <div
                    v-for="stat in row.teamStats"
                    :key="stat.team.id"
                    class="team-stat-row"
                    role="link"
                    tabindex="0"
                    @click="goToTeamDetail(stat)"
                    @keydown.enter.prevent="goToTeamDetail(stat)"
                  >
                    <img v-if="stat.team.logo" :src="stat.team.logo" class="team-logo" alt="" />
                    <span class="team-name">{{ stat.team.name }}</span>
                    <span class="team-record">{{ stat.won }}胜{{ stat.lost }}负</span>
                    <span class="team-winrate" :class="winRateClass(stat.winRate)">{{ stat.winRate.toFixed(0) }}%</span>
                  </div>
                </div>
                <div v-else class="detail-empty">暂无队伍数据</div>
              </div>

              <div v-if="row.compositions.length" class="detail-block">
                <div class="detail-title">常见阵容</div>
                <div class="comp-list">
                  <div v-for="(comp, compIdx) in row.compositions" :key="compIdx" class="comp-item">
                    <div class="comp-heroes">
                      <div v-for="hero in comp.heroes" :key="hero.heroId" class="comp-hero" :title="hero.heroName">
                        <div class="comp-hero-icon">
                          <img
                            v-if="hero.iconUrl && !hero.iconFailed"
                            :src="hero.iconUrl"
                            :alt="hero.heroName"
                            loading="lazy"
                            @error="hero.iconFailed = true"
                          />
                          <span v-else class="comp-hero-fallback">{{ hero.heroName.slice(0, 1) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-text">暂无地图数据</div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { getMapImageUrl, getMapModeIconUrl } from '@/utils/mapImages';
import { getHeroIconUrl } from '@/utils/heroIcons';

const TYPE_ORDER = [
  { type: '占领要点', cssClass: 'bg-control' },
  { type: '运载目标', cssClass: 'bg-escort' },
  { type: '攻击/护送', cssClass: 'bg-hybrid' },
  { type: '机动推进', cssClass: 'bg-push' },
  { type: '闪点作战', cssClass: 'bg-flashpoint' }
];

export default {
  name: 'MapStatsOverview',
  components: {
    ArrowDown
  },
  props: {
    mapPickStats: {
      type: Array,
      default: () => []
    },
    mapGames: {
      type: Array,
      default: () => []
    },
    // 本赛季配置的地图池（地图 id 数组）；配置后池内未被选用的地图也要展示
    mapIds: {
      type: Array,
      default: () => []
    },
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const router = useRouter();
    const expandedMapIds = ref(new Set());

    // 「各队胜率」行 → 战队详情页（同赛季）
    const goToTeamDetail = (stat) => {
      const teamId = stat?.team?.id;
      if (!teamId || !props.seasonId) return;
      router.push({
        path: '/visualize/team-detail',
        query: {
          teamId: String(teamId),
          seasonId: String(props.seasonId),
          from: 'visualize'
        }
      });
    };

    // 未被选用的地图没有可展开的明细
    const canExpand = (row) => (Number(row.pickCount) || 0) > 0;

    const toggleExpand = (row) => {
      if (!canExpand(row)) return;
      const next = new Set(expandedMapIds.value);
      if (next.has(row.mapId)) next.delete(row.mapId);
      else next.add(row.mapId);
      expandedMapIds.value = next;
    };
    const isExpanded = (mapId) => expandedMapIds.value.has(mapId);

    const resolveTeam = (teamId) => {
      const fromGetter = store.getters.getTeamById ? store.getters.getTeamById(teamId) : null;
      if (fromGetter) return fromGetter;
      return (store.state.teams || []).find(t => Number(t.id) === Number(teamId))
        || { id: teamId, name: `Team ${teamId}`, logo: null };
    };

    // 每张地图的各队战绩（从赛季全部地图局实时汇总，与地图池悬浮窗口径一致）
    const teamStatsByMapId = computed(() => {
      const acc = {};
      (Array.isArray(props.mapGames) ? props.mapGames : []).forEach(game => {
        const mapId = Number(game.mapId);
        const t1 = Number(game.team1Id);
        const t2 = Number(game.team2Id);
        const winner = Number(game.winnerId);
        if (!mapId || !t1 || !t2 || !winner) return;
        if (!acc[mapId]) acc[mapId] = {};
        [[t1, winner === t1], [t2, winner === t2]].forEach(([teamId, isWin]) => {
          if (!acc[mapId][teamId]) acc[mapId][teamId] = { played: 0, won: 0, lost: 0 };
          const s = acc[mapId][teamId];
          s.played++;
          if (isWin) s.won++;
          else s.lost++;
        });
      });
      const result = {};
      Object.entries(acc).forEach(([mapId, byTeam]) => {
        result[mapId] = Object.entries(byTeam)
          .map(([teamId, s]) => ({
            team: resolveTeam(teamId),
            played: s.played,
            won: s.won,
            lost: s.lost,
            winRate: s.played ? (s.won / s.played) * 100 : 0
          }))
          .sort((a, b) => (b.winRate - a.winRate) || (b.played - a.played) || (b.won - a.won));
      });
      return result;
    });

    const heroById = computed(() => {
      const map = {};
      (store.state.heroes || []).forEach(h => { map[Number(h.id)] = h; });
      return map;
    });

    const winRateClass = (winRate) => {
      if (winRate >= 60) return 'text-success';
      if (winRate < 40) return 'text-danger';
      return 'text-neutral';
    };

    const allMapsById = computed(() => {
      const dict = {};
      (store.state.maps || []).forEach(m => { dict[Number(m.id)] = m; });
      return dict;
    });

    const groups = computed(() => {
      const statRows = Array.isArray(props.mapPickStats) ? props.mapPickStats : [];
      const statByMapId = {};
      statRows.forEach(row => { statByMapId[Number(row.mapId)] = row; });

      // 基础行集合：配置了地图池就按池顺序展示（含未被选用的地图），池外但有数据的地图附后；
      // 未配置地图池（旧赛季）退化为仅展示有数据的地图
      const poolIds = (Array.isArray(props.mapIds) ? props.mapIds : [])
        .map(v => Number(v))
        .filter(v => Number.isFinite(v));
      const baseEntries = [];
      if (poolIds.length) {
        poolIds.forEach(id => {
          const mapObj = allMapsById.value[id] || statByMapId[id]?.map || null;
          if (!mapObj && !statByMapId[id]) return;
          baseEntries.push({ mapId: id, mapObj, stat: statByMapId[id] || null });
        });
        statRows.forEach(row => {
          const id = Number(row.mapId);
          if (!poolIds.includes(id)) {
            baseEntries.push({ mapId: id, mapObj: allMapsById.value[id] || row.map || null, stat: row });
          }
        });
      } else {
        statRows.forEach(row => {
          const id = Number(row.mapId);
          baseEntries.push({ mapId: id, mapObj: allMapsById.value[id] || row.map || null, stat: row });
        });
      }

      const typeOf = (entry) => String(entry.stat?.mapType || entry.mapObj?.type || entry.stat?.map?.type || '').trim();

      // 类型内总出场（与地图池选取率口径一致：类型内占比）
      const totalByType = {};
      baseEntries.forEach(entry => {
        const type = typeOf(entry);
        const count = Math.trunc(Number(entry.stat?.pickCount) || 0);
        if (!type) return;
        totalByType[type] = (totalByType[type] || 0) + count;
      });

      const result = [];
      TYPE_ORDER.forEach(({ type, cssClass }) => {
        const typeRows = baseEntries
          .filter(entry => typeOf(entry) === type)
          .map(entry => {
            const mapId = entry.mapId;
            const pickCount = Math.trunc(Number(entry.stat?.pickCount) || 0);
            const total = totalByType[type] || 0;
            const compositions = (Array.isArray(entry.stat?.compositions) ? entry.stat.compositions : [])
              .map(comp => {
                const heroes = (Array.isArray(comp.heroIds) ? comp.heroIds : []).map(heroId => {
                  const hero = heroById.value[Number(heroId)] || null;
                  const heroName = hero?.name || `英雄#${heroId}`;
                  return {
                    heroId: Number(heroId),
                    heroName,
                    iconUrl: getHeroIconUrl(heroName),
                    iconFailed: false
                  };
                });
                return { heroes };
              })
              .filter(comp => comp.heroes.length === 5);
            return {
              mapId,
              mapName: entry.mapObj?.name || entry.stat?.mapName || entry.stat?.map?.name || '未知地图',
              pickCount,
              pickRatePct: total ? (pickCount / total) * 100 : 0,
              imageUrl: entry.mapObj ? getMapImageUrl(entry.mapObj) : '',
              teamStats: teamStatsByMapId.value[mapId] || [],
              compositions
            };
          })
          .sort((a, b) => b.pickCount - a.pickCount);
        if (typeRows.length) {
          result.push({
            type,
            label: type,
            cssClass,
            iconUrl: getMapModeIconUrl(type),
            rows: typeRows,
            totalCount: typeRows.reduce((sum, r) => sum + r.pickCount, 0)
          });
        }
      });
      return result;
    });

    return {
      groups,
      canExpand,
      toggleExpand,
      isExpanded,
      winRateClass,
      goToTeamDetail
    };
  }
};
</script>

<style scoped>
.map-stats-overview {
  position: relative;
}

.info-icon {
  font-size: 17px;
  color: #8a8f98;
  cursor: pointer;
  transition: color 0.3s;
}

.info-icon:hover {
  color: #ff8a00;
}

.map-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 16px;
}

.group-header {
  font-family: var(--vis-font-body);
  font-weight: 800;
  font-size: 14px;
  padding: 8px 12px;
  color: #111;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 6px;
  margin-bottom: 10px;
}

.group-total {
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 700;
  opacity: 0.75;
}

.group-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* 模式图标：白色镂空 PNG 做 mask，用 currentColor 着色，颜色与模式名字体一致 */
.mode-icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}

.bg-control { background-color: rgba(17, 17, 17, 0.06); color: #111111; border-left: 3px solid #111111; }
.bg-escort { background-color: rgba(255, 106, 0, 0.10); color: #c24e00; border-left: 3px solid #ff6a00; }
.bg-hybrid { background-color: rgba(17, 17, 17, 0.045); color: #303133; border-left: 3px solid #606266; }
.bg-push { background-color: rgba(255, 158, 15, 0.12); color: #a66a00; border-left: 3px solid #ff9e0f; }
.bg-flashpoint { background-color: rgba(17, 17, 17, 0.08); color: #111111; border-left: 3px solid #ffb84d; }

.map-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-item {
  border-radius: 8px;
  transition: background 0.2s;
}

.map-item:hover {
  background: rgba(17, 17, 17, 0.03);
}

.map-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.map-row.not-expandable {
  cursor: default;
}

.map-thumb {
  flex: 0 0 auto;
  width: 64px;
  height: 40px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  background-color: #f0f2f5;
  box-shadow: 0 1px 3px rgba(16, 21, 28, 0.12);
}

.map-main {
  flex: 1 1 auto;
  min-width: 0;
}

.map-line1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.map-name {
  font-size: 13px;
  font-weight: 700;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-pick-count {
  flex: 0 0 auto;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 700;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.map-line2 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pick-bar-track {
  flex: 1 1 auto;
  height: 5px;
  border-radius: 3px;
  background: #f0f2f5;
  overflow: hidden;
}

.pick-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #ff9e0f 0%, #ff6a00 100%);
  transition: width 0.4s var(--vis-ease, ease);
}

.pick-rate-text {
  flex: 0 0 auto;
  min-width: 32px;
  text-align: right;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 800;
  color: #ff6a00;
  font-variant-numeric: tabular-nums;
}

.expand-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eef0f4;
  font-size: 14px;
  color: #606266;
  transition: transform 0.25s var(--vis-ease, ease), background-color 0.18s var(--vis-ease, ease), color 0.18s var(--vis-ease, ease);
}

.expand-icon.expanded {
  transform: rotate(180deg);
  color: #ff6a00;
  background: rgba(255, 106, 0, 0.12);
}

/* 展开详情 */
.map-detail {
  padding: 8px 6px 10px 78px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-title {
  font-size: 12px;
  font-weight: 800;
  color: #303133;
  margin-bottom: 6px;
}

.team-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.team-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
}

.team-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: 0 0 auto;
}

.team-name {
  flex: 1 1 auto;
  min-width: 0;
  color: #606266;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.18);
  text-underline-offset: 3px;
}

/* 按压反馈：队名变为橙色强调色 */
.team-stat-row:active .team-name {
  color: #ff6a00;
  text-decoration-color: rgba(255, 106, 0, 0.55);
}

.team-record {
  flex: 0 0 auto;
  color: #909399;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.team-winrate {
  flex: 0 0 auto;
  min-width: 36px;
  text-align: right;
  font-family: var(--vis-font-numeric);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.text-success { color: #ff6a00; }
.text-danger { color: #dc3545; }
.text-neutral { color: #909399; }

.comp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comp-heroes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.comp-hero {
  display: flex;
}

.comp-hero-icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  overflow: hidden;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(16, 21, 28, 0.1);
}

.comp-hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comp-hero-fallback {
  font-size: 13px;
  font-weight: 800;
  color: #909399;
}

.detail-empty {
  font-size: 12px;
  color: #c0c4cc;
  padding: 2px 0;
}

.empty-text {
  padding: 40px 0;
  text-align: center;
  color: #909399;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .map-groups {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .map-detail {
    padding-left: 6px;
  }
}
</style>
