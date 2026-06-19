<template>
  <div class="upcoming-detail-page">
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
          <span class="tournament-name" :title="queryParams.tournament">{{ formattedTournament }}</span>
        </div>
        <div class="empty-space"></div>
      </header>

      <!-- 对阵横幅 -->
      <div class="match-banner">
        <div class="team left-team team-link" @click="goToTeamDetail(team1ResolvedId)">
          <span class="team-name">{{ queryParams.team1 }}</span>
          <img :src="queryParams.team1Logo" class="team-logo" alt="" />
        </div>
        <div class="match-time-center">
          <div class="time-text">{{ formatTime(queryParams.time) }}</div>
          <div class="vs-text">VS</div>
          <div v-if="isOngoing" class="match-status-badge ongoing">LIVE</div>
          <div v-else class="match-status-badge">未开赛</div>
        </div>
        <div class="team right-team team-link" @click="goToTeamDetail(team2ResolvedId)">
          <img :src="queryParams.team2Logo" class="team-logo" alt="" />
          <span class="team-name">{{ queryParams.team2 }}</span>
        </div>
      </div>

      <!-- 内容区网格（转为全页面 Tab 切换结构） -->
      <div class="tabs-container">
        <!-- 自定义 Tabs Header (无边框轻量设计) -->
        <div class="custom-tabs-nav">
          <div class="tab-nav-item" :class="{ active: activeTab === 'team' }" @click="switchTab('team')">
            战队对比
          </div>
          <div class="tab-nav-item" :class="{ active: activeTab === 'players' }" @click="switchTab('players')">
            选手对位
          </div>
          <div class="tab-nav-item" :class="{ active: activeTab === 'h2h' }" @click="switchTab('h2h')">
            历史交手
          </div>
        </div>

        <div class="tab-content-area">
          <!-- 战队对比 Tab -->
          <div v-show="activeTab === 'team'" class="seamless-content">
            <div class="team-radar-wrapper">
              <div class="radar-container team-radar-container" ref="teamRadarRef"></div>
            </div>

            <!-- 附加对比数据 -->
        <div class="team-extra-stats" v-if="teamStats.team1 && teamStats.team2">
           
           <div class="stat-item">
              <div class="stat-header">
                 <span class="stat-val t1-val">{{ teamStats.team1.scoreStat.matchWin }}W - {{ teamStats.team1.scoreStat.matchLoss }}L</span>
                 <span class="stat-label">大场战绩</span>
                 <span class="stat-val t2-val">{{ teamStats.team2.scoreStat.matchWin }}W - {{ teamStats.team2.scoreStat.matchLoss }}L</span>
              </div>
              <div class="stat-bars">
                 <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(teamStats.team1.scoreStat.matchWin, teamStats.team1.scoreStat.matchWin + teamStats.team1.scoreStat.matchLoss) }"></div>
                 </div>
                 <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(teamStats.team2.scoreStat.matchWin, teamStats.team2.scoreStat.matchWin + teamStats.team2.scoreStat.matchLoss) }"></div>
                 </div>
              </div>
           </div>

           <div class="stat-item">
              <div class="stat-header">
                 <span class="stat-val t1-val">{{ teamStats.team1.scoreStat.mapWin }}W - {{ teamStats.team1.scoreStat.mapLoss }}L</span>
                 <span class="stat-label">小局战绩</span>
                 <span class="stat-val t2-val">{{ teamStats.team2.scoreStat.mapWin }}W - {{ teamStats.team2.scoreStat.mapLoss }}L</span>
              </div>
              <div class="stat-bars">
                 <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(teamStats.team1.scoreStat.mapWin, teamStats.team1.scoreStat.mapWin + teamStats.team1.scoreStat.mapLoss) }"></div>
                 </div>
                 <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(teamStats.team2.scoreStat.mapWin, teamStats.team2.scoreStat.mapWin + teamStats.team2.scoreStat.mapLoss) }"></div>
                 </div>
              </div>
           </div>

           <div class="stat-item">
              <div class="stat-header">
                 <span class="stat-val t1-val">{{ teamStats.team1.scoreStat.mapDiff > 0 ? '+' : '' }}{{ teamStats.team1.scoreStat.mapDiff }}</span>
                 <span class="stat-label">净胜局</span>
                 <span class="stat-val t2-val">{{ teamStats.team2.scoreStat.mapDiff > 0 ? '+' : '' }}{{ teamStats.team2.scoreStat.mapDiff }}</span>
              </div>
              <div class="stat-bars">
                 <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(Math.max(0, teamStats.team1.scoreStat.mapDiff), Math.max(0, teamStats.team1.scoreStat.mapDiff, teamStats.team2.scoreStat.mapDiff)) }"></div>
                 </div>
                 <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(Math.max(0, teamStats.team2.scoreStat.mapDiff), Math.max(0, teamStats.team1.scoreStat.mapDiff, teamStats.team2.scoreStat.mapDiff)) }"></div>
                 </div>
              </div>
           </div>
        </div>
          </div>

          <!-- 选手对位 Tab -->
          <div v-show="activeTab === 'players'" class="seamless-content player-comparison-body">
            <div v-if="!hasAnyPlayers" class="empty-state">
              暂无选手数据
            </div>
            <div v-else class="interactive-matchups">
              <div v-for="role in ['tank', 'damage', 'support']" :key="role" class="role-arena" v-show="rolePlayers[role].t1.length || rolePlayers[role].t2.length">
                
                <div class="role-arena-header">
                  <div class="header-line left-line"></div>
                  <div class="header-title">
                    <img :src="getRoleIconUrl(role)" class="role-icon-small" alt="" />
                    <span class="role-name">{{ role.toUpperCase() }}</span>
                  </div>
                  <div class="header-line right-line"></div>
                </div>
                <div class="role-arena-body">
                  <!-- Selectors -->
                  <div class="player-selectors">
                      <div class="team-selector t1-selector">
                        <div v-for="p in rolePlayers[role].t1" :key="p.name"
                             class="player-chip" :class="{active: selectedPlayers[role].t1?.name === p.name}"
                             @click="selectPlayer(role, 't1', p)">
                          <span class="chip-name">{{ p.name }}</span>
                        </div>
                      </div>

                      <div class="selector-vs">VS</div>

                      <div class="team-selector t2-selector">
                        <div v-for="p in rolePlayers[role].t2" :key="p.name"
                             class="player-chip" :class="{active: selectedPlayers[role].t2?.name === p.name}"
                             @click="selectPlayer(role, 't2', p)">
                          <span class="chip-name">{{ p.name }}</span>
                        </div>
                      </div>
                    </div>

                  <!-- Player Radar -->
                  <div class="player-radar-wrapper" v-show="selectedPlayers[role].t1 || selectedPlayers[role].t2">
                    <div class="player-radar-container" :ref="el => setPlayerRadarRef(el, role)"></div>
                  </div>

                </div>
              </div>
            </div>
          </div>

          <!-- 历史交手 Tab -->
          <div v-show="activeTab === 'h2h'" class="seamless-content">
            <div v-if="h2hMatches.length === 0" class="empty-state">
              暂无交手记录
            </div>
            <div v-else class="h2h-list">
              <div v-for="match in h2hMatches" :key="match.id" class="h2h-match-row" @click="goToMatchDetail(match)">
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
import { ref, onMounted, computed, nextTick, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowLeft } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';

