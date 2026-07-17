<template>
  <div class="team-detail-page">
    <div v-if="isLoading" class="page-loading">
      <div class="loading-panel">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    </div>
    
    <div v-else class="detail-container">
      <!-- 页面头部 -->
      <header class="detail-header">
        <el-button link @click="goBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="tournament-info">
          <span class="tournament-name">战队详情</span>
        </div>
        <div class="empty-space"></div>
      </header>

      <!-- 战队横幅 -->
      <div class="match-banner vis-arena-banner">
        <div class="team-banner-center">
          <img :src="getTeamLogo(team?.id)" class="team-logo-large" alt="" />
          <div class="team-name-large">{{ team?.name || '未知战队' }}</div>
          
          <el-dropdown trigger="click" @command="selectSeason" class="season-dropdown" placement="bottom">
            <div class="season-dropdown-link">
              <span class="text">{{ currentSeasonName }}</span>
              <el-icon class="icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="minimal-dropdown-menu">
                <el-dropdown-item v-for="s in availableSeasons" :key="s.id" :command="s.id" :class="{ 'is-active': String(currentSeasonId) === String(s.id) }">
                  {{ s.name }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 战绩 -->
      <div class="team-record-container vis-arena-banner" v-if="scoreStat">
        <div class="team-record-badge">
          <span class="record-item">{{ scoreStat.matchWin }}W - {{ scoreStat.matchLoss }}L</span>
          <span class="record-divider">|</span>
          <span class="record-item">{{ scoreStat.mapWin }}W - {{ scoreStat.mapLoss }}L</span>
          <span class="record-divider">|</span>
          <span class="record-item" :class="scoreStat.mapDiff > 0 ? 'text-success' : (scoreStat.mapDiff < 0 ? 'text-danger' : '')">
            {{ scoreStat.mapDiff > 0 ? '+' : '' }}{{ scoreStat.mapDiff }}
          </span>
        </div>
      </div>

      <!-- 内容区网格 -->
      <div class="tabs-container" v-loading="seasonLoading">
        <div class="custom-tabs-nav">
          <div class="tab-nav-item" :class="{ active: activeTab === 'roster' }" @click="switchTab('roster')">
            选手阵容
          </div>
          <div class="tab-nav-item" :class="{ active: activeTab === 'matches' }" @click="switchTab('matches')">
            历史比赛
          </div>
          <div class="tab-nav-item" :class="{ active: activeTab === 'analysis' }" @click="switchTab('analysis')">
            数据分析
          </div>
        </div>

        <div class="tab-content-area">
          <!-- 选手阵容 Tab -->
          <div v-show="activeTab === 'roster'" class="seamless-content">
            <div v-if="!hasAnyPlayers" class="empty-state">
              暂无选手数据
            </div>
            <div v-else class="minimal-roster">
              <div v-for="role in ['tank', 'damage', 'support']" :key="role" class="m-role-section" v-show="rosterGroups[role].length > 0">
                <div class="m-role-title">
                  <img :src="getRoleIconUrl(role)" class="m-role-icon" alt="" />
                  <span>{{ role.toUpperCase() }}</span>
                </div>
                
                <div class="m-grid-header">
                  <div class="m-col text-left">选手</div>
                  <div class="m-col text-right">K/D</div>
                  <div class="m-col text-right">伤害/10m</div>
                  <div class="m-col text-right" v-if="role==='support'">治疗/10m</div>
                  <div class="m-col text-right" v-if="role==='tank'">抵挡/10m</div>
                  <div class="m-col text-right" v-if="role==='damage'">消灭/10m</div>
                  <div class="m-col text-right">时长(m)</div>
                </div>

                <div class="m-grid-row" v-for="p in rosterGroups[role]" :key="p.name">
                  <div class="m-col text-left font-bold">{{ p.name }}</div>
                  <div class="m-col text-right" :class="{'highlight-text': p.kd === roleMaxStats[role].kd && p.kd > 0}">{{ p.kd }}</div>
                  <div class="m-col text-right" :class="{'highlight-text': p.damagePer10 === roleMaxStats[role].damage && p.damagePer10 > 0}">{{ p.damagePer10 }}</div>
                  <div class="m-col text-right" v-if="role==='support'" :class="{'highlight-text': p.healingPer10 === roleMaxStats[role].healing && p.healingPer10 > 0}">{{ p.healingPer10 }}</div>
                  <div class="m-col text-right" v-if="role==='tank'" :class="{'highlight-text': p.mitigationPer10 === roleMaxStats[role].mitigation && p.mitigationPer10 > 0}">{{ p.mitigationPer10 }}</div>
                  <div class="m-col text-right" v-if="role==='damage'" :class="{'highlight-text': p.elimsPer10 === roleMaxStats[role].elims && p.elimsPer10 > 0}">{{ p.elimsPer10 }}</div>
                  <div class="m-col text-right text-muted">{{ Math.round(p.gameTime) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 历史比赛 Tab -->
          <div v-show="activeTab === 'matches'" class="seamless-content">
            <div v-if="recentMatches.length === 0" class="empty-state">
              暂无比赛记录
            </div>
            <div v-else class="h2h-list">
              <div v-for="match in recentMatches" :key="match.id" class="h2h-match-row" @click="goToMatchDetail(match)">
                <div class="h2h-match-info">
                  <div class="h2h-date">{{ formatDateOnly(match.matchDate) }}</div>
                  <div class="h2h-tournament" :title="getSeasonName(match.seasonId) || match.tournamentName">
                    {{ getSeasonName(match.seasonId) || formatTournamentName(match.tournamentName) }}
                  </div>
                </div>
                
                <div class="h2h-matchup">
                  <div class="h2h-team t1" :class="{'is-winner': match.winnerId === match.team1Id, 'is-loser': match.winnerId && match.winnerId !== match.team1Id}">
                    <span class="team-name">{{ getTeamName(match.team1Id) }}</span>
                    <img :src="getTeamLogo(match.team1Id)" class="h2h-logo" alt=""/>
                  </div>

                  <div class="h2h-score-box">
                    <span class="score-num" :class="{'is-winner': match.winnerId === match.team1Id}">{{ match.team1Score !== null ? match.team1Score : '-' }}</span>
                    <span class="score-colon">:</span>
                    <span class="score-num" :class="{'is-winner': match.winnerId === match.team2Id}">{{ match.team2Score !== null ? match.team2Score : '-' }}</span>
                  </div>

                  <div class="h2h-team t2" :class="{'is-winner': match.winnerId === match.team2Id, 'is-loser': match.winnerId && match.winnerId !== match.team2Id}">
                    <img :src="getTeamLogo(match.team2Id)" class="h2h-logo" alt=""/>
                    <span class="team-name">{{ getTeamName(match.team2Id) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'analysis'" class="seamless-content">
            <MapWinRateAnalysis
              :map-games="seasonMapGames"
              :primary-team-id="queryParams.teamId"
              :primary-team-name="team?.name || ''"
              :show-map-sample="false"
              :show-map-insight="false"
              :show-single-mode-hint="false"
              :show-single-opponents="true"
            />
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowLeft, ArrowDown } from '@element-plus/icons-vue';
import apiService from '@/services/api';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';
import MapWinRateAnalysis from './components/MapWinRateAnalysis.vue';

export default {
  name: 'TeamDetail',
  components: { ArrowLeft, ArrowDown, MapWinRateAnalysis },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const store = useStore();
    
    const isLoading = ref(true);
    const queryParams = ref({
      seasonId: route.query.seasonId,
      teamId: route.query.teamId,
      from: route.query.from || ''
    });

    const team = ref(null);
    const scoreStat = ref(null);
    const recentMatches = ref([]);
    const allMatches = ref([]);
    const seasonMapGames = ref([]);
    const availableSeasons = ref([]);
    const currentSeasonId = ref(null);
    const seasonLoading = ref(false);
    
    const currentSeasonName = computed(() => {
      if (!currentSeasonId.value) return '请选择赛季';
      const s = availableSeasons.value.find(s => String(s.id) === String(currentSeasonId.value));
      return s ? s.name : '未知赛季';
    });
    
    const rosterGroups = ref({
      tank: [],
      damage: [],
      support: []
    });

      const roleMaxStats = ref({
      tank: { kd: 0, damage: 0, mitigation: 0, healing: 0, elims: 0 },
      damage: { kd: 0, damage: 0, mitigation: 0, healing: 0, elims: 0 },
      support: { kd: 0, damage: 0, mitigation: 0, healing: 0, elims: 0 }
    });

    const activeTab = ref('roster');

    const hasAnyPlayers = computed(() => {
      return ['tank', 'damage', 'support'].some(r => rosterGroups.value[r].length > 0);
    });
    
    const seasonName = computed(() => {
      return getSeasonName(queryParams.value.seasonId) || '战队详情';
    });

    const switchTab = async (tab) => {
      if (activeTab.value !== tab) {
        trackPublicEvent('战队详情-切换标签', {
          seasonId: currentSeasonId.value || queryParams.value.seasonId,
          teamId: queryParams.value.teamId,
          tab
        }, route);
      }
      activeTab.value = tab;
      await nextTick();
    };

    const goBack = () => {
      trackPublicEvent('战队详情-返回上一页', {
        seasonId: currentSeasonId.value || queryParams.value.seasonId,
        teamId: queryParams.value.teamId,
        source: queryParams.value.from || 'visualize'
      }, route);

      if (queryParams.value.from === 'match-detail' || queryParams.value.from === 'upcoming-match-detail') {
        router.back();
        return;
      }

      router.push({
        path: '/visualize',
        query: { seasonId: queryParams.value.seasonId }
      });
    };

    const goToMatchDetail = (match) => {
      if (!match?.id) return;

      trackPublicEvent('战队详情-打开比赛', {
        seasonId: String(match.seasonId || currentSeasonId.value || queryParams.value.seasonId || ''),
        teamId: queryParams.value.teamId,
        matchId: match.id,
        source: 'team_recent_matches'
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
          seasonId: String(match.seasonId || currentSeasonId.value || ''),
          from: 'team-detail',
          team1Id: String(match.team1Id || ''),
          team2Id: String(match.team2Id || ''),
          team1: matchData.team1Name,
          team2: matchData.team2Name,
          team1Logo: matchData.team1Logo,
          team2Logo: matchData.team2Logo,
          tournament: match.tournamentName || ''
        }
      });
    };

    const formatDateOnly = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return `${date.getMonth() + 1}.${date.getDate()}`;
    };

    const formatTournamentName = (name) => {
      if (!name) return '';
      const parts = name.split('-');
      if (parts.length > 1) {
        return parts[0].trim();
      }
      return name;
    };

    const getRoleIconUrl = (role) => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      if (!role) return `${baseUrl}icons/role/DPS.png`;
      const lowerRole = role.toLowerCase();
      if (lowerRole === 'tank') return `${baseUrl}icons/role/Tank.png`;
      if (lowerRole === 'damage') return `${baseUrl}icons/role/DPS.png`;
      if (lowerRole === 'support') return `${baseUrl}icons/role/Support.png`;
      return `${baseUrl}icons/role/DPS.png`;
    };

    const getTeamName = (teamId) => {
      const t = store.state.teams.find(t => String(t.id) === String(teamId));
      return t ? t.name : 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      if (!teamId) return 'https://owmini.xyz/images/tbd.png';
      const t = store.state.teams.find(t => String(t.id) === String(teamId));
      return t?.logo || 'https://owmini.xyz/images/tbd.png';
    };

    const getSeasonName = (seasonId) => {
      if (!seasonId) return '';
      const season = store.state.seasons?.find(s => String(s.id) === String(seasonId));
      return season ? season.name : '';
    };

    const getPercentage = (val, max) => {
      if (!max || max === 0) return '0%';
      return `${Math.min((val / max) * 100, 100)}%`;
    };

    const loadData = async () => {
      const startTime = performance.now();
      isLoading.value = true;
      try {
        if (!store.state.teams.length || !store.state.seasons.length || !store.state.maps.length) {
          await store.dispatch('loadBaseData');
        }

        const teamId = queryParams.value.teamId;
        team.value = store.state.teams.find(t => String(t.id) === String(teamId));

        const matchesRes = await apiService.getMatches({ pageSize: 2000 });
        const matches = Array.isArray(matchesRes) ? matchesRes : matchesRes.data || matchesRes.list || [];
        
        const teamMatches = matches.filter(m => String(m.team1Id) === String(teamId) || String(m.team2Id) === String(teamId));
        allMatches.value = teamMatches;

        const seasonIds = [...new Set(teamMatches.map(m => String(m.seasonId)))];
        
        availableSeasons.value = seasonIds
          .map(id => store.state.seasons.find(s => String(s.id) === id))
          .filter(Boolean)
          .sort((a, b) => Number(b.id) - Number(a.id));

        if (availableSeasons.value.length === 0) {
           const s = store.state.seasons.find(s => String(s.id) === String(queryParams.value.seasonId));
           if (s) availableSeasons.value = [s];
        }

        let targetSeasonId = queryParams.value.seasonId;
        if (!targetSeasonId || !availableSeasons.value.find(s => String(s.id) === String(targetSeasonId))) {
           targetSeasonId = availableSeasons.value.length > 0 ? availableSeasons.value[0].id : null;
        }
        
        await selectSeason(targetSeasonId);

      } catch (err) {
        console.error('Failed to load team base data:', err);
      } finally {
        isLoading.value = false;
        trackPerformance('战队详情加载', performance.now() - startTime, {
          seasonId: currentSeasonId.value || queryParams.value.seasonId,
          teamId: queryParams.value.teamId,
          tab: activeTab.value
        }, route);
      }
    };

    const selectSeason = async (seasonId) => {
      if (!seasonId) return;
      currentSeasonId.value = String(seasonId);
      seasonLoading.value = true;
      try {
        const teamId = queryParams.value.teamId;
        
        let allPlayerStats = [];
        let scoreStats = [];

        const [statsRes, scoreStatsRes, mapGamesRes] = await Promise.all([
          apiService.getSeasonPlayerStats(seasonId),
          apiService.getSeasonTeamScoreStats(seasonId),
          apiService.getMapGames({ seasonId, teamId, pageSize: 2000 })
        ]);
        allPlayerStats = Array.isArray(statsRes) ? statsRes : statsRes.data || statsRes.list || [];
        scoreStats = Array.isArray(scoreStatsRes) ? scoreStatsRes : scoreStatsRes.data || scoreStatsRes.list || [];
        seasonMapGames.value = Array.isArray(mapGamesRes) ? mapGamesRes : mapGamesRes.data || mapGamesRes.list || [];

        recentMatches.value = allMatches.value
          .filter(m => String(m.seasonId) === String(seasonId))
          .sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));

        const sStat = scoreStats.find(s => String(s.teamId) === String(teamId));
        if (sStat) {
           scoreStat.value = {
             matchWin: sStat.matchWin || 0,
             matchLoss: sStat.matchLoss || 0,
             mapWin: sStat.mapWin || 0,
             mapLoss: sStat.mapLoss || 0,
             mapDiff: (sStat.mapWin || 0) - (sStat.mapLoss || 0)
           };
        } else {
           let matchWin = 0, matchLoss = 0, mapWin = 0, mapLoss = 0;
           recentMatches.value.forEach(m => {
             if (m.winnerId) {
                if (String(m.winnerId) === String(teamId)) matchWin++;
                else matchLoss++;
             }
             if (String(m.team1Id) === String(teamId)) {
                mapWin += (m.team1Score || 0);
                mapLoss += (m.team2Score || 0);
             } else if (String(m.team2Id) === String(teamId)) {
                mapWin += (m.team2Score || 0);
                mapLoss += (m.team1Score || 0);
             }
           });
           scoreStat.value = { matchWin, matchLoss, mapWin, mapLoss, mapDiff: mapWin - mapLoss };
        }

        const teamPlayers = allPlayerStats.filter(p => String(p.teamId) === String(teamId));
        
        ['tank', 'damage', 'support'].forEach(r => {
          rosterGroups.value[r] = [];
        });

        teamPlayers.forEach(p => {
          const duration = p.gameTime || p.totalDuration || 0;
          if (duration === 0) return;

          const p10 = (val) => parseFloat(((val || 0) / duration * 10).toFixed(2));
          const kills = Number(p.elims || p.totalKills) || 0;
          const deaths = Number(p.deaths || p.totalDeaths) || 0;
          const damage = Number(p.damage || p.totalDamage) || 0;
          const healing = Number(p.healing || p.totalHealing) || 0;
          const mitigation = Number(p.mitigation || p.totalMitigation) || 0;
          
          let kd = kills;
          if (deaths > 0) kd = parseFloat((kills / deaths).toFixed(2));

          const playerObj = {
            name: p.player?.name || p.playerName || '未知',
            role: p.player?.role || p.role || 'damage',
            gameTime: duration,
            damagePer10: p10(damage),
            healingPer10: p10(healing),
            mitigationPer10: p10(mitigation),
            elimsPer10: p10(kills),
            kd: kd
          };

          const role = ['tank', 'damage', 'support'].includes(playerObj.role) ? playerObj.role : 'damage';
          rosterGroups.value[role].push(playerObj);
        });

        ['tank', 'damage', 'support'].forEach(r => {
           rosterGroups.value[r].sort((a,b) => b.gameTime - a.gameTime);
           
           roleMaxStats.value[r] = {
             kd: Math.max(...rosterGroups.value[r].map(p => p.kd), 1),
             damage: Math.max(...rosterGroups.value[r].map(p => p.damagePer10), 1),
             healing: Math.max(...rosterGroups.value[r].map(p => p.healingPer10), 1),
             mitigation: Math.max(...rosterGroups.value[r].map(p => p.mitigationPer10), 1),
             elims: Math.max(...rosterGroups.value[r].map(p => p.elimsPer10), 1)
           };
        });

      } catch (err) {
        console.error('Failed to load season data:', err);
      } finally {
        seasonLoading.value = false;
      }
    };

    onMounted(() => {
      loadData();
    });

    return {
      isLoading,
      seasonLoading,
      queryParams,
      currentSeasonName,
      team,
      scoreStat,
      recentMatches,
      seasonMapGames,
      availableSeasons,
      currentSeasonId,
      selectSeason,
      rosterGroups,
      roleMaxStats,
      hasAnyPlayers,
      activeTab,
      switchTab,
      goBack,
      goToMatchDetail,
      formatDateOnly,
      formatTournamentName,
      getRoleIconUrl,
      getTeamName,
      getTeamLogo,
      getSeasonName,
      getPercentage
    };
  }
};
</script>

