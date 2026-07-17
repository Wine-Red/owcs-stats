<template>
  <div class="regular-season-container">
    <div class="section-header">
      <h3 class="section-title">积分榜</h3>
      <div v-if="segments.length > 0" class="stage-tabs" :key="segmentSelectKey">
        <div
          v-for="seg in segments"
          :key="seg.key"
          class="stage-tab"
          :class="{ active: seg.key === selectedSegmentKey }"
          :title="seg.title || seg.label"
          @click="selectSegment(seg.key)"
        >
          {{ seg.label }}
        </div>
      </div>
    </div>
    <div class="standings-table-container" v-loading="isInitializing">
      <el-table
        v-if="!isInitializing"
        :data="standings"
        style="width: 100%"
        class="standings-table"
        :row-class-name="tableRowClassName"
        :header-cell-style="{ background: '#f8f9fa', color: '#495057', fontWeight: '700', borderBottom: '2px solid #dee2e6' }"
        :cell-style="{ borderBottom: '1px solid #edf2f7' }"
      >
        <el-table-column label="#" width="40" align="center">
          <template #default="scope">
            <div class="rank-cell">
              <span class="rank-number" :class="{ 'rank-top': scope.$index < 3, 'rank-qualified': isCurrentStage && qualificationCount > 0 && scope.$index < qualificationCount }">{{ scope.$index + 1 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="队伍" min-width="110">
          <template #default="scope">
            <div
              class="team-cell team-cell-clickable"
              role="button"
              tabindex="0"
              :title="`查看 ${scope.row.team.name} 详情`"
              @click="openTeamRoster(scope.row)"
              @keydown.enter.prevent="openTeamRoster(scope.row)"
              @keydown.space.prevent="openTeamRoster(scope.row)"
            >
              <img :src="getTeamLogo(scope.row.team)" class="team-logo" />
              <span class="team-name">{{ scope.row.team.name }}</span>
              <span class="team-roster-cue" aria-hidden="true">›</span>
              <span v-if="isCurrentStage && qualificationCount > 0 && scope.$index < qualificationCount" class="qualification-badge">WORLDS</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="currentTemplate === 'wl_maps'" label="W-L" width="55" align="center">
          <template #default="scope">
            <span class="font-mono wl-cell"><span class="wl-win">{{ scope.row.matchesWon }}</span><span class="wl-sep">-</span><span class="wl-loss">{{ scope.row.matchesLost }}</span></span>
          </template>
        </el-table-column>
        <el-table-column v-if="currentTemplate === 'points_3_0'" label="PTS" width="50" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.points }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Maps" width="55" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.mapsWon }}-{{ scope.row.mapsLost }}</span>
          </template>
        </el-table-column>
        <el-table-column label="+/-" width="45" align="center">
          <template #default="scope">
            <span class="font-mono map-diff" :class="getDiffClass(scope.row.mapDiff)">
              {{ scope.row.mapDiff > 0 ? '+' : '' }}{{ scope.row.mapDiff }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>

  </div>
</template>

<script>
import { computed, ref, watch, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import apiService from '@/services/api';
import { trackPublicEvent } from '@/utils/analytics';

const TBD_LOGO_URL = 'https://owmini.xyz/images/tbd.png';

export default {
  name: 'RegularSeasonBoard',
  props: {
    seasonId: {
      type: [Number, String],
      required: true
    },
    matches: {
      type: Array,
      default: () => []
    },
    mapGames: {
      type: Array,
      default: () => []
    },
    template: {
      type: String,
      default: 'wl_maps'
    },
    scoreStats: {
      type: Array,
      default: () => []
    },
    stageOverrides: {
      type: Object,
      default: () => ({})
    },
    currentStageLabel: {
      type: String,
      default: '当前阶段'
    },
    qualificationCount: {
      type: Number,
      default: 0
    }
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const router = useRouter();
    const snapshots = ref([]);
    const selectedSegmentKey = ref('cumulative');
    const activeScoreStats = ref([]);
    const isInitializing = ref(true);

    const normalizedTemplate = computed(() => {
      return props.template === 'points_3_0' ? 'points_3_0' : 'wl_maps';
    });

    const buildSegments = (snapshotList) => {
      const list = Array.isArray(snapshotList) ? snapshotList : [];
      const segments = [];
      for (let i = 0; i < list.length; i++) {
        const to = list[i];
        const from = i > 0 ? list[i - 1] : null;
        segments.push({
          key: `snap:${from ? from.id : 0}->${to.id}`,
          label: String(to.name || `阶段${i + 1}`),
          title: String(to.name || `阶段${i + 1}`),
          fromSnapshotId: from ? from.id : null,
          toSnapshotId: to.id
        });
      }
      if (list.length > 0) {
        const last = list[list.length - 1];
        const currentLabel = String(props.currentStageLabel || '当前阶段');
        segments.push({
          key: `snap:${last.id}->current`,
          label: currentLabel,
          title: currentLabel,
          fromSnapshotId: last.id,
          toSnapshotId: null
        });
      }
      return segments;
    };

    const segments = computed(() => buildSegments(snapshots.value));
    const segmentSelectKey = computed(() => segments.value.map(s => s.key).join('|'));

    const applyStageOverrides = (rows) => {
      // Return early if rows is empty or not an array to avoid flashing empty state
      if (!Array.isArray(rows) || rows.length === 0) return rows;

      const key = displaySegmentKey.value;
      const override = props.stageOverrides && typeof props.stageOverrides === 'object' ? props.stageOverrides[key] : null;
      if (!override) return rows;

      const hiddenSet = new Set((override.hiddenTeamIds || []).map(v => Number(v)).filter(v => Number.isFinite(v)));
      let filtered = rows.filter(r => !hiddenSet.has(Number(r.team?.id ?? r.teamId)));

      const orderedTeamIds = (override.orderedTeamIds || []).map(v => Number(v)).filter(v => Number.isFinite(v));
      if (orderedTeamIds.length === 0) return filtered;

      const byId = new Map(filtered.map(r => [Number(r.team?.id ?? r.teamId), r]));
      const ordered = [];
      const used = new Set();
      orderedTeamIds.forEach(id => {
        const row = byId.get(id);
        if (row) {
          ordered.push(row);
          used.add(id);
        }
      });
      const rest = filtered.filter(r => !used.has(Number(r.team?.id ?? r.teamId)));
      return ordered.concat(rest);
    };

    const standings = computed(() => {
      if (!props.seasonId) return [];

      const scoreStatsSource = displaySegmentKey.value === 'cumulative'
        ? (Array.isArray(props.scoreStats) ? props.scoreStats : [])
        : (Array.isArray(activeScoreStats.value) ? activeScoreStats.value : []);

      if (scoreStatsSource.length > 0) {
        const standingsArray = scoreStatsSource.map(item => {
          const team = item.team || store.getters.getTeamById(item.teamId) || { id: item.teamId, name: item.teamName || 'Unknown', logo: null };
          const matchesWon = Number(item.matchWin ?? item.matchesWon ?? 0) || 0;
          const matchesLost = Number(item.matchLoss ?? item.matchesLost ?? 0) || 0;
          const mapsWon = Number(item.mapWin ?? item.mapsWon ?? 0) || 0;
          const mapsLost = Number(item.mapLoss ?? item.mapsLost ?? 0) || 0;
          const mapDiff = Number(item.mapDiff ?? (mapsWon - mapsLost)) || 0;
          const points = matchesWon * 3;

          return {
            team,
            matchesWon,
            matchesLost,
            mapsWon,
            mapsLost,
            mapDiff,
            points
          };
        });

        standingsArray.sort((a, b) => {
          if (normalizedTemplate.value === 'points_3_0') {
            if (b.points !== a.points) return b.points - a.points;
            if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
            if (b.mapsWon !== a.mapsWon) return b.mapsWon - a.mapsWon;
            return a.team.name.localeCompare(b.team.name);
          }

          if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
          if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
          if (b.mapsWon !== a.mapsWon) return b.mapsWon - a.mapsWon;
          return a.team.name.localeCompare(b.team.name);
        });

        return applyStageOverrides(standingsArray);
      }

      if (displaySegmentKey.value !== 'cumulative') {
        return [];
      }

      const teams = store.getters.getTeamsBySeasonId(props.seasonId) || [];
      const teamStats = {};

      // Initialize stats
      teams.forEach(team => {
        teamStats[team.id] = {
          team,
          matchesWon: 0,
          matchesLost: 0,
          mapsWon: 0,
          mapsLost: 0,
          mapDiff: 0
        };
      });

      // Calculate Matches W-L
      props.matches.forEach(match => {
        if (teamStats[match.team1Id] && teamStats[match.team2Id]) {
          if (match.winnerId === match.team1Id) {
            teamStats[match.team1Id].matchesWon++;
            teamStats[match.team2Id].matchesLost++;
          } else if (match.winnerId === match.team2Id) {
            teamStats[match.team2Id].matchesWon++;
            teamStats[match.team1Id].matchesLost++;
          }
        }
      });

      // Calculate Maps W-L
      props.mapGames.forEach(mg => {
        const isTeam1 = teamStats[mg.team1Id];
        const isTeam2 = teamStats[mg.team2Id];
        if (isTeam1 && isTeam2) {
          if (mg.winnerId === mg.team1Id) {
            teamStats[mg.team1Id].mapsWon++;
            teamStats[mg.team2Id].mapsLost++;
          } else if (mg.winnerId === mg.team2Id) {
            teamStats[mg.team2Id].mapsWon++;
            teamStats[mg.team1Id].mapsLost++;
          }
        }
      });

      // Calculate Diff and Convert to Array
      const standingsArray = Object.values(teamStats).map(stat => {
        stat.mapDiff = stat.mapsWon - stat.mapsLost;
        stat.points = stat.matchesWon * 3;
        return stat;
      });

      // Sort
      standingsArray.sort((a, b) => {
        if (normalizedTemplate.value === 'points_3_0') {
          if (b.points !== a.points) return b.points - a.points;
          if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
          if (b.mapsWon !== a.mapsWon) return b.mapsWon - a.mapsWon;
          return a.team.name.localeCompare(b.team.name);
        }

        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
        if (b.mapsWon !== a.mapsWon) return b.mapsWon - a.mapsWon;
        return a.team.name.localeCompare(b.team.name);
      });

      return applyStageOverrides(standingsArray);
    });

    const loadSnapshots = async () => {
      if (!props.seasonId) {
        snapshots.value = [];
        return;
      }
      try {
        const res = await apiService.getSeasonStageSnapshots(props.seasonId);
        snapshots.value = Array.isArray(res) ? res : res?.data || [];
      } catch (e) {
        snapshots.value = [];
      }
    };

    const displaySegmentKey = ref('cumulative');

    const refreshScoreStatsForSelection = async (targetKey) => {
      const seg = segments.value.find(s => s.key === targetKey);
      if (!seg || seg.key === 'cumulative') {
        return Array.isArray(props.scoreStats) ? props.scoreStats : [];
      }
      
      const params = {};
      if (seg.fromSnapshotId) params.fromSnapshotId = seg.fromSnapshotId;
      if (seg.toSnapshotId) params.toSnapshotId = seg.toSnapshotId;
      
      try {
        const res = await apiService.getSeasonTeamScoreStats(props.seasonId, params);
        return Array.isArray(res) ? res : res?.data || [];
      } catch (e) {
        return [];
      }
    };

    const pickDefaultSegmentKey = () => {
      const segs = segments.value;
      if (segs.length === 0) return 'cumulative';
      const current = segs.find(s => s.key.endsWith('->current'));
      return current ? current.key : segs[segs.length - 1].key;
    };

    const selectSegment = async (key) => {
      if (key === selectedSegmentKey.value) return;
      const targetKey = key;
      selectedSegmentKey.value = targetKey;
      
      const newData = await refreshScoreStatsForSelection(targetKey);
      
      // Only update if we are still on the same tab we requested
      if (selectedSegmentKey.value === targetKey) {
        activeScoreStats.value = newData;
        displaySegmentKey.value = targetKey;
      }
    };

    watch(() => props.seasonId, async (newVal, oldVal) => {
      if (newVal !== oldVal) {
        isInitializing.value = true;
        // Optimistically set cumulative as default before fetching snapshots
        // This avoids the initial flicker where it renders without overrides
        displaySegmentKey.value = 'cumulative';
        selectedSegmentKey.value = 'cumulative';
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
        
        await loadSnapshots();
        const segs = segments.value;
        if (segs.length === 0) {
          isInitializing.value = false;
          return;
        }
        
        const defaultKey = pickDefaultSegmentKey();
        if (defaultKey === 'cumulative') {
           isInitializing.value = false;
           return; // Already initialized correctly above
        }
        
        selectedSegmentKey.value = defaultKey;
        const newData = await refreshScoreStatsForSelection(defaultKey);
        
        if (selectedSegmentKey.value === defaultKey) {
          activeScoreStats.value = newData;
          displaySegmentKey.value = defaultKey;
        }
        isInitializing.value = false;
      }
    }, { immediate: true });

    watch(() => props.scoreStats, () => {
      if (displaySegmentKey.value === 'cumulative') {
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
      }
    }, { deep: true });

    onMounted(() => {
      if (displaySegmentKey.value === 'cumulative') {
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
      }
    });

    const isCurrentStage = computed(() => {
      return displaySegmentKey.value === 'cumulative' || displaySegmentKey.value.endsWith('->current');
    });

    const getDiffClass = (diff) => {
      if (diff > 0) return 'text-success';
      if (diff < 0) return 'text-danger';
      return 'text-neutral';
    };

    const getTeamLogo = (team) => {
      const logo = String(team?.logo || '').trim();
      return logo || TBD_LOGO_URL;
    };

    const openTeamRoster = (row) => {
      const team = row?.team;
      if (!team?.id || !props.seasonId) return;

      trackPublicEvent('首页-打开战队详情', {
        source: 'regular_season_board',
        seasonId: props.seasonId,
        teamId: team.id
      }, route);

      router.push({
        path: '/visualize/team-detail',
        query: { seasonId: props.seasonId, teamId: team.id }
      });
    };

    const tableRowClassName = ({ rowIndex }) => {
      let classes = [];
      if (isCurrentStage.value && props.qualificationCount > 0 && rowIndex < props.qualificationCount) {
        classes.push('qualified-row');
        if (rowIndex === props.qualificationCount - 1) {
          classes.push('qualified-last-row');
        }
      }
      return classes.join(' ');
    };

    return {
      standings,
      getDiffClass,
      tableRowClassName,
      currentTemplate: normalizedTemplate,
      segments,
      segmentSelectKey,
      selectedSegmentKey,
      selectSegment,
      isInitializing,
      isCurrentStage,
      getTeamLogo,
      openTeamRoster
    };
  }
};
</script>

<style scoped>
.regular-season-container {
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

/* M1 · 斜切标题条：渐变斜块锚点 + 斜体展示字 */
.section-title {
  font-family: var(--vis-font-display);
  font-size: 18px;
  color: var(--vis-text-strong);
  margin: 0;
  font-weight: 800;
  font-style: italic;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.2;
  white-space: nowrap;
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

/* 阶段切换：紧凑 chip 轨道（黑底白字激活，移动端横向滑动） */
.stage-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--vis-bg-muted);
  overflow-x: auto;
  max-width: calc(100% - 120px);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.stage-tabs::-webkit-scrollbar {
  display: none;
}

.stage-tab {
  flex: 0 0 auto;
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vis-text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--vis-dur-fast) var(--vis-ease), color var(--vis-dur-fast) var(--vis-ease), box-shadow var(--vis-dur-fast) var(--vis-ease);
  line-height: 1;
  white-space: nowrap;
  scroll-snap-align: start;
}

/* 抵消 Visualize.vue 全局 .stage-tab 的下划线装饰 */
.stage-tab::after {
  content: none;
}

.stage-tab:hover {
  color: var(--vis-text-strong);
}

.stage-tab.active {
  background: var(--vis-primary-strong);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(17, 17, 17, 0.22);
}

.standings-table-container {
  border-radius: 14px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--vis-bg-card);
  border: 1px solid var(--vis-border);
  box-shadow: var(--vis-shadow);
}

/* 移除最小宽度限制，让表格能在移动端自适应收缩 */
.standings-table {
  width: 100%;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.team-cell-clickable {
  min-height: 36px;
  margin: -3px -5px;
  padding: 3px 5px;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color var(--vis-dur-fast) var(--vis-ease), transform var(--vis-dur-fast) var(--vis-ease);
}

.team-cell-clickable:hover,
.team-cell-clickable:focus-visible {
  background: var(--vis-team-right-soft);
  outline: none;
}

.team-cell-clickable:active {
  transform: translateY(1px);
}

.team-cell-clickable .team-name {
  color: var(--vis-text-strong);
  text-decoration: underline;
  text-decoration-color: rgba(255, 106, 0, 0.35);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.team-cell-clickable:hover .team-name,
.team-cell-clickable:focus-visible .team-name {
  color: var(--vis-accent);
  text-decoration-color: var(--vis-accent);
}

.team-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
}

.team-logo-placeholder {
  width: 24px;
  height: 24px;
  background: var(--vis-bg-muted);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: var(--vis-text-secondary);
  flex-shrink: 0;
}

.team-name {
  font-family: var(--vis-font-body);
  font-weight: 600;
  color: var(--vis-text-primary);
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-roster-cue {
  flex: 0 0 auto;
  color: var(--vis-accent);
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  opacity: 0.72;
  transform: translateY(-1px);
}

.font-mono {
  font-family: var(--vis-font-numeric);
  font-weight: 600;
  font-size: 13px;
  color: var(--vis-text-primary);
  font-variant-numeric: tabular-nums;
}

/* 胜/负分列着色：success/error 只落在数字上，不整行染色 */
.wl-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
}

.wl-win {
  color: var(--vis-success);
  font-weight: 700;
}

.wl-sep {
  color: var(--vis-text-disabled);
}

.wl-loss {
  color: var(--vis-error);
  font-weight: 700;
}

.map-diff {
  display: inline-block;
  min-width: 20px;
  text-align: right;
  font-weight: 700;
}

.text-success {
  color: var(--vis-success);
}

.text-danger {
  color: var(--vis-error);
}

.text-neutral {
  color: var(--vis-text-tertiary);
}

.rank-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* M4 · 排名数字：默认 #909399，前三/晋级位渐变橙斜体 */
.rank-number {
  font-family: var(--vis-font-numeric);
  font-size: 14px;
  font-weight: 700;
  color: var(--vis-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 修复：渐变裁剪区域（background-clip:text 只覆盖 padding box）小于
   斜体字形墨迹范围时，数字底部与右侧斜伸部分会被裁掉。
   通过加大 line-height + 四周 padding 扩大绘制区域，保证完整显示。 */
.rank-top,
.rank-qualified {
  display: inline-block;
  font-style: italic;
  font-weight: 900;
  color: transparent;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: var(--vis-primary-gradient);
  background-size: 100% 100%;
  line-height: 1.4;
  padding: 2px 3px 3px 1px;
  overflow: visible;
}

/* 晋级区：仅左侧渐变窄条 + 底部分隔，不整行染色 */
:deep(.el-table__row.qualified-row > td:first-child) {
  position: relative;
}

:deep(.el-table__row.qualified-row > td:first-child::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--vis-primary-gradient);
}

:deep(.el-table__row.qualified-last-row > td.el-table__cell) {
  border-bottom: 1px solid var(--vis-border-strong) !important;
}

.qualification-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 5px;
  font-size: 9px;
  font-weight: 800;
  color: #ffffff;
  background: var(--vis-primary-gradient);
  border-radius: 3px;
  clip-path: polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px));
  text-transform: uppercase;
  letter-spacing: 0.4px;
  line-height: 1.1;
  flex-shrink: 0;
}

/* 表头：11px / 700 / #909399 / 大写字距（覆盖 inline header-cell-style） */
:deep(.el-table th.el-table__cell) {
  background-color: var(--vis-bg-subtle) !important;
  color: var(--vis-text-tertiary) !important;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--vis-border-strong) !important;
  padding: 8px 0;
}

:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid var(--vis-border) !important;
}

:deep(.el-table__body tr:last-child > td.el-table__cell) {
  border-bottom: none !important;
}

/* 行 hover：轻微浅灰 */
:deep(.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background-color: var(--vis-bg-subtle) !important;
}

@media (max-width: 768px) {
  .section-header {
    gap: 8px;
    margin-bottom: 8px;
  }

  .section-title {
    font-size: 16px;
  }

  .section-title::before {
    height: 14px;
  }

  .stage-tabs {
    max-width: calc(100% - 96px);
    padding: 2px;
  }

  .stage-tab {
    min-height: 28px;
    padding: 4px 9px;
    font-size: 10.5px;
  }

  .standings-table-container {
    border-radius: 12px;
  }

  :deep(.el-table .cell) {
    padding: 0 3px;
    line-height: 1.3;
  }

  :deep(.el-table th.el-table__cell) {
    padding: 6px 0;
    font-size: 10.5px;
    letter-spacing: 0.2px;
  }

  :deep(.el-table td.el-table__cell) {
    padding: 6px 0;
  }

  .team-name {
    font-size: 12.5px;
  }

  .team-logo {
    width: 22px;
    height: 22px;
  }

  .font-mono {
    font-size: 12.5px;
  }

  .rank-number {
    font-size: 13px;
  }

  .team-cell {
    gap: 4px;
  }

  .team-cell-clickable {
    min-height: 36px;
    padding: 4px 5px;
  }

  .team-roster-cue {
    font-size: 14px;
  }

  .qualification-badge {
    font-size: 8px;
    margin-left: 4px;
  }
}

@media (max-width: 420px) {
  .section-title {
    font-size: 15px;
  }

  .stage-tabs {
    max-width: calc(100% - 84px);
  }

  .team-name {
    font-size: 12px;
  }

  .font-mono {
    font-size: 12px;
  }
}
</style>
