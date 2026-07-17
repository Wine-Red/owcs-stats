<template>
  <div class="map-analysis-panel">
    <div v-if="!hasAnyData" class="analysis-empty">
      暂无地图局数据
    </div>

    <template v-else>
      <section class="analysis-section">
        <div class="analysis-heading">
          <h3 class="heading-title">模式胜率</h3>
        </div>

        <div class="mode-accordion-list">
          <article
            v-for="section in modeMapSections"
            :key="section.type"
            class="mode-accordion-item"
            :class="{ expanded: isModeExpanded(section.type) }"
          >
            <button
              class="mode-accordion-header"
              :class="{ 'is-compare-header': isCompare, 'is-single-header': !isCompare }"
              type="button"
              @click="toggleMode(section.type)"
            >
              <template v-if="!isCompare">
                <div class="mode-center accordion-center">
                  <div class="mode-badge">
                    <div
                      v-if="section.icon"
                      class="mode-icon-mask"
                      :style="{ WebkitMaskImage: `url(${section.icon})`, maskImage: `url(${section.icon})` }"
                    ></div>
                    <span>{{ section.label }}</span>
                  </div>
                  <div v-if="showSingleModeHint" class="mode-vs-note">
                    {{ getSingleTierLabel(section.summary) }}
                  </div>
                </div>

                <div class="mode-side mode-side-left header-side">
                  <div class="mode-side-value team-dark">{{ formatPercent(section.summary.winRate) }}</div>
                  <div class="mode-side-meta">{{ formatRecord(section.summary) }}</div>
                </div>

                <div class="single-header-meta">
                  <span class="accordion-count">{{ section.maps.length }} 图</span>
                  <span class="accordion-arrow" :class="{ expanded: isModeExpanded(section.type) }">⌄</span>
                </div>
              </template>

              <template v-else>
              <div v-if="isCompare" class="mode-side mode-side-left header-side">
                <div class="mode-side-value team-dark">{{ formatPercent(section.summary.team1.winRate) }}</div>
                <div class="mode-side-meta">{{ formatRecord(section.summary.team1) }}</div>
              </div>

              <div class="mode-center accordion-center">
                <div class="mode-badge">
                  <div
                    v-if="section.icon"
                    class="mode-icon-mask"
                    :style="{ WebkitMaskImage: `url(${section.icon})`, maskImage: `url(${section.icon})` }"
                  ></div>
                  <span>{{ section.label }}</span>
                </div>
                <div v-if="!isCompare && showSingleModeHint" class="mode-vs-note">
                  {{ getSingleTierLabel(section.summary) }}
                </div>
              </div>

              <div class="mode-side mode-side-right header-side">
                <div class="mode-side-value team-accent">{{ formatPercent(section.summary.team2.winRate) }}</div>
                <div class="mode-side-meta">{{ formatRecord(section.summary.team2) }}</div>
              </div>

              <span class="accordion-count">{{ section.maps.length }} 图</span>
              <span class="accordion-arrow" :class="{ expanded: isModeExpanded(section.type) }">⌄</span>
              </template>
            </button>

            <transition name="accordion-collapse">
              <div v-show="isModeExpanded(section.type)" class="mode-accordion-body">
              <div class="map-card-grid">
                <article
                  v-for="entry in section.maps"
                  :key="entry.mapId"
                  class="single-map-card"
                  :class="{ 'is-cover-card': coverMapCards }"
                >
                  <div class="map-thumb" :style="{ backgroundImage: `url(${entry.bannerUrl})` }"></div>

                  <div class="map-compact-content">
                    <div class="map-card-top compact-top">
                      <div>
                        <div class="map-card-title compact-title">{{ entry.mapName }}</div>
                        <div v-if="showMapSample" class="map-meta-line">
                          <span class="map-sample-chip">{{ isCompare ? getCompareSampleLabel(entry) : `${entry.played} 场` }}</span>
                        </div>
                      </div>

                      <div v-if="!isCompare" class="single-map-rate compact-rate">{{ formatPercent(entry.winRate) }}</div>
                    </div>

                    <div v-if="isCompare" class="map-compare-body compact-compare-body">
                      <div class="map-compare-side">
                        <div class="side-label team-dark">{{ primaryTeamName }}</div>
                        <div class="side-rate">{{ formatPercent(entry.team1.winRate) }}</div>
                        <div class="side-record compact-record">{{ formatRecord(entry.team1) }}</div>
                      </div>

                      <div class="map-compare-divider">VS</div>

                      <div class="map-compare-side right-side">
                        <div class="side-label team-accent">{{ secondaryTeamName }}</div>
                        <div class="side-rate">{{ formatPercent(entry.team2.winRate) }}</div>
                        <div class="side-record compact-record">{{ formatRecord(entry.team2) }}</div>
                      </div>
                    </div>

                    <div v-else class="single-map-record compact-record">{{ formatRecord(entry) }}</div>

                    <div v-if="!isCompare && showSingleOpponents && entry.opponents?.length" class="map-opponents-row">
                      <span class="opponents-label">对手</span>
                      <div class="opponents-list">
                        <span
                          v-for="opponent in entry.opponents"
                          :key="`${entry.mapId}-${opponent.name}`"
                          class="opponent-chip"
                          :class="{
                            'is-win': opponent.won > 0 && opponent.lost === 0,
                            'is-loss': opponent.lost > 0 && opponent.won === 0,
                            'is-mixed': opponent.won > 0 && opponent.lost > 0
                          }"
                        >
                          <span class="opponent-name">{{ opponent.name }}</span>
                          <span class="opponent-result">
                            {{ opponent.won > 0 && opponent.lost > 0 ? `${opponent.won}胜${opponent.lost}负` : (opponent.won > 0 ? '胜' : '负') }}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div v-if="showMapInsight || (isCompare && entry.h2h.played > 0)" class="map-card-footer compact-footer">
                      <span class="map-footer-highlight">
                        {{ showMapInsight ? (isCompare ? getCompactCompareMapInsight(entry) : getCompactSingleInsight(entry)) : '' }}
                      </span>
                      <span v-if="isCompare && entry.h2h.played > 0" class="map-footer-note">
                        {{ entry.h2h.team1Won }} : {{ entry.h2h.team2Won }}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
              </div>
            </transition>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { getMapImageUrl, getMapModeIconUrl, getMapModeLabel } from '@/utils/mapImages';

