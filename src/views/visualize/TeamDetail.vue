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
      <div class="match-banner">
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
      <div class="team-record-container" v-if="scoreStat">
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

export default {
  name: 'TeamDetail',
  components: { ArrowLeft, ArrowDown },
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
        if (!store.state.teams.length || !store.state.seasons.length) {
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

        const [statsRes, scoreStatsRes] = await Promise.all([
          apiService.getSeasonPlayerStats(seasonId),
          apiService.getSeasonTeamScoreStats(seasonId)
        ]);
        allPlayerStats = Array.isArray(statsRes) ? statsRes : statsRes.data || statsRes.list || [];
        scoreStats = Array.isArray(scoreStatsRes) ? scoreStatsRes : scoreStatsRes.data || scoreStatsRes.list || [];

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
  background-color: #fff;
  font-family: var(--vis-font-body);
}

.page-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.loading-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-top-color: #111;
  border-radius: 50%;
  animation: spinner-rotate 1s linear infinite;
}

.loading-text {
  color: #666;
  font-size: 14px;
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
  padding: 14px 20px 10px;
}

.back-btn {
  font-size: 15px;
  color: #606266;
  font-weight: 600;
  transition: color 0.2s;
}

.back-btn:hover {
  color: #111;
}

.tournament-info {
  text-align: center;
}

.tournament-name {
  font-size: 16px;
  font-weight: 800;
  color: #303133;
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
  padding: 5px 14px;
  background: #f4f4f5;
  border-radius: 20px;
  color: #111;
  font-size: 12px;
  font-weight: 800;
  transition: all 0.2s;
}

.season-dropdown-link:hover {
  background: #ebeef5;
}

.minimal-dropdown-menu {
  border-radius: 12px;
  padding: 8px;
  border: 1px solid #ebeef5;
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}

.minimal-dropdown-menu .el-dropdown-item {
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 2px;
}

.minimal-dropdown-menu .el-dropdown-item:hover {
  background: #f4f4f5;
  color: #111;
}

.minimal-dropdown-menu .el-dropdown-item.is-active {
  background: #111;
  color: #fff;
}

.dropdown-divider {
  margin: 4px 0;
}

.team-record-container {
  display: flex;
  justify-content: center;
  background: #fff;
  padding-bottom: 16px;
  border-bottom: 10px solid #fafafa;
}

.match-banner {
  background: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 40px 8px;
}

.team-banner-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.team-logo-large {
  width: 64px;
  height: 64px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.08));
}

.team-name-large {
  font-size: 24px;
  font-weight: 900;
  color: #111;
  font-family: var(--vis-font-display);
  letter-spacing: 0.5px;
  line-height: 1;
}

.team-record-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8f9fa;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 800;
  color: #606266;
  font-family: var(--vis-font-numeric);
}

.record-divider {
  color: #dcdfe6;
  font-weight: 400;
}

.text-success { color: #28a745; }
.text-danger { color: #dc3545; }

.tabs-container {
  display: flex;
  flex-direction: column;
}

.custom-tabs-nav {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #f0f2f5;
}

.tab-nav-item {
  flex: 1;
  text-align: center;
  padding: 16px 0;
  font-weight: 800;
  font-size: 15px;
  color: #909399;
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
  position: relative;
}

.tab-nav-item:hover {
  color: #111;
}

.tab-nav-item.active {
  color: #111;
}

@keyframes lineScale {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.tab-nav-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 30%;
  width: 40%;
  height: 3px;
  background: #111;
  border-radius: 3px 3px 0 0;
  animation: lineScale 0.25s ease-out forwards;
  transform-origin: center;
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
  gap: 24px;
  padding: 0 10px;
}

.m-role-section {
  display: flex;
  flex-direction: column;
}

.m-role-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
  margin-bottom: 4px;
  border-bottom: 2px solid #111;
  font-weight: 900;
  font-size: 14px;
  color: #111;
  letter-spacing: 1px;
}

.m-role-icon {
  width: 16px;
  height: 16px;
  filter: brightness(0);
}

.m-grid-header, .m-grid-row {
  display: grid;
  grid-template-columns: 2.5fr 1fr 1.5fr 1.5fr 1fr;
  align-items: center;
}

.m-grid-header {
  padding: 8px;
  font-size: 11px;
  color: #909399;
  font-weight: 700;
  border-bottom: 1px solid #ebeef5;
}

.m-grid-row {
  padding: 10px 8px;
  font-size: 13px;
  border-bottom: 1px dashed #f0f2f5;
  transition: background-color 0.2s;
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
.text-right { text-align: right; font-family: var(--vis-font-numeric); }

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
  gap: 12px;
  padding: 0 10px;
}

.h2h-match-row {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s;
  position: relative;
  overflow: hidden;
  gap: 10px;
  cursor: pointer;
}

.h2h-match-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.h2h-match-row:active {
  transform: scale(0.98);
}

.h2h-match-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #dcdfe6;
  border-radius: 4px 0 0 4px;
}

.h2h-match-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
}

.h2h-date {
  font-size: 13px;
  color: #111;
  font-weight: 900;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.h2h-tournament {
  font-size: 12px;
  color: #909399;
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
  padding: 0 8px 4px;
}

.h2h-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: #606266;
}

.h2h-team.t1 { justify-content: flex-end; }
.h2h-team.t2 { justify-content: flex-start; }
.h2h-team.is-winner { color: #111; font-weight: 900; }
.h2h-team.is-loser { opacity: 0.6; }

.h2h-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.h2h-score-box {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
  padding: 4px 16px;
  border-radius: 20px;
  font-weight: 900;
  font-size: 16px;
  min-width: 60px;
}

.score-num {
  color: #909399;
  width: 20px;
  text-align: center;
}

.score-num.is-winner {
  color: #111;
}

.score-colon {
  margin: 0 6px;
  color: #c0c4cc;
  font-size: 14px;
}

@media (max-width: 768px) {
  .detail-header {
    padding: 12px 16px 8px;
  }
  .tournament-name {
    font-size: 14px;
  }
  .empty-space {
    width: 40px;
  }
  .match-banner {
    padding: 8px 12px 6px;
  }
  .team-logo-large {
    width: 52px;
    height: 52px;
  }
  .team-name-large {
    font-size: 20px;
  }
  .team-banner-center {
    gap: 6px;
  }
  .season-dropdown-link {
    padding: 4px 12px;
    font-size: 11px;
  }
  .team-record-container {
    padding-bottom: 12px;
  }
  .team-record-badge {
    gap: 8px;
    padding: 4px 12px;
    font-size: 11px;
  }
  .m-grid-header, .m-grid-row {
    grid-template-columns: 2fr 1fr 1.2fr 1.2fr 1fr;
  }
  .m-grid-header {
    font-size: 10px;
    padding: 6px 4px;
  }
  .m-grid-row {
    font-size: 12px;
    padding: 8px 4px;
  }
  .minimal-roster {
    padding: 0;
  }
  .h2h-match-row {
    padding: 10px 12px;
    gap: 8px;
  }
  .h2h-match-info {
    padding-left: 2px;
    gap: 6px;
  }
  .h2h-date {
    font-size: 12px;
  }
  .h2h-tournament {
    font-size: 11px;
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
    min-width: 48px;
  }
  .h2h-matchup {
    gap: 8px;
  }
  .tab-nav-item {
    font-size: 13px;
    padding: 12px 0;
  }
}
</style>
