<template>
  <div class="match-detail-page">
    <div v-if="isLoading" class="page-loading">
      <div class="loading-panel">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    </div>

    <div v-else class="detail-container">
      <header class="detail-header">
        <el-button link @click="goBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="tournament-info">
          <span class="tournament-name" :title="queryParams.tournament || '比赛详情'">{{ formattedTournament }}</span>
        </div>
        <div class="empty-space"></div>
      </header>

      <div class="match-banner vis-arena-banner">
        <div class="team left-team team-link" @click="goToTeamDetail(queryParams.team1Id)">
          <span class="team-name" :class="{ winner: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team1Id) }">
            {{ queryParams.team1 || 'Team 1' }}
          </span>
          <img :src="queryParams.team1Logo" class="team-logo" alt="" />
        </div>

        <div class="match-center">
          <div class="match-meta-time">{{ formatDateTime(queryParams.matchDate) }}</div>
          <div class="match-score">
            <span :class="{ winner: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team1Id) }">
              {{ displayScore(queryParams.team1Score) }}
            </span>
            <span class="score-colon">:</span>
            <span :class="{ winner: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team2Id) }">
              {{ displayScore(queryParams.team2Score) }}
            </span>
          </div>
          <div class="match-status-badge">已完赛</div>
        </div>

        <div class="team right-team team-link" @click="goToTeamDetail(queryParams.team2Id)">
          <img :src="queryParams.team2Logo" class="team-logo" alt="" />
          <span class="team-name" :class="{ winner: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team2Id) }">
            {{ queryParams.team2 || 'Team 2' }}
          </span>
        </div>
      </div>

      <div class="match-summary-strip">
        <div class="summary-pill">
          <span class="summary-label">赛制</span>
          <span class="summary-value">{{ queryParams.boFormat || '--' }}</span>
        </div>
        <div class="summary-pill">
          <span class="summary-label">地图数</span>
          <span class="summary-value">{{ matchDetails.mapGames.length }}</span>
        </div>
        <div class="summary-pill">
          <span class="summary-label">胜者</span>
          <span class="summary-value">{{ winnerName }}</span>
        </div>
      </div>

      <div class="tabs-container">
        <div class="custom-tabs-nav">
          <div class="tab-nav-item" :class="{ active: activeTab === 'overall' }" @click="switchTab('overall')">
            全场总览
          </div>
          <div
            v-for="(mapGame, index) in matchDetails.mapGames"
            :key="mapGame.id"
            class="tab-nav-item"
            :class="{ active: String(activeTab) === String(mapGame.id) }"
            @click="switchTab(String(mapGame.id))"
          >
            {{ getMapTabLabel(mapGame, index) }}
          </div>
        </div>

        <div class="tab-content-area">
          <div v-if="!matchDetails.mapGames.length" class="empty-state">
            暂无比赛详情数据
          </div>

          <template v-else>
            <div v-show="activeTab === 'overall'" class="seamless-content">
              <div class="content-mode-switch">
                <button
                  class="mode-chip"
                  :class="{ active: contentMode === 'analysis' }"
                  @click="switchContentMode('analysis')"
                >
                  比赛分析
                </button>
                <button
                  class="mode-chip"
                  :class="{ active: contentMode === 'data' }"
                  @click="switchContentMode('data')"
                >
                  选手总览
                </button>
              </div>

              <transition name="mode-fade" mode="out-in" @after-enter="handleModePanelAfterEnter">
                <div v-if="contentMode === 'data'" key="overall-data" class="overall-stats-container mode-panel">
                  <div v-for="teamBlock in overallTeamSections" :key="teamBlock.key" class="overall-team-section">
                    <div class="overall-team-header">
                      <img :src="teamBlock.logo" class="overall-team-logo" alt="" />
                      <span>{{ teamBlock.name }}</span>
                    </div>

                    <div v-if="teamBlock.players.length" class="overall-table">
                      <div class="overall-table-header">
                        <div class="col-role"></div>
                        <div class="col-name">选手</div>
                        <div class="col-kda">K / A / D</div>
                        <div class="col-kd">K/D</div>
                        <div class="col-stat">伤害</div>
                        <div class="col-stat">治疗</div>
                        <div class="col-stat">抵挡</div>
                      </div>

                      <div v-for="player in teamBlock.players" :key="player.playerId" class="overall-table-row">
                        <div class="col-role">
                          <img :src="getRoleIconUrl(player.role)" class="role-icon" alt="" />
                        </div>
                        <div class="col-name">{{ player.name }}</div>
                        <div class="col-kda">{{ player.kills }} / {{ player.assists }} / {{ player.deaths }}</div>
                        <div class="col-kd" :class="{ 'match-best': player.kdValue > 0 && player.kdValue === overallStats.maxStats.kd }">
                          {{ player.kd }}
                        </div>
                        <div class="col-stat" :class="{ 'match-best': player.damage > 0 && player.damage === overallStats.maxStats.damage }">
                          {{ formatNumber(player.damage) }}
                        </div>
                        <div class="col-stat" :class="{ 'match-best': player.healing > 0 && player.healing === overallStats.maxStats.healing }">
                          {{ formatNumber(player.healing) }}
                        </div>
                        <div class="col-stat" :class="{ 'match-best': player.mitigation > 0 && player.mitigation === overallStats.maxStats.mitigation }">
                          {{ formatNumber(player.mitigation) }}
                        </div>
                      </div>
                    </div>

                    <div v-else class="empty-inner">暂无该队选手数据</div>
                  </div>
                </div>

                <div v-else-if="teamAnalysis" key="overall-analysis" class="match-analysis-section mode-panel">
                  <div class="analysis-grid">
                    <div v-if="mapFlow.length" class="analysis-card map-flow-card analysis-grid-span-2">
                      <div class="analysis-card-header">
                        <div>
                          <div class="analysis-card-title">地图走势</div>
                        </div>
                      </div>

                      <div class="map-flow-track">
                        <div
                          v-for="mapItem in mapFlow"
                          :key="mapItem.id"
                          class="map-flow-item"
                          :class="mapItem.winnerSideClass"
                          :style="{ backgroundImage: `url(${mapItem.bannerUrl})` }"
                        >
                          <div class="map-flow-backdrop"></div>
                          <div class="map-flow-content">
                            <div class="map-flow-top">
                              <span class="map-flow-index">MAP {{ mapItem.index }}</span>
                            </div>
                            <div class="map-flow-main">
                              <div class="map-flow-left">
                                <span class="map-flow-score">{{ mapItem.scoreText }}</span>
                                <div class="map-flow-name">{{ mapItem.name }}</div>
                              </div>
                              <div class="map-flow-right">
                                <img v-if="mapItem.winnerLogo" :src="mapItem.winnerLogo" class="map-flow-winner-logo" alt="" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="analysis-card radar-analysis-card analysis-grid-span-2">
                      <div class="analysis-card-header">
                        <div>
                          <div class="analysis-card-title">战队雷达</div>
                        </div>
                        <div class="analysis-legend">
                          <span class="legend-chip team1-chip">{{ queryParams.team1 }}</span>
                          <span class="legend-chip team2-chip">{{ queryParams.team2 }}</span>
                        </div>
                      </div>
                      <div ref="teamAnalysisRadarRef" class="team-analysis-radar"></div>
                    </div>
                  </div>

                  <div class="analysis-card role-analysis-card">
                    <div class="analysis-card-header">
                      <div>
                        <div class="analysis-card-title">职责对位</div>
                      </div>
                    </div>

                    <div class="role-analysis-list">
                      <div v-for="row in roleComparisonRows" :key="row.role" class="role-analysis-row">
                        <div class="role-analysis-meta">
                          <div class="role-analysis-name">
                            <img :src="getRoleIconUrl(row.role)" class="role-icon" alt="" />
                            <span>{{ row.label }}</span>
                          </div>
                          <div class="role-analysis-label">{{ row.metricLabel }}</div>
                        </div>

                        <div class="role-analysis-values">
                          <span class="role-team-value team1-text">{{ row.team1Display }}</span>
                          <span class="role-analysis-edge">{{ row.edgeText }}</span>
                          <span class="role-team-value team2-text">{{ row.team2Display }}</span>
                        </div>

                        <div class="role-analysis-bars">
                          <div class="role-bar-track">
                            <div class="role-bar-fill team1-fill" :style="{ width: `${row.team1Percent}%` }"></div>
                          </div>
                          <div class="role-bar-track">
                            <div class="role-bar-fill team2-fill" :style="{ width: `${row.team2Percent}%` }"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
            </div>

            <template v-for="(mapGame, index) in matchDetails.mapGames" :key="`panel-${mapGame.id}`">
            <div v-if="String(activeTab) === String(mapGame.id)" class="seamless-content">
              <div class="map-info-banner" :style="{ backgroundImage: `url(${getMapBannerUrl(mapGame.mapId)})` }">
                <div class="banner-overlay"></div>
                <div class="banner-content">
                  <div class="banner-left">
                    <div class="banner-kicker">MAP {{ index + 1 }}</div>
                    <h3 class="map-name">{{ getMapName(mapGame.mapId) }}</h3>
                    <div class="map-meta">
                      <span class="meta-item">{{ formatDuration(mapGame.duration) }}</span>
                      <span class="meta-item" v-if="mapGame.replayId">{{ mapGame.replayId }}</span>
                    </div>
                  </div>

                  <div class="banner-right">
                    <div class="map-score">
                      <span class="score-team" :class="{ winner: String(mapGame.winnerId) === String(mapGame.team1Id) }">{{ queryParams.team1 }}</span>
                      <span class="score-number">{{ displayScore(mapGame.team1Score) }}</span>
                      <span class="score-divider">:</span>
                      <span class="score-number">{{ displayScore(mapGame.team2Score) }}</span>
                      <span class="score-team" :class="{ winner: String(mapGame.winnerId) === String(mapGame.team2Id) }">{{ queryParams.team2 }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="content-mode-switch">
                <button
                  class="mode-chip"
                  :class="{ active: contentMode === 'analysis' }"
                  @click="switchContentMode('analysis')"
                >
                  地图分析
                </button>
                <button
                  class="mode-chip"
                  :class="{ active: contentMode === 'data' }"
                  @click="switchContentMode('data')"
                >
                  选手数据
                </button>
              </div>

              <transition name="mode-fade" mode="out-in" @after-enter="handleModePanelAfterEnter">
                <div v-if="contentMode === 'analysis' && currentMapOverview" key="map-analysis" class="map-analysis-simple mode-panel">
                  <div class="map-analysis-overview">
                    <div class="map-overview-pill">
                      <img v-if="currentMapOverview.modeIcon" :src="currentMapOverview.modeIcon" class="map-mode-icon" alt="" />
                      <div class="map-overview-meta">
                        <span class="map-overview-label">地图模式</span>
                        <span class="map-overview-value">{{ currentMapOverview.modeLabel }}</span>
                      </div>
                    </div>
                    <div class="map-overview-pill">
                      <div class="map-overview-meta">
                        <span class="map-overview-label">图分</span>
                        <span class="map-overview-value">{{ currentMapOverview.scoreText }}</span>
                      </div>
                    </div>
                    <div class="map-overview-pill">
                      <div class="map-overview-meta">
                        <span class="map-overview-label">时长</span>
                        <span class="map-overview-value">{{ currentMapOverview.duration }}</span>
                      </div>
                    </div>
                    <div class="map-overview-pill">
                      <div class="map-overview-meta">
                        <span class="map-overview-label">胜者</span>
                        <span class="map-overview-value">{{ currentMapOverview.winnerText }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="map-analysis-grid">
                    <div class="map-analysis-card analysis-grid-span-2">
                      <div class="map-analysis-title">职责对位</div>
                      <div class="map-role-list">
                        <div v-for="row in currentMapRoleRows" :key="row.role" class="map-role-row">
                          <div class="map-role-top">
                            <div class="map-role-name">
                              <img :src="getRoleIconUrl(row.role)" class="role-icon" alt="" />
                              <span>{{ row.label }}</span>
                            </div>
                            <div class="map-role-edge">{{ row.edgeText }}</div>
                          </div>
                          <div class="map-role-values">
                            <span class="team1-text">{{ row.team1Display }}</span>
                            <span class="map-role-metric">{{ row.metricLabel }}</span>
                            <span class="team2-text">{{ row.team2Display }}</span>
                          </div>
                          <div class="map-role-bars">
                            <div class="role-bar-track">
                              <div class="role-bar-fill team1-fill" :style="{ width: `${row.team1Percent}%` }"></div>
                            </div>
                            <div class="role-bar-track">
                              <div class="role-bar-fill team2-fill" :style="{ width: `${row.team2Percent}%` }"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      v-for="card in currentMapPlayerRadarCards"
                      :key="card.key"
                      class="map-analysis-card map-player-radar-card"
                    >
                      <div class="map-analysis-card-header">
                        <div>
                          <div class="map-analysis-title">{{ card.label }} 对位</div>
                        </div>
                      </div>

                      <div class="map-player-selectors">
                        <div class="map-player-team map-player-team1">
                          <div
                            v-for="player in card.team1Players"
                            :key="`t1-${card.key}-${player.playerId}`"
                            class="map-player-chip"
                            :class="{ active: isSelectedMapRadarPlayer(card.role, 'team1', player) }"
                            @click="selectMapRadarPlayer(card.role, 'team1', player)"
                          >
                            {{ player.name }}
                          </div>
                        </div>

                        <div class="map-player-vs">VS</div>

                        <div class="map-player-team map-player-team2">
                          <div
                            v-for="player in card.team2Players"
                            :key="`t2-${card.key}-${player.playerId}`"
                            class="map-player-chip"
                            :class="{ active: isSelectedMapRadarPlayer(card.role, 'team2', player) }"
                            @click="selectMapRadarPlayer(card.role, 'team2', player)"
                          >
                            {{ player.name }}
                          </div>
                        </div>
                      </div>

                      <div :ref="(el) => setMapPlayerRadarRef(card.key, el)" class="map-player-radar"></div>
                    </div>
                  </div>
                </div>

                <div v-else-if="currentStatsRows.length" key="map-data" class="stats-grid mode-panel">
                  <div class="team-col-header">{{ queryParams.team1 }}</div>
                  <div class="team-col-header">{{ queryParams.team2 }}</div>

                  <template v-for="(row, rowIndex) in currentStatsRows" :key="rowIndex">
                    <div class="player-card">
                      <template v-if="row.team1">
                        <div class="player-card-header">
                          <div class="player-role-name">
                            <img :src="getRoleIconUrl(row.team1.role)" class="role-icon" alt="" />
                            <span class="player-name">{{ row.team1.name }}</span>
                          </div>
                          <span class="player-kda">{{ row.team1.kills }}/{{ row.team1.assists }}/{{ row.team1.deaths }}</span>
                        </div>

                        <div class="player-stats">
                          <div class="stat-row">
                            <span class="stat-label">伤害</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill damage-color" :style="{ width: `${row.team1.damagePercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team1.damage) }}</span>
                          </div>
                          <div class="stat-row">
                            <span class="stat-label">治疗</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill healing-color" :style="{ width: `${row.team1.healingPercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team1.healing) }}</span>
                          </div>
                          <div class="stat-row">
                            <span class="stat-label">抵挡</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill mitigation-color" :style="{ width: `${row.team1.mitigationPercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team1.mitigation) }}</span>
                          </div>
                        </div>
                      </template>
                      <div v-else class="empty-player">无数据</div>
                    </div>

                    <div class="player-card">
                      <template v-if="row.team2">
                        <div class="player-card-header">
                          <div class="player-role-name">
                            <img :src="getRoleIconUrl(row.team2.role)" class="role-icon" alt="" />
                            <span class="player-name">{{ row.team2.name }}</span>
                          </div>
                          <span class="player-kda">{{ row.team2.kills }}/{{ row.team2.assists }}/{{ row.team2.deaths }}</span>
                        </div>

                        <div class="player-stats">
                          <div class="stat-row">
                            <span class="stat-label">伤害</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill damage-color" :style="{ width: `${row.team2.damagePercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team2.damage) }}</span>
                          </div>
                          <div class="stat-row">
                            <span class="stat-label">治疗</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill healing-color" :style="{ width: `${row.team2.healingPercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team2.healing) }}</span>
                          </div>
                          <div class="stat-row">
                            <span class="stat-label">抵挡</span>
                            <div class="stat-bar-track">
                              <div class="stat-bar-fill mitigation-color" :style="{ width: `${row.team2.mitigationPercent}%` }"></div>
                            </div>
                            <span class="stat-value">{{ formatNumber(row.team2.mitigation) }}</span>
                          </div>
                        </div>
                      </template>
                      <div v-else class="empty-player">无数据</div>
                    </div>
                  </template>
                </div>

                <div v-else key="map-empty" class="empty-state map-empty mode-panel">暂无该地图的分析或选手数据</div>
              </transition>
            </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowLeft } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { getMapImageUrl } from '@/utils/mapImages';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';

const TBD_LOGO_URL = 'https://owmini.xyz/images/tbd.png';

export default {
  name: 'MatchDetail',
  components: { ArrowLeft },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const store = useStore();

    const isLoading = ref(true);
    const activeTab = ref('overall');
    const contentMode = ref('analysis');
    const matchDetails = ref({ mapGames: [], playerStats: [] });
    const teamAnalysisRadarRef = ref(null);
    const mapPlayerRadarRefs = ref({});
    let teamAnalysisRadarInstance = null;
    const mapPlayerRadarInstances = {};
    const queryParams = ref({
      matchId: route.query.matchId || '',
      seasonId: route.query.seasonId || '',
      from: route.query.from || 'visualize',
      team1Id: route.query.team1Id || '',
      team2Id: route.query.team2Id || '',
      team1: route.query.team1 || '',
      team2: route.query.team2 || '',
      team1Logo: route.query.team1Logo || TBD_LOGO_URL,
      team2Logo: route.query.team2Logo || TBD_LOGO_URL,
      tournament: route.query.tournament || '',
      matchDate: '',
      boFormat: '',
      team1Score: null,
      team2Score: null,
      winnerId: ''
    });

    const formattedTournament = computed(() => {
      const raw = queryParams.value.tournament || '比赛详情';
      return raw.split('-')[0].trim() || raw;
    });

    const winnerName = computed(() => {
      if (!queryParams.value.winnerId) return '--';
      if (String(queryParams.value.winnerId) === String(queryParams.value.team1Id)) return queryParams.value.team1 || '--';
      if (String(queryParams.value.winnerId) === String(queryParams.value.team2Id)) return queryParams.value.team2 || '--';
      return '--';
    });

    const comparisonRoles = ['tank', 'damage', 'support'];
    const roleOrder = { tank: 1, damage: 2, support: 3 };
    const selectedMapPlayers = ref({});

    const getTeamName = (teamId) => {
      const team = store.state.teams.find(item => String(item.id) === String(teamId));
      return team?.name || 'Unknown';
    };

    const getTeamLogo = (teamId) => {
      const team = store.state.teams.find(item => String(item.id) === String(teamId));
      const logo = String(team?.logo || '').trim();
      return logo || TBD_LOGO_URL;
    };

    const getMapName = (mapId) => {
      const map = store.state.maps.find(item => String(item.id) === String(mapId));
      return map?.name || '未知地图';
    };

    const getMapModeKey = (mapType) => {
      const type = String(mapType || '').trim();
      if (type === '占领要点') return 'control';
      if (type === '运载目标') return 'escort';
      if (type === '攻击/护送') return 'hybrid';
      if (type === '机动推进') return 'push';
      if (type === '闪点作战') return 'flashpoint';
      return '';
    };

    const getMapModeLabel = (mapType) => {
      return String(mapType || '').trim() || '未知模式';
    };

    const getMapModeIconUrlByType = (mapType) => {
      const key = getMapModeKey(mapType);
      if (!key) return '';
      const baseUrl = import.meta.env.BASE_URL?.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL || '/'}${(import.meta.env.BASE_URL || '/').endsWith('/') ? '' : '/'}`;
      return `${baseUrl}maps/logo/${key}.png`;
    };

    const getMapModeInfo = (mapId) => {
      const map = store.state.maps.find(item => String(item.id) === String(mapId));
      const type = map?.type || '';
      return {
        label: getMapModeLabel(type),
        icon: getMapModeIconUrlByType(type)
      };
    };

    const getMapBannerUrl = (mapId) => {
      const map = store.state.maps.find(item => String(item.id) === String(mapId));
      return getMapImageUrl(map);
    };

    const getRoleIconUrl = (role) => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const normalizedRole = String(role || 'damage').toLowerCase();
      if (normalizedRole === 'tank') return `${baseUrl}icons/role/Tank.png`;
      if (normalizedRole === 'support') return `${baseUrl}icons/role/Support.png`;
      return `${baseUrl}icons/role/DPS.png`;
    };

    const formatNumber = (num) => {
      if (num == null) return '0';
      return Math.round(num).toLocaleString();
    };

    const displayScore = (score) => {
      return score === null || score === undefined ? '-' : score;
    };

    const formatDateTime = (dateStr) => {
      if (!dateStr) return '比赛时间未知';
      const date = new Date(dateStr);
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      const hours = `${date.getHours()}`.padStart(2, '0');
      const minutes = `${date.getMinutes()}`.padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    };

    const formatDuration = (minutesFloat) => {
      if (!minutesFloat) return '00:00';
      const minutes = Math.floor(minutesFloat);
      const seconds = Math.round((minutesFloat - minutes) * 60);
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const normalizeMatchData = (match, options = {}) => {
      if (!match) return;
      const preserveRouteIdentity = options.preserveRouteIdentity !== false;
      const routeMatchId = route.query.matchId ? String(route.query.matchId) : '';
      const routeSeasonId = route.query.seasonId ? String(route.query.seasonId) : '';
      const routeTeam1Id = route.query.team1Id ? String(route.query.team1Id) : '';
      const routeTeam2Id = route.query.team2Id ? String(route.query.team2Id) : '';

      queryParams.value.matchId = preserveRouteIdentity && routeMatchId
        ? routeMatchId
        : (match.id ? String(match.id) : queryParams.value.matchId);
      queryParams.value.seasonId = preserveRouteIdentity && routeSeasonId
        ? routeSeasonId
        : (match.seasonId ? String(match.seasonId) : queryParams.value.seasonId);
      queryParams.value.team1Id = preserveRouteIdentity && routeTeam1Id
        ? routeTeam1Id
        : (match.team1Id ? String(match.team1Id) : queryParams.value.team1Id);
      queryParams.value.team2Id = preserveRouteIdentity && routeTeam2Id
        ? routeTeam2Id
        : (match.team2Id ? String(match.team2Id) : queryParams.value.team2Id);

      queryParams.value.team1 = route.query.team1
        ? String(route.query.team1)
        : (match.team1?.name || getTeamName(queryParams.value.team1Id));
      queryParams.value.team2 = route.query.team2
        ? String(route.query.team2)
        : (match.team2?.name || getTeamName(queryParams.value.team2Id));
      queryParams.value.team1Logo = match.team1?.logo || getTeamLogo(queryParams.value.team1Id);
      queryParams.value.team2Logo = match.team2?.logo || getTeamLogo(queryParams.value.team2Id);
      queryParams.value.tournament = route.query.tournament
        ? String(route.query.tournament)
        : (match.tournamentName || queryParams.value.tournament || '');
      queryParams.value.matchDate = match.matchDate || queryParams.value.matchDate;
      queryParams.value.boFormat = match.boFormat || queryParams.value.boFormat;
      queryParams.value.team1Score = match.team1Score ?? queryParams.value.team1Score;
      queryParams.value.team2Score = match.team2Score ?? queryParams.value.team2Score;
      queryParams.value.winnerId = match.winnerId ? String(match.winnerId) : queryParams.value.winnerId;
    };

    const normalizePlayer = (stat) => ({
      playerId: stat.playerId,
      teamId: stat.teamId,
      name: stat.player?.name || stat.playerName || 'Unknown',
      role: stat.player?.role || stat.role || 'damage',
      kills: Number(stat.kills || 0),
      deaths: Number(stat.deaths || 0),
      assists: Number(stat.assists || 0),
      damage: Number(stat.damage || 0),
      healing: Number(stat.healing || 0),
      mitigation: Number(stat.mitigation || 0)
    });

    const overallStats = computed(() => {
      const playerMap = new Map();

      matchDetails.value.playerStats.forEach(rawStat => {
        const stat = normalizePlayer(rawStat);
        if (!playerMap.has(stat.playerId)) {
          playerMap.set(stat.playerId, { ...stat });
          return;
        }

        const player = playerMap.get(stat.playerId);
        player.kills += stat.kills;
        player.deaths += stat.deaths;
        player.assists += stat.assists;
        player.damage += stat.damage;
        player.healing += stat.healing;
        player.mitigation += stat.mitigation;
      });

      const allPlayers = Array.from(playerMap.values()).map(player => {
        const kdValue = player.deaths > 0 ? player.kills / player.deaths : player.kills;
        return {
          ...player,
          kdValue,
          kd: kdValue.toFixed(2)
        };
      });

      const maxStats = {
        kd: Math.max(...allPlayers.map(player => player.kdValue), 0),
        damage: Math.max(...allPlayers.map(player => player.damage), 0),
        healing: Math.max(...allPlayers.map(player => player.healing), 0),
        mitigation: Math.max(...allPlayers.map(player => player.mitigation), 0)
      };

      const team1 = allPlayers
        .filter(player => String(player.teamId) === String(queryParams.value.team1Id))
        .sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
      const team2 = allPlayers
        .filter(player => String(player.teamId) === String(queryParams.value.team2Id))
        .sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));

      return { team1, team2, maxStats };
    });

    const overallTeamSections = computed(() => [
      {
        key: 'team1',
        name: queryParams.value.team1,
        logo: queryParams.value.team1Logo,
        players: overallStats.value.team1
      },
      {
        key: 'team2',
        name: queryParams.value.team2,
        logo: queryParams.value.team2Logo,
        players: overallStats.value.team2
      }
    ]);

    const totalMatchDuration = computed(() => {
      return matchDetails.value.mapGames.reduce((sum, mapGame) => sum + Number(mapGame.duration || 0), 0);
    });

    const aggregateTeamForMatch = (players, duration) => {
      const totals = players.reduce((acc, player) => {
        acc.kills += Number(player.kills || 0);
        acc.deaths += Number(player.deaths || 0);
        acc.assists += Number(player.assists || 0);
        acc.damage += Number(player.damage || 0);
        acc.healing += Number(player.healing || 0);
        acc.mitigation += Number(player.mitigation || 0);
        return acc;
      }, {
        kills: 0,
        deaths: 0,
        assists: 0,
        damage: 0,
        healing: 0,
        mitigation: 0
      });

      const safeDuration = duration > 0 ? duration : 1;
      const kdValue = totals.deaths > 0 ? totals.kills / totals.deaths : totals.kills;

      return {
        ...totals,
        kdValue,
        kd: kdValue.toFixed(2),
        damagePer10: (totals.damage / safeDuration) * 10,
        healingPer10: (totals.healing / safeDuration) * 10,
        mitigationPer10: (totals.mitigation / safeDuration) * 10,
        killsPer10: (totals.kills / safeDuration) * 10
      };
    };

    const teamAnalysis = computed(() => {
      if (!overallStats.value.team1.length && !overallStats.value.team2.length) return null;

      const duration = totalMatchDuration.value;
      const team1 = aggregateTeamForMatch(overallStats.value.team1, duration);
      const team2 = aggregateTeamForMatch(overallStats.value.team2, duration);

      team1.mapWins = matchDetails.value.mapGames.filter(mapGame => String(mapGame.winnerId) === String(queryParams.value.team1Id)).length;
      team2.mapWins = matchDetails.value.mapGames.filter(mapGame => String(mapGame.winnerId) === String(queryParams.value.team2Id)).length;

      return {
        duration,
        team1,
        team2
      };
    });

    const teamRadarStats = computed(() => {
      if (!teamAnalysis.value) return { team1: null, team2: null };

      const toRadarStats = (team) => ({
        kd: Number(team.kd || 0),
        damage: Number(team.damage || 0),
        healing: Number(team.healing || 0),
        mitigation: Number(team.mitigation || 0),
        kills: Number(team.kills || 0)
      });

      return {
        team1: toRadarStats(teamAnalysis.value.team1),
        team2: toRadarStats(teamAnalysis.value.team2)
      };
    });

    const roleComparisonRows = computed(() => {
      const configs = [
        { role: 'tank', label: 'TANK', metric: 'mitigation', metricLabel: '抵挡', formatter: formatNumber },
        { role: 'damage', label: 'DAMAGE', metric: 'damage', metricLabel: '伤害', formatter: formatNumber },
        { role: 'support', label: 'SUPPORT', metric: 'healing', metricLabel: '治疗', formatter: formatNumber }
      ];

      return configs.map(config => {
        const team1Value = overallStats.value.team1
          .filter(player => player.role === config.role)
          .reduce((sum, player) => sum + Number(player[config.metric] || 0), 0);
        const team2Value = overallStats.value.team2
          .filter(player => player.role === config.role)
          .reduce((sum, player) => sum + Number(player[config.metric] || 0), 0);
        const maxValue = Math.max(team1Value, team2Value, 1);
        const leadName = team1Value === team2Value
          ? '均势'
          : `${team1Value > team2Value ? queryParams.value.team1 : queryParams.value.team2} 占优`;

        return {
          ...config,
          team1Value,
          team2Value,
          team1Display: config.formatter(team1Value),
          team2Display: config.formatter(team2Value),
          team1Percent: (team1Value / maxValue) * 100,
          team2Percent: (team2Value / maxValue) * 100,
          edgeText: leadName
        };
      });
    });

    const mapFlow = computed(() => {
      return matchDetails.value.mapGames.map((mapGame, index) => {
        let winnerSideClass = 'is-neutral';
        let winnerLogo = '';
        if (String(mapGame.winnerId) === String(queryParams.value.team1Id)) {
          winnerSideClass = 'is-team1';
          winnerLogo = queryParams.value.team1Logo || '';
        } else if (String(mapGame.winnerId) === String(queryParams.value.team2Id)) {
          winnerSideClass = 'is-team2';
          winnerLogo = queryParams.value.team2Logo || '';
        }

        return {
          id: mapGame.id,
          index: index + 1,
          name: getMapName(mapGame.mapId),
          bannerUrl: getMapBannerUrl(mapGame.mapId),
          winnerLogo,
          winnerSideClass,
          scoreText: `${displayScore(mapGame.team1Score)}:${displayScore(mapGame.team2Score)}`
        };
      });
    });

    const currentMapGame = computed(() => {
      return matchDetails.value.mapGames.find(mapGame => String(mapGame.id) === String(activeTab.value)) || null;
    });

    const currentMapPlayers = computed(() => {
      if (!currentMapGame.value) return [];

      const filteredStats = matchDetails.value.playerStats.filter(
        stat => String(stat.mapGameId) === String(currentMapGame.value.id)
      );
      const playerMap = new Map();

      filteredStats.forEach(rawStat => {
        const stat = normalizePlayer(rawStat);
        if (!playerMap.has(stat.playerId)) {
          playerMap.set(stat.playerId, { ...stat });
          return;
        }

        const player = playerMap.get(stat.playerId);
        player.kills += stat.kills;
        player.deaths += stat.deaths;
        player.assists += stat.assists;
        player.damage += stat.damage;
        player.healing += stat.healing;
        player.mitigation += stat.mitigation;
      });

      const allPlayers = Array.from(playerMap.values());
      const maxDamage = Math.max(...allPlayers.map(player => player.damage), 0);
      const maxHealing = Math.max(...allPlayers.map(player => player.healing), 0);
      const maxMitigation = Math.max(...allPlayers.map(player => player.mitigation), 0);

      const withPercents = allPlayers.map(player => ({
        ...player,
        damagePercent: maxDamage > 0 ? (player.damage / maxDamage) * 100 : 0,
        healingPercent: maxHealing > 0 ? (player.healing / maxHealing) * 100 : 0,
        mitigationPercent: maxMitigation > 0 ? (player.mitigation / maxMitigation) * 100 : 0
      }));

      return withPercents;
    });

    const currentStatsRows = computed(() => {
      const withPercents = currentMapPlayers.value;

      const team1 = withPercents
        .filter(player => String(player.teamId) === String(queryParams.value.team1Id))
        .sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
      const team2 = withPercents
        .filter(player => String(player.teamId) === String(queryParams.value.team2Id))
        .sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));

      const maxLength = Math.max(team1.length, team2.length);
      return Array.from({ length: maxLength }, (_, index) => ({
        team1: team1[index] || null,
        team2: team2[index] || null
      }));
    });

    const currentMapOverview = computed(() => {
      if (!currentMapGame.value) return null;
      const modeInfo = getMapModeInfo(currentMapGame.value.mapId);
      let winnerText = '未决出';
      if (String(currentMapGame.value.winnerId) === String(queryParams.value.team1Id)) {
        winnerText = queryParams.value.team1;
      } else if (String(currentMapGame.value.winnerId) === String(queryParams.value.team2Id)) {
        winnerText = queryParams.value.team2;
      }

      return {
        modeLabel: modeInfo.label,
        modeIcon: modeInfo.icon,
        duration: formatDuration(currentMapGame.value.duration),
        scoreText: `${displayScore(currentMapGame.value.team1Score)}:${displayScore(currentMapGame.value.team2Score)}`,
        winnerText
      };
    });

    const currentMapRoleRows = computed(() => {
      const configs = [
        { role: 'tank', label: 'TANK', metric: 'mitigation', metricLabel: '抵挡', formatter: formatNumber },
        { role: 'damage', label: 'DAMAGE', metric: 'damage', metricLabel: '伤害', formatter: formatNumber },
        { role: 'support', label: 'SUPPORT', metric: 'healing', metricLabel: '治疗', formatter: formatNumber }
      ];

      return configs.map(config => {
        const team1Value = currentStatsRows.value.reduce((sum, row) => {
          const player = row.team1;
          return player && player.role === config.role ? sum + Number(player[config.metric] || 0) : sum;
        }, 0);
        const team2Value = currentStatsRows.value.reduce((sum, row) => {
          const player = row.team2;
          return player && player.role === config.role ? sum + Number(player[config.metric] || 0) : sum;
        }, 0);
        const maxValue = Math.max(team1Value, team2Value, 1);

        return {
          ...config,
          team1Display: config.formatter(team1Value),
          team2Display: config.formatter(team2Value),
          team1Percent: (team1Value / maxValue) * 100,
          team2Percent: (team2Value / maxValue) * 100,
          edgeText: team1Value === team2Value
            ? '基本持平'
            : `${team1Value > team2Value ? queryParams.value.team1 : queryParams.value.team2} 占优`
        };
      });
    });

    const getPlayerImpactScore = (player) => {
      if (!player) return -Infinity;
      return (
        Number(player.kills || 0) * 3 +
        Number(player.assists || 0) * 1.2 +
        Number(player.damage || 0) / 1000 +
        Number(player.healing || 0) / 1200 +
        Number(player.mitigation || 0) / 1500 -
        Number(player.deaths || 0) * 2
      );
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
      if (!player || !definition) return 0;
      if (definition.type === 'survival') {
        const deathValue = Number(player?.[definition.deathKey]) || 0;
        return Math.max(0, definition.max - deathValue);
      }
      return Number(player?.[definition.key]) || 0;
    };

    const normalizePlayerRadarMetrics = (player) => {
      const kills = Number(player?.kills || 0);
      const assists = Number(player?.assists || 0);
      const deaths = Number(player?.deaths || 0);
      return {
        name: player?.name || '未知选手',
        kd: Number((deaths > 0 ? kills / deaths : kills).toFixed(2)),
        kad: Number((deaths > 0 ? (kills + assists) / deaths : kills + assists).toFixed(2)),
        damage: Number(player?.damage || 0),
        healing: Number(player?.healing || 0),
        mitigation: Number(player?.mitigation || 0),
        kills,
        assists,
        deaths
      };
    };

    const ensureCurrentMapSelections = () => {
      if (!currentMapGame.value) return;

      const mapId = String(currentMapGame.value.id);
      if (!selectedMapPlayers.value[mapId]) {
        selectedMapPlayers.value[mapId] = {};
      }

      comparisonRoles.forEach(role => {
        const team1Players = currentMapPlayers.value
          .filter(player => String(player.teamId) === String(queryParams.value.team1Id) && player.role === role)
          .sort((a, b) => getPlayerImpactScore(b) - getPlayerImpactScore(a));
        const team2Players = currentMapPlayers.value
          .filter(player => String(player.teamId) === String(queryParams.value.team2Id) && player.role === role)
          .sort((a, b) => getPlayerImpactScore(b) - getPlayerImpactScore(a));

        if (!selectedMapPlayers.value[mapId][role]) {
          selectedMapPlayers.value[mapId][role] = {
            team1: team1Players[0] || null,
            team2: team2Players[0] || null
          };
          return;
        }

        const currentSelection = selectedMapPlayers.value[mapId][role];
        const hasTeam1Selection = team1Players.some(player => String(player.playerId) === String(currentSelection.team1?.playerId));
        const hasTeam2Selection = team2Players.some(player => String(player.playerId) === String(currentSelection.team2?.playerId));

        if (!hasTeam1Selection) {
          currentSelection.team1 = team1Players[0] || null;
        }
        if (!hasTeam2Selection) {
          currentSelection.team2 = team2Players[0] || null;
        }
      });
    };

    const currentMapPlayerRadarCards = computed(() => {
      const configs = [
        { role: 'tank', label: 'TANK' },
        { role: 'damage', label: 'DAMAGE' },
        { role: 'support', label: 'SUPPORT' }
      ];

      const mapId = currentMapGame.value ? String(currentMapGame.value.id) : '';
      const currentSelections = mapId ? selectedMapPlayers.value[mapId] || {} : {};

      return configs.map(config => {
        const team1Players = currentMapPlayers.value
          .filter(player => String(player.teamId) === String(queryParams.value.team1Id) && player.role === config.role)
          .sort((a, b) => getPlayerImpactScore(b) - getPlayerImpactScore(a));
        const team2Players = currentMapPlayers.value
          .filter(player => String(player.teamId) === String(queryParams.value.team2Id) && player.role === config.role)
          .sort((a, b) => getPlayerImpactScore(b) - getPlayerImpactScore(a));

        const team1Player = currentSelections[config.role]?.team1 || team1Players[0] || null;
        const team2Player = currentSelections[config.role]?.team2 || team2Players[0] || null;

        return {
          ...config,
          key: `${mapId}-${config.role}`,
          team1Players,
          team2Players,
          team1Player,
          team2Player,
          team1Label: team1Player?.name || '无数据',
          team2Label: team2Player?.name || '无数据',
          team1Metrics: team1Player ? normalizePlayerRadarMetrics(team1Player) : null,
          team2Metrics: team2Player ? normalizePlayerRadarMetrics(team2Player) : null
        };
      }).filter(card => card.team1Player || card.team2Player);
    });

    const selectMapRadarPlayer = (role, teamKey, player) => {
      if (!currentMapGame.value) return;
      const mapId = String(currentMapGame.value.id);
      if (!selectedMapPlayers.value[mapId]) {
        selectedMapPlayers.value[mapId] = {};
      }
      if (!selectedMapPlayers.value[mapId][role]) {
        selectedMapPlayers.value[mapId][role] = { team1: null, team2: null };
      }
      selectedMapPlayers.value[mapId][role][teamKey] = player;

      nextTick(() => {
        const targetCard = currentMapPlayerRadarCards.value.find(card => card.role === role);
        if (targetCard) {
          renderMapPlayerRadar(targetCard);
        }
      });
    };

    const isSelectedMapRadarPlayer = (role, teamKey, player) => {
      if (!currentMapGame.value) return false;
      const mapId = String(currentMapGame.value.id);
      const selectedPlayer = selectedMapPlayers.value[mapId]?.[role]?.[teamKey] || null;
      return String(selectedPlayer?.playerId || '') === String(player?.playerId || '');
    };

    const getMapTabLabel = (mapGame, index) => {
      return getMapName(mapGame.mapId) || `MAP ${index + 1}`;
    };

    const switchTab = (tab) => {
      if (activeTab.value !== tab) {
        trackPublicEvent('比赛详情-切换标签', {
          seasonId: queryParams.value.seasonId,
          matchId: queryParams.value.matchId,
          team1Id: queryParams.value.team1Id,
          team2Id: queryParams.value.team2Id,
          tab: String(tab)
        }, route);
      }
      activeTab.value = tab;
      contentMode.value = 'analysis';
      nextTick(() => {
        if (tab === 'overall') {
          renderTeamAnalysisRadar();
        }
      });
    };

    const switchContentMode = (mode) => {
      if (contentMode.value !== mode) {
        trackPublicEvent('比赛详情-切换模式', {
          seasonId: queryParams.value.seasonId,
          matchId: queryParams.value.matchId,
          team1Id: queryParams.value.team1Id,
          team2Id: queryParams.value.team2Id,
          tab: String(activeTab.value),
          mode
        }, route);
      }
      contentMode.value = mode;
    };

    const handleModePanelAfterEnter = () => {
      renderVisibleCharts();
    };

    const goToTeamDetail = (teamId) => {
      if (!teamId) return;
      trackPublicEvent('比赛详情-打开战队', {
        seasonId: queryParams.value.seasonId,
        matchId: queryParams.value.matchId,
        teamId: String(teamId),
        source: String(activeTab.value)
      }, route);

      router.push({
        path: '/visualize/team-detail',
        query: {
          seasonId: queryParams.value.seasonId,
          teamId: String(teamId),
          from: 'match-detail'
        }
      });
    };

    const goBack = () => {
      trackPublicEvent('比赛详情-返回上一页', {
        seasonId: queryParams.value.seasonId,
        matchId: queryParams.value.matchId,
        source: queryParams.value.from || 'visualize'
      }, route);

      if (queryParams.value.from === 'visualize') {
        router.push({
          path: '/visualize',
          query: {
            seasonId: queryParams.value.seasonId,
            tab: route.query.tab || 'recent'
          }
        });
        return;
      }

      router.back();
    };

    const renderTeamAnalysisRadar = () => {
      if (!teamAnalysisRadarRef.value || !teamRadarStats.value.team1 || !teamRadarStats.value.team2) return;

      if (teamAnalysisRadarInstance && teamAnalysisRadarInstance.getDom() !== teamAnalysisRadarRef.value) {
        teamAnalysisRadarInstance.dispose();
        teamAnalysisRadarInstance = null;
      }

      if (!teamAnalysisRadarInstance) {
        teamAnalysisRadarInstance = echarts.init(teamAnalysisRadarRef.value);
      }

      const t1 = teamRadarStats.value.team1;
      const t2 = teamRadarStats.value.team2;
      const radarLayout = getRadarLayout(teamAnalysisRadarRef.value);

      const getMax = (key) => {
        const t1Val = t1 ? Number(t1[key]) || 0 : 0;
        const t2Val = t2 ? Number(t2[key]) || 0 : 0;
        const max = Math.max(t1Val, t2Val);
        if (key === 'kd' || key === 'kills') {
          return max === 0 ? 5 : max * 1.2;
        }
        return max === 0 ? 10 : Math.ceil(max * 1.2);
      };

      const dataKeys = ['kd', 'damage', 'healing', 'mitigation', 'kills'];
      const indicators = [
        { name: 'K/D', max: getMax('kd') },
        { name: '伤害', max: getMax('damage') },
        { name: '治疗', max: getMax('healing') },
        { name: '抵挡', max: getMax('mitigation') },
        { name: '击杀', max: getMax('kills') }
      ];

      teamAnalysisRadarInstance.setOption({
        animationDuration: 300,
        tooltip: { show: false },
        legend: {
          show: false,
          bottom: 0,
          data: [queryParams.value.team1, queryParams.value.team2],
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
            fontSize: 12,
            fontWeight: 'bold',
            formatter: function (value) {
              const index = indicators.findIndex(item => item.name === value);
              const key = dataKeys[index];
              let t1v = t1 ? t1[key] || 0 : 0;
              let t2v = t2 ? t2[key] || 0 : 0;
              if (t1v > 100) t1v = Math.round(t1v);
              if (t2v > 100) t2v = Math.round(t2v);
              if (value === 'K/D') return `{name|${value}}\n{t1|${t1v}} : {t2|${t2v}}`;
              return `{name|${value}}\n{t1|${t1v}}\n{t2|${t2v}}`;
            },
            rich: {
              name: { color: '#909399', fontSize: 10, align: 'center', padding: [0, 0, 4, 0] },
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
          data: [
            {
              value: [t1.kd, t1.damage, t1.healing, t1.mitigation, t1.kills],
              name: queryParams.value.team1,
              itemStyle: { color: '#111' },
              areaStyle: { color: 'rgba(17, 17, 17, 0.16)' }
            },
            {
              value: [t2.kd, t2.damage, t2.healing, t2.mitigation, t2.kills],
              name: queryParams.value.team2,
              itemStyle: { color: '#ff6a00' },
              areaStyle: { color: 'rgba(255, 106, 0, 0.18)' }
            }
          ],
          symbol: 'circle',
          symbolSize: 4
        }]
      }, true);
      teamAnalysisRadarInstance.resize();
    };

    const setMapPlayerRadarRef = (key, el) => {
      if (el) {
        mapPlayerRadarRefs.value[key] = el;
        return;
      }
      delete mapPlayerRadarRefs.value[key];
    };

    const renderMapPlayerRadar = (card) => {
      const container = mapPlayerRadarRefs.value[card.key];
      if (!container) return;

      if (mapPlayerRadarInstances[card.key] && mapPlayerRadarInstances[card.key].getDom() !== container) {
        mapPlayerRadarInstances[card.key].dispose();
        delete mapPlayerRadarInstances[card.key];
      }

      if (!mapPlayerRadarInstances[card.key]) {
        mapPlayerRadarInstances[card.key] = echarts.init(container);
      }

      const chart = mapPlayerRadarInstances[card.key];
      const p1 = card.team1Metrics;
      const p2 = card.team2Metrics;
      const radarLayout = getRadarLayout(container);

      if (!p1 && !p2) {
        chart.clear();
        return;
      }

      const rolePool = [...card.team1Players, ...card.team2Players].map(normalizePlayerRadarMetrics);
      const radarDefinitions = buildRoleRadarDefinitions(card.role, rolePool, { usePer10: false });
      const indicators = radarDefinitions.map(definition => ({
        name: definition.name,
        max: definition.max
      }));

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

      chart.setOption({
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
              const v1 = formatRadarAxisValue(getRadarMetricValue(p1, definition));
              const v2 = formatRadarAxisValue(getRadarMetricValue(p2, definition));
              if (value === 'K/D' || value === 'KA/D') return `{name|${value}}\n{t1|${v1}} : {t2|${v2}}`;
              return `{name|${value}}\n{t1|${v1}}\n{t2|${v2}}`;
            },
            rich: {
              name: { color: '#909399', fontSize: 10, align: 'center', padding: [0, 0, 4, 0] },
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
      }, true);
      chart.resize();
    };

    const renderVisibleCharts = () => {
      nextTick(() => {
        requestAnimationFrame(() => {
          if (activeTab.value === 'overall' && contentMode.value === 'analysis') {
            renderTeamAnalysisRadar();
          }
          if (activeTab.value !== 'overall' && contentMode.value === 'analysis') {
            currentMapPlayerRadarCards.value.forEach(renderMapPlayerRadar);
          }
        });
      });
    };

    const handleResize = () => {
      if (teamAnalysisRadarInstance) {
        teamAnalysisRadarInstance.resize();
      }
      Object.values(mapPlayerRadarInstances).forEach(instance => {
        instance?.resize();
      });
    };

    const loadData = async () => {
      const startTime = performance.now();
      isLoading.value = true;
      try {
        if (!store.state.teams.length || !store.state.maps.length || !store.state.seasons.length) {
          await store.dispatch('loadBaseData');
        }

        const cachedMatch = sessionStorage.getItem('current_match_detail');
        if (cachedMatch) {
          try {
            normalizeMatchData(JSON.parse(cachedMatch), { preserveRouteIdentity: true });
          } catch (error) {
            console.error('Failed to parse cached match detail', error);
          }
        }

        if (queryParams.value.matchId) {
          const matchRes = await apiService.getMatchById(queryParams.value.matchId);
          const match = Array.isArray(matchRes) ? matchRes[0] : matchRes?.data || matchRes;
          normalizeMatchData(match, { preserveRouteIdentity: true });
        }

        if (!queryParams.value.team1) queryParams.value.team1 = getTeamName(queryParams.value.team1Id);
        if (!queryParams.value.team2) queryParams.value.team2 = getTeamName(queryParams.value.team2Id);
        queryParams.value.team1Logo = getTeamLogo(queryParams.value.team1Id);
        queryParams.value.team2Logo = getTeamLogo(queryParams.value.team2Id);

        if (queryParams.value.matchId) {
          const mapGamesRes = await apiService.getMatchMapGames(queryParams.value.matchId);
          const mapGames = Array.isArray(mapGamesRes) ? mapGamesRes : mapGamesRes?.data || [];
          matchDetails.value.mapGames = mapGames;

          const statsResults = await Promise.all(
            mapGames.map(mapGame => apiService.getMapGamePlayerStats(mapGame.id))
          );

          const allPlayerStats = [];
          statsResults.forEach(result => {
            const stats = Array.isArray(result) ? result : result?.data || [];
            allPlayerStats.push(...stats);
          });
          matchDetails.value.playerStats = allPlayerStats;
        }

        activeTab.value = 'overall';
        contentMode.value = 'analysis';
      } catch (error) {
        console.error('Failed to load match detail data:', error);
      } finally {
        isLoading.value = false;
        trackPerformance('比赛详情加载', performance.now() - startTime, {
          seasonId: queryParams.value.seasonId,
          matchId: queryParams.value.matchId,
          team1Id: queryParams.value.team1Id,
          team2Id: queryParams.value.team2Id,
          tab: String(activeTab.value),
          mode: contentMode.value
        }, route);
        ensureCurrentMapSelections();
        renderVisibleCharts();
      }
    };

    watch([activeTab, contentMode], () => {
      ensureCurrentMapSelections();
      renderVisibleCharts();
    });

    watch(teamAnalysis, () => {
      renderVisibleCharts();
    });

    watch(teamAnalysisRadarRef, (value) => {
      if (value && activeTab.value === 'overall' && contentMode.value === 'analysis') {
        renderVisibleCharts();
      }
    });

    watch([currentMapGame, currentMapPlayers], () => {
      ensureCurrentMapSelections();
      renderVisibleCharts();
    }, { deep: true });

    watch(currentMapPlayerRadarCards, () => {
      renderVisibleCharts();
    }, { deep: true });

    onMounted(() => {
      loadData();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      if (teamAnalysisRadarInstance) {
        teamAnalysisRadarInstance.dispose();
        teamAnalysisRadarInstance = null;
      }
      Object.values(mapPlayerRadarInstances).forEach(instance => {
        instance?.dispose();
      });
    });

    return {
      isLoading,
      queryParams,
      formattedTournament,
      matchDetails,
      activeTab,
      contentMode,
      winnerName,
      overallStats,
      overallTeamSections,
      teamAnalysis,
      teamAnalysisRadarRef,
      roleComparisonRows,
      mapFlow,
      currentMapOverview,
      currentMapRoleRows,
      currentMapPlayerRadarCards,
      isSelectedMapRadarPlayer,
      selectMapRadarPlayer,
      currentStatsRows,
      switchTab,
      switchContentMode,
      handleModePanelAfterEnter,
      setMapPlayerRadarRef,
      goToTeamDetail,
      goBack,
      getMapName,
      getMapTabLabel,
      getMapBannerUrl,
      getRoleIconUrl,
      formatNumber,
      formatDateTime,
      formatDuration,
      displayScore
    };
  }
};
</script>