const MODE_ORDER = ['占领要点', '攻击/护送', '运载目标', '机动推进', '闪点作战'];

const createEmptyStat = () => ({
  played: 0,
  won: 0,
  lost: 0,
  winRate: 0
});

export default {
  name: 'MapWinRateAnalysis',
  props: {
    mapGames: {
      type: Array,
      default: () => []
    },
    primaryTeamId: {
      type: [Number, String],
      required: true
    },
    primaryTeamName: {
      type: String,
      default: ''
    },
    secondaryTeamId: {
      type: [Number, String],
      default: ''
    },
    secondaryTeamName: {
      type: String,
      default: ''
    },
    coverMapCards: {
      type: Boolean,
      default: false
    },
    showMapSample: {
      type: Boolean,
      default: true
    },
    showMapInsight: {
      type: Boolean,
      default: true
    },
    showSingleModeHint: {
      type: Boolean,
      default: true
    },
    showSingleOpponents: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const store = useStore();

    const normalizeId = (value) => String(value ?? '');
    const isCompare = computed(() => Boolean(normalizeId(props.secondaryTeamId)));
    const expandedModes = ref([]);

    const mapLookup = computed(() => {
      const lookup = new Map();
      (store.state.maps || []).forEach((map) => {
        lookup.set(normalizeId(map.id), map);
      });
      return lookup;
    });

    const teamLookup = computed(() => {
      const lookup = new Map();
      (store.state.teams || []).forEach((team) => {
        lookup.set(normalizeId(team.id), team);
      });
      return lookup;
    });

    const completedGames = computed(() => {
      return (Array.isArray(props.mapGames) ? props.mapGames : []).filter((game) => {
        return game && game.mapId && game.winnerId && game.team1Id && game.team2Id;
      });
    });

    const buildTeamStats = (games, teamId, groupBy) => {
      const normalizedTeamId = normalizeId(teamId);
      const grouped = new Map();

      games.forEach((game) => {
        const participates = normalizeId(game.team1Id) === normalizedTeamId || normalizeId(game.team2Id) === normalizedTeamId;
        if (!participates) return;

        const groupKey = groupBy(game);
        if (!groupKey) return;

        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            played: 0,
            won: 0,
            lost: 0
          });
        }

        const stat = grouped.get(groupKey);
        stat.played += 1;
        if (normalizeId(game.winnerId) === normalizedTeamId) {
          stat.won += 1;
        } else {
          stat.lost += 1;
        }
      });

      return grouped;
    };

    const singleModeStats = computed(() => {
      const grouped = buildTeamStats(completedGames.value, props.primaryTeamId, (game) => {
        const map = mapLookup.value.get(normalizeId(game.mapId));
        return map?.type || '';
      });

      return MODE_ORDER.map((type) => {
        const stat = grouped.get(type) || createEmptyStat();
        const played = stat.played || 0;
        const won = stat.won || 0;
        return {
          type,
          label: getMapModeLabel(type),
          icon: getMapModeIconUrl(type),
          played,
          won,
          lost: stat.lost || 0,
          winRate: played > 0 ? (won / played) * 100 : 0
        };
      }).filter((item) => item.played > 0);
    });

    const singleMapStats = computed(() => {
      const grouped = buildTeamStats(completedGames.value, props.primaryTeamId, (game) => normalizeId(game.mapId));
      const opponentsByMap = new Map();
      const rows = [];

      completedGames.value.forEach((game) => {
        const primaryTeamId = normalizeId(props.primaryTeamId);
        const team1Id = normalizeId(game.team1Id);
        const team2Id = normalizeId(game.team2Id);
        if (team1Id !== primaryTeamId && team2Id !== primaryTeamId) return;

        const mapId = normalizeId(game.mapId);
        if (!opponentsByMap.has(mapId)) {
          opponentsByMap.set(mapId, new Map());
        }

        const opponentId = team1Id === primaryTeamId ? team2Id : team1Id;
        const opponent = teamLookup.value.get(opponentId);
        const isWin = normalizeId(game.winnerId) === primaryTeamId;
        const opponentStats = opponentsByMap.get(mapId);
        if (!opponentStats.has(opponentId)) {
          opponentStats.set(opponentId, {
            name: opponent?.name || `Team ${opponentId}`,
            won: 0,
            lost: 0
          });
        }

        const record = opponentStats.get(opponentId);
        if (isWin) {
          record.won += 1;
        } else {
          record.lost += 1;
        }
      });

      grouped.forEach((stat, mapId) => {
        const map = mapLookup.value.get(mapId);
        if (!map) return;

        const played = stat.played || 0;
        const won = stat.won || 0;
        rows.push({
          mapId,
          mapName: map.name,
          modeLabel: getMapModeLabel(map.type),
          bannerUrl: getMapImageUrl(map),
          opponents: Array.from(opponentsByMap.get(mapId)?.values() || []).sort((a, b) => {
            const aTotal = a.won + a.lost;
            const bTotal = b.won + b.lost;
            if (bTotal !== aTotal) return bTotal - aTotal;
            return a.name.localeCompare(b.name, 'zh-CN');
          }),
          played,
          won,
          lost: stat.lost || 0,
          winRate: played > 0 ? (won / played) * 100 : 0
        });
      });

      return rows.sort((a, b) => {
        if (b.played !== a.played) return b.played - a.played;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return a.mapName.localeCompare(b.mapName, 'zh-CN');
      });
    });

    const modeComparisonStats = computed(() => {
      const team1Grouped = buildTeamStats(completedGames.value, props.primaryTeamId, (game) => {
        const map = mapLookup.value.get(normalizeId(game.mapId));
        return map?.type || '';
      });
      const team2Grouped = buildTeamStats(completedGames.value, props.secondaryTeamId, (game) => {
        const map = mapLookup.value.get(normalizeId(game.mapId));
        return map?.type || '';
      });

      return MODE_ORDER.map((type) => {
        const team1 = team1Grouped.get(type) || createEmptyStat();
        const team2 = team2Grouped.get(type) || createEmptyStat();
        const h2h = createEmptyStat();

        completedGames.value.forEach((game) => {
          const map = mapLookup.value.get(normalizeId(game.mapId));
          if (!map || map.type !== type) return;

          const isH2h =
            [normalizeId(game.team1Id), normalizeId(game.team2Id)].includes(normalizeId(props.primaryTeamId)) &&
            [normalizeId(game.team1Id), normalizeId(game.team2Id)].includes(normalizeId(props.secondaryTeamId));

          if (!isH2h) return;

          h2h.played += 1;
          if (normalizeId(game.winnerId) === normalizeId(props.primaryTeamId)) {
            h2h.won += 1;
          } else if (normalizeId(game.winnerId) === normalizeId(props.secondaryTeamId)) {
            h2h.lost += 1;
          }
        });

        return {
          type,
          label: getMapModeLabel(type),
          icon: getMapModeIconUrl(type),
          team1: {
            ...team1,
            winRate: team1.played > 0 ? (team1.won / team1.played) * 100 : 0
          },
          team2: {
            ...team2,
            winRate: team2.played > 0 ? (team2.won / team2.played) * 100 : 0
          },
          h2h: {
            played: h2h.played,
            team1Won: h2h.won,
            team2Won: h2h.lost
          }
        };
      }).filter((item) => item.team1.played > 0 || item.team2.played > 0 || item.h2h.played > 0);
    });

    const compareMapStats = computed(() => {
      const team1Grouped = buildTeamStats(completedGames.value, props.primaryTeamId, (game) => normalizeId(game.mapId));
      const team2Grouped = buildTeamStats(completedGames.value, props.secondaryTeamId, (game) => normalizeId(game.mapId));
      const mapIds = new Set([...team1Grouped.keys(), ...team2Grouped.keys()]);
      const rows = [];

      mapIds.forEach((mapId) => {
        const map = mapLookup.value.get(mapId);
        if (!map) return;

        const team1Base = team1Grouped.get(mapId) || createEmptyStat();
        const team2Base = team2Grouped.get(mapId) || createEmptyStat();
        const h2h = {
          played: 0,
          team1Won: 0,
          team2Won: 0
        };

        completedGames.value.forEach((game) => {
          if (normalizeId(game.mapId) !== mapId) return;

          const gameTeams = [normalizeId(game.team1Id), normalizeId(game.team2Id)];
          const isH2h = gameTeams.includes(normalizeId(props.primaryTeamId)) && gameTeams.includes(normalizeId(props.secondaryTeamId));
          if (!isH2h) return;

          h2h.played += 1;
          if (normalizeId(game.winnerId) === normalizeId(props.primaryTeamId)) {
            h2h.team1Won += 1;
          } else if (normalizeId(game.winnerId) === normalizeId(props.secondaryTeamId)) {
            h2h.team2Won += 1;
          }
        });

        rows.push({
          mapId,
          mapName: map.name,
          modeLabel: getMapModeLabel(map.type),
          bannerUrl: getMapImageUrl(map),
          team1: {
            ...team1Base,
            winRate: team1Base.played > 0 ? (team1Base.won / team1Base.played) * 100 : 0
          },
          team2: {
            ...team2Base,
            winRate: team2Base.played > 0 ? (team2Base.won / team2Base.played) * 100 : 0
          },
          h2h
        });
      });

      return rows.sort((a, b) => {
        if (b.h2h.played !== a.h2h.played) return b.h2h.played - a.h2h.played;
        const aPlayed = a.team1.played + a.team2.played;
        const bPlayed = b.team1.played + b.team2.played;
        if (bPlayed !== aPlayed) return bPlayed - aPlayed;
        const aDiff = Math.abs(a.team1.winRate - a.team2.winRate);
        const bDiff = Math.abs(b.team1.winRate - b.team2.winRate);
        if (bDiff !== aDiff) return bDiff - aDiff;
        return a.mapName.localeCompare(b.mapName, 'zh-CN');
      });
    });

    const hasAnyData = computed(() => {
      if (isCompare.value) {
        return modeComparisonStats.value.length > 0 || compareMapStats.value.length > 0;
      }
      return singleModeStats.value.length > 0 || singleMapStats.value.length > 0;
    });

    const modeMapSections = computed(() => {
      if (isCompare.value) {
        const mapsByMode = new Map();
        compareMapStats.value.forEach((entry) => {
          const mode = entry.modeLabel;
          if (!mapsByMode.has(mode)) mapsByMode.set(mode, []);
          mapsByMode.get(mode).push(entry);
        });

        return modeComparisonStats.value.map((summary) => ({
          type: summary.type,
          label: summary.label,
          icon: summary.icon,
          summary,
          maps: mapsByMode.get(summary.label) || []
        })).filter((section) => section.maps.length > 0);
      }

      const mapsByMode = new Map();
      singleMapStats.value.forEach((entry) => {
        const mode = entry.modeLabel;
        if (!mapsByMode.has(mode)) mapsByMode.set(mode, []);
        mapsByMode.get(mode).push(entry);
      });

      return singleModeStats.value.map((summary) => ({
        type: summary.type,
        label: summary.label,
        icon: summary.icon,
        summary,
        maps: mapsByMode.get(summary.label) || []
      })).filter((section) => section.maps.length > 0);
    });

    watch(modeMapSections, (sections) => {
      const validTypes = sections.map((section) => section.type);
      const nextExpanded = expandedModes.value.filter((type) => validTypes.includes(type));
      if (!nextExpanded.length && validTypes.length) {
        nextExpanded.push(validTypes[0]);
      }
      expandedModes.value = nextExpanded;
    }, { immediate: true });

    const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;
    const formatRecord = (stat) => `${Number(stat.won || 0)}W - ${Number(stat.lost || 0)}L`;

    const isModeExpanded = (type) => expandedModes.value.includes(type);
    const toggleMode = (type) => {
      if (isModeExpanded(type)) {
        expandedModes.value = expandedModes.value.filter((item) => item !== type);
        return;
      }
      expandedModes.value = [...expandedModes.value, type];
    };

    const getSingleTierLabel = (stat) => {
      if (stat.played <= 1) return '样本少';
      if (stat.winRate >= 65) return '强势';
      if (stat.winRate <= 35) return '警惕';
      return '均势';
    };

    const getCompactSingleInsight = (stat) => {
      if (stat.played <= 1) return '样本偏少，建议结合其他地图判断';
      if (stat.winRate >= 70) return '强势图';
      if (stat.winRate >= 55) return '偏优';
      if (stat.winRate <= 30) return '弱势图';
      if (stat.winRate <= 45) return '偏劣';
      return '均势';
    };

    const getCompactCompareModeInsight = (mode) => {
      if (mode.h2h.played > 0) {
        if (mode.h2h.team1Won === mode.h2h.team2Won) return `${mode.h2h.team1Won} : ${mode.h2h.team2Won}`;
        return mode.h2h.team1Won > mode.h2h.team2Won ? '交手偏左' : '交手偏右';
      }

      const diff = mode.team1.winRate - mode.team2.winRate;
      if (Math.abs(diff) < 8) return '接近';
      return diff > 0 ? '偏左' : '偏右';
    };

    const getCompactCompareMapInsight = (entry) => {
      if (entry.h2h.played > 0) {
        if (entry.h2h.team1Won === entry.h2h.team2Won) return '交手持平';
        return entry.h2h.team1Won > entry.h2h.team2Won ? '交手偏左' : '交手偏右';
      }

      const diff = entry.team1.winRate - entry.team2.winRate;
      if (Math.abs(diff) < 8) return '赛季接近';
      return diff > 0 ? '赛季偏左' : '赛季偏右';
    };

    const getCompareSampleLabel = (entry) => {
      if (entry.h2h.played > 0) return `交手 ${entry.h2h.played} 图`;
      return `${entry.team1.played + entry.team2.played} 图样本`;
    };

    return {
      isCompare,
      hasAnyData,
      singleModeStats,
      singleMapStats,
      modeComparisonStats,
      compareMapStats,
      modeMapSections,
      formatPercent,
      formatRecord,
      isModeExpanded,
      toggleMode,
      getSingleTierLabel,
      getCompactSingleInsight,
      getCompactCompareModeInsight,
      getCompactCompareMapInsight,
      getCompareSampleLabel
    };
  }
};
</script>

