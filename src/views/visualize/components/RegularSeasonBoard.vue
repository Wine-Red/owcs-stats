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
    <div class="standings-table-container">
      <el-table
        :data="standings"
        style="width: 100%"
        class="standings-table"
        :row-class-name="tableRowClassName"
        :header-cell-style="{ background: '#f8f9fa', color: '#495057', fontWeight: '700', borderBottom: '2px solid #dee2e6' }"
        :cell-style="{ borderBottom: '1px solid #edf2f7' }"
      >
        <el-table-column label="#" width="50" align="center">
          <template #default="scope">
            <span class="rank-number">{{ scope.$index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="队伍" min-width="100">
          <template #default="scope">
            <div class="team-cell">
              <img v-if="scope.row.team.logo" :src="scope.row.team.logo" class="team-logo" />
              <div v-else class="team-logo-placeholder">{{ scope.row.team.name.charAt(0) }}</div>
              <span class="team-name">{{ scope.row.team.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="template === 'wl_maps'" label="W-L" width="65" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.matchesWon }}-{{ scope.row.matchesLost }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="template === 'points_3_0'" label="PTS" width="55" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.points }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Maps" width="65" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.mapsWon }}-{{ scope.row.mapsLost }}</span>
          </template>
        </el-table-column>
        <el-table-column label="+/-" width="55" align="center">
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
import apiService from '@/services/api';

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
    }
  },
  setup(props) {
    const store = useStore();
    const snapshots = ref([]);
    const selectedSegmentKey = ref('cumulative');
    const activeScoreStats = ref([]);

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
      const key = selectedSegmentKey.value;
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

      const scoreStatsSource = selectedSegmentKey.value === 'cumulative'
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

      if (selectedSegmentKey.value !== 'cumulative') {
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

    const refreshScoreStatsForSelection = async () => {
      const seg = segments.value.find(s => s.key === selectedSegmentKey.value);
      if (!seg) {
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
        return;
      }
      try {
        const params = {};
        if (seg.fromSnapshotId) params.fromSnapshotId = seg.fromSnapshotId;
        if (seg.toSnapshotId) params.toSnapshotId = seg.toSnapshotId;
        const res = await apiService.getSeasonTeamScoreStats(props.seasonId, params);
        activeScoreStats.value = Array.isArray(res) ? res : res?.data || [];
      } catch (e) {
        activeScoreStats.value = [];
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
      selectedSegmentKey.value = key;
      await refreshScoreStatsForSelection();
    };

    watch(() => props.seasonId, async () => {
      activeScoreStats.value = [];
      selectedSegmentKey.value = 'cumulative';
      await loadSnapshots();
      const segs = segments.value;
      if (segs.length === 0) {
        selectedSegmentKey.value = 'cumulative';
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
        return;
      }
      selectedSegmentKey.value = pickDefaultSegmentKey();
      await refreshScoreStatsForSelection();
    }, { immediate: true });

    watch(() => props.scoreStats, () => {
      if (selectedSegmentKey.value === 'cumulative') {
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
      }
    }, { deep: true });

    onMounted(() => {
      if (selectedSegmentKey.value === 'cumulative') {
        activeScoreStats.value = Array.isArray(props.scoreStats) ? props.scoreStats : [];
      }
    });

    const getDiffClass = (diff) => {
      if (diff > 0) return 'text-success';
      if (diff < 0) return 'text-danger';
      return 'text-neutral';
    };

    const tableRowClassName = ({ rowIndex }) => {
      if (rowIndex < 3) {
        return 'top-rank-row';
      }
      return '';
    };

    return {
      standings,
      getDiffClass,
      tableRowClassName,
      template: normalizedTemplate,
      segments,
      segmentSelectKey,
      selectedSegmentKey,
      selectSegment
    };
  }
};
</script>

<style scoped>
.regular-season-container {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  color: #1a1a1a;
  margin: 0;
  font-weight: 700;
}

.stage-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: #f0f2f5;
  overflow-x: auto;
  max-width: calc(100% - 120px);
}

.stage-tab {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  color: #606266;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  line-height: 1;
  white-space: nowrap;
}

.stage-tab:hover {
  color: #1a1a1a;
}

.stage-tab.active {
  background: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.standings-table-container {
  border-radius: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  background: #ffffff;
}

/* 移除最小宽度限制，让表格能在移动端自适应收缩 */
.standings-table {
  width: 100%;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 8px; /* 减小间距 */
}

.team-logo {
  width: 24px; /* 减小 logo 尺寸 */
  height: 24px;
  object-fit: contain;
}

.team-logo-placeholder {
  width: 24px;
  height: 24px;
  background: #f0f2f5;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: #666;
}

.team-name {
  font-weight: 600;
  color: #333;
  font-size: 14px; /* 减小字体大小 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-mono {
  font-family: 'Oxanium', monospace;
  font-weight: 600;
  font-size: 14px; /* 减小字体大小 */
}

.map-diff {
  display: inline-block;
  min-width: 20px;
  text-align: right;
}

.text-success {
  color: #28a745;
}

.text-danger {
  color: #dc3545;
}

.text-neutral {
  color: #6c757d;
}

.rank-number {
  font-family: 'Oxanium', monospace;
  font-weight: 700;
  color: #666;
}

:deep(.top-rank-row) {
  background-color: rgba(255, 158, 15, 0.03);
}

:deep(.el-table th.el-table__cell) {
  background-color: #f8f9fa;
  color: #495057;
  font-weight: 700;
  border-bottom: 2px solid #dee2e6;
}

:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid #edf2f7;
}

@media (max-width: 768px) {
  .section-title {
    margin: 0 0 10px 0;
  }
  :deep(.el-table .cell) {
    padding: 0 4px;
  }
  :deep(.el-table th.el-table__cell) {
    padding: 6px 0;
  }
  :deep(.el-table td.el-table__cell) {
    padding: 6px 0;
  }
  .team-name {
    font-size: 13px;
  }
  .font-mono {
    font-size: 13px;
  }
  .team-cell {
    gap: 4px;
  }
}
</style>