<style scoped>
.match-detail-page {
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
  padding: 26px 40px 22px;
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

.team-name {
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

.right-team .team-name {
  color: #ff6a00;
}

.team-name.winner {
  background: var(--vis-primary-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.team-logo {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgba(17, 17, 17, 0.16));
}

.match-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  padding: 0 32px;
  gap: 6px;
}

.match-meta-time {
  color: #909399;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.match-score {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #909399;
  font-family: var(--vis-font-numeric);
  font-style: italic;
  font-size: 42px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.match-score > span:not(.score-colon) {
  min-width: 1.1em;
  text-align: center;
}

.match-score .winner {
  background: var(--vis-primary-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.score-colon {
  color: #c0c4cc;
}

.match-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  padding: 3px 12px;
  background: #f4f4f5;
  border: 1px solid var(--vis-border);
  border-radius: 999px;
  color: #606266;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.match-status-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #909399;
}

.match-summary-strip {
  position: relative;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 40px 14px;
  background: #fafafa;
  border-bottom: 1px solid var(--vis-border);
}

.summary-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 4px 14px;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 999px;
}

.summary-label {
  color: #909399;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.summary-value {
  color: #111;
  font-family: var(--vis-font-numeric);
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.summary-pill:last-child .summary-value {
  background: var(--vis-primary-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
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
  min-height: 420px;
  background: #fff;
}

.seamless-content {
  padding: 20px;
  animation: tab-fade-in 0.3s ease-out forwards;
}

@keyframes tab-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-state {
  padding: 40px 0;
  color: #909399;
  text-align: center;
  font-size: 14px;
}

.mode-panel {
  will-change: opacity, transform;
}

.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.content-mode-switch {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 0;
  padding: 4px;
  background: var(--vis-bg-muted);
  border: 1px solid var(--vis-border);
  border-radius: 999px;
}

.mode-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--vis-text-tertiary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.2s var(--vis-ease), background-color 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

.mode-chip:hover:not(.active) {
  color: #111;
}

.mode-chip.active {
  background: #111;
  color: #fff;
  box-shadow: 0 4px 10px rgba(17, 17, 17, 0.18);
}

.overall-stats-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overall-team-section {
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.overall-team-section:first-child {
  border-left: 3px solid var(--vis-team-left);
}

.overall-team-section:nth-child(2) {
  border-left: 3px solid var(--vis-team-right);
}

.overall-team-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: var(--vis-bg-subtle);
  border-bottom: 1px solid var(--vis-border);
  color: #111;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.overall-team-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08));
}

.overall-table {
  display: flex;
  flex-direction: column;
}

.overall-table-header,
.overall-table-row {
  display: flex;
  align-items: center;
}

.overall-table-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--vis-border);
  color: #909399;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.overall-table-row {
  padding: 10px 16px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 13px;
  transition: background-color 0.2s var(--vis-ease);
}

.overall-table-row:last-child {
  border-bottom: none;
}

.overall-table-row:hover {
  background: var(--vis-bg-subtle);
}

.col-role {
  width: 40px;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.col-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #111;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 800;
  letter-spacing: -0.2px;
}

.col-kda {
  width: 102px;
  flex-shrink: 0;
  text-align: center;
  color: #606266;
  white-space: nowrap;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.col-kd {
  width: 46px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.col-stat {
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.role-icon {
  width: 14px;
  height: 14px;
  filter: brightness(0);
}

.match-best {
  color: #ff6a00;
  font-weight: 800;
}

.empty-inner {
  padding: 20px;
  color: #909399;
  text-align: center;
  font-size: 13px;
}

.match-analysis-section {
  margin-top: 2px;
}

.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 16px;
  margin-bottom: 16px;
}

.analysis-grid-span-2 {
  grid-column: 1 / -1;
}

.analysis-card {
  position: relative;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s var(--vis-ease), box-shadow 0.25s var(--vis-ease);
}

.analysis-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.25s var(--vis-ease);
  pointer-events: none;
}

@media (hover: hover) and (pointer: fine) {
  .analysis-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }

  .analysis-card:hover::before {
    opacity: 1;
  }
}

.analysis-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 0;
}

.analysis-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #111;
  font-family: var(--vis-font-display);
  font-size: 16px;
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

.analysis-card-subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.analysis-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
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

.team-analysis-radar {
  height: 320px;
  padding: 4px 0 6px;
}

.role-analysis-card,
.map-flow-card {
  margin-top: 16px;
}

.map-flow-card {
  overflow: hidden;
  touch-action: pan-x;
}

.role-analysis-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px 18px;
}

.role-analysis-row {
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f2f5;
  border-radius: 12px;
  transition: border-color 0.2s var(--vis-ease);
}

.role-analysis-row:hover {
  border-color: var(--vis-border-strong);
}

.role-analysis-meta,
.role-analysis-values {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-analysis-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #111;
  font-size: 13px;
  font-weight: 900;
}

.role-analysis-label {
  color: #909399;
  font-size: 12px;
  font-weight: 700;
}

.role-analysis-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  margin-top: 10px;
  font-family: var(--vis-font-numeric);
}

