<template>
  <div class="recent-matches-container">
    <div v-for="group in displayedMatches" :key="group.date" class="vis-grid overview-section group-block">
      <div class="vis-col span-12">
        <div class="liquipedia-matches-container">
          <div class="match-date-header">{{ group.formattedDate }}</div>

          <div class="matches-list">
            <div v-for="match in group.matches" :key="match.id" class="match-row" @click="goToMatchDetail(match)">
              <div class="match-content">
                <div class="team-side left-side">
                  <span class="team-name" :class="{ 'winner-name': match.winnerId === match.team1Id }">
                    {{ getTeamName(match.team1Id) }}
                  </span>
                  <div class="team-logo-container">
                    <img :src="getTeamLogo(match.team1Id)" class="team-logo" alt="" />
                  </div>
                </div>

                <div class="score-section">
                  <div class="score-row">
                    <span class="winner-arrow left-arrow" :class="{ visible: match.winnerId === match.team1Id }">◀</span>
                    <span class="score-number">{{ match.team1Score !== null ? match.team1Score : '-' }}</span>
                    <span class="score-colon">:</span>
                    <span class="score-number">{{ match.team2Score !== null ? match.team2Score : '-' }}</span>
                    <span class="winner-arrow right-arrow" :class="{ visible: match.winnerId === match.team2Id }">▶</span>
                  </div>
                  <div class="bo-format" v-if="match.boFormat">({{ match.boFormat }})</div>
                </div>

                <div class="team-side right-side">
                  <div class="team-logo-container">
                    <img :src="getTeamLogo(match.team2Id)" class="team-logo" alt="" />
                  </div>
                  <span class="team-name" :class="{ 'winner-name': match.winnerId === match.team2Id }">
                    {{ getTeamName(match.team2Id) }}
                  </span>
                </div>
              </div>

              <div class="match-replays" v-if="hasMapGames(match.id)">
                <div class="replay-label" @click.stop="toggleReplays(match.id)">
                  <el-icon><VideoCamera /></el-icon>
                  <span>回放</span>
                  <el-icon class="expand-icon" :class="{ 'is-expanded': isReplaysExpanded(match.id) }"><ArrowDown /></el-icon>
                </div>

                <el-collapse-transition>
                  <div v-show="isReplaysExpanded(match.id)">
                    <div class="replay-tags">
                      <template v-for="(item, index) in getMapGamesInfo(match.id)" :key="item.mapId + '-' + index">
                        <span
                          v-if="item.code"
                          class="replay-tag"
                          :title="`点击复制 ${item.mapName} 代码`"
                          @click.stop="copyCode(item.code, $event)"
                        >
                          <span class="replay-map-name">{{ item.mapName }}</span>
                          <span class="replay-code">{{ item.code }}</span>
                          <el-icon class="copy-icon"><DocumentCopy /></el-icon>
                        </span>
                        <span v-else class="replay-tag disabled" title="暂无回放代码" @click.stop>
                          <span class="replay-map-name">{{ item.mapName }}</span>
                          <span class="replay-code empty-code">-</span>
                        </span>
                      </template>
                    </div>
                  </div>
                </el-collapse-transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="hasMoreMatches" class="show-more-container">
      <el-button @click="toggleShowAll" plain size="large" class="show-more-btn">
        {{ showAllMatches ? '收起全部比赛' : '查看全部比赛' }}
        <el-icon class="el-icon--right">
          <component :is="showAllMatches ? 'ArrowUp' : 'ArrowDown'" />
        </el-icon>
      </el-button>
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowUp, ArrowDown, VideoCamera, DocumentCopy } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const TBD_LOGO_URL = 'https://owmini.xyz/images/tbd.png';