export default {
  name: 'UpcomingMatchDetail',
  components: { ArrowLeft },
  setup() {
    const comparisonRoles = ['tank', 'damage', 'support'];
    const route = useRoute();
    const router = useRouter();
    const store = useStore();
    
    const isLoading = ref(true);
    const queryParams = ref({
      seasonId: route.query.seasonId,
      team1: route.query.t1 || route.query.team1 || 'Team 1',
      team2: route.query.t2 || route.query.team2 || 'Team 2',
      team1Logo: route.query.team1Logo || '',
      team2Logo: route.query.team2Logo || '',
      time: route.query.time ? parseInt(route.query.time) : null,
      tournament: route.query.tournament || ''
    });

    const storedMatchStr = sessionStorage.getItem('current_upcoming_match');
    if (storedMatchStr) {
      try {
        const storedMatch = JSON.parse(storedMatchStr);
        // Only use stored data if it matches the current teams in query
        if (storedMatch.team1 === queryParams.value.team1 && storedMatch.team2 === queryParams.value.team2) {
           if (!queryParams.value.team1Logo) queryParams.value.team1Logo = storedMatch.team1Logo;
           if (!queryParams.value.team2Logo) queryParams.value.team2Logo = storedMatch.team2Logo;
           if (!queryParams.value.time) queryParams.value.time = storedMatch.time;
           if (!queryParams.value.tournament) queryParams.value.tournament = storedMatch.tournament;
        }
      } catch (e) {
        console.error('Failed to parse stored match', e);
      }
    }

    const h2hMatches = ref([]);
    const teamStats = ref({ team1: null, team2: null });
    
    const rolePlayers = ref({
      tank: { t1: [], t2: [] },
      damage: { t1: [], t2: [] },
      support: { t1: [], t2: [] }
    });

    const selectedPlayers = ref({
      tank: { t1: null, t2: null },
      damage: { t1: null, t2: null },
      support: { t1: null, t2: null }
    });

    const roleMaxStats = ref({
      tank: { damage: 1000, healing: 1000, mitigation: 1000 },
      damage: { damage: 1000, healing: 1000, mitigation: 1000 },
      support: { damage: 1000, healing: 1000, mitigation: 1000 }
    });

    const hasAnyPlayers = computed(() => {
      return ['tank', 'damage', 'support'].some(r => rolePlayers.value[r].t1.length > 0 || rolePlayers.value[r].t2.length > 0);
    });
    
    const formattedTournament = computed(() => {
      const name = queryParams.value.tournament;
      if (!name) return '';
      const parts = name.split('-');
      if (parts.length > 1) {
        return parts[0].trim();
      }
      return name;
    });

    const team1ResolvedId = computed(() => {
      const target = String(queryParams.value.team1 || '').toLowerCase();
      if (!target) return '';
      const found = store.state.teams.find(t => {
        const name = String(t.name || '').toLowerCase();
        const abbr = String(t.abbreviation || '').toLowerCase();
        return name === target || abbr === target || name.includes(target) || target.includes(name);
      });
      return found?.id ? String(found.id) : '';
    });

    const team2ResolvedId = computed(() => {
      const target = String(queryParams.value.team2 || '').toLowerCase();
      if (!target) return '';
      const found = store.state.teams.find(t => {
        const name = String(t.name || '').toLowerCase();
        const abbr = String(t.abbreviation || '').toLowerCase();
        return name === target || abbr === target || name.includes(target) || target.includes(name);
      });
      return found?.id ? String(found.id) : '';
    });
    
    const activeTab = ref('team');
    const teamRadarRef = ref(null);
    let radarChartInstance = null;

    const playerRadarRefs = ref({});
    const playerRadarInstances = {};

    const setPlayerRadarRef = (el, role) => {
      if (el) {
        playerRadarRefs.value[role] = el;
      } else {
        delete playerRadarRefs.value[role];
      }
    };

    const getPreferredSelectedPlayer = (players) => {
      if (!players.length) return null;
      return players.find(player => player.hasStats) || players[0];
    };

    const formatRadarAxisValue = (value) => {
      const numeric = Number(value || 0);
      if (!Number.isFinite(numeric)) return '0';
      if (numeric >= 100) return String(Math.round(numeric));
      if (Number.isInteger(numeric)) return String(numeric);
      if (numeric >= 10) return numeric.toFixed(1).replace(/\.0$/, '');
      return numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    };

    const getRadarLayout = (container) => {
      const width = container?.clientWidth || 0;
      if (width && width <= 420) {
        return {
          radius: '54%',
          center: ['50%', '56%']
        };
      }

      return {
        radius: '60%',
        center: ['50%', '50%']
      };
    };

    const buildRoleRadarDefinitions = (role, players, options = {}) => {
      const usePer10 = options.usePer10 !== false;
      const metricLabel = (base) => (usePer10 ? `${base}/10m` : base);
      const deathKey = usePer10 ? 'deathsPer10' : 'deaths';

      const baseDefinitions = {
        tank: [
          { name: 'K/D', key: 'kd' },
          { name: metricLabel('消灭'), key: usePer10 ? 'elimsPer10' : 'kills' },
          { name: metricLabel('伤害'), key: usePer10 ? 'damagePer10' : 'damage' },
          { name: metricLabel('抵挡'), key: usePer10 ? 'mitigationPer10' : 'mitigation' },
          { name: '生存', type: 'survival', deathKey }
        ],
        damage: [
          { name: 'K/D', key: 'kd' },
          { name: metricLabel('消灭'), key: usePer10 ? 'elimsPer10' : 'kills' },
          { name: metricLabel('伤害'), key: usePer10 ? 'damagePer10' : 'damage' },
          { name: metricLabel('助攻'), key: usePer10 ? 'assistsPer10' : 'assists' },
          { name: '生存', type: 'survival', deathKey }
        ],
        support: [
          { name: 'KA/D', key: 'kad' },
          { name: metricLabel('消灭'), key: usePer10 ? 'elimsPer10' : 'kills' },
          { name: metricLabel('治疗'), key: usePer10 ? 'healingPer10' : 'healing' },
          { name: metricLabel('助攻'), key: usePer10 ? 'assistsPer10' : 'assists' },
          { name: '生存', type: 'survival', deathKey }
        ]
      };

      const rolePlayers = players.filter(Boolean);
      const maxDeaths = Math.max(0, ...rolePlayers.map(player => Number(player?.[deathKey]) || 0));
      const survivalMax = maxDeaths === 0 ? 10 : Math.ceil(maxDeaths * 1.1);

      return (baseDefinitions[role] || baseDefinitions.damage).map((definition) => {
        if (definition.type === 'survival') {
          return {
            ...definition,
            max: survivalMax
          };
        }

        const maxValue = Math.max(0, ...rolePlayers.map(player => Number(player?.[definition.key]) || 0));
        return {
          ...definition,
          max: maxValue === 0 ? 10 : Math.ceil(maxValue * 1.1)
        };
      });
    };

    const getRadarMetricValue = (player, definition) => {
      if (!player) return 0;
      if (definition.type === 'survival') {
        const deathValue = Number(player?.[definition.deathKey]) || 0;
        return Math.max(0, definition.max - deathValue);
      }
      return Number(player?.[definition.key]) || 0;
    };

    const switchTab = async (tab) => {
      if (activeTab.value !== tab) {
        trackPublicEvent('未开赛详情-切换标签', {
          seasonId: queryParams.value.seasonId,
          team1Id: team1ResolvedId.value,
          team2Id: team2ResolvedId.value,
          tab
        }, route);
      }

      activeTab.value = tab;
      await nextTick();

      requestAnimationFrame(() => {
        if (tab === 'team') {
          renderTeamRadar();
          handleResize();
          return;
        }

        if (tab === 'players') {
          renderVisiblePlayerRadars();
          return;
        }

        handleResize();
      });
    };

    const selectPlayer = (role, teamKey, playerObj) => {
      selectedPlayers.value[role][teamKey] = playerObj;
      nextTick(() => {
        renderPlayerRadar(role);
      });
    };

    const goBack = () => {
      trackPublicEvent('未开赛详情-返回上一页', {
        seasonId: queryParams.value.seasonId,
        team1Id: team1ResolvedId.value,
        team2Id: team2ResolvedId.value
      }, route);

      // Pass the seasonId back to the visualizer view via query parameter
      router.push({
        path: '/visualize',
        query: { seasonId: queryParams.value.seasonId }
      });
    };

    const goToTeamDetail = (teamId) => {
      if (!teamId) return;
      trackPublicEvent('未开赛详情-打开战队', {
        seasonId: queryParams.value.seasonId,
        team1Id: team1ResolvedId.value,
        team2Id: team2ResolvedId.value,
        teamId: String(teamId)
      }, route);

      router.push({
        path: '/visualize/team-detail',
        query: {
          seasonId: queryParams.value.seasonId,
          teamId: String(teamId),
          from: 'upcoming-match-detail'
        }
      });
    };

    const goToMatchDetail = (match) => {
      if (!match?.id) return;

      trackPublicEvent('未开赛详情-打开历史比赛', {
        seasonId: String(match.seasonId || queryParams.value.seasonId || ''),
        team1Id: team1ResolvedId.value,
        team2Id: team2ResolvedId.value,
        matchId: match.id
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
          seasonId: String(match.seasonId || queryParams.value.seasonId || ''),
          from: 'upcoming-match-detail',
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

    const formatTime = (timestamp) => {
      if (!timestamp) return 'TBD';
      const date = new Date(timestamp);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
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

    const formatNumber = (num) => {
      if (num == null) return '0';
      return Math.round(num).toLocaleString();
    };

    const getPercentage = (val, max) => {
      if (!max || max === 0) return '0%';
      return `${Math.min((val / max) * 100, 100)}%`;
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
      const team = store.state.teams.find(t => t.id === teamId);
      return team ? team.name : 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      const team = store.state.teams.find(t => t.id === teamId);
      return team?.logo || 'https://owmini.xyz/images/tbd.png';
    };

    const getSeasonName = (seasonId) => {
      if (!seasonId) return '';
      const season = store.state.seasons?.find(s => String(s.id) === String(seasonId));
      return season ? season.name : '';
    };

      const isMatchBetweenTeams = (match, t1Name, t2Name) => {
      const mTeam1 = getTeamName(match.team1Id).toLowerCase();
      const mTeam2 = getTeamName(match.team2Id).toLowerCase();
      const target1 = t1Name.toLowerCase();
      const target2 = t2Name.toLowerCase();
      
      // 避免模糊匹配时，如果某队名极短（如仅一两个字母）导致错误匹配其他队
      const isMatch = (mTeam1 === target1 && mTeam2 === target2) || 
                      (mTeam1 === target2 && mTeam2 === target1) ||
                      (match.teamA?.short?.toLowerCase() === target1 && match.teamB?.short?.toLowerCase() === target2) ||
                      (match.teamA?.short?.toLowerCase() === target2 && match.teamB?.short?.toLowerCase() === target1);
      
      // 回退方案：如果严格匹配和缩写匹配都没找到，再尝试模糊匹配，但加上长度限制避免误杀
      if (!isMatch && target1.length > 2 && target2.length > 2) {
         return (mTeam1.includes(target1) && mTeam2.includes(target2)) || 
                (mTeam1.includes(target2) && mTeam2.includes(target1));
      }
      
      return isMatch;
    };

    const processTeamStats = (allStats, teamName, teamId) => {
      const targetLower = String(teamName || '').toLowerCase();
      const teamPlayers = allStats.filter(p => {
        if (teamId != null && Number(p.teamId) === Number(teamId)) return true;
        const pTeamName = (p.teamName || p.team?.name || '').toLowerCase();
        return pTeamName === targetLower || pTeamName.includes(targetLower) || targetLower.includes(pTeamName);
      });

      if (teamPlayers.length === 0) return null;

      let totalDamage = 0;
      let totalHealing = 0;
      let totalMitigation = 0;
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
      let maxDuration = 0;

      // When a team has more than 5 players (substitutions), summing all players' stats 
      // is still correct for the *team's* total stats. 
      // However, for the team's *actual game time*, taking the maximum individual player time
      // might be slightly inaccurate if NO single player played 100% of the maps (e.g. everyone rotated).
      // But in the context of OWCS aggregated season data per player, the most reliable proxy 
      // for "team's total game time" is indeed the max game time of any player, OR the sum of 
      // all player times divided by 5. We use sum/5 here because it perfectly accounts for substitutions 
      // across any number of players and matches.
      let sumOfAllPlayerDurations = 0;

      teamPlayers.forEach(p => {
        totalDamage += Number(p.damage || 0);
        totalHealing += Number(p.healing || 0);
        totalMitigation += Number(p.mitigation || 0);
        totalKills += Number(p.elims || 0);
        totalDeaths += Number(p.deaths || 0);
        totalAssists += Number(p.assists || 0);
        sumOfAllPlayerDurations += (p.gameTime || 0);
      });
      
      // Because there are exactly 5 players on the field for a team at any given second,
      // the true total game time of the team is exactly the sum of all its players' game times divided by 5.
      const teamTrueDuration = sumOfAllPlayerDurations / 5;

      let kd = totalKills;
      if (totalDeaths > 0) kd = parseFloat((totalKills / totalDeaths).toFixed(2));
      
      let kad = totalKills + totalAssists;
      if (totalDeaths > 0) kad = parseFloat(((totalKills + totalAssists) / totalDeaths).toFixed(2));
      
      const p10 = (val) => {
        if (!val || teamTrueDuration === 0) return 0;
        return parseFloat(((val / teamTrueDuration) * 10).toFixed(2));
      };

      return {
        avgDamage: p10(totalDamage),
        avgHealing: p10(totalHealing),
        avgMitigation: p10(totalMitigation),
        avgElims: p10(totalKills),
        avgAssists: p10(totalAssists),
        avgDeaths: p10(totalDeaths),
        kd,
        kad
      };
    };

    const processPlayerMatchups = (allStats, team1Name, team2Name) => {
      // Clear old data
      comparisonRoles.forEach(r => {
        rolePlayers.value[r] = { t1: [], t2: [] };
        roleMaxStats.value[r] = { damage: 100, healing: 100, mitigation: 100 };
      });

      const t1Lower = team1Name.toLowerCase();
      const t2Lower = team2Name.toLowerCase();
      
      let actualTeam1 = store.state.teams.find(t => {
         const tNameLower = t.name.toLowerCase();
         const tAbbrLower = t.abbreviation ? t.abbreviation.toLowerCase() : '';
         return tNameLower === t1Lower || tAbbrLower === t1Lower || tNameLower.includes(t1Lower) || t1Lower.includes(tNameLower);
      });
      
      let actualTeam2 = store.state.teams.find(t => {
         const tNameLower = t.name.toLowerCase();
         const tAbbrLower = t.abbreviation ? t.abbreviation.toLowerCase() : '';
         return tNameLower === t2Lower || tAbbrLower === t2Lower || tNameLower.includes(t2Lower) || t2Lower.includes(tNameLower);
      });

      const team1Roster = [];
      const team2Roster = [];
      const seasonId = queryParams.value.seasonId;
      const team1Id = team1ResolvedId.value ? Number(team1ResolvedId.value) : null;
      const team2Id = team2ResolvedId.value ? Number(team2ResolvedId.value) : null;
      const playerStatMap = new Map();

      const buildPlayerObj = (source = {}, fallback = {}) => {
        const duration = Number(source.gameTime || source.totalDuration || fallback.gameTime || 0);
        const damage = Number(source.damage || source.totalDamage || 0);
        const healing = Number(source.healing || source.totalHealing || 0);
        const mitigation = Number(source.mitigation || source.totalMitigation || 0);
        const elims = Number(source.elims || source.totalKills || 0);
        const assists = Number(source.assists || source.totalAssists || 0);
        const deaths = Number(source.deaths || source.totalDeaths || 0);
        const playerId = source.playerId || source.player?.id || fallback.playerId || fallback.id || null;
        const role = source.role || source.player?.role || fallback.role || 'damage';
        const name = source.playerName || source.player?.name || fallback.name || '未知';
        const p10 = (val) => (duration > 0 ? parseFloat(((Number(val || 0) / duration) * 10).toFixed(2)) : 0);
        const kd = deaths > 0 ? parseFloat((elims / deaths).toFixed(2)) : elims;
        const kad = deaths > 0 ? parseFloat(((elims + assists) / deaths).toFixed(2)) : elims + assists;

        return {
          id: playerId,
          name,
          role,
          gameTime: duration,
          kills: elims,
          assists,
          deaths,
          damage,
          healing,
          mitigation,
          damagePer10: p10(damage),
          healingPer10: p10(healing),
          mitigationPer10: p10(mitigation),
          elimsPer10: p10(elims),
          assistsPer10: p10(assists),
          deathsPer10: p10(deaths),
          kd,
          kad,
          hasStats: duration > 0
        };
      };

      const appendUniquePlayer = (list, playerObj) => {
        if (!playerObj?.name) return;
        const existingIndex = list.findIndex(item =>
          (playerObj.id && item.id && String(item.id) === String(playerObj.id)) ||
          item.name === playerObj.name
        );

        if (existingIndex === -1) {
          list.push(playerObj);
          return;
        }

        if ((playerObj.hasStats ? 1 : 0) > (list[existingIndex].hasStats ? 1 : 0) ||
            Number(playerObj.gameTime || 0) > Number(list[existingIndex].gameTime || 0)) {
          list.splice(existingIndex, 1, playerObj);
        }
      };

      if (seasonId && (team1Id || team2Id)) {
        const seasonNumericId = Number(seasonId);
        const seasonTeam1 = team1Id ? store.getters.getSeasonTeamBySeasonAndTeam(seasonNumericId, team1Id) : null;
        const seasonTeam2 = team2Id ? store.getters.getSeasonTeamBySeasonAndTeam(seasonNumericId, team2Id) : null;

        if (seasonTeam1?.id) {
          store.getters.getPlayersBySeasonTeamId(seasonTeam1.id).forEach(player => {
            team1Roster.push({
              id: player.id,
              name: player.name,
              role: player.role || 'damage'
            });
          });
        }

        if (seasonTeam2?.id) {
          store.getters.getPlayersBySeasonTeamId(seasonTeam2.id).forEach(player => {
            team2Roster.push({
              id: player.id,
              name: player.name,
              role: player.role || 'damage'
            });
          });
        }
      }

      allStats.forEach(p => {
        const pTeamName = (p.teamName || p.team?.name || '').toLowerCase();
        const playerObj = buildPlayerObj(p);
        const role = ['tank', 'damage', 'support'].includes(playerObj.role) ? playerObj.role : 'damage';
        const playerMapKey = playerObj.id ? String(playerObj.id) : `${role}:${playerObj.name}`;

        if ((actualTeam1 && p.teamId === actualTeam1.id) || pTeamName.includes(t1Lower) || (actualTeam1 && pTeamName.includes(actualTeam1.name.toLowerCase()))) {
          playerStatMap.set(`t1:${playerMapKey}`, playerObj);
          appendUniquePlayer(rolePlayers.value[role].t1, playerObj);
        } else if ((actualTeam2 && p.teamId === actualTeam2.id) || pTeamName.includes(t2Lower) || (actualTeam2 && pTeamName.includes(actualTeam2.name.toLowerCase()))) {
          playerStatMap.set(`t2:${playerMapKey}`, playerObj);
          appendUniquePlayer(rolePlayers.value[role].t2, playerObj);
        }
      });

      team1Roster.forEach(player => {
        const role = ['tank', 'damage', 'support'].includes(player.role) ? player.role : 'damage';
        const playerMapKey = player.id ? String(player.id) : `${role}:${player.name}`;
        const mergedPlayer = playerStatMap.get(`t1:${playerMapKey}`) || buildPlayerObj({}, player);
        appendUniquePlayer(rolePlayers.value[role].t1, mergedPlayer);
      });

      team2Roster.forEach(player => {
        const role = ['tank', 'damage', 'support'].includes(player.role) ? player.role : 'damage';
        const playerMapKey = player.id ? String(player.id) : `${role}:${player.name}`;
        const mergedPlayer = playerStatMap.get(`t2:${playerMapKey}`) || buildPlayerObj({}, player);
        appendUniquePlayer(rolePlayers.value[role].t2, mergedPlayer);
      });

      comparisonRoles.forEach(r => {
         rolePlayers.value[r].t1.sort((a,b) => b.gameTime - a.gameTime);
         rolePlayers.value[r].t2.sort((a,b) => b.gameTime - a.gameTime);

         selectedPlayers.value[r].t1 = getPreferredSelectedPlayer(rolePlayers.value[r].t1);
         selectedPlayers.value[r].t2 = getPreferredSelectedPlayer(rolePlayers.value[r].t2);

         const allInRole = [...rolePlayers.value[r].t1, ...rolePlayers.value[r].t2];
         if (allInRole.length > 0) {
            roleMaxStats.value[r].damage = Math.max(...allInRole.map(p => p.damagePer10), 100);
            roleMaxStats.value[r].healing = Math.max(...allInRole.map(p => p.healingPer10), 100);
            roleMaxStats.value[r].mitigation = Math.max(...allInRole.map(p => p.mitigationPer10), 100);
         }
      });
    };

    const renderVisiblePlayerRadars = () => {
      if (activeTab.value !== 'players') return;

      nextTick(() => {
        requestAnimationFrame(() => {
          comparisonRoles.forEach(role => renderPlayerRadar(role));
          handleResize();
        });
      });
    };

    const renderPlayerRadar = (role) => {
      if (!playerRadarRefs.value[role]) return;
      if (!playerRadarInstances[role]) {
        playerRadarInstances[role] = echarts.init(playerRadarRefs.value[role]);
      }

      const p1 = selectedPlayers.value[role].t1;
      const p2 = selectedPlayers.value[role].t2;

      if (!p1 && !p2) {
        playerRadarInstances[role].clear();
        return;
      }

      const rolePool = [...rolePlayers.value[role].t1, ...rolePlayers.value[role].t2];
      const radarDefinitions = buildRoleRadarDefinitions(role, rolePool, { usePer10: true });
      const indicators = radarDefinitions.map(definition => ({
        name: definition.name,
        max: definition.max
      }));
      const radarLayout = getRadarLayout(playerRadarRefs.value[role]);

      const seriesData = [];
      if (p1) {
        seriesData.push({
          value: radarDefinitions.map(definition => getRadarMetricValue(p1, definition)),
          name: p1.name,
          itemStyle: { color: '#111' },
          areaStyle: { color: 'rgba(17, 17, 17, 0.16)' }
        });
      }
      if (p2) {
        seriesData.push({
          value: radarDefinitions.map(definition => getRadarMetricValue(p2, definition)),
          name: p2.name,
          itemStyle: { color: '#ff6a00' },
          areaStyle: { color: 'rgba(255, 106, 0, 0.18)' }
        });
      }

      const option = {
        tooltip: { show: false },
        legend: {
          show: false,
          bottom: 0,
          data: seriesData.map(s => s.name),
          textStyle: { fontSize: 12 }
        },
        radar: {
          indicator: indicators,
          shape: 'polygon',
          splitNumber: 4,
          radius: radarLayout.radius,
          center: radarLayout.center,
          axisName: {
            color: '#606266',
            fontSize: 11,
            fontWeight: 'bold',
            formatter: function (value) {
               const definition = radarDefinitions.find(item => item.name === value);
               const v1 = formatRadarAxisValue(getRadarMetricValue(p1, definition));
               const v2 = formatRadarAxisValue(getRadarMetricValue(p2, definition));
               if (value === 'K/D' || value === 'KA/D') return `{name|${value}}\n{t1|${v1}} : {t2|${v2}}`;
               return `{name|${value}}\n{t1|${v1}}\n{t2|${v2}}`;
            },
            rich: {
              name: { color: '#909399', fontSize: 10, align: 'center', padding: [0,0,4,0] },
              t1: { color: '#111', fontSize: 11, fontWeight: 'bold', align: 'center', lineHeight: 14 },
              t2: { color: '#ff6a00', fontSize: 11, fontWeight: 'bold', align: 'center', lineHeight: 14 }
            }
          },
          splitLine: { lineStyle: { color: ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.2)'] } },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } }
        },
        series: [{
          type: 'radar',
          data: seriesData,
          symbol: 'circle',
          symbolSize: 4
        }]
      };

      playerRadarInstances[role].setOption(option);
    };

    const renderTeamRadar = () => {
      if (!teamRadarRef.value) return;
      if (!radarChartInstance) {
        radarChartInstance = echarts.init(teamRadarRef.value);
      }

      const t1 = teamStats.value.team1;
      const t2 = teamStats.value.team2;

      if (!t1 && !t2) {
        radarChartInstance.clear();
        return;
      }

      const getMax = (key) => {
        const t1Val = t1 ? Number(t1[key]) || 0 : 0;
        const t2Val = t2 ? Number(t2[key]) || 0 : 0;
        const max = Math.max(t1Val, t2Val);
        if (key === 'kd' || key === 'avgElims') {
           return max === 0 ? 5 : max * 1.2;
        }
        return max === 0 ? 10 : Math.ceil(max * 1.2);
      };

      const dataKeys = ['kd', 'avgDamage', 'avgHealing', 'avgMitigation', 'avgElims'];
      const indicators = [
        { name: 'K/D', max: getMax('kd') },
        { name: '伤害/10m', max: getMax('avgDamage') },
        { name: '治疗/10m', max: getMax('avgHealing') },
        { name: '抵挡/10m', max: getMax('avgMitigation') },
        { name: '消灭/10m', max: getMax('avgElims') }
      ];

      const seriesData = [];
      if (t1) {
        seriesData.push({
          value: [t1.kd, t1.avgDamage, t1.avgHealing, t1.avgMitigation, t1.avgElims],
          name: queryParams.value.team1,
          itemStyle: { color: '#111' },
          areaStyle: { color: 'rgba(17, 17, 17, 0.16)' }
        });
      }
      if (t2) {
        seriesData.push({
          value: [t2.kd, t2.avgDamage, t2.avgHealing, t2.avgMitigation, t2.avgElims],
          name: queryParams.value.team2,
          itemStyle: { color: '#ff6a00' },
          areaStyle: { color: 'rgba(255, 106, 0, 0.18)' }
        });
      }

      const option = {
        tooltip: { show: false },
        legend: {
          bottom: 0,
          data: seriesData.map(s => s.name),
          textStyle: { fontSize: 12 }
        },
        radar: {
          indicator: indicators,
          shape: 'polygon',
          splitNumber: 4,
          radius: getRadarLayout(teamRadarRef.value).radius,
          center: getRadarLayout(teamRadarRef.value).center,
          axisName: {
            color: '#606266',
            fontSize: 12,
            fontWeight: 'bold',
            formatter: function (value, indicator) {
               let t1v = t1 ? t1[dataKeys[indicators.findIndex(i => i.name === value)]] : 0;
               let t2v = t2 ? t2[dataKeys[indicators.findIndex(i => i.name === value)]] : 0;
               if (t1v > 100) t1v = Math.round(t1v);
               if (t2v > 100) t2v = Math.round(t2v);
               
               // For K/D (the topmost indicator), display side by side
               if (value === 'K/D') {
                 return `{name|${value}}\n{t1|${t1v}} : {t2|${t2v}}`;
               }
               // For other indicators, display stacked vertically
               return `{name|${value}}\n{t1|${t1v}}\n{t2|${t2v}}`;
            },
            rich: {
              name: { color: '#909399', fontSize: 11, align: 'center', padding: [0,0,4,0] },
              t1: { color: '#111', fontSize: 12, fontWeight: 'bold', align: 'center', lineHeight: 16 },
              t2: { color: '#ff6a00', fontSize: 12, fontWeight: 'bold', align: 'center', lineHeight: 16 }
            }
          },
          splitLine: {
            lineStyle: {
              color: ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.2)']
            }
          },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: 'rgba(0,0,0,0.1)' } }
        },
        series: [{
          type: 'radar',
          data: seriesData,
          symbol: 'circle',
          symbolSize: 6
        }]
      };

      radarChartInstance.setOption(option);
    };

    const loadData = async () => {
      const startTime = performance.now();
      isLoading.value = true;
      try {
        if (!store.state.teams.length || !store.state.players.length) {
          await store.dispatch('loadBaseData');
        }

        const seasonId = queryParams.value.seasonId;
        if (seasonId) {
          await store.dispatch('getSeasonTeams', Number(seasonId));
        }
        const [allGlobalMatchesRes, seasonMatchesRes, statsRes, scoreStatsRes] = await Promise.all([
          apiService.getMatches({ pageSize: 2000 }), // 获取尽可能多的全局比赛
          apiService.getMatches({ seasonId, pageSize: 2000 }),
          apiService.getSeasonPlayerStats(seasonId),
          apiService.getSeasonTeamScoreStats(seasonId)
        ]);

        const allMatches = Array.isArray(allGlobalMatchesRes) ? allGlobalMatchesRes : allGlobalMatchesRes.data || allGlobalMatchesRes.list || [];
        const seasonMatches = Array.isArray(seasonMatchesRes) ? seasonMatchesRes : seasonMatchesRes.data || seasonMatchesRes.list || [];
        const scoreStats = Array.isArray(scoreStatsRes) ? scoreStatsRes : scoreStatsRes.data || scoreStatsRes.list || [];
        const t1Name = queryParams.value.team1;
        const t2Name = queryParams.value.team2;

        h2hMatches.value = allMatches
          .filter(m => isMatchBetweenTeams(m, t1Name, t2Name))
          .sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));

        const allPlayerStats = statsRes || [];
        
        // Use abbreviations if team names are too long and causing mismatch
        let team1MatchStr = t1Name;
        let team2MatchStr = t2Name;

        const team1 = store.state.teams.find(t => {
           const tNameLower = t.name.toLowerCase();
           const tAbbrLower = t.abbreviation ? t.abbreviation.toLowerCase() : '';
           const searchLower = t1Name.toLowerCase();
           return tNameLower === searchLower || 
                  tAbbrLower === searchLower || 
                  tNameLower.includes(searchLower) || 
                  searchLower.includes(tNameLower);
        });
        
        const team2 = store.state.teams.find(t => {
           const tNameLower = t.name.toLowerCase();
           const tAbbrLower = t.abbreviation ? t.abbreviation.toLowerCase() : '';
           const searchLower = t2Name.toLowerCase();
           return tNameLower === searchLower || 
                  tAbbrLower === searchLower || 
                  tNameLower.includes(searchLower) || 
                  searchLower.includes(tNameLower);
        });

        if (team1) team1MatchStr = team1.name;
        if (team2) team2MatchStr = team2.name;

        const isCompletedMatch = (match) => match && (match.winnerId != null || (match.team1Score != null && match.team2Score != null));

        // Get score stats
        const getTeamScoreStat = (teamId, searchName) => {
          const sName = searchName.toLowerCase();
          return scoreStats.find(s => {
            if (teamId != null && Number(s.teamId) === Number(teamId)) return true;
            const sn = (s.teamName || '').toLowerCase();
            const ssn = (s.teamShortName || '').toLowerCase();
            return sn === sName || ssn === sName || sn.includes(sName) || sName.includes(sn);
          }) || { matchWin: 0, matchLoss: 0, matchDiff: 0, mapWin: 0, mapLoss: 0, mapDiff: 0 };
        };

        const t1ScoreStat = getTeamScoreStat(team1?.id, team1MatchStr || t1Name);
        const t2ScoreStat = getTeamScoreStat(team2?.id, team2MatchStr || t2Name);

        teamStats.value.team1 = processTeamStats(allPlayerStats, team1MatchStr, team1?.id);
        if (teamStats.value.team1) teamStats.value.team1.scoreStat = t1ScoreStat;

        teamStats.value.team2 = processTeamStats(allPlayerStats, team2MatchStr, team2?.id);
        if (teamStats.value.team2) teamStats.value.team2.scoreStat = t2ScoreStat;

        // Fallback for names if not found
        if (!teamStats.value.team1) {
          teamStats.value.team1 = processTeamStats(allPlayerStats, t1Name, team1?.id);
          if (teamStats.value.team1) teamStats.value.team1.scoreStat = t1ScoreStat;
        }
        if (!teamStats.value.team2) {
          teamStats.value.team2 = processTeamStats(allPlayerStats, t2Name, team2?.id);
          if (teamStats.value.team2) teamStats.value.team2.scoreStat = t2ScoreStat;
        }

        processPlayerMatchups(allPlayerStats, team1MatchStr, team2MatchStr);
        if (!hasAnyPlayers.value) {
           processPlayerMatchups(allPlayerStats, t1Name, t2Name);
        }

      } catch (err) {
        console.error('Failed to load detail data:', err);
      } finally {
        isLoading.value = false;
        trackPerformance('未开赛详情加载', performance.now() - startTime, {
          seasonId: queryParams.value.seasonId,
          team1Id: team1ResolvedId.value,
          team2Id: team2ResolvedId.value,
          tab: activeTab.value
        }, route);
        nextTick(() => {
          if (activeTab.value === 'team') {
            requestAnimationFrame(() => {
              renderTeamRadar();
              handleResize();
            });
          } else if (activeTab.value === 'players') {
            renderVisiblePlayerRadars();
          }
        });
      }
    };

    const handleResize = () => {
      if (radarChartInstance) radarChartInstance.resize();
      Object.values(playerRadarInstances).forEach(inst => {
        if (inst) inst.resize();
      });
    };

    onMounted(() => {
      loadData();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      if (radarChartInstance) radarChartInstance.dispose();
      Object.values(playerRadarInstances).forEach(inst => {
        if (inst) inst.dispose();
      });
    });

      const isOngoing = computed(() => {
        if (!queryParams.value.time) return false;
        return queryParams.value.time < Date.now();
      });

    watch(activeTab, (tab) => {
      if (tab === 'players') {
        renderVisiblePlayerRadars();
      }
      if (tab === 'team') {
        nextTick(() => {
          requestAnimationFrame(() => {
            renderTeamRadar();
            handleResize();
          });
        });
      }
    });

    return {
      isLoading,
      queryParams,
      formattedTournament,
      team1ResolvedId,
      team2ResolvedId,
      h2hMatches,
      teamStats,
      rolePlayers,
      selectedPlayers,
      roleMaxStats,
      hasAnyPlayers,
      activeTab,
      teamRadarRef,
      setPlayerRadarRef,
      switchTab,
      selectPlayer,
      goToTeamDetail,
      goBack,
      goToMatchDetail,
      formatTime,
      formatDateOnly,
      formatTournamentName,
      formatNumber,
      getPercentage,
      getRoleIconUrl,
      getTeamName,
      getTeamLogo,
      getSeasonName,
      isOngoing
    };
  }
};
</script>