.role-team-value {
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.team1-text {
  color: #111;
  text-align: right;
}

.team2-text {
  color: #ff6a00;
  text-align: left;
}

.role-analysis-edge {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--vis-bg-muted);
  color: #606266;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  text-align: center;
}

.role-analysis-bars {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.role-bar-track {
  height: 6px;
  overflow: hidden;
  background: #f0f2f5;
  border-radius: 999px;
}

.role-analysis-bars .role-bar-track:first-child,
.map-role-bars .role-bar-track:first-child {
  direction: rtl;
}

.role-bar-fill {
  height: 100%;
  border-radius: 999px;
}

.team1-fill {
  background: #111;
}

.team2-fill {
  background: var(--vis-primary-gradient);
}

.map-flow-track {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  padding: 8px 2px 6px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  scroll-snap-type: x proximity;
}

.map-flow-item {
  flex: 0 0 148px;
  position: relative;
  min-height: 82px;
  padding: 6px 7px;
  overflow: hidden;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background-color: #f5f7fa;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: 0 4px 12px rgba(17, 17, 17, 0.04);
  scroll-snap-align: start;
}

.map-flow-item::before {
  display: none;
}

.map-flow-item::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 3px;
  background: transparent;
}

.map-flow-item.is-team1::after {
  background: #111;
}