<style scoped>
.team-detail-page {
  min-height: 100vh;
  background: #fafafa;
  font-family: var(--vis-font-body);
}

.page-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #fafafa;
}

.loading-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 106, 0, 0.14);
  border-top-color: #ff6a00;
  border-radius: 50%;
  animation: spinner-rotate 0.8s linear infinite;
}

.loading-text {
  color: #909399;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

@keyframes spinner-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.detail-container {
  width: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 12px 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  font-size: 14px;
  color: #909399;
  font-weight: 600;
  transition: color 0.2s var(--vis-ease);
}

.back-btn:hover,
.back-btn:active {
  color: #111;
}

.tournament-info {
  min-width: 0;
  text-align: center;
}

.tournament-name {
  font-size: 15px;
  font-weight: 800;
  color: #111;
  letter-spacing: -0.01em;
}

.empty-space {
  width: 60px;
}

.season-dropdown {
  margin-top: 0;
  cursor: pointer;
}

.season-dropdown-link {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 14px;
  background: rgba(17, 17, 17, 0.05);
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 999px;
  color: #606266;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  transition: background-color 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease), color 0.2s var(--vis-ease);
}

.season-dropdown-link .text {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.season-dropdown-link:hover {
  background: rgba(17, 17, 17, 0.08);
  border-color: rgba(17, 17, 17, 0.1);
  color: #111;
}

/* 浅色赛事横幅延续段：战绩条与主横幅同底，全宽贴边平收 */
.team-record-container {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 0 40px 26px;
}

/* 浅色赛事横幅：队标轻微悬浮（不加圆底），队名 24px/900 深色字 */
.match-banner {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 26px 40px 22px;
}

.team-banner-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.team-logo-large {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.16));
}

