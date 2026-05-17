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
              <span class="rank-number" :class="{ 'rank-qualified': isCurrentStage && qualificationCount > 0 && scope.$index < qualificationCount }">{{ scope.$index + 1 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="队伍" min-width="110">
          <template #default="scope">
            <div
              class="team-cell team-cell-clickable"
              role="button"
              tabindex="0"
              :title="`查看 ${scope.row.team.name} 阵容`"
              @click="openTeamRoster(scope.row)"
              @keydown.enter.prevent="openTeamRoster(scope.row)"
              @keydown.space.prevent="openTeamRoster(scope.row)"
            >
              <img v-if="scope.row.team.logo" :src="scope.row.team.logo" class="team-logo" />
              <div v-else class="team-logo-placeholder">{{ scope.row.team.name.charAt(0) }}</div>
              <span class="team-name">{{ scope.row.team.name }}</span>
              <span class="team-roster-cue" aria-hidden="true">›</span>
              <span v-if="isCurrentStage && qualificationCount > 0 && scope.$index < qualificationCount" class="qualification-badge">WORLDS</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="currentTemplate === 'wl_maps'" label="W-L" width="55" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.matchesWon }}-{{ scope.row.matchesLost }}</span>
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

    <Transition name="modal-fade">
      <div v-if="rosterDialogVisible" class="roster-modal-overlay" @click.self="closeTeamRoster">
        <div class="roster-modal-content">
          <button class="roster-close-button" type="button" aria-label="关闭" @click="closeTeamRoster">×</button>

          <div class="roster-dialog-header">
            <div class="roster-team-identity">
              <img v-if="selectedTeam?.logo" :src="selectedTeam.logo" class="roster-team-logo" />
              <div v-else class="roster-team-logo roster-team-logo-placeholder">{{ selectedTeamInitial }}</div>
              <div class="roster-title-block">
                <div class="roster-eyebrow">当前赛季阵容</div>
                <div class="roster-team-name">{{ selectedTeam?.name || '队伍阵容' }}</div>
              </div>
            </div>
          </div>

          <div class="roster-dialog-body" v-loading="rosterLoading">
            <div v-if="rosterError" class="roster-empty-state">{{ rosterError }}</div>
            <div v-else-if="!rosterLoading && rosterPlayers.length === 0" class="roster-empty-state">暂无人员配置</div>
            <div v-else class="roster-list">
              <section
                v-for="group in rosterGroups"
                :key="group.key"
                class="roster-role-section"
              >
                <div class="roster-role-header">
                  <img :src="getRoleIcon(group.key)" class="roster-role-icon" :alt="group.label" />
                  <span>{{ group.label }}</span>
                  <span class="roster-role-count">{{ group.players.length }}</span>
                </div>
                <div class="roster-player-list">
                  <div
                    v-for="player in group.players"
                    :key="player.id"
                    class="roster-player-row"
                  >
                    <span class="roster-player-name">{{ player.name }}</span>
                    <span class="roster-player-time">{{ formatGameTime(player.gameTime) }}</span>
                  </div>
                  <div v-if="group.players.length === 0" class="roster-player-empty">未配置</div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </Transition>
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
    },
    qualificationCount: {
      type: Number,
      default: 0
    }
  },
  setup(props) {
    const store = useStore();
    const snapshots = ref([]);
    const selectedSegmentKey = ref('cumulative');
    const activeScoreStats = ref([]);
    const isInitializing = ref(true);
    const rosterDialogVisible = ref(false);
    const selectedTeam = ref(null);
    const rosterPlayers = ref([]);
    const rosterLoading = ref(false);
    const rosterError = ref('');
    const rosterCache = ref(new Map());
    const seasonPlayerStatsCache = ref(new Map());

    const roleMeta = [
      { key: 'tank', label: '重装' },
      { key: 'damage', label: '输出' },
      { key: 'support', label: '支援' }
    ];

    const roleOrder = {
      tank: 1,
      damage: 2,
      support: 3
    };

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

    const selectedTeamInitial = computed(() => {
      return selectedTeam.value?.name ? selectedTeam.value.name.charAt(0) : '';
    });

    const normalizeApiList = (res) => {
      return Array.isArray(res) ? res : res?.data || res?.list || [];
    };

    const buildPlayerStatMap = (stats, teamId) => {
      const teamIdNum = Number(teamId);
      const map = new Map();
      normalizeApiList(stats)
        .filter(stat => Number(stat.teamId) === teamIdNum)
        .forEach(stat => {
          if (stat.playerId) map.set(Number(stat.playerId), stat);
          if (stat.playerName) map.set(`name:${String(stat.playerName).trim().toLowerCase()}`, stat);
        });
      return map;
    };

    const normalizeRosterPlayers = (items, playerStatMap = new Map()) => {
      return normalizeApiList(items)
        .map(item => item.player || item.Player || store.getters.getPlayerById(item.playerId))
        .filter(Boolean)
        .map(player => {
          const stat = playerStatMap.get(Number(player.id)) || playerStatMap.get(`name:${String(player.name || '').trim().toLowerCase()}`);
          return {
            id: player.id,
            name: player.name || 'Unknown',
            role: ['tank', 'damage', 'support'].includes(player.role) ? player.role : 'damage',
            gameTime: Number(stat?.gameTime ?? 0) || 0
          };
        })
        .sort((a, b) => {
          const roleDiff = (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
          if (roleDiff !== 0) return roleDiff;
          if (b.gameTime !== a.gameTime) return b.gameTime - a.gameTime;
          return String(a.name).localeCompare(String(b.name));
        });
    };

    const loadSeasonPlayerStats = async () => {
      const seasonId = Number(props.seasonId);
      if (!Number.isFinite(seasonId)) return [];
      if (seasonPlayerStatsCache.value.has(seasonId)) {
        return seasonPlayerStatsCache.value.get(seasonId);
      }
      const res = await apiService.getSeasonPlayerStats(seasonId);
      const stats = normalizeApiList(res);
      seasonPlayerStatsCache.value.set(seasonId, stats);
      return stats;
    };

    const findSeasonTeam = async (teamId) => {
      const seasonIdNum = Number(props.seasonId);
      const teamIdNum = Number(teamId);
      const localSeasonTeam = store.state.seasonTeams.find(st => (
        Number(st.seasonId) === seasonIdNum && Number(st.teamId) === teamIdNum
      ));
      if (localSeasonTeam) return localSeasonTeam;

      const allSeasonTeams = normalizeApiList(await apiService.getAllSeasonTeams());
      const filteredSeasonTeams = allSeasonTeams.filter(st => Number(st.seasonId) === seasonIdNum);
      store.commit('setSeasonTeams', filteredSeasonTeams);
      return filteredSeasonTeams.find(st => Number(st.teamId) === teamIdNum) || null;
    };

    const openTeamRoster = async (row) => {
      const team = row?.team;
      if (!team?.id || !props.seasonId) return;

      selectedTeam.value = team;
      rosterDialogVisible.value = true;
      rosterError.value = '';

      const cacheKey = `${props.seasonId}:${team.id}`;
      if (rosterCache.value.has(cacheKey)) {
        rosterPlayers.value = rosterCache.value.get(cacheKey);
        return;
      }

      rosterLoading.value = true;
      rosterPlayers.value = [];
      try {
        const seasonTeam = await findSeasonTeam(team.id);
        if (!seasonTeam?.id) {
          rosterError.value = '当前赛季未找到该队伍的人员配置';
          return;
        }

        const [res, seasonStats] = await Promise.all([
          apiService.getSeasonTeamPlayers(seasonTeam.id),
          loadSeasonPlayerStats()
        ]);
        const players = normalizeRosterPlayers(res, buildPlayerStatMap(seasonStats, team.id));
        rosterCache.value.set(cacheKey, players);
        rosterPlayers.value = players;
      } catch (error) {
        console.error('Failed to load team roster', error);
        rosterError.value = '人员配置加载失败';
      } finally {
        rosterLoading.value = false;
      }
    };

    const closeTeamRoster = () => {
      rosterDialogVisible.value = false;
    };

    const rosterGroups = computed(() => {
      return roleMeta.map(role => ({
        ...role,
        players: rosterPlayers.value.filter(player => player.role === role.key)
      }));
    });

    const formatGameTime = (minutesFloat) => {
      const totalSeconds = Math.round((Number(minutesFloat) || 0) * 60);
      if (totalSeconds <= 0) return '0:00';
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    const getRoleIcon = (role) => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      if (role === 'tank') return `${baseUrl}icons/role/Tank.png`;
      if (role === 'support') return `${baseUrl}icons/role/Support.png`;
      return `${baseUrl}icons/role/DPS.png`;
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
      rosterDialogVisible,
      selectedTeam,
      selectedTeamInitial,
      rosterPlayers,
      rosterLoading,
      rosterError,
      rosterGroups,
      openTeamRoster,
      closeTeamRoster,
      formatGameTime,
      getRoleIcon
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
  margin-bottom: 8px;
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
  gap: 6px; /* 减小间距 */
  width: 100%;
}

.team-cell-clickable {
  min-height: 30px;
  margin: -3px -5px;
  padding: 3px 5px;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.team-cell-clickable:hover,
.team-cell-clickable:focus-visible {
  background: rgba(255, 158, 15, 0.08);
  outline: none;
}

.team-cell-clickable:active {
  transform: translateY(1px);
}

.team-cell-clickable .team-name {
  color: #111;
  text-decoration: underline;
  text-decoration-color: rgba(255, 158, 15, 0.42);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.team-cell-clickable:hover .team-name,
.team-cell-clickable:focus-visible .team-name {
  color: #ff6a00;
  text-decoration-color: #ff6a00;
}

.team-logo {
  width: 24px; /* 减小 logo 尺寸 */
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.team-name {
  font-weight: 600;
  color: #333;
  font-size: 13px;
  white-space: nowrap;
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-roster-cue {
  flex: 0 0 auto;
  color: #ff8a00;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
  opacity: 0.72;
  transform: translateY(-1px);
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

.rank-qualified {
  color: transparent;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: linear-gradient(135deg, #facc15 0%, #ff8a00 100%);
  text-shadow: 0 0 8px rgba(250, 204, 21, 0.4);
  font-size: 1.1em;
}

:deep(.el-table__row.qualified-row > td.el-table__cell) {
  background-color: rgba(250, 204, 21, 0.06) !important;
}

:deep(.el-table--enable-row-hover .el-table__body tr.qualified-row:hover > td.el-table__cell) {
  background-color: rgba(250, 204, 21, 0.1) !important;
}

:deep(.el-table__row.qualified-row > td:first-child) {
  position: relative;
}

:deep(.el-table__row.qualified-row > td:first-child::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: rgba(250, 204, 21, 0.8);
  border-top-right-radius: 2px;
  border-bottom-right-radius: 2px;
}

:deep(.el-table__row.qualified-row > td:last-child) {
  position: relative;
}

:deep(.el-table__row.qualified-row > td:last-child::after) {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 80px;
  background: linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%);
  pointer-events: none;
}

:deep(.el-table__row.qualified-last-row > td.el-table__cell) {
  border-bottom: 2px dashed rgba(250, 204, 21, 0.4) !important;
}

.qualification-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 700;
  color: #c98e00;
  background: linear-gradient(135deg, rgba(254, 240, 138, 0.5) 0%, rgba(253, 224, 71, 0.4) 100%);
  border: 1px solid rgba(250, 204, 21, 0.4);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.2px;
  line-height: 1.1;
  box-shadow: none;
  flex-shrink: 0;
}

.rank-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.roster-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.roster-modal-content {
  position: relative;
  width: 100%;
  max-width: 560px;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .roster-modal-content,
.modal-fade-leave-active .roster-modal-content {
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .roster-modal-content,
.modal-fade-leave-to .roster-modal-content {
  transform: translateY(20px) scale(0.95);
  opacity: 0;
}

.roster-dialog-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 56px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f0f0f0;
  color: #111111;
}

.roster-team-identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}

.roster-team-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
  flex: 0 0 auto;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.05));
}

.roster-team-logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #111111;
  font-weight: 800;
}

.roster-title-block {
  min-width: 0;
}

.roster-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: #909399;
  letter-spacing: 0;
  margin-bottom: 4px;
}

.roster-team-name {
  font-size: 20px;
  line-height: 1.15;
  font-weight: 800;
  color: #111111;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roster-close-button {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #666666;
  font-size: 24px;
  line-height: 30px;
  cursor: pointer;
  z-index: 2;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.roster-close-button:hover,
.roster-close-button:focus-visible {
  background: rgba(0, 0, 0, 0.04);
  color: #111111;
  outline: none;
}

.roster-dialog-body {
  min-height: 180px;
  padding: 14px 24px 22px;
  background: #ffffff;
}

.roster-list {
  display: grid;
  gap: 0;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

.roster-role-section + .roster-role-section {
  border-top: 1px solid #f0f0f0;
}

.roster-role-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 14px;
  background: #f7f8fa;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  font-weight: 800;
  color: #111111;
}

.roster-role-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  filter: brightness(0);
  flex: 0 0 auto;
}

.roster-role-count {
  margin-left: auto;
  color: #909399;
  font-family: 'Oxanium', monospace;
  font-size: 12px;
  font-weight: 800;
}

.roster-player-list {
  display: grid;
  align-content: start;
  padding: 0;
}

.roster-player-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 40px;
  padding: 9px 14px;
  color: #111111;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.2;
}