.map-flow-item.is-team2::after {
  background: var(--vis-primary-gradient);
}

.map-flow-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(17, 17, 17, 0.08) 0%, rgba(17, 17, 17, 0.14) 28%, rgba(17, 17, 17, 0.52) 100%);
}

.map-flow-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 68px;
}

.map-flow-top {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.map-flow-index,
.map-flow-score {
  font-family: var(--vis-font-numeric);
}

.map-flow-index {
  color: rgba(255, 255, 255, 0.78);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.4px;
}

.map-flow-main {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  margin-top: 2px;
}

.map-flow-left {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.map-flow-right {
  flex: 0 0 42%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 7px;
}

.map-flow-name {
  margin-top: auto;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  font-family: var(--vis-font-display);
  line-height: 1.1;
  text-shadow: 0 2px 10px rgba(17, 17, 17, 0.28);
}

.map-flow-score {
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  text-shadow: 0 2px 10px rgba(17, 17, 17, 0.28);
}

.map-flow-winner-logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
  display: block;
  transform: translateY(-1px);
  filter: drop-shadow(0 4px 12px rgba(17, 17, 17, 0.28));
}

.map-analysis-simple {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.map-analysis-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.map-overview-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease);
}

@media (hover: hover) and (pointer: fine) {
  .map-overview-pill:hover {
    transform: translateY(-1px);
    border-color: var(--vis-border-strong);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  }
}

