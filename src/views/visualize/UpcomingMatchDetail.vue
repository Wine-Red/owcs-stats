<template>
  <div class="upcoming-detail-page">
    <div v-if="isLoading" class="page-loading">
      <div class="loading-panel">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    </div>

    <div v-else class="detail-container">
      <DetailTopbar :title="formattedTournament || '赛前详情'" @back="goBack" />

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

      <div class="tabs-container">
        <DetailSectionTabs
          :model-value="activeTab"
          :items="detailTabs"
          aria-label="赛前详情分区"
          @update:model-value="switchTab"
        />

        <div class="tab-content-area">
          <p class="form-note">双方各取最近 10 场已完赛比赛，不限赛季或阶段；不足 10 场按实际场数统计。</p>
          <p v-if="loadError" class="form-note" role="alert">{{ loadError }}</p>
          <p v-else class="form-note">{{ queryParams.team1 }}：{{ recentMatches.team1.length }} 场 · {{ queryParams.team2 }}：{{ recentMatches.team2.length }} 场</p>
          <p v-if="!loadError && !recentMatches.team1.length && !recentMatches.team2.length" class="form-note">暂无已录入的近期完赛记录。</p>
          <p v-else-if="!loadError && !teamStats.team1 && !teamStats.team2" class="form-note">近期比赛暂无选手统计，暂无法生成雷达和选手对位。</p>
          <!-- 战队对比 Tab -->
          <div v-show="activeTab === 'team'" class="seamless-content">
            <div class="team-radar-wrapper" v-if="teamStats.team1 || teamStats.team2">
              <div class="analysis-card-header">
                <div class="analysis-card-title">
                  战队雷达
                </div>
                <div class="analysis-legend">
                  <span class="legend-chip team1-chip">{{ queryParams.team1 }}</span>
                  <span class="legend-chip team2-chip">{{ queryParams.team2 }}</span>
                </div>
              </div>
              <div class="radar-container team-radar-container" ref="teamRadarRef"></div>
            </div>

            <!-- 战绩对比（双方近 10 场已完赛比赛） -->
            <div class="team-extra-stats" v-if="recentMatches.team1.length || recentMatches.team2.length">
              <div class="analysis-card-header stats-card-header">
                <div class="analysis-card-title">
                  近10场战绩
                </div>
              </div>

              <div class="stat-item">
                <div class="stat-header">
                  <span class="stat-val t1-val">{{ recentScores.team1.matchWin }}W - {{ recentScores.team1.matchLoss }}L</span>
                  <span class="stat-label">大场战绩</span>
                  <span class="stat-val t2-val">{{ recentScores.team2.matchWin }}W - {{ recentScores.team2.matchLoss }}L</span>
                </div>
                <div class="stat-bars">
                  <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(recentScores.team1.matchWin, recentScores.team1.matchWin + recentScores.team1.matchLoss) }"></div>
                  </div>
                  <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(recentScores.team2.matchWin, recentScores.team2.matchWin + recentScores.team2.matchLoss) }"></div>
                  </div>
                </div>
              </div>

              <div class="stat-item">
                <div class="stat-header">
                  <span class="stat-val t1-val">{{ recentScores.team1.mapWin }}W - {{ recentScores.team1.mapLoss }}L</span>
                  <span class="stat-label">小局战绩</span>
                  <span class="stat-val t2-val">{{ recentScores.team2.mapWin }}W - {{ recentScores.team2.mapLoss }}L</span>
                </div>
                <div class="stat-bars">
                  <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(recentScores.team1.mapWin, recentScores.team1.mapWin + recentScores.team1.mapLoss) }"></div>
                  </div>
                  <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(recentScores.team2.mapWin, recentScores.team2.mapWin + recentScores.team2.mapLoss) }"></div>
                  </div>
                </div>
              </div>

              <div class="stat-item">
                <div class="stat-header">
                  <span class="stat-val t1-val">{{ recentScores.team1.mapDiff > 0 ? '+' : '' }}{{ recentScores.team1.mapDiff }}</span>
                  <span class="stat-label">净胜局</span>
                  <span class="stat-val t2-val">{{ recentScores.team2.mapDiff > 0 ? '+' : '' }}{{ recentScores.team2.mapDiff }}</span>
                </div>
                <div class="stat-bars">
                  <div class="bar-track left-track">
                    <div class="bar-fill t1-bg" :style="{ width: getPercentage(Math.max(0, recentScores.team1.mapDiff), Math.max(0, recentScores.team1.mapDiff, recentScores.team2.mapDiff)) }"></div>
                  </div>
                  <div class="bar-track right-track">
                    <div class="bar-fill t2-bg" :style="{ width: getPercentage(Math.max(0, recentScores.team2.mapDiff), Math.max(0, recentScores.team1.mapDiff, recentScores.team2.mapDiff)) }"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模式胜率：两队各自最近 10 场已完赛比赛 -->
            <div class="team-analysis-block" v-if="showTeam1ModeWinRate || showTeam2ModeWinRate">
              <div class="analysis-card-header stats-card-header">
                <div class="analysis-card-title">
                  模式胜率
                </div>
              </div>

              <div v-if="showTeam1ModeWinRate" class="mode-team-group">
                <div class="mode-team-label team-dark">{{ queryParams.team1 }}</div>
                <MapWinRateAnalysis
                  :map-games="team1MapGames"
                  :primary-team-id="team1ResolvedId"
                  :primary-team-name="queryParams.team1"
                  :show-map-sample="false"
                  :show-map-insight="false"
                  :show-single-mode-hint="false"
                  hide-heading
                />
              </div>

              <div v-if="showTeam2ModeWinRate" class="mode-team-group">
                <div class="mode-team-label team-accent">{{ queryParams.team2 }}</div>
                <MapWinRateAnalysis
                  :map-games="team2MapGames"
                  :primary-team-id="team2ResolvedId"
                  :primary-team-name="queryParams.team2"
                  :show-map-sample="false"
                  :show-map-insight="false"
                  :show-single-mode-hint="false"
                  hide-heading
                />
              </div>
            </div>
          </div>

          <!-- 选手对位 Tab：单一合并雷达 + 顶部职责筛选 -->
          <div v-show="activeTab === 'players'" class="seamless-content player-comparison-body">
            <div v-if="hasAnyPlayers" class="player-radar-block">
              <div class="analysis-card-header stats-card-header">
                <div class="analysis-card-title">
                  选手对位
                </div>
              </div>

              <ContentChoiceGroup
                class="role-filter"
                :model-value="selectedRole"
                :items="roleTabs"
                hide-label
                compact
                aria-label="职责筛选"
                @update:model-value="selectRole"
              />

              <div class="player-selectors">
                <div class="team-selector t1-selector">
                  <span v-for="p in activeRolePlayers.t1" :key="p.name"
                        class="player-chip t1-chip"
                        :class="{ active: selectedPlayers[selectedRole]?.t1?.name === p.name }"
                        @click="selectPlayer(selectedRole, 't1', p)">
                    {{ p.name }}
                  </span>
                </div>

                <div class="selector-vs">VS</div>

                <div class="team-selector t2-selector">
                  <span v-for="p in activeRolePlayers.t2" :key="p.name"
                        class="player-chip t2-chip"
                        :class="{ active: selectedPlayers[selectedRole]?.t2?.name === p.name }"
                        @click="selectPlayer(selectedRole, 't2', p)">
                    {{ p.name }}
                  </span>
                </div>
              </div>

              <div class="player-radar-wrapper" v-show="hasActiveRadarData">
                <div class="player-radar-container" ref="playerRadarRef"></div>
              </div>
            </div>
          </div>

          <!-- 历史交手 Tab -->
          <div v-show="activeTab === 'h2h'" class="seamless-content">
            <div v-if="h2hMatches.length" class="h2h-list">
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
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { rowsOf, resolvePreviewTeam, recentTeamMatches, teamScore, aggregateRecentPlayers, mapWithConcurrency } from '@/utils/recentTeamForm.mjs';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';
import { TBD_TEAM_LOGO_URL } from '@/utils/teamLogos';
import MapWinRateAnalysis from './components/MapWinRateAnalysis.vue';
import DetailTopbar from './components/DetailTopbar.vue';
import DetailSectionTabs from './components/DetailSectionTabs.vue';
import ContentChoiceGroup from './components/ContentChoiceGroup.vue';

