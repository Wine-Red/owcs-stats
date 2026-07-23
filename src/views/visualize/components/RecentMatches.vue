<template>
  <div class="recent-matches-container">
    <div v-for="group in displayedMatches" :key="group.date" class="vis-grid overview-section group-block">
      <div class="vis-col span-12">
        <div class="liquipedia-matches-container">
          <div class="match-date-header"><span class="match-date-text">{{ group.formattedDate }}</span></div>

          <div class="matches-list">
            <div v-for="match in group.matches" :key="match.id" class="match-row vis-card-lift" @click="goToMatchDetail(match)">
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
                    <span class="score-number vis-score-num">{{ match.team1Score !== null ? match.team1Score : '-' }}</span>
                    <span class="score-colon">:</span>
                    <span class="score-number vis-score-num">{{ match.team2Score !== null ? match.team2Score : '-' }}</span>
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
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowUp, ArrowDown, VideoCamera, DocumentCopy } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { trackPublicEvent } from '@/utils/analytics';
import { TBD_TEAM_LOGO_URL } from '@/utils/teamLogos';

const TBD_LOGO_URL = TBD_TEAM_LOGO_URL;

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
    const route = useRoute();
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
      trackPublicEvent('首页-打开比赛详情', {
        source: 'recent_matches',
        seasonId: match?.seasonId,
        matchId: match?.id
      }, route);

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
  scroll-snap-align: start;
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
  min-height: 40px;
  font-weight: 600;
}

.show-more-btn:hover,
.show-more-btn:focus {
  color: var(--vis-accent);
  border-color: var(--vis-accent);
  background: var(--vis-team-right-soft);
}

.liquipedia-matches-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}

/* M4 · 斜切日期 chip（浅灰底 + 斜体数字字） */
.match-date-header {
  display: inline-block;
  padding: 4px 12px;
  background: var(--vis-bg-muted);
  border-radius: 3px;
  transform: skewX(var(--vis-slant));
}

.match-date-text {
  display: inline-block;
  transform: skewX(calc(var(--vis-slant) * -1));
  color: var(--vis-text-secondary);
  font-family: var(--vis-font-numeric);
  font-style: italic;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 620px;
}

/* 比赛卡：白底轻边框 + 全局 .vis-card-lift hover（上浮 + 顶部渐变线） */
.match-row {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--vis-bg-card);
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: var(--vis-shadow);
  cursor: pointer;
}

.match-row:active {
  transform: scale(0.99);
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
  gap: 10px;
  flex: 1 1 0;
  min-width: 0;
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

/* 左队黑 / 右队橙 严格镜像；胜方加重，负方降透明度 */
.team-name {
  font-family: var(--vis-font-display);
  font-size: 17px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  opacity: 0.55;
}

.left-side .team-name {
  color: var(--vis-team-left);
  text-align: right;
}

.right-side .team-name {
  color: var(--vis-team-right);
  text-align: left;
}

.team-name.winner-name {
  font-weight: 900;
  opacity: 1;
}

.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 108px;
  padding: 0 12px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--vis-text-primary);
}

/* M4 · 斜体比分数字（.vis-score-num），左黑右橙固定宽度居中 */
.score-number {
  min-width: 24px;
  text-align: center;
  font-size: 24px;
  color: var(--vis-text-tertiary);
}

.left-arrow + .score-number {
  color: var(--vis-team-left);
}

.score-colon + .score-number {
  color: var(--vis-team-right);
}

.score-colon {
  position: relative;
  top: -2px;
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-size: 18px;
}

/* 胜方箭头：左黑右橙镜像（原 #409eff 蓝色已清除） */
.winner-arrow {
  width: 12px;
  flex: 0 0 auto;
  text-align: center;
  font-size: 11px;
  opacity: 0;
  transition: opacity var(--vis-dur-fast) var(--vis-ease);
}

.left-arrow {
  color: var(--vis-team-left);
}

.right-arrow {
  color: var(--vis-team-right);
}

.winner-arrow.visible {
  opacity: 1;
}