.team-name-large {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 24px;
  font-weight: 900;
  color: #111;
  font-family: var(--vis-font-display);
  letter-spacing: 0.01em;
  line-height: 1.1;
}

/* M4 · 战绩记分胶囊：白底细边框深字，Oxanium 斜体数字，胜/负用 success/error 语义色 */
.team-record-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  background: #fff;
  border: 1px solid var(--vis-border);
  padding: 5px 16px;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  font-size: 13px;
  font-weight: 800;
  color: #111;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.record-item {
  font-style: italic;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.record-divider {
  color: #dcdfe6;
  font-weight: 400;
}

.text-success { color: var(--vis-success); }
.text-danger { color: var(--vis-error); }

.tabs-container {
  display: flex;
  flex-direction: column;
}

/* Element Plus v-loading 默认主题色为蓝色，收敛为黑橙体系 */
.tabs-container :deep(.el-loading-spinner .path) {
  stroke: #ff6a00;
}

.tabs-container :deep(.el-loading-text) {
  color: #909399;
}

.custom-tabs-nav {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid var(--vis-border);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.custom-tabs-nav::-webkit-scrollbar {
  display: none;
}

.tab-nav-item {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  background: var(--vis-bg-muted);
  color: var(--vis-text-secondary);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.01em;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s var(--vis-ease), background-color 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
  user-select: none;
  scroll-snap-align: start;
}

.tab-nav-item:hover {
  color: #111;
  background: rgba(17, 17, 17, 0.1);
}

.tab-nav-item.active {
  background: #111;
  color: #fff;
  box-shadow: 0 4px 10px rgba(17, 17, 17, 0.18);
}

.tab-content-area {
  display: flex;
  flex-direction: column;
  background: #fff;
  min-height: 400px;
}

@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.seamless-content {
  padding: 20px;
  animation: tabFadeIn 0.3s ease-out forwards;
}

.empty-state {
  color: #909399;
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}

.minimal-roster {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 数据卡：白底细边框轻阴影 */
.m-role-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* M1 · 斜切标题条：渐变斜块锚点 + 斜体展示字 */
.m-role-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  font-weight: 900;
  font-size: 14px;
  font-style: italic;
  color: #111;
  font-family: var(--vis-font-display);
  letter-spacing: 0.04em;
}

.m-role-title::before {
  content: '';
  width: 4px;
  height: 14px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant));
}