<style scoped>
.map-analysis-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 0 -12px;
}

.analysis-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-accordion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-accordion-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-accordion-header {
  position: relative;
  width: 100%;
  display: grid;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease);
}

/* M5 · hover 顶部渐变线 */
.mode-accordion-header::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 14px;
  right: 14px;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.2s var(--vis-ease);
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .mode-accordion-header:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .mode-accordion-header:hover::before {
    opacity: 1;
  }
}

/* 展开态：克制的浅橙描边提示 */
.mode-accordion-item.expanded .mode-accordion-header {
  border-color: rgba(255, 106, 0, 0.36);
}

.mode-accordion-header.is-compare-header {
  grid-template-columns: minmax(72px, 1fr) auto minmax(72px, 1fr) auto auto;
}

.mode-accordion-header.is-single-header {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.header-side {
  min-width: 0;
}

.is-single-header .header-side {
  align-items: flex-end;
  text-align: right;
}

.accordion-center {
  min-width: 88px;
}

.is-single-header .accordion-center {
  justify-self: start;
  align-items: flex-start;
  text-align: left;
  min-width: 0;
}

.is-single-header .mode-badge {
  justify-content: flex-start;
  font-size: 15px;
  font-weight: 900;
  gap: 8px;
}

.is-single-header .mode-icon-mask {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.is-single-header .mode-side-value {
  font-size: 24px;
}

.single-header-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-self: end;
}

.accordion-count {
  font-size: 10px;
  color: #909399;
  font-weight: 700;
  white-space: nowrap;
  justify-self: end;
}

.accordion-arrow {
  font-size: 12px;
  color: #909399;
  line-height: 1;
  transition: transform 0.2s var(--vis-ease);
  justify-self: end;
}

.accordion-arrow.expanded {
  transform: rotate(180deg);
}

.mode-accordion-body {
  padding: 0;
}

.accordion-collapse-enter-active,
.accordion-collapse-leave-active {
  transition: max-height 0.28s ease, opacity 0.22s ease, transform 0.28s ease;
  overflow: hidden;
}

.accordion-collapse-enter-from,
.accordion-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}