.map-overview-pill .map-mode-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  object-fit: contain;
  display: block;
  filter: brightness(0) saturate(100%);
  opacity: 0.78;
}

.map-overview-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.map-overview-label {
  color: #909399;
  font-size: 11px;
  font-weight: 700;
}

.map-overview-value {
  margin-top: 4px;
  color: #111;
  font-size: 14px;
  font-weight: 900;
  font-family: var(--vis-font-numeric);
}

.map-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 12px;
}

.map-analysis-card {
  padding: 14px;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.map-analysis-title {
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

.map-analysis-title::before {
  content: '';
  width: 4px;
  height: 15px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(-8deg);
}

.map-analysis-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.map-analysis-card-subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
}

.map-role-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.map-role-row {
  padding: 10px;
  background: #fafafa;
  border: 1px solid #f0f2f5;
  border-radius: 10px;
  transition: border-color 0.2s var(--vis-ease);
}

.map-role-row:hover {
  border-color: var(--vis-border-strong);
}

.map-role-top,
.map-role-values {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.map-role-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #111;
  font-size: 12px;
  font-weight: 900;
}

.map-role-edge,
.map-role-metric {
  color: #909399;
  font-size: 11px;
  font-weight: 700;
}

.map-role-edge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--vis-bg-muted);
  color: #606266;
  white-space: nowrap;
}