<style scoped>
.upcoming-detail-page {
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
  border-top-color: #409EFF;
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
  padding: 16px 20px;
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
  width: 60px; /* balance the back btn */
}

.match-banner {
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px 30px;
  border-bottom: 10px solid #fafafa;
}

.team {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.team-link {
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.team-link:hover .team-name,
.team-link:hover .team-logo {
  opacity: 0.8;
}

.team-link:active {
  transform: scale(0.98);
}

.left-team {
  justify-content: flex-end;
}

.right-team {
  justify-content: flex-start;
}

.team-name {
  font-size: 24px;
  font-weight: 900;
  color: #111;
  font-family: var(--vis-font-display);
}

.team-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
}

.match-time-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40px;
  gap: 4px;
}

.time-text {
  font-size: 14px;
  color: #909399;
  font-weight: 600;
}

.vs-text {
  font-size: 32px;
  font-weight: 900;
  color: #dcdfe6;
  font-family: var(--vis-font-display);
  line-height: 1;
}

.match-status-badge {
  background: #f4f4f5;
  color: #909399;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  font-weight: 600;
  margin-top: 4px;
}

.match-status-badge.ongoing {
  background-color: #ffeaea;
  color: #f56c6c;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

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
  color: #409EFF;
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
  left: 20%;
  width: 60%;
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
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.seamless-content {
  padding: 20px;
  animation: tabFadeIn 0.3s ease-out forwards;
}

.team-radar-wrapper {
  position: relative;
}

.team-radar-wrapper::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, #f0f2f5 0%, rgba(240,242,245,0) 70%);
  border-radius: 50%;
  z-index: 0;
  pointer-events: none;
}