.accordion-collapse-enter-to,
.accordion-collapse-leave-from {
  max-height: 1200px;
  opacity: 1;
  transform: translateY(0);
}

.analysis-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* M1 · 斜切标题条：渐变斜块 + Oxanium 斜体 */
.heading-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--vis-font-display);
  font-size: 15px;
  font-style: italic;
  font-weight: 900;
  color: #111;
  letter-spacing: -0.01em;
}

.heading-title::before {
  content: '';
  width: 4px;
  height: 15px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant));
}

.analysis-empty {
  padding: 36px 12px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #303133;
  font-size: 11px;
  font-weight: 800;
  min-width: 0;
}

.mode-icon-mask {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  background: #303133;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  opacity: 1;
}

.map-mode-chip,
.map-sample-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.mode-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-side-left {
  align-items: flex-end;
  text-align: right;
}

.mode-side-right {
  align-items: flex-start;
  text-align: left;
}

.mode-side-value {
  font-size: 20px;
  line-height: 1;
  font-weight: 900;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-variant-numeric: tabular-nums;
}

.team-dark {
  color: #111;
}

.team-accent {
  color: #ff6a00;
}

.mode-side-meta,
.side-record {
  font-size: 11px;
  font-weight: 700;
}

.mode-side-meta {
  color: #606266;
}