.m-role-icon {
  width: 15px;
  height: 15px;
  filter: brightness(0);
}

.m-grid-header, .m-grid-row {
  display: grid;
  grid-template-columns: 2.5fr 1fr 1.5fr 1.5fr 1fr;
  align-items: center;
  column-gap: 8px;
}

.m-grid-header {
  padding: 7px 14px;
  font-size: 11px;
  color: #909399;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: var(--vis-bg-subtle);
  border-top: 1px solid var(--vis-border);
  border-bottom: 1px solid var(--vis-border);
}

.m-grid-row {
  padding: 10px 14px;
  font-size: 13px;
  border-bottom: 1px solid #f0f2f5;
  transition: background-color 0.2s var(--vis-ease);
}

.m-grid-row:hover {
  background-color: #f8f9fa;
}

.m-grid-row:last-child {
  border-bottom: none;
}

.m-col {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-left { text-align: left; }
.text-right {
  text-align: right;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.font-bold {
  font-weight: 800;
  color: #111;
  font-family: var(--vis-font-body);
}

.text-muted {
  color: #909399;
  font-weight: 600;
}

.highlight-text {
  color: #ff6a00;
  font-weight: 800;
}

.h2h-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.h2h-match-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease);
}

/* M5 · hover 顶部渐变线 */
.h2h-match-row::before {
  content: '';
  position: absolute;
  top: 0;
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
  .h2h-match-row:hover {
    transform: translateY(-2px);
    border-color: var(--vis-border-strong);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }

  .h2h-match-row:hover::before {
    opacity: 1;
  }
}