.map-role-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  margin-top: 8px;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.map-role-bars {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-top: 8px;
}

.map-player-radar-card {
  min-width: 0;
}

.map-player-selectors {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
}

.map-player-team {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.map-player-team1 {
  justify-content: flex-end;
}

.map-player-team2 {
  justify-content: flex-start;
}

.map-player-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--vis-bg-muted);
  border: 1px solid rgba(17, 17, 17, 0.06);
  color: #303133;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: color 0.2s var(--vis-ease), background-color 0.2s var(--vis-ease), border-color 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

.map-player-team1 .map-player-chip:hover {
  background: rgba(17, 17, 17, 0.06);
  border-color: rgba(17, 17, 17, 0.14);
}

.map-player-team2 .map-player-chip:hover {
  background: rgba(255, 106, 0, 0.08);
  border-color: rgba(255, 106, 0, 0.18);
}

.map-player-team1 .map-player-chip.active {
  background: #111;
  border-color: #111;
  color: #fff;
  box-shadow: 0 4px 10px rgba(17, 17, 17, 0.22);
}

.map-player-team2 .map-player-chip.active {
  background: #ff6a00;
  border-color: #ff6a00;
  color: #fff;
  box-shadow: 0 4px 10px rgba(255, 106, 0, 0.28);
}