.mode-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 84px;
  text-align: center;
}

.mode-vs-note {
  font-size: 10px;
  color: #909399;
  font-weight: 700;
}

.map-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.single-map-card {
  position: relative;
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: 84px;
  border-radius: 14px;
  border: 1px solid #ebeef5;
  background: #fff;
  overflow: hidden;
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

/* M5 · hover 顶部渐变线（仅白卡，背景图卡除外） */
.single-map-card:not(.is-cover-card)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.2s var(--vis-ease);
  pointer-events: none;
  z-index: 2;
}

@media (hover: hover) and (pointer: fine) {
  .single-map-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .single-map-card:not(.is-cover-card):hover::before {
    opacity: 1;
  }
}

/* 背景图卡：深岩黑渐变遮罩保证文字可读 */
.single-map-card.is-cover-card {
  grid-template-columns: 1fr;
  min-height: 136px;
  position: relative;
  border: none;
  background:
    linear-gradient(180deg, rgba(16, 21, 28, 0.2) 0%, rgba(16, 21, 28, 0.78) 100%);
}

.map-thumb {
  position: relative;
  background-size: cover;
  background-position: center;
  min-height: 100%;
  overflow: hidden;
}

.map-thumb::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0) 52%, rgba(255, 255, 255, 0.08) 66%, rgba(255, 255, 255, 0.28) 80%, rgba(255, 255, 255, 0.62) 91%, #fff 100%);
  pointer-events: none;
}