.bo-format {
  margin-top: 6px;
  padding: 2px 8px;
  background: var(--vis-bg-muted);
  border-radius: 3px;
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.match-replays {
  display: flex;
  flex-direction: column;
  background: var(--vis-bg-subtle);
  border-top: 1px solid var(--vis-border);
}

.replay-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 0;
  color: var(--vis-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: color var(--vis-dur-fast) var(--vis-ease), background-color var(--vis-dur-fast) var(--vis-ease);
}

.replay-label .el-icon {
  color: var(--vis-accent);
}

.replay-label:hover {
  background: var(--vis-team-right-soft);
  color: var(--vis-text-strong);
}

.expand-icon {
  font-size: 12px;
  transition: transform var(--vis-dur) var(--vis-ease);
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.replay-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  padding: 10px 16px 12px;
}

.replay-tag {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  color: var(--vis-text-primary);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: border-color var(--vis-dur-fast) var(--vis-ease), box-shadow var(--vis-dur-fast) var(--vis-ease), transform var(--vis-dur-fast) var(--vis-ease);
}

.replay-tag:hover {
  border-color: var(--vis-border-strong);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.replay-map-name {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--vis-bg-muted);
  border-right: 1px solid var(--vis-border);
  color: var(--vis-text-secondary);
  font-weight: 600;
  white-space: nowrap;
  transition: background-color var(--vis-dur-fast) var(--vis-ease), color var(--vis-dur-fast) var(--vis-ease);
}

.replay-code {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  color: var(--vis-text-primary);
  font-family: var(--vis-font-numeric);
  font-weight: 500;
  letter-spacing: 0.5px;
}

.copy-icon {
  align-self: center;
  padding-right: 8px;
  padding-left: 2px;
  color: var(--vis-text-strong);
  font-size: 20px;
  opacity: 0.4;
  transition: opacity var(--vis-dur-fast) var(--vis-ease);
}

.replay-tag:hover .replay-map-name {
  background: var(--vis-primary-strong);
  border-right-color: var(--vis-primary-strong);
  color: #fff;
}

.replay-tag:hover .replay-code,
.replay-tag:hover .copy-icon {
  opacity: 1;
}

.replay-tag.disabled {
  background: var(--vis-bg-subtle);
  border-color: var(--vis-border);
  box-shadow: none;
  cursor: default;
}

.replay-tag.disabled:hover {
  transform: none;
  border-color: var(--vis-border);
  box-shadow: none;
}

.replay-tag.disabled .replay-map-name {
  background: var(--vis-bg-subtle);
  border-right-color: var(--vis-border);
  color: var(--vis-text-tertiary);
}

.replay-tag.disabled .replay-code.empty-code {
  padding: 4px 12px;
  color: var(--vis-text-disabled);
  font-family: var(--vis-font-body);
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .group-block {
    margin-bottom: 18px;
  }

  .liquipedia-matches-container {
    gap: 10px;
  }

  .matches-list {
    gap: 10px;
  }

  .team-name {
    font-size: 13px;
  }

  .match-content {
    padding: 12px;
  }

  .team-side {
    gap: 6px;
  }

  .team-logo-container {
    width: 22px;
    height: 22px;
  }

  .team-logo {
    max-width: 22px;
    max-height: 22px;
  }

  .score-section {
    min-width: 92px;
    padding: 0 6px;
  }

  .score-row {
    gap: 4px;
  }

  .score-number {
    min-width: 20px;
    font-size: 20px;
  }

  .score-colon {
    font-size: 15px;
  }

  .winner-arrow {
    width: 9px;
    font-size: 9px;
  }

  .bo-format {
    margin-top: 4px;
    padding: 1px 6px;
    font-size: 10px;
  }

  .match-replays {
    flex-direction: column;
  }

  .replay-label {
    min-height: 36px;
    padding: 6px 0;
    font-size: 12px;
  }

  .replay-tags {
    gap: 6px;
    padding: 6px 12px 10px;
  }

  .replay-tag {
    font-size: 11px;
  }

  .replay-map-name,
  .replay-code {
    padding: 3px 6px;
  }

  .show-more-container {
    margin-top: 0;
  }
}

@media (max-width: 420px) {
  .match-content {
    padding: 10px;
  }

  .team-name {
    font-size: 12px;
  }

  .score-section {
    min-width: 84px;
  }

  .score-number {
    font-size: 18px;
  }
}
</style>