.map-player-vs {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 4px;
  color: #c0c4cc;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.map-player-radar {
  height: 250px;
  margin-top: 6px;
}

.map-info-banner {
  position: relative;
  display: flex;
  align-items: center;
  height: 110px;
  margin-bottom: 16px;
  overflow: hidden;
  background-position: center;
  background-size: cover;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgba(17, 17, 17, 0.08);
}

.banner-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(52% 120% at 92% 108%, rgba(255, 106, 0, 0.22), rgba(255, 106, 0, 0) 62%),
    linear-gradient(90deg, rgba(16, 21, 28, 0.88) 0%, rgba(16, 21, 28, 0.55) 45%, rgba(16, 21, 28, 0.88) 100%);
}

.banner-content {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 18px;
  color: #fff;
}

.banner-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.72);
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.banner-kicker::before {
  content: '';
  width: 3px;
  height: 10px;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(-8deg);
}

.map-name {
  margin: 2px 0 0;
  font-family: var(--vis-font-display);
  font-style: italic;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.map-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.78);
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.map-score {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  background: rgba(16, 21, 28, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  font-family: var(--vis-font-numeric);
  font-size: 20px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  transform: skewX(-8deg);
}

.map-score > * {
  transform: skewX(8deg);
}

.score-team {
  font-size: 13px;
  opacity: 0.7;
}

.score-team.winner {
  opacity: 1;
}

.score-number {
  min-width: 1em;
  text-align: center;
}

.score-divider {
  color: rgba(255, 255, 255, 0.55);
  font-size: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.team-col-header {
  padding-bottom: 8px;
  border-bottom: 2px solid #e4e7ed;
  color: #111;
  font-size: 16px;
  font-weight: 800;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-grid .team-col-header:first-child {
  border-bottom-color: var(--vis-team-left);
}

.stats-grid .team-col-header:nth-child(2) {
  border-bottom-color: var(--vis-team-right);
}

.player-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid var(--vis-border);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.2s var(--vis-ease), box-shadow 0.2s var(--vis-ease);
}

.player-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 2px;
  border-radius: 999px;
  background: var(--vis-primary-gradient);
  opacity: 0;
  transition: opacity 0.2s var(--vis-ease);
  pointer-events: none;
}

.player-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.player-card:hover::before {
  opacity: 1;
}

.player-card:active {
  transform: scale(0.98);
}

.player-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #f0f0f0;
}