.team-radar-container {
  height: 340px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.vis-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f2f5;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #111;
}

.card-subtitle {
  font-size: 12px;
  color: #909399;
}

.card-body {
  padding: 20px;
  flex: 1;
}

.radar-container {
  height: 300px;
  width: 100%;
}

.team-radar-body {
  display: block;
  flex: none;
}

.empty-state {
  color: #909399;
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}

.h2h-card {
  margin-top: 20px;
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
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;
  gap: 10px;
  cursor: pointer;
}

.h2h-match-row:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
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

.h2h-team.t1 {
  justify-content: flex-end;
}

.h2h-team.t2 {
  justify-content: flex-start;
}

.h2h-team.is-winner {
  color: #111;
  font-weight: 900;
}

.h2h-team.is-loser {
  opacity: 0.6;
}

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
  color: #409EFF;
}

.score-colon {
  margin: 0 6px;
  color: #c0c4cc;
  font-size: 14px;
}

.player-comparison-body {
  padding: 0;
}

.interactive-matchups {
  display: flex;
  flex-direction: column;
}

.role-arena {
  display: flex;
  flex-direction: column;
  padding-bottom: 5px;
}

.role-arena-header {
  display: flex;
  align-items: center;
  padding: 24px 0 16px;
}

.role-arena:first-child .role-arena-header {
  padding-top: 10px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
}