export default {
  name: 'RecentMatches',
  components: {
    ArrowUp,
    ArrowDown,
    VideoCamera,
    DocumentCopy
  },
  props: {
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
    const router = useRouter();
    const showAllMatches = ref(false);
    const expandedReplays = ref(new Set());

    const allDatesSorted = computed(() => {
      return [...new Set(
        props.matches
          .map(match => match.matchDate)
          .filter(Boolean)
      )].sort((a, b) => new Date(b) - new Date(a));
    });

    const hasMoreMatches = computed(() => allDatesSorted.value.length > 2);

    const displayedMatches = computed(() => {
      if (!props.matches?.length) return [];

      const targetDates = showAllMatches.value ? allDatesSorted.value : allDatesSorted.value.slice(0, 2);
      const filteredMatches = props.matches
        .filter(match => targetDates.includes(match.matchDate))
        .sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));

      const groups = {};
      filteredMatches.forEach(match => {
        if (!groups[match.matchDate]) {
          groups[match.matchDate] = {
            date: match.matchDate,
            formattedDate: formatDateStr(match.matchDate),
            matches: []
          };
        }
        groups[match.matchDate].matches.push(match);
      });

      return Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    const toggleShowAll = () => {
      showAllMatches.value = !showAllMatches.value;
    };

    const toggleReplays = (matchId) => {
      if (expandedReplays.value.has(matchId)) {
        expandedReplays.value.delete(matchId);
      } else {
        expandedReplays.value.add(matchId);
      }
    };

    const isReplaysExpanded = (matchId) => expandedReplays.value.has(matchId);

    const formatDateStr = (dateStr) => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      } catch (error) {
        return dateStr;
      }
    };

    const getTeamName = (teamId) => {
      const team = store.state.teams.find(item => String(item.id) === String(teamId));
      return team ? team.name : 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      const team = store.state.teams.find(item => String(item.id) === String(teamId));
      const logo = String(team?.logo || '').trim();
      return logo || TBD_LOGO_URL;
    };

    const getMapName = (mapId) => {
      const map = store.state.maps.find(item => String(item.id) === String(mapId));
      return map ? map.name : '未知地图';
    };

    const hasMapGames = (matchId) => {
      return Array.isArray(props.mapGames) && props.mapGames.some(mapGame => String(mapGame.matchId) === String(matchId));
    };

    const getMapGamesInfo = (matchId) => {
      if (!Array.isArray(props.mapGames)) return [];
      return [...props.mapGames]
        .filter(mapGame => String(mapGame.matchId) === String(matchId))
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map(mapGame => ({
          mapId: mapGame.mapId,
          mapName: getMapName(mapGame.mapId),
          code: mapGame.replayId && mapGame.replayId.trim() ? mapGame.replayId.trim() : null
        }));
    };

    const copyCode = async (code, event) => {
      if (event) event.stopPropagation();
      try {
        await navigator.clipboard.writeText(code);
        ElMessage.success({ message: `录像代码 ${code} 已复制`, duration: 2000 });
      } catch (error) {
        ElMessage.error('复制失败');
      }
    };

    const goToMatchDetail = (match) => {
      const matchData = {
        id: match.id,
        seasonId: match.seasonId,
        tournamentName: match.tournamentName || '',
        matchDate: match.matchDate || '',
        boFormat: match.boFormat || '',
        team1Id: match.team1Id,
        team2Id: match.team2Id,
        team1Name: getTeamName(match.team1Id),
        team2Name: getTeamName(match.team2Id),
        team1Logo: getTeamLogo(match.team1Id),
        team2Logo: getTeamLogo(match.team2Id),
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        winnerId: match.winnerId
      };

      sessionStorage.setItem('current_match_detail', JSON.stringify(matchData));

      router.push({
        path: '/visualize/match-detail',
        query: {
          matchId: String(match.id),
          seasonId: String(match.seasonId || ''),
          tab: 'recent',
          from: 'visualize',
          tournament: match.tournamentName || '',
          team1Id: String(match.team1Id || ''),
          team2Id: String(match.team2Id || ''),
          team1: matchData.team1Name,
          team2: matchData.team2Name,
          team1Logo: matchData.team1Logo,
          team2Logo: matchData.team2Logo
        }
      });
    };

    return {
      displayedMatches,
      showAllMatches,
      hasMoreMatches,
      toggleShowAll,
      getTeamName,
      getTeamLogo,
      hasMapGames,
      getMapGamesInfo,
      copyCode,
      toggleReplays,
      isReplaysExpanded,
      goToMatchDetail
    };
  }
};
</script>