.h2h-match-row:active {
  transform: scale(0.98);
}

.h2h-match-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.h2h-date {
  flex-shrink: 0;
  color: #111;
  font-family: var(--vis-font-numeric);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}

.h2h-tournament {
  color: #909399;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.h2h-matchup {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

/* 左队黑、右队橙镜像 */
.h2h-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
}

.h2h-team .team-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.h2h-team.t1 {
  justify-content: flex-end;
  color: #111;
}

.h2h-team.t2 {
  justify-content: flex-start;
  color: #ff6a00;
}

.h2h-team.is-winner {
  font-weight: 900;
}

.h2h-team.is-loser {
  opacity: 0.55;
}

.h2h-logo {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  object-fit: contain;
}

/* 比分胶囊：M4 斜体数字，固定宽度居中不抖动 */
.h2h-score-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 72px;
  padding: 4px 14px;
  background: var(--vis-bg-muted);
  border-radius: 999px;
  font-family: var(--vis-font-numeric);
  font-size: 16px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.score-num {
  min-width: 20px;
  color: #909399;
  font-style: italic;
  text-align: center;
}

.score-num.is-winner {
  background: var(--vis-primary-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.score-colon {
  margin: 0 6px;
  color: #c0c4cc;
  font-size: 14px;
}

@media (max-width: 768px) {
  .detail-header {
    padding: 12px 16px;
  }
  .tournament-name {
    font-size: 14px;
  }
  .empty-space {
    width: 40px;
  }
  .match-banner {
    padding: 20px 12px 18px;
  }
  .team-banner-center {
    gap: 8px;
  }
  .team-logo-large {
    width: 56px;
    height: 56px;
  }
  .team-name-large {
    font-size: 20px;
  }
  .season-dropdown-link {
    min-height: 30px;
    padding: 3px 12px;
    font-size: 11px;
  }
  .season-dropdown-link .text {
    max-width: 150px;
  }
  .team-record-container {
    padding: 0 12px 22px;
  }
  .team-record-badge {
    gap: 8px;
    min-height: 30px;
    padding: 4px 12px;
    font-size: 11px;
  }
  .custom-tabs-nav {
    gap: 6px;
    padding: 8px 12px;
  }
  .tab-nav-item {
    min-height: 30px;
    padding: 0 12px;
    font-size: 11px;
  }
  .seamless-content {
    padding: 12px;
  }
  .minimal-roster {
    gap: 12px;
  }
  .m-role-title {
    padding: 10px 12px 8px;
    font-size: 13px;
  }
  .m-grid-header, .m-grid-row {
    grid-template-columns: 2fr 1fr 1.2fr 1.2fr 1fr;
    column-gap: 6px;
  }
  .m-grid-header {
    font-size: 10px;
    padding: 6px 10px;
  }
  .m-grid-row {
    font-size: 12px;
    padding: 9px 10px;
  }
  .h2h-list {
    gap: 8px;
  }
  .h2h-match-row {
    padding: 10px 12px;
    gap: 8px;
  }
  .h2h-date {
    font-size: 12px;
  }
  .h2h-tournament {
    font-size: 11px;
  }
  .h2h-matchup {
    gap: 8px;
  }
  .h2h-team {
    font-size: 13px;
    gap: 6px;
  }
  .h2h-logo {
    width: 18px;
    height: 18px;
  }
  .h2h-score-box {
    padding: 2px 10px;
    font-size: 14px;
    min-width: 56px;
  }
  .score-num {
    min-width: 16px;
  }
  .score-colon {
    margin: 0 4px;
    font-size: 12px;
  }
}

@media (max-width: 420px) {
  .detail-header {
    padding: 10px 12px;
  }
  .match-banner {
    padding: 16px 10px 14px;
  }
  .team-logo-large {
    width: 48px;
    height: 48px;
  }
  .team-name-large {
    font-size: 18px;
  }
  .team-record-container {
    padding: 0 10px 20px;
  }
  .team-record-badge {
    gap: 6px;
    padding: 3px 10px;
    font-size: 10px;
  }
  .custom-tabs-nav {
    padding: 8px 10px;
  }
  .tab-nav-item {
    min-height: 28px;
    padding: 0 10px;
    font-size: 10px;
  }
  .seamless-content {
    padding: 10px;
  }
  .m-grid-header, .m-grid-row {
    grid-template-columns: 1.8fr 0.9fr 1.1fr 1.1fr 0.9fr;
  }
  .m-grid-header {
    padding: 6px 8px;
  }
  .m-grid-row {
    padding: 8px;
  }
  .h2h-matchup {
    gap: 6px;
  }
  .h2h-team {
    font-size: 12px;
  }
  .h2h-score-box {
    padding: 2px 8px;
    font-size: 13px;
    min-width: 48px;
  }
}
</style>

<!-- el-dropdown 弹层挂载于 body，scoped 无法触达；minimal-dropdown-menu 为本组件独有类名，样式仅作用于本页下拉 -->
<style>
.minimal-dropdown-menu {
  border-radius: 12px !important;
  padding: 6px !important;
}

.minimal-dropdown-menu .el-dropdown-menu__item {
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  line-height: 32px;
  padding: 0 14px;
}

.minimal-dropdown-menu .el-dropdown-menu__item:not(.is-disabled):hover,
.minimal-dropdown-menu .el-dropdown-menu__item:not(.is-disabled):focus {
  background: #f4f4f5;
  color: #111;
}

.minimal-dropdown-menu .el-dropdown-menu__item.is-active {
  background: rgba(255, 106, 0, 0.08);
  color: #ff6a00;
  font-weight: 800;
}
</style>