.header-line {
  flex: 1;
  height: 1px;
}

.left-line {
  background: linear-gradient(to right, rgba(220,223,230,0), rgba(220,223,230,0.8));
}

.right-line {
  background: linear-gradient(to left, rgba(220,223,230,0), rgba(220,223,230,0.8));
}

.role-icon-small {
  width: 20px;
  height: 20px;
  opacity: 1;
  filter: brightness(0);
}

.role-name {
  font-weight: 800;
  color: #000;
  font-size: 13px;
  letter-spacing: 1px;
}

.player-selectors {
  display: flex;
  align-items: flex-start;
  padding: 0 20px 12px;
  gap: 12px;
}

.team-selector {
  flex: 1;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

.t1-selector {
  justify-content: flex-end;
}

.t2-selector {
  justify-content: flex-start;
}

.player-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  background: #f4f4f5;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(17, 17, 17, 0.06);
  font-size: 12px;
  user-select: none;
}

.player-chip:hover {
  transform: translateY(-1px);
}

.t1-selector .player-chip:hover {
  background: rgba(17, 17, 17, 0.06);
  border-color: rgba(17, 17, 17, 0.12);
}

.t2-selector .player-chip:hover {
  background: rgba(255, 106, 0, 0.08);
  border-color: rgba(255, 106, 0, 0.18);
}