.single-map-card.is-cover-card .map-thumb {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.single-map-card.is-cover-card .map-thumb::after {
  background:
    linear-gradient(180deg, rgba(16, 21, 28, 0.08) 0%, rgba(16, 21, 28, 0.52) 100%);
}

.map-mode-chip {
  padding: 2px 6px;
  background: #f4f4f5;
  color: #606266;
}

.map-sample-chip {
  padding: 2px 6px;
  background: rgba(255, 106, 0, 0.1);
  color: #ff6a00;
}

.map-compact-content {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  background: #fff;
  z-index: 1;
}

.map-compact-content::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -18px;
  width: 28px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.34) 58%, #fff 100%);
  pointer-events: none;
}

.single-map-card.is-cover-card .map-compact-content {
  position: relative;
  z-index: 1;
  min-height: 136px;
  justify-content: space-between;
  padding: 12px;
}

.single-map-card.is-cover-card .map-compact-content::before {
  display: none;
}

.map-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.compact-top {
  align-items: flex-start;
}

.map-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.map-card-title {
  font-size: 20px;
  font-weight: 900;
  line-height: 1.15;
}

.compact-title {
  font-size: 15px;
  color: #111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.single-map-card.is-cover-card .compact-title,
.single-map-card.is-cover-card .compact-rate,
.single-map-card.is-cover-card .side-rate,
.single-map-card.is-cover-card .side-label,
.single-map-card.is-cover-card .compact-record,
.single-map-card.is-cover-card .map-footer-highlight,
.single-map-card.is-cover-card .map-footer-note {
  color: #fff;
}

.single-map-card.is-cover-card .map-compare-divider {
  color: rgba(255, 255, 255, 0.72);
}

.single-map-card.is-cover-card .map-sample-chip {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
}

.single-map-rate {
  font-size: 34px;
  line-height: 1;
  font-weight: 900;
  font-family: var(--vis-font-display);
}

.compact-rate {
  font-size: 24px;
  color: #111;
  flex-shrink: 0;
  font-style: italic;
  font-variant-numeric: tabular-nums;
}

.single-map-record {
  font-size: 13px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.88);
}