<style scoped>
.recent-matches-container {
  width: 100%;
}

.group-block {
  margin-bottom: 24px;
}

.show-more-container {
  display: flex;
  justify-content: center;
  margin-top: -8px;
  margin-bottom: 24px;
}

.show-more-btn {
  width: 100%;
  max-width: 600px;
  font-weight: 600;
}

.liquipedia-matches-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.match-date-header {
  display: inline-block;
  margin-bottom: 8px;
  padding: 4px 12px;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  text-align: center;
  color: #495057;
  font-family: var(--vis-font-numeric);
  font-size: 14px;
  font-weight: 600;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

.match-row {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f8f9fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.match-row:hover {
  background: #f0f2f5;
  border-color: #dcdfe6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.match-row:active {
  transform: scale(0.98);
}

.match-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.team-side {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
}

.left-side {
  justify-content: flex-end;
}

.right-side {
  justify-content: flex-start;
}

.team-logo-container {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.team-logo {
  max-width: 30px;
  max-height: 30px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.team-name {
  color: #606266;
  font-family: var(--vis-font-display);
  font-size: 28px;
  font-weight: 700;
}

.winner-name {
  color: #303133;
  font-weight: 800;
}

.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  padding: 0 16px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #303133;
  font-family: var(--vis-font-numeric);
  font-size: 22px;
  font-weight: 700;
}

.score-number {
  min-width: 20px;
  text-align: center;
}

.score-colon {
  position: relative;
  top: -2px;
  color: #909399;
  font-size: 18px;
}

.winner-arrow {
  color: #409eff;
  font-size: 12px;
  opacity: 0;
}

.winner-arrow.visible {
  opacity: 1;
}

.bo-format {
  margin-top: 6px;
  padding: 2px 8px;
  background: #f4f4f5;
  border-radius: 12px;
  color: #909399;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
}

.match-replays {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.replay-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  color: #888;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.replay-label:hover {
  background: #f0f0f0;
  color: #111;
}

.expand-icon {
  font-size: 12px;
  transition: transform 0.3s ease;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.replay-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  padding: 8px 20px;
}

.replay-tag {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  color: #333;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.replay-tag:hover {
  border-color: #d9d9d9;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.replay-map-name {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  color: #555;
  font-weight: 600;
  white-space: nowrap;
}

.replay-code {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: #444;
  font-family: var(--vis-font-numeric);
  font-weight: 500;
  letter-spacing: 0.5px;
}

.copy-icon {
  align-self: center;
  padding-right: 8px;
  padding-left: 2px;
  color: #111;
  font-size: 20px;
  opacity: 0.4;
  transition: opacity 0.2s ease;
}

.replay-tag:hover .replay-map-name {
  background: #111;
  border-right-color: #111;
  color: #fff;
}

.replay-tag:hover .replay-code,
.replay-tag:hover .copy-icon {
  opacity: 1;
}

.replay-tag.disabled {
  background: #f9f9f9;
  border-color: #f0f0f0;
  box-shadow: none;
  cursor: default;
}

.replay-tag.disabled:hover {
  transform: none;
  border-color: #f0f0f0;
  box-shadow: none;
}

.replay-tag.disabled .replay-map-name {
  background: #f9f9f9;
  border-right-color: #f0f0f0;
  color: #a0a0a0;
}

.replay-tag.disabled .replay-code.empty-code {
  padding: 4px 12px;
  color: #c0c0c0;
  font-family: var(--vis-font-body);
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .team-name {
    font-size: 14px;
  }

  .match-content {
    padding: 10px 12px;
  }

  .team-logo-container {
    width: 24px;
    height: 24px;
  }

  .match-replays {
    flex-direction: column;
  }

  .replay-label {
    padding: 6px 0;
    font-size: 12px;
  }

  .replay-tags {
    gap: 6px;
    padding: 4px 12px;
  }

  .replay-tag {
    font-size: 11px;
  }

  .replay-map-name,
  .replay-code {
    padding: 3px 6px;
  }
}
</style>