.player-role-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.player-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #111;
  font-size: 14px;
  font-weight: 800;
}

.player-kda {
  flex-shrink: 0;
  padding: 2px 8px;
  background: var(--vis-bg-muted);
  border-radius: 999px;
  color: #303133;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.player-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.stat-label {
  width: 28px;
  flex-shrink: 0;
  color: #909399;
}

.stat-bar-track {
  height: 5px;
  flex: 1;
  overflow: hidden;
  background: #f0f2f5;
  border-radius: 999px;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 999px;
}

.damage-color {
  background: #ff6a00;
}

.healing-color {
  background: #28a745;
}

.mitigation-color {
  background: #111;
}

.stat-value {
  width: 44px;
  flex-shrink: 0;
  color: #111;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.empty-player,
.map-empty {
  grid-column: 1 / -1;
}

@media (max-width: 768px) {
  .detail-header {
    padding: 12px 16px;
  }

  .tournament-name {
    max-width: 180px;
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
    padding: 18px 12px 14px;
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

  .match-center {
    gap: 4px;
    padding: 0 10px;
  }

  .match-meta-time {
    font-size: 11px;
  }

  .match-score {
    gap: 8px;
    font-size: 28px;
  }

  .match-status-badge {
    padding: 2px 10px;
  }

  .match-summary-strip {
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px 12px;
  }

  .summary-pill {
    min-height: 28px;
    padding: 4px 10px;
  }

  .summary-label,
  .summary-value {
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

  .overall-team-header {
    padding: 10px 12px;
    font-size: 15px;
  }

  .overall-table-header {
    padding: 6px 8px;
    font-size: 10px;
  }

  .overall-table-row {
    padding: 8px;
    font-size: 11px;
  }

  .col-name {
    font-size: 12px;
  }

  .col-role {
    width: 28px;
  }

  .col-kda {
    width: 76px;
    font-size: 10px;
  }

  .col-kd {
    width: 32px;
  }

  .col-stat {
    width: 42px;
    font-size: 10px;
  }

  .map-info-banner {
    height: 92px;
    border-radius: 10px;
  }

  .analysis-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .content-mode-switch {
    margin-bottom: 0;
    padding: 3px;
  }

  .mode-chip {
    min-height: 28px;
    padding: 0 12px;
    font-size: 11px;
  }

  .analysis-card-header {
    padding: 12px 12px 0;
  }

  .analysis-card-title {
    font-size: 14px;
  }

  .analysis-card-subtitle {
    font-size: 11px;
  }

  .analysis-legend {
    justify-content: flex-start;
  }

  .legend-chip {
    padding: 3px 8px;
    font-size: 10px;
  }

  .team-analysis-radar {
    height: 260px;
  }

  .role-analysis-list,
  .map-flow-track {
    padding: 12px;
  }

  .role-analysis-row,
  .map-flow-item {
    padding: 10px;
    border-radius: 10px;
  }

  .map-flow-track {
    gap: 8px;
    padding: 8px 2px 4px;
  }

  .map-flow-item {
    flex-basis: 124px;
    min-height: 74px;
  }

  .role-analysis-name,
  .role-team-value {
    font-size: 12px;
  }

  .role-analysis-label,
  .role-analysis-edge,
  .map-flow-index,
  .map-flow-score {
    font-size: 10px;
  }

  .map-flow-name {
    font-size: 11px;
  }

  .map-flow-winner-logo {
    width: 30px;
    height: 30px;
  }

  .map-analysis-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .map-overview-pill {
    padding: 10px;
  }

  .map-overview-label {
    font-size: 10px;
  }

  .map-overview-value {
    font-size: 12px;
  }

  .map-analysis-grid {
    grid-template-columns: 1fr;
  }

  .map-analysis-card {
    padding: 12px;
  }

  .map-analysis-title {
    font-size: 13px;
  }

  .map-role-row {
    padding: 8px;
  }

  .map-analysis-card-subtitle,
  .map-role-name,
  .map-role-edge,
  .map-role-metric,
  .map-role-values {
    font-size: 10px;
  }

  .map-player-selectors {
    display: flex;
    align-items: start;
    gap: 6px;
    margin-top: 6px;
  }

  .map-player-team {
    flex: 1;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .map-player-team1 {
    align-items: flex-start;
    justify-content: flex-end;
  }

  .map-player-team2 {
    align-items: flex-start;
    justify-content: flex-start;
  }

  .map-player-chip {
    max-width: 100%;
    min-height: 28px;
    padding: 3px 10px;
    font-size: 10px;
    white-space: nowrap;
  }

  .map-player-vs {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 24px;
    padding-top: 6px;
    font-size: 10px;
    color: #c0c4cc;
    line-height: 1;
  }

  .map-player-radar {
    height: 208px;
    margin-top: 2px;
  }

  .banner-content {
    padding: 0 12px;
  }

  .map-name {
    font-size: 18px;
  }

  .map-meta {
    gap: 8px;
    margin-top: 6px;
    font-size: 10px;
  }

  .map-score {
    gap: 4px;
    padding: 3px 8px;
    font-size: 13px;
  }

  .score-team {
    display: block;
    max-width: 34px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  .stats-grid {
    gap: 8px;
  }

  .team-col-header {
    font-size: 13px;
  }

  .player-card {
    padding: 8px;
    border-radius: 8px;
  }

  .player-name {
    font-size: 12px;
  }

  .player-kda {
    padding: 2px 5px;
    font-size: 10px;
  }

  .stat-label {
    width: 24px;
    font-size: 10px;
  }

  .stat-bar-track {
    height: 4px;
  }

  .stat-value {
    width: 34px;
    font-size: 10px;
  }
}

@media (max-width: 420px) {
  .detail-header {
    padding: 10px 12px;
  }

  .match-banner {
    gap: 6px;
    padding: 14px 10px 12px;
  }

  .team {
    gap: 6px;
  }

  .team-logo {
    width: 34px;
    height: 34px;
  }

  .team-name {
    font-size: 14px;
  }

  .match-center {
    padding: 0 6px;
  }

  .match-meta-time {
    font-size: 10px;
  }

  .match-score {
    gap: 6px;
    font-size: 24px;
  }

  .match-status-badge {
    padding: 2px 10px;
    font-size: 10px;
  }

  .match-summary-strip {
    gap: 6px;
    padding: 8px 10px 10px;
  }

  .summary-pill {
    min-height: 26px;
    padding: 3px 10px;
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

  .team-analysis-radar {
    height: 230px;
  }

  .map-player-radar {
    height: 190px;
  }

  .map-info-banner {
    height: 84px;
  }

  .map-name {
    font-size: 16px;
  }

  .map-score {
    gap: 3px;
    padding: 3px 8px;
    font-size: 12px;
  }

  .score-team {
    max-width: 30px;
    font-size: 9px;
  }

  .col-role {
    width: 24px;
  }

  .col-kda {
    width: 68px;
  }

  .col-kd {
    width: 28px;
  }

  .col-stat {
    width: 38px;
  }

  .role-team-value {
    font-size: 12px;
  }

  .stat-value {
    width: 32px;
  }
}
</style>