.compact-record {
  font-size: 11px;
  color: #606266;
}

.map-opponents-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
}

.opponents-label {
  flex: 0 0 auto;
  color: #909399;
  font-weight: 700;
}

.opponents-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.opponent-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f5f7fa;
  color: #303133;
  font-weight: 700;
  line-height: 1.35;
}

.opponent-chip.is-win {
  background: rgba(40, 167, 69, 0.12);
  color: #28a745;
}

.opponent-chip.is-loss {
  background: rgba(220, 53, 69, 0.12);
  color: #dc3545;
}

.opponent-chip.is-mixed {
  background: rgba(255, 106, 0, 0.12);
  color: #e05a00;
}

.opponent-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opponent-result {
  font-weight: 800;
}

.map-compare-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  margin-top: auto;
}

.compact-compare-body {
  margin-top: 0;
  align-items: center;
  gap: 6px;
}

.map-compare-side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.map-compare-side:first-child {
  align-items: flex-end;
  text-align: right;
}

.map-compare-side.right-side {
  align-items: flex-start;
  text-align: left;
}

.side-label {
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-rate {
  font-size: 20px;
  line-height: 1;
  font-weight: 900;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-variant-numeric: tabular-nums;
}

.map-compare-divider {
  font-size: 10px;
  font-weight: 800;
  font-family: var(--vis-font-display);
  font-style: italic;
  color: #c0c4cc;
  justify-self: center;
  align-self: center;
  text-align: center;
  width: 28px;
}

.map-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
}

.compact-footer {
  margin-top: 0;
}

.map-footer-highlight {
  font-weight: 800;
  color: #909399;
}

.map-footer-note {
  color: #606266;
  font-weight: 700;
}

@media (max-width: 768px) {
  .map-analysis-panel {
    gap: 16px;
  }

  .analysis-section {
    gap: 8px;
  }

  .heading-title {
    font-size: 14px;
  }

  .mode-accordion-header {
    padding: 9px 10px;
  }

  .mode-accordion-header.is-compare-header {
    grid-template-columns: minmax(58px, 1fr) auto minmax(58px, 1fr) auto auto;
  }

  .mode-accordion-header.is-single-header {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .accordion-center {
    min-width: 72px;
  }

  .mode-side-value,
  .side-rate {
    font-size: 18px;
  }

  .mode-vs-note,
  .accordion-count {
    font-size: 9px;
  }

  .single-map-card {
    grid-template-columns: 86px minmax(0, 1fr);
    min-height: 82px;
  }

  .single-map-card.is-cover-card {
    min-height: 124px;
  }

  .map-compact-content {
    padding: 8px 10px;
  }

  .single-map-card.is-cover-card .map-compact-content {
    min-height: 124px;
    padding: 10px;
  }

  .compact-title {
    font-size: 13px;
  }

  .compact-rate {
    font-size: 20px;
  }
}
</style>