.roster-player-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roster-player-time {
  color: #606266;
  font-family: 'Oxanium', monospace;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.roster-player-row + .roster-player-row {
  border-top: 1px solid #f5f5f5;
}

.roster-player-empty,
.roster-empty-state {
  color: #909399;
  font-size: 13px;
  font-weight: 600;
}

.roster-player-empty {
  padding: 10px 14px;
}

.roster-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  border-radius: 8px;
  background: #f8f9fa;
  border: 1px dashed #dcdfe6;
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
    margin: 0 0 6px 0;
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
  .team-cell-clickable {
    min-height: 32px;
    padding: 4px 5px;
  }
  .team-roster-cue {
    font-size: 14px;
  }
  .roster-modal-overlay {
    padding: 8px;
    align-items: center;
  }
  .roster-modal-content {
    max-width: none;
    max-height: 98vh;
    border-radius: 8px;
  }
  .roster-dialog-header {
    justify-content: flex-start;
    padding: 12px 44px 12px 12px;
  }
  .roster-team-logo {
    width: 30px;
    height: 30px;
  }
  .roster-team-identity {
    gap: 8px;
  }
  .roster-eyebrow {
    font-size: 10px;
    margin-bottom: 2px;
  }
  .roster-team-name {
    font-size: 16px;
  }
  .roster-dialog-body {
    padding: 10px 12px 12px;
  }
  .roster-list {
    border-radius: 6px;
  }
  .roster-role-header {
    min-height: 34px;
    gap: 6px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .roster-role-icon {
    width: 15px;
    height: 15px;
  }
  .roster-role-count {
    font-size: 11px;
  }
  .roster-player-row {
    min-height: 36px;
    padding: 8px 10px;
    font-size: 12px;
    gap: 8px;
  }
  .roster-player-name {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
  }
  .roster-player-time {
    font-size: 11px;
  }
  .roster-player-empty {
    padding: 8px 10px;
    font-size: 11px;
  }
  .roster-close-button {
    top: 10px;
    right: 10px;
    width: 28px;
    height: 28px;
    font-size: 22px;
  }
}
</style>
