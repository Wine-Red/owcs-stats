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
      <div class="match-banner vis-arena-banner">
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
              <div class="analysis-card-header">
                <div class="analysis-card-title">战队雷达</div>
                <div class="analysis-legend">
                  <span class="legend-chip team1-chip">{{ queryParams.team1 }}</span>
                  <span class="legend-chip team2-chip">{{ queryParams.team2 }}</span>
                </div>
              </div>
              <div class="radar-container team-radar-container" ref="teamRadarRef"></div>
            </div>

            <!-- 附加对比数据 -->
        <div class="team-extra-stats" v-if="teamStats.team1 && teamStats.team2">
           <div class="analysis-card-header stats-card-header">
             <div class="analysis-card-title">赛季战绩</div>
           </div>

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

            <div class="team-analysis-block">
              <MapWinRateAnalysis
                :map-games="seasonMapGames"
                :primary-team-id="team1ResolvedId"
                :primary-team-name="queryParams.team1"
                :secondary-team-id="team2ResolvedId"
                :secondary-team-name="queryParams.team2"
                :cover-map-cards="false"
                :show-map-sample="false"
                :show-map-insight="false"
              />
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
import MapWinRateAnalysis from './components/MapWinRateAnalysis.vue';

export default {
  name: 'UpcomingMatchDetail',
  components: { ArrowLeft, MapWinRateAnalysis },
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
    const seasonMapGames = ref([]);
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

    const getTeamRadarLayout = (container) => {
      const width = container?.clientWidth || 0;
      if (width && width <= 420) {
        return {
          radius: '52%',
          center: ['50%', '49%']
        };
      }

      return {
        radius: '58%',
        center: ['50%', '47%']
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
          radius: getTeamRadarLayout(teamRadarRef.value).radius,
          center: getTeamRadarLayout(teamRadarRef.value).center,
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
        if (!store.state.teams.length || !store.state.players.length || !store.state.maps.length) {
          await store.dispatch('loadBaseData');
        }

        const seasonId = queryParams.value.seasonId;
        if (seasonId) {
          await store.dispatch('getSeasonTeams', Number(seasonId));
        }
        const [allGlobalMatchesRes, seasonMatchesRes, statsRes, scoreStatsRes, seasonMapGamesRes] = await Promise.all([
          apiService.getMatches({ pageSize: 2000 }), // 获取尽可能多的全局比赛
          apiService.getMatches({ seasonId, pageSize: 2000 }),
          apiService.getSeasonPlayerStats(seasonId),
          apiService.getSeasonTeamScoreStats(seasonId),
          apiService.getMapGames({ seasonId, pageSize: 2000 })
        ]);

        const allMatches = Array.isArray(allGlobalMatchesRes) ? allGlobalMatchesRes : allGlobalMatchesRes.data || allGlobalMatchesRes.list || [];
        const seasonMatches = Array.isArray(seasonMatchesRes) ? seasonMatchesRes : seasonMatchesRes.data || seasonMatchesRes.list || [];
        const scoreStats = Array.isArray(scoreStatsRes) ? scoreStatsRes : scoreStatsRes.data || scoreStatsRes.list || [];
        seasonMapGames.value = Array.isArray(seasonMapGamesRes) ? seasonMapGamesRes : seasonMapGamesRes.data || seasonMapGamesRes.list || [];
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
      seasonMapGames,
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
  display: flex;
  flex-direction: column;
  width: 100%;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  color: #909399;
  font-size: 14px;
  font-weight: 600;
  transition: color 0.2s var(--vis-ease);
}

.back-btn:hover {
  color: #111;
}

.tournament-info {
  min-width: 0;
  text-align: center;
}

.tournament-name {
  color: #111;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.empty-space {
  width: 60px;
}

.match-banner {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  padding: 26px 40px 30px;
}

.team {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.team-link {
  cursor: pointer;
  transition: transform 0.2s var(--vis-ease), opacity 0.2s var(--vis-ease);
}

.team-link:hover .team-name,
.team-link:hover .team-logo {
  opacity: 0.85;
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

.match-banner .team-name {
  min-width: 0;
  overflow: hidden;
  color: #111;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--vis-font-display);
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.match-banner .left-team .team-name {
  color: #111;
}

.match-banner .right-team .team-name {
  color: #ff6a00;
}

.team-logo {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(17, 17, 17, 0.16));
}

.match-time-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  padding: 0 32px;
  gap: 6px;
}

.time-text {
  color: #909399;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.vs-text {
  background: var(--vis-primary-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-family: var(--vis-font-numeric);
  font-size: 38px;
  font-style: italic;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
}

.match-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  padding: 3px 12px;
  background: #f4f4f5;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 999px;
  color: #606266;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.match-status-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #909399;
}

.match-status-badge.ongoing {
  color: #e64545;
  background: rgba(245, 108, 108, 0.08);
  border-color: rgba(245, 108, 108, 0.28);
}

.match-status-badge.ongoing::before {
  background: var(--vis-live);
  animation: vis-live-pulse 2s var(--vis-ease) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .match-status-badge.ongoing::before {
    animation: none;
  }
}

.tabs-container {
  display: flex;
  flex-direction: column;
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
  user-select: none;
  scroll-snap-align: start;
  transition: color 0.2s var(--vis-ease), background-color 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
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
  min-height: 400px;
  background: #fff;
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
  padding: 16px 20px 24px;
  animation: tabFadeIn 0.3s ease-out forwards;
}

.analysis-card-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 0;
}

.analysis-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #111;
  font-family: var(--vis-font-display);
  font-size: 15px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.analysis-card-title::before {
  content: '';
  width: 4px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(-8deg);
}

.analysis-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: 140px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team1-chip {
  background: var(--vis-team-left-soft);
  border: 1px solid rgba(17, 17, 17, 0.12);
  color: #111;
}

.team2-chip {
  background: var(--vis-team-right-soft);
  border: 1px solid rgba(255, 106, 0, 0.2);
  color: #ff6a00;
}

.team-radar-wrapper {
  position: relative;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s var(--vis-ease), box-shadow 0.25s var(--vis-ease);
}

.team-radar-wrapper::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, #f0f2f5 0%, rgba(240, 242, 245, 0) 70%);
  border-radius: 50%;
  z-index: 0;
  pointer-events: none;
}

.team-radar-wrapper::after {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  z-index: 2;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.25s var(--vis-ease);
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .team-radar-wrapper:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }

  .team-radar-wrapper:hover::after {
    opacity: 1;
  }
}