export default {
  name: 'UpcomingMatchDetail',
  components: { DetailTopbar, DetailSectionTabs, MapWinRateAnalysis, ContentChoiceGroup },
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
    const team1MapGames = ref([]);
    const team2MapGames = ref([]);
    const recentMatches = ref({ team1: [], team2: [] });
    const recentScores = ref({ team1: teamScore([], null), team2: teamScore([], null) });
    const loadError = ref('');
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

    const hasAnyPlayers = computed(() => {
      return comparisonRoles.some(r => rolePlayers.value[r].t1.length > 0 || rolePlayers.value[r].t2.length > 0);
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

    const team1ResolvedId = computed(() => resolvePreviewTeam(store.state.teams, queryParams.value.team1)?.id || '');
    const team2ResolvedId = computed(() => resolvePreviewTeam(store.state.teams, queryParams.value.team2)?.id || '');

    const activeTab = ref('team');
    const detailTabs = computed(() => {
      const tabs = [{ value: 'team', label: '战队对比' }];
      if (hasAnyPlayers.value) tabs.push({ value: 'players', label: '选手对位' });
      if (h2hMatches.value.length) tabs.push({ value: 'h2h', label: '历史交手' });
      return tabs;
    });

    watch(detailTabs, (tabs) => {
      if (!tabs.some(t => t.value === activeTab.value)) {
        activeTab.value = 'team';
      }
    });

    const teamRadarRef = ref(null);
    let radarChartInstance = null;

    const playerRadarRef = ref(null);
    let playerRadarInstance = null;

    // 选手对位：职责筛选（T → D → S）
    const selectedRole = ref('tank');
    const roleTabs = computed(() => {
      const labels = { tank: '重装', damage: '输出', support: '支援' };
      return comparisonRoles
        .filter(role => rolePlayers.value[role].t1.length || rolePlayers.value[role].t2.length)
        .map(role => ({ value: role, label: labels[role] || role }));
    });

    watch(roleTabs, (tabs) => {
      if (tabs.length && !tabs.some(t => t.value === selectedRole.value)) {
        selectedRole.value = tabs[0].value;
      }
    });

    const activeRolePlayers = computed(() => {
      return rolePlayers.value[selectedRole.value] || { t1: [], t2: [] };
    });

    const hasActiveRadarData = computed(() => {
      const sel = selectedPlayers.value[selectedRole.value] || {};
      return Boolean(sel.t1?.hasStats || sel.t2?.hasStats);
    });

    const teamParticipates = (teamId, games) => {
      const normalized = String(teamId || '');
      if (!normalized) return false;
      return games.some(g =>
        g && g.winnerId && g.mapId &&
        (String(g.team1Id) === normalized || String(g.team2Id) === normalized)
      );
    };

    const showTeam1ModeWinRate = computed(() => teamParticipates(team1ResolvedId.value, team1MapGames.value));
    const showTeam2ModeWinRate = computed(() => teamParticipates(team2ResolvedId.value, team2MapGames.value));

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

      const pool = players.filter(Boolean);
      const maxDeaths = Math.max(0, ...pool.map(player => Number(player?.[deathKey]) || 0));
      const survivalMax = maxDeaths === 0 ? 10 : Math.ceil(maxDeaths * 1.1);

      return (baseDefinitions[role] || baseDefinitions.damage).map((definition) => {
        if (definition.type === 'survival') {
          return {
            ...definition,
            max: survivalMax
          };
        }

        const maxValue = Math.max(0, ...pool.map(player => Number(player?.[definition.key]) || 0));
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
          renderPlayerRadar();
          return;
        }

        handleResize();
      });
    };

    const selectRole = (role) => {
      selectedRole.value = role;
      nextTick(() => {
        renderPlayerRadar();
      });
    };

    const selectPlayer = (role, teamKey, playerObj) => {
      selectedPlayers.value[role][teamKey] = playerObj;
      nextTick(() => {
        renderPlayerRadar();
      });
    };

    const goBack = () => {
      trackPublicEvent('未开赛详情-返回上一页', {
        seasonId: queryParams.value.seasonId,
        team1Id: team1ResolvedId.value,
        team2Id: team2ResolvedId.value
      }, route);

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

    const getTeamName = (teamId) => {
      const team = store.state.teams.find(t => t.id === teamId);
      return team ? team.name : 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      const team = store.state.teams.find(t => t.id === teamId);
      return team?.logo || TBD_TEAM_LOGO_URL;
    };

    const getSeasonName = (seasonId) => {
      if (!seasonId) return '';
      const season = store.state.seasons?.find(s => String(s.id) === String(seasonId));
      return season ? season.name : '';
    };

    const processTeamStats = (allStats, teamName, teamId) => {
      const targetLower = String(teamName || '').toLowerCase();
      const teamPlayers = allStats.filter(p => {
        if (teamId != null) return String(p.teamId) === String(teamId);
        const pTeamName = (p.teamName || p.team?.name || '').toLowerCase();
        return Boolean(pTeamName && targetLower && pTeamName === targetLower);
      });

      if (teamPlayers.length === 0) return null;

      let totalDamage = 0;
      let totalHealing = 0;
      let totalMitigation = 0;
      let totalKills = 0;
      let totalDeaths = 0;
      let totalAssists = 0;
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
      comparisonRoles.forEach(r => {
        rolePlayers.value[r] = { t1: [], t2: [] };
      });

      const t1Lower = team1Name.toLowerCase();
      const t2Lower = team2Name.toLowerCase();

      const actualTeam1 = resolvePreviewTeam(store.state.teams, team1Name);
      const actualTeam2 = resolvePreviewTeam(store.state.teams, team2Name);

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

      allStats.forEach(p => {
        const pTeamName = (p.teamName || p.team?.name || '').toLowerCase();
        const playerObj = buildPlayerObj(p);
        const role = ['tank', 'damage', 'support'].includes(playerObj.role) ? playerObj.role : 'damage';

        if (actualTeam1 ? String(p.teamId) === String(actualTeam1.id) : pTeamName === t1Lower) {
          appendUniquePlayer(rolePlayers.value[role].t1, playerObj);
        } else if (actualTeam2 ? String(p.teamId) === String(actualTeam2.id) : pTeamName === t2Lower) {
          appendUniquePlayer(rolePlayers.value[role].t2, playerObj);
        }
      });

      comparisonRoles.forEach(r => {
         // 只保留近期比赛有实际统计的选手参与对位
         rolePlayers.value[r].t1 = rolePlayers.value[r].t1.filter(p => p.hasStats).sort((a, b) => b.gameTime - a.gameTime);
         rolePlayers.value[r].t2 = rolePlayers.value[r].t2.filter(p => p.hasStats).sort((a, b) => b.gameTime - a.gameTime);

         selectedPlayers.value[r].t1 = getPreferredSelectedPlayer(rolePlayers.value[r].t1);
         selectedPlayers.value[r].t2 = getPreferredSelectedPlayer(rolePlayers.value[r].t2);
      });
    };

    const renderPlayerRadar = () => {
      if (activeTab.value !== 'players') return;
      if (!playerRadarRef.value) return;

      if (!playerRadarInstance) {
        playerRadarInstance = echarts.init(playerRadarRef.value);
      }

      const role = selectedRole.value;
      const p1 = selectedPlayers.value[role]?.t1;
      const p2 = selectedPlayers.value[role]?.t2;

      if (!p1?.hasStats && !p2?.hasStats) {
        playerRadarInstance.clear();
        return;
      }

      const rolePool = [...rolePlayers.value[role].t1, ...rolePlayers.value[role].t2];
      const radarDefinitions = buildRoleRadarDefinitions(role, rolePool, { usePer10: true });
      const indicators = radarDefinitions.map(definition => ({
        name: definition.name,
        max: definition.max
      }));
      const radarLayout = getRadarLayout(playerRadarRef.value);

      const seriesData = [];
      if (p1?.hasStats) {
        seriesData.push({
          value: radarDefinitions.map(definition => getRadarMetricValue(p1, definition)),
          name: p1.name,
          itemStyle: { color: '#111' },
          areaStyle: { color: 'rgba(17, 17, 17, 0.16)' }
        });
      }
      if (p2?.hasStats) {
        seriesData.push({
          value: radarDefinitions.map(definition => getRadarMetricValue(p2, definition)),
          name: p2.name,
          itemStyle: { color: '#ff6a00' },
          areaStyle: { color: 'rgba(255, 106, 0, 0.18)' }
        });
      }

      const option = {
        animationDuration: 300,
        tooltip: { show: false },
        legend: { show: false },
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
               const v1 = formatRadarAxisValue(getRadarMetricValue(p1?.hasStats ? p1 : null, definition));
               const v2 = formatRadarAxisValue(getRadarMetricValue(p2?.hasStats ? p2 : null, definition));
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

      playerRadarInstance.setOption(option, true);
      playerRadarInstance.resize();
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
            formatter: function (value) {
               let t1v = t1 ? t1[dataKeys[indicators.findIndex(i => i.name === value)]] : 0;
               let t2v = t2 ? t2[dataKeys[indicators.findIndex(i => i.name === value)]] : 0;
               if (t1v > 100) t1v = Math.round(t1v);
               if (t2v > 100) t2v = Math.round(t2v);

               if (value === 'K/D') {
                 return `{name|${value}}\n{t1|${t1v}} : {t2|${t2v}}`;
               }
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
        if (!store.state.teams.length || !store.state.players.length || !store.state.maps.length || !store.state.seasons.length) {
          await store.dispatch('loadBaseData');
        }

        loadError.value = '';
        const firstPage = await apiService.getMatches({ pageSize: 2000 });
        const allMatches = [...rowsOf(firstPage)];
        for (let page = 2; allMatches.length < Number(firstPage.total || 0); page++) {
          const rows = rowsOf(await apiService.getMatches({ pageSize: 2000, page }));
          if (!rows.length) break;
          allMatches.push(...rows);
        }
        const team1 = resolvePreviewTeam(store.state.teams, queryParams.value.team1);
        const team2 = resolvePreviewTeam(store.state.teams, queryParams.value.team2);
        const before = Math.min(Date.now(), queryParams.value.time || Date.now());
        recentMatches.value = {
          team1: recentTeamMatches(allMatches, team1?.id, before),
          team2: recentTeamMatches(allMatches, team2?.id, before)
        };
        recentScores.value = {
          team1: teamScore(recentMatches.value.team1, team1?.id),
          team2: teamScore(recentMatches.value.team2, team2?.id)
        };
        h2hMatches.value = allMatches.filter(match => team1 && team2 &&
          [match.team1Id, match.team2Id].some(id => String(id) === String(team1.id)) &&
          [match.team1Id, match.team2Id].some(id => String(id) === String(team2.id)) &&
          new Date(match.matchDate).getTime() <= before
        ).sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));
        const matchIds = [...new Set([...recentMatches.value.team1, ...recentMatches.value.team2].map(match => match.id))];
        const gameLists = await mapWithConcurrency(matchIds, async id => rowsOf(await apiService.getMatchMapGames(id)));
        const games = gameLists.flat();
        const selectGames = matches => {
          const ids = new Set(matches.map(match => String(match.id)));
          return games.filter(game => ids.has(String(game.matchId)));
        };
        team1MapGames.value = selectGames(recentMatches.value.team1);
        team2MapGames.value = selectGames(recentMatches.value.team2);
        const stats = (await mapWithConcurrency(games, async game => rowsOf(await apiService.getMapGamePlayerStats(game.id)))).flat();
        const allPlayerStats = [
          ...aggregateRecentPlayers(team1MapGames.value, stats, team1?.id),
          ...aggregateRecentPlayers(team2MapGames.value, stats, team2?.id)
        ];
        teamStats.value = {
          team1: processTeamStats(allPlayerStats, team1?.name || queryParams.value.team1, team1?.id),
          team2: processTeamStats(allPlayerStats, team2?.name || queryParams.value.team2, team2?.id)
        };
        processPlayerMatchups(allPlayerStats, team1?.name || queryParams.value.team1, team2?.name || queryParams.value.team2);

      } catch (err) {
        console.error('Failed to load detail data:', err);
        loadError.value = '部分近期比赛数据加载失败，请刷新重试。';
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
            renderPlayerRadar();
          }
        });
      }
    };

    const handleResize = () => {
      if (radarChartInstance) radarChartInstance.resize();
      if (playerRadarInstance) playerRadarInstance.resize();
    };

    onMounted(() => {
      loadData();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      if (radarChartInstance) radarChartInstance.dispose();
      if (playerRadarInstance) playerRadarInstance.dispose();
    });

    const isOngoing = computed(() => {
      if (!queryParams.value.time) return false;
      const now = Date.now();
      return queryParams.value.time <= now && queryParams.value.time > now - 8 * 60 * 60 * 1000;
    });

    watch(activeTab, (tab) => {
      if (tab === 'players') {
        nextTick(() => renderPlayerRadar());
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
      team1MapGames,
      team2MapGames,
      recentMatches,
      recentScores,
      loadError,
      teamStats,
      rolePlayers,
      selectedPlayers,
      hasAnyPlayers,
      activeTab,
      detailTabs,
      teamRadarRef,
      playerRadarRef,
      selectedRole,
      roleTabs,
      activeRolePlayers,
      hasActiveRadarData,
      showTeam1ModeWinRate,
      showTeam2ModeWinRate,
      switchTab,
      selectRole,
      selectPlayer,
      goToTeamDetail,
      goBack,
      goToMatchDetail,
      formatTime,
      formatDateOnly,
      formatTournamentName,
      formatNumber,
      getPercentage,
      getTeamName,
      getTeamLogo,
      getSeasonName,
      isOngoing
    };
  }
};
</script>

