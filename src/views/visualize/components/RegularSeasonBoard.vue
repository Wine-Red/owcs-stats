<template>
  <div class="regular-season-container">
    <h3 class="section-title">Regular Season Standings</h3>
    <div class="standings-table-container">
      <el-table
        :data="standings"
        style="width: 100%"
        class="standings-table"
        :row-class-name="tableRowClassName"
        :header-cell-style="{ background: '#f8f9fa', color: '#495057', fontWeight: '700', borderBottom: '2px solid #dee2e6' }"
        :cell-style="{ borderBottom: '1px solid #edf2f7' }"
      >
        <el-table-column label="#" width="40" align="center">
          <template #default="scope">
            <span class="rank-number">{{ scope.$index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Team" min-width="120">
          <template #default="scope">
            <div class="team-cell">
              <img v-if="scope.row.team.logo" :src="scope.row.team.logo" class="team-logo" />
              <div v-else class="team-logo-placeholder">{{ scope.row.team.name.charAt(0) }}</div>
              <span class="team-name">{{ scope.row.team.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="W-L" width="70" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.matchesWon }}-{{ scope.row.matchesLost }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Maps" width="70" align="center">
          <template #default="scope">
            <span class="font-mono">{{ scope.row.mapsWon }}-{{ scope.row.mapsLost }}</span>
          </template>
        </el-table-column>
        <el-table-column label="+/-" width="60" align="center">
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
import { computed } from 'vue';
import { useStore } from 'vuex';

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
    }
  },
  setup(props) {
    const store = useStore();

    const standings = computed(() => {
      if (!props.seasonId) return [];

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
        return stat;
      });

      // Sort
      standingsArray.sort((a, b) => {
        // 1. Match wins
        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        // 2. Map diff
        if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
        // 3. Map wins
        if (b.mapsWon !== a.mapsWon) return b.mapsWon - a.mapsWon;
        // 4. Alphabetical
        return a.team.name.localeCompare(b.team.name);
      });

      return standingsArray;
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
      tableRowClassName
    };
  }
};
</script>

<style scoped>
.regular-season-container {
  margin-bottom: 24px;
}

.section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  color: #1a1a1a;
  margin: 0 0 16px 0;
  font-weight: 700;
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
</style>