.team-radar-container {
  height: 316px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.radar-container {
  height: 300px;
  width: 100%;
}

.empty-state {
  padding: 40px 0;
  color: #909399;
  text-align: center;
  font-size: 14px;
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

.h2h-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  color: #606266;
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
  flex-shrink: 0;
  object-fit: contain;
}

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

.interactive-matchups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.role-arena {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s var(--vis-ease), box-shadow 0.25s var(--vis-ease);
}

.role-arena::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  z-index: 2;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.25s var(--vis-ease);
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .role-arena:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }

  .role-arena:hover::before {
    opacity: 1;
  }
}

.role-arena-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px 2px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.header-title::before {
  content: '';
  width: 4px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(-8deg);
}

.header-line {
  flex: 1;
  height: 1px;
}

.left-line {
  display: none;
}

.right-line {
  background: linear-gradient(to right, rgba(235, 238, 245, 0.9), rgba(235, 238, 245, 0));
}

.role-icon-small {
  width: 18px;
  height: 18px;
  opacity: 1;
  filter: brightness(0);
}

.role-name {
  color: #111;
  font-family: var(--vis-font-display);
  font-size: 13px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.player-selectors {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 18px 6px;
}

.team-selector {
  flex: 1;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.t1-selector {
  justify-content: flex-end;
}

.t2-selector {
  justify-content: flex-start;
}

.player-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  background: var(--vis-bg-muted);
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 999px;
  color: var(--vis-text-secondary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s var(--vis-ease), background-color 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease), color 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

@media (hover: hover) and (pointer: fine) {
  .player-chip:hover {
    transform: translateY(-1px);
  }

  .t1-selector .player-chip:hover {
    background: rgba(17, 17, 17, 0.06);
    border-color: rgba(17, 17, 17, 0.12);
    color: #111;
  }

  .t2-selector .player-chip:hover {
    background: rgba(255, 106, 0, 0.08);
    border-color: rgba(255, 106, 0, 0.18);
    color: #ff6a00;
  }
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
  white-space: nowrap;
}

.selector-vs {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 5px;
  color: var(--vis-text-disabled);
  font-family: var(--vis-font-numeric);
  font-size: 13px;
  font-style: italic;
  font-weight: 900;
}

.team-extra-stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  padding: 4px 14px 14px;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.stats-card-header {
  padding: 10px 4px 2px;
}

.team-analysis-block {
  margin-top: 14px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f2f5;
  border-radius: 12px;
  transition: border-color 0.2s var(--vis-ease);
}

.stat-item:hover {
  border-color: var(--vis-border-strong);
}

.stat-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.stat-label {
  color: #909399;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.stat-val {
  font-family: var(--vis-font-numeric);
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.t1-val {
  color: #111;
  text-align: right;
}

.t2-val {
  color: #ff6a00;
  text-align: left;
}

.stat-bars {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.bar-track {
  height: 6px;
  overflow: hidden;
  background: #f0f2f5;
  border-radius: 999px;
}

.stat-bars .bar-track:first-child {
  direction: rtl;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s var(--vis-ease);
}

.t1-bg { background: #111; }
.t2-bg { background: var(--vis-primary-gradient); }

.player-radar-wrapper {
  position: relative;
  padding: 0 18px 10px;
}

.player-radar-wrapper::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, #f0f2f5 0%, rgba(240, 242, 245, 0) 70%);
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

@media (max-width: 768px) {
  .detail-header {
    padding: 10px 16px;
  }

  .tournament-info {
    flex: 1;
    display: flex;
    justify-content: center;
    overflow: hidden;
    padding: 0 10px;
  }

  .tournament-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .empty-space {
    width: 40px;
  }

  .match-banner {
    gap: 8px;
    padding: 18px 12px 16px;
  }

  .team {
    gap: 8px;
  }

  .match-banner .team-name {
    font-size: 16px;
  }

  .team-logo {
    width: 40px;
    height: 40px;
  }

  .match-time-center {
    gap: 4px;
    padding: 0 10px;
  }

  .time-text {
    font-size: 11px;
  }

  .vs-text {
    font-size: 26px;
  }

  .match-status-badge {
    padding: 2px 10px;
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

  .analysis-card-header {
    padding: 12px 12px 0;
  }

  .analysis-card-title {
    font-size: 14px;
  }

  .legend-chip {
    max-width: 100px;
    padding: 2px 8px;
    font-size: 10px;
  }

  .team-radar-container {
    height: 270px;
  }

  .team-extra-stats {
    gap: 8px;
    margin-top: 12px;
    padding: 4px 12px 12px;
  }

  .stats-card-header {
    padding: 8px 2px 2px;
  }

  .stat-item {
    padding: 10px;
    border-radius: 10px;
  }

  .stat-header {
    gap: 8px;
  }

  .stat-val {
    font-size: 12px;
  }

  .stat-label {
    font-size: 11px;
  }

  .team-analysis-block {
    margin-top: 12px;
  }

  .interactive-matchups {
    gap: 12px;
  }

  .role-arena-header {
    padding: 12px 12px 2px;
  }

  .player-selectors {
    gap: 8px;
    padding: 8px 12px 4px;
  }

  .team-selector {
    gap: 6px;
  }

  .player-chip {
    min-height: 28px;
    padding: 0 10px;
    font-size: 11px;
    gap: 4px;
  }

  .selector-vs {
    font-size: 11px;
    padding-top: 5px;
  }

  .player-radar-wrapper {
    padding: 0 12px 8px;
  }

  .player-radar-container {
    height: 220px;
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
    gap: 6px;
  }

  .h2h-team .team-name {
    font-size: 13px;
  }

  .h2h-logo {
    width: 18px;
    height: 18px;
  }

  .h2h-score-box {
    min-width: 56px;
    padding: 2px 10px;
    font-size: 14px;
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
    padding: 8px 12px;
  }

  .back-btn {
    font-size: 13px;
  }

  .tournament-name {
    font-size: 13px;
  }

  .empty-space {
    width: 32px;
  }

  .match-banner {
    gap: 6px;
    padding: 14px 10px 14px;
  }

  .team {
    gap: 6px;
  }

  .match-banner .team-name {
    font-size: 14px;
  }

  .team-logo {
    width: 34px;
    height: 34px;
  }

  .match-time-center {
    gap: 3px;
    padding: 0 6px;
  }

  .time-text {
    font-size: 10px;
  }

  .vs-text {
    font-size: 22px;
  }

  .match-status-badge {
    padding: 2px 8px;
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

  .analysis-legend {
    justify-content: flex-start;
  }

  .legend-chip {
    max-width: 88px;
  }

  .team-radar-container {
    height: 250px;
  }

  .player-radar-container {
    height: 190px;
  }

  .role-name {
    font-size: 12px;
  }

  .player-chip {
    padding: 0 8px;
    font-size: 10px;
  }

  .h2h-matchup {
    gap: 6px;
  }

  .h2h-team .team-name {
    font-size: 12px;
  }

  .h2h-score-box {
    min-width: 48px;
    padding: 2px 8px;
    font-size: 13px;
  }
}
</style>