.t1-selector .player-chip.active {
  background: rgba(17, 17, 17, 0.08);
  border-color: rgba(17, 17, 17, 0.18);
  color: #111;
  box-shadow: 0 6px 14px rgba(17, 17, 17, 0.08);
}

.t2-selector .player-chip.active {
  background: rgba(255, 106, 0, 0.12);
  border-color: rgba(255, 106, 0, 0.24);
  color: #ff6a00;
  box-shadow: 0 6px 14px rgba(255, 106, 0, 0.12);
}

.chip-name {
  font-weight: 800;
}

.chip-kd {
  color: #909399;
  font-size: 11px;
  background: #fff;
  padding: 2px 4px;
  border-radius: 4px;
}

.active .chip-kd {
  color: inherit;
}

.selector-vs {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  font-weight: 900;
  color: #ebeef5;
  font-size: 14px;
  font-style: italic;
  padding-top: 4px;
}

.team-extra-stats {
  padding: 0 40px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: #909399;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.stat-val {
  font-size: 14px;
  font-weight: 900;
  white-space: nowrap;
  font-family: var(--vis-font-display);
}

.t1-val {
  color: #111;
  text-align: left;
}

.t2-val {
  color: #ff6a00;
  text-align: right;
}

.stat-bars {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  position: relative;
}