<style scoped>
.form-note {
  margin: 12px 16px;
  color: var(--vis-text-secondary, #606266);
  font-size: 12px;
  line-height: 1.6;
}

.upcoming-detail-page {
  min-height: 100vh;
  background: var(--vis-bg-page, #f4f5f8);
  font-family: var(--vis-font-body);
}

.page-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: var(--vis-bg-page, #f4f5f8);
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
}

.team-link:active {
  opacity: 0.75;
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

.match-banner .right-team .team-name {
  color: #ff6a00;
}

.team-logo {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  object-fit: contain;
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
  color: #909399;
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

.tab-content-area {
  display: flex;
  flex-direction: column;
  min-height: 400px;
  background: #fff;
}

.seamless-content {
  padding: 16px 20px 24px;
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

.stats-card-header {
  padding: 10px 4px 2px;
}

.analysis-card-title {
  display: flex;
  align-items: baseline;
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
  align-self: center;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(-8deg);
}

.analysis-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.legend-chip {
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.team1-chip {
  color: #111;
}

.team2-chip {
  color: #ff6a00;
}

.team-radar-wrapper {
  position: relative;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
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

.h2h-list {
  display: flex;
  flex-direction: column;
}

.h2h-match-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 2px;
  border-bottom: 1px solid #f0f2f5;
  cursor: pointer;
}

.h2h-match-row:last-child {
  border-bottom: 0;
}

.h2h-match-row:active {
  opacity: 0.75;
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

/* 选手对位：职责筛选 + 合并雷达 */
.player-radar-block {
  display: flex;
  flex-direction: column;
}

.role-filter {
  padding: 12px 4px 0;
}

.player-selectors {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 4px 4px;
}

.team-selector {
  flex: 1;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px 14px;
  min-width: 0;
}

.t1-selector {
  justify-content: flex-end;
}

.t2-selector {
  justify-content: flex-start;
}

.player-chip {
  color: #606266;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.18);
  text-underline-offset: 3px;
}

.player-chip:active {
  color: #ff6a00;
}

.t1-selector .player-chip.active {
  color: #111;
  font-weight: 900;
}

.t2-selector .player-chip.active {
  color: #ff6a00;
  font-weight: 900;
}

.selector-vs {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex-shrink: 0;
  color: var(--vis-text-disabled);
  font-family: var(--vis-font-numeric);
  font-size: 13px;
  font-style: italic;
  font-weight: 900;
}

.team-extra-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
}

.team-analysis-block {
  margin-top: 14px;
}

.mode-team-group {
  padding: 6px 4px 0;
}

.mode-team-group + .mode-team-group {
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid #f0f2f5;
}

.mode-team-label {
  padding: 2px 2px 6px;
  font-size: 13px;
  font-weight: 900;
}

.team-dark {
  color: #111;
}

.team-accent {
  color: #ff6a00;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 4px;
  border-bottom: 1px solid #f7f8fa;
}

.stat-item:last-child {
  border-bottom: 0;
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
}

.t1-bg { background: #111; }
.t2-bg { background: var(--vis-primary-gradient); }

.player-radar-wrapper {
  position: relative;
  padding: 0 4px 10px;
}

.player-radar-container {
  height: 260px;
  width: 100%;
  position: relative;
  z-index: 1;
}

@media (max-width: 768px) {
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

  .seamless-content {
    padding: 12px;
  }

  .analysis-card-header {
    padding: 12px 12px 0;
  }

  .stats-card-header {
    padding: 8px 2px 2px;
  }

  .analysis-card-title {
    font-size: 14px;
  }

  .team-radar-container {
    height: 270px;
  }

  .team-extra-stats {
    margin-top: 12px;
  }

  .team-analysis-block {
    margin-top: 12px;
  }

  .player-selectors {
    gap: 8px;
  }

  .player-chip {
    font-size: 11px;
  }

  .player-radar-container {
    height: 230px;
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

  .seamless-content {
    padding: 10px;
  }

  .team-radar-container {
    height: 250px;
  }

  .player-radar-container {
    height: 210px;
  }

  .player-chip {
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
    font-size: 13px;
  }
}
</style>