.left-track .bar-fill {
  right: 0;
  border-radius: 4px;
}

.right-track .bar-fill {
  left: 0;
  border-radius: 4px;
}

.bar-fill {
  position: absolute;
  top: 0;
  height: 100%;
  transition: width 0.4s ease;
}

.t1-bg { background: #111; }
.t2-bg { background: #ff6a00; }

.arena-bars {
  padding: 8px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-radar-wrapper {
  padding: 0 20px 5px;
  position: relative;
}

.player-radar-wrapper::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, #f0f2f5 0%, rgba(240,242,245,0) 70%);
  border-radius: 50%;
  z-index: 0;
  pointer-events: none;
}

.player-radar-container {
  height: 240px;
  width: 100%;
  position: relative;
  z-index: 1;
}

@media (max-width: 992px) {
}

@media (max-width: 768px) {
  .detail-header {
    padding: 12px 16px;
  }

  .tournament-info {
    flex: 1;
    display: flex;
    justify-content: center;
    overflow: hidden;
    padding: 0 10px;
  }

  .tournament-name {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .empty-space {
    width: 40px; /* smaller on mobile */
  }

  .match-banner {
    padding: 16px 12px 24px;
    flex-direction: row; /* Keep horizontal */
    gap: 8px;
  }

  .team {
    gap: 8px;
  }

  .team-name {
    font-size: 16px;
  }

  .team-logo {
    width: 40px;
    height: 40px;
  }

  .match-time-center {
    padding: 0 10px;
  }

  .vs-text {
    font-size: 24px;
  }

  .time-text {
    font-size: 12px;
  }

  .card-header {
    padding: 12px 16px;
  }

  .card-title {
    font-size: 15px;
  }

  .card-body {
    padding: 12px;
  }

  .radar-container {
    height: 240px;
  }

  .team-radar-body {
    display: block;
    flex: none;
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

  .team-radar-container {
    height: 300px;
  }

  .team-extra-stats {
    padding: 0 20px 20px;
    gap: 16px;
  }

  .player-selectors {
    padding: 0 10px 8px;
    gap: 8px;
  }

  .team-selector {
    gap: 6px;
  }

  .player-chip {
    padding: 4px 10px;
    font-size: 11px;
    gap: 4px;
  }

  .selector-vs {
    width: auto;
    font-size: 12px;
    padding-top: 4px;
  }

  .arena-bars {
    padding: 4px 10px 12px;
  }

  .stat-val {
    font-size: 12px;
  }

  .stat-label {
    font-size: 11px;
  }

  .bar-track {
    height: 6px;
  }
}
</style>
