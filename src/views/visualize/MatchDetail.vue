<template>
  <div class="match-detail-page">
    <div v-if="isLoading" class="page-loading">
      <div class="loading-panel">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    </div>

    <div v-else class="detail-container">
      <DetailTopbar :title="formattedTournament" @back="goBack" />

      <div class="match-hero">
        <div class="match-banner">
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
            <span class="tab-map-name">{{ getMapTabLabel(mapGame, index) }}</span>
            <span class="tab-map-score">{{ displayScore(mapGame.team1Score) }}:{{ displayScore(mapGame.team2Score) }}</span>
          </div>
        </div>

        <div class="tab-content-area">
          <div v-if="!matchDetails.mapGames.length" class="empty-state">
            暂无比赛详情数据
          </div>

          <template v-else>
            <div v-show="activeTab === 'overall'" class="seamless-content">
              <ContentChoiceGroup
                class="content-mode-switch"
                :model-value="contentMode"
                :items="overallModeTabs"
                hide-label
                aria-label="全场内容视图"
                @update:model-value="switchContentMode"
              />

              <transition name="mode-fade" mode="out-in" @after-enter="handleModePanelAfterEnter">
                <div v-if="contentMode === 'data'" key="overall-data" class="overall-stats-container mode-panel">
                  <template v-for="(teamBlock, ti) in overallTeamSections" :key="teamBlock.key">
                    <!-- 全场对标带：两队选手之间，深色赛事面 + 双方队标 -->
                    <div v-if="ti === 1" class="versus-band versus-band--overall">
                      <div class="versus-band-overlay">
                        <div class="vb-team vb-team-left">
                          <img :src="queryParams.team1Logo" class="vb-logo" alt="" />
                          <span class="vb-name">{{ queryParams.team1 }}</span>
                        </div>
                        <div class="vb-center">
                          <span class="vb-map">全场总览{{ queryParams.boFormat ? ` · ${queryParams.boFormat}` : '' }}</span>
                          <span class="vb-score">
                            <b :class="{ win: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team1Id) }">{{ displayScore(queryParams.team1Score) }}</b>
                            <i>:</i>
                            <b :class="{ win: queryParams.winnerId && String(queryParams.winnerId) === String(queryParams.team2Id) }">{{ displayScore(queryParams.team2Score) }}</b>
                          </span>
                        </div>
                        <div class="vb-team vb-team-right">
                          <span class="vb-name">{{ queryParams.team2 }}</span>
                          <img :src="queryParams.team2Logo" class="vb-logo" alt="" />
                        </div>
                      </div>
                    </div>
                    <section class="overall-team-section" :class="`is-${teamBlock.key}`">
                      <div class="overall-team-header">
                        <img :src="teamBlock.logo" class="overall-team-logo" alt="" />
                        <span>{{ teamBlock.name }}</span>
                      </div>

                      <div v-if="teamBlock.players.length" class="stats-rows">
                        <div v-for="player in teamBlock.players" :key="player.playerId" class="stat-player-row">
                          <img :src="getRoleIconUrl(player.role)" class="sp-role-icon" :alt="player.role" />
                          <div class="sp-body">
                            <div class="sp-line1">
                              <span class="sp-name">{{ player.name }}</span>
                              <span class="sp-kda" :class="{ 'match-best': player.kdValue > 0 && player.kdValue === overallStats.maxStats.kd }">{{ player.kills }}/{{ player.assists }}/{{ player.deaths }}</span>
                            </div>
                            <div class="sp-line2">
                              <span class="sp-stat"><em>伤害</em><span :class="{ 'match-best': player.damage > 0 && player.damage === overallStats.maxStats.damage }">{{ formatNumber(player.damage) }}</span></span>
                              <span class="sp-stat"><em>治疗</em><span :class="{ 'match-best': player.healing > 0 && player.healing === overallStats.maxStats.healing }">{{ formatNumber(player.healing) }}</span></span>
                              <span class="sp-stat"><em>抵挡</em><span :class="{ 'match-best': player.mitigation > 0 && player.mitigation === overallStats.maxStats.mitigation }">{{ formatNumber(player.mitigation) }}</span></span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div v-else class="empty-inner">暂无该队选手数据</div>
                    </section>
                  </template>
                </div>

                <div v-else-if="teamAnalysis" key="overall-analysis" class="match-analysis-section mode-panel">
                  <div class="analysis-grid">
                    <div v-if="mapFlow.length" class="map-flow-strip analysis-grid-span-2">
                      <div
                        v-for="mapItem in mapFlow"
                        :key="mapItem.id"
                        class="map-flow-node"
                        :class="mapItem.winnerSideClass"
                      >
                        <span class="map-flow-index">M{{ mapItem.index }}</span>
                        <img v-if="mapItem.modeIcon" :src="mapItem.modeIcon" class="map-flow-mode-icon" alt="" />
                        <span class="map-flow-name">{{ mapItem.name }}</span>
                        <img v-if="mapItem.winnerLogo" :src="mapItem.winnerLogo" class="map-flow-winner-logo" alt="" />
                        <span v-else class="map-flow-winner-placeholder"></span>
                        <span class="map-flow-score">{{ mapItem.scoreText }}</span>
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

                </div>
              </transition>
            </div>

            <template v-for="(mapGame, index) in matchDetails.mapGames" :key="`panel-${mapGame.id}`">
            <div v-if="String(activeTab) === String(mapGame.id)" class="seamless-content" :class="{ 'is-data-mode': contentMode === 'data' }">
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

              <div v-if="mapBanChips.length" class="map-ban-strip">
                <div v-for="chip in mapBanChips" :key="chip.side" class="ban-chip">
                  <img :src="chip.teamLogo" class="ban-team-logo" alt="" />
                  <span class="ban-label">禁用</span>
                  <span class="ban-hero-icon">
                    <img v-if="chip.iconUrl" :src="chip.iconUrl" :alt="chip.heroName" loading="lazy" />
                    <span v-else class="ban-hero-fallback">{{ chip.heroName.slice(0, 1) }}</span>
                  </span>
                  <span class="ban-hero-name">{{ chip.heroName }}</span>
                </div>
              </div>

              <ContentChoiceGroup
                class="content-mode-switch"
                :model-value="contentMode"
                :items="mapModeTabs"
                hide-label
                aria-label="地图内容视图"
                @update:model-value="switchContentMode"
              />

              <transition name="mode-fade" mode="out-in" @after-enter="handleModePanelAfterEnter">
                <div v-if="contentMode === 'analysis' && (activeMapRadarCard || currentMapGame?.timeline)" key="map-analysis" class="map-analysis-simple mode-panel">
                  <div v-if="activeMapRadarCard" class="map-analysis-grid">
                    <div class="map-analysis-card map-player-radar-card analysis-grid-span-2">
                      <ContentChoiceGroup
                        class="map-role-filter"
                        :model-value="selectedMapRole"
                        :items="mapRoleTabs"
                        hide-label
                        compact
                        aria-label="职责筛选"
                        @update:model-value="selectMapRole"
                      />

                      <div class="map-player-selectors">
                        <div class="map-player-team map-player-team1">
                          <div
                            v-for="player in activeMapRadarCard.team1Players"
                            :key="`t1-${activeMapRadarCard.key}-${player.playerId}`"
                            class="map-player-chip"
                            :class="{ active: isSelectedMapRadarPlayer(activeMapRadarCard.role, 'team1', player) }"
                            @click="selectMapRadarPlayer(activeMapRadarCard.role, 'team1', player)"
                          >
                            {{ player.name }}
                          </div>
                        </div>

                        <div class="map-player-vs">VS</div>

                        <div class="map-player-team map-player-team2">
                          <div
                            v-for="player in activeMapRadarCard.team2Players"
                            :key="`t2-${activeMapRadarCard.key}-${player.playerId}`"
                            class="map-player-chip"
                            :class="{ active: isSelectedMapRadarPlayer(activeMapRadarCard.role, 'team2', player) }"
                            @click="selectMapRadarPlayer(activeMapRadarCard.role, 'team2', player)"
                          >
                            {{ player.name }}
                          </div>
                        </div>
                      </div>

                      <div :key="activeMapRadarCard.key" :ref="(el) => setMapPlayerRadarRef(activeMapRadarCard, el)" class="map-player-radar"></div>
                    </div>
                  </div>

                  <MatchMapTimeline
                    v-if="hasCurrentMapTimeline"
                    :map-game="currentMapGame"
                    :payload="currentMapTimeline.payload"
                    :loading="currentMapTimeline.loading"
                    :error="currentMapTimeline.error"
                  />
                </div>

                <div v-else-if="currentStatsRows.length" key="map-data" class="stats-list mode-panel">
                  <template v-for="(grp, gi) in mapPlayerGroups" :key="grp.key">
                    <!-- 两队对标带：夹在双方选手中间，地图头图作背景 -->
                    <div v-if="gi === 1" class="versus-band" :style="{ backgroundImage: `url(${getMapBannerUrl(mapGame.mapId)})` }">
                      <div class="versus-band-overlay">
                        <div class="vb-team vb-team-left">
                          <img :src="queryParams.team1Logo" class="vb-logo" alt="" />
                          <span class="vb-name">{{ queryParams.team1 }}</span>
                          <span v-if="mapGame.team1BanHero" class="vb-ban" :title="`${queryParams.team1} 禁用 ${mapGame.team1BanHero.name}`">
                            <img :src="getBanIconUrl(mapGame.team1BanHero)" :alt="mapGame.team1BanHero.name" loading="lazy" />
                          </span>
                        </div>
                        <div class="vb-center">
                          <span class="vb-map">MAP {{ index + 1 }} · {{ getMapName(mapGame.mapId) }} · {{ formatDuration(mapGame.duration) }}</span>
                          <span class="vb-score">
                            <b :class="{ win: String(mapGame.winnerId) === String(mapGame.team1Id) }">{{ displayScore(mapGame.team1Score) }}</b>
                            <i>:</i>
                            <b :class="{ win: String(mapGame.winnerId) === String(mapGame.team2Id) }">{{ displayScore(mapGame.team2Score) }}</b>
                          </span>
                        </div>
                        <div class="vb-team vb-team-right">
                          <span v-if="mapGame.team2BanHero" class="vb-ban" :title="`${queryParams.team2} 禁用 ${mapGame.team2BanHero.name}`">
                            <img :src="getBanIconUrl(mapGame.team2BanHero)" :alt="mapGame.team2BanHero.name" loading="lazy" />
                          </span>
                          <span class="vb-name">{{ queryParams.team2 }}</span>
                          <img :src="queryParams.team2Logo" class="vb-logo" alt="" />
                        </div>
                      </div>
                    </div>
                    <section class="stats-team" :class="`is-${grp.key}`">
                      <header class="stats-team-header">
                        <img :src="grp.logo" class="stats-team-logo" alt="" />
                        <span class="stats-team-name">{{ grp.name }}</span>
                      </header>
                      <div class="stats-rows">
                        <div v-for="player in grp.players" :key="player.playerId || player.name" class="stat-player-entry">
                          <component
                            :is="canExpandMapPlayer(player) ? 'button' : 'div'"
                            class="stat-player-row stat-player-summary"
                            :class="{ 'is-expandable': canExpandMapPlayer(player), 'is-expanded': isMapPlayerExpanded(player) }"
                            :type="canExpandMapPlayer(player) ? 'button' : null"
                            :aria-expanded="canExpandMapPlayer(player) ? isMapPlayerExpanded(player) : null"
                            :aria-controls="canExpandMapPlayer(player) ? mapPlayerDrawerId(player) : null"
                            :aria-label="canExpandMapPlayer(player) ? `${isMapPlayerExpanded(player) ? '收起' : '展开'}${player.name}的英雄统计` : null"
                            @click="toggleMapPlayerHeroes(player)"
                          >
                            <img :src="getRoleIconUrl(player.role)" class="sp-role-icon" :alt="player.role" />
                            <div class="sp-body">
                              <div class="sp-line1">
                                <span class="sp-name">{{ player.name }}</span>
                                <span class="sp-kda">{{ player.kills }}/{{ player.assists }}/{{ player.deaths }}</span>
                              </div>
                              <div class="sp-line2">
                                <span class="sp-stat"><em>伤害</em>{{ formatNumber(player.damage) }}</span>
                                <span class="sp-stat"><em>治疗</em>{{ formatNumber(player.healing) }}</span>
                                <span class="sp-stat"><em>抵挡</em>{{ formatNumber(player.mitigation) }}</span>
                              </div>
                            </div>
                            <span v-if="canExpandMapPlayer(player)" class="sp-expand" aria-hidden="true"><i></i></span>
                          </component>

                          <div
                            v-if="canExpandMapPlayer(player) && isMapPlayerExpanded(player)"
                            :id="mapPlayerDrawerId(player)"
                            class="player-hero-drawer"
                          >
                            <div class="player-hero-grid">
                              <article
                                v-for="hero in player.heroes"
                                :key="hero.heroId ?? hero.heroName"
                                class="player-hero-card"
                                :aria-label="`${hero.heroName}本局统计，使用占比${hero.usagePct}%`"
                              >
                                <div class="player-hero-portrait">
                                  <img
                                    v-if="hero.iconUrl && !hero.iconFailed"
                                    :src="hero.iconUrl"
                                    :alt="hero.heroName"
                                    loading="lazy"
                                    @error="handleHeroIconError(hero)"
                                  />
                                  <span v-else class="player-hero-fallback">{{ hero.heroName.slice(0, 1) }}</span>
                                  <span class="player-hero-usage" :title="`使用占比 ${hero.usagePct}%`">{{ hero.usagePct }}%</span>
                                  <b>{{ hero.heroName }}</b>
                                </div>
                                <dl class="player-hero-metrics">
                                  <div><dt>最后一击</dt><dd>{{ hero.finalBlows }}</dd></div>
                                  <div><dt>死亡</dt><dd>{{ hero.deathsByFinalBlow }}</dd></div>
                                  <div><dt>平均充能</dt><dd>{{ formatHeroCharge(hero.avgUltChargeSeconds) }}</dd></div>
                                </dl>
                              </article>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
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
import * as echarts from 'echarts';
import apiService from '@/services/api';
import { getMapImageUrl } from '@/utils/mapImages';
import { getHeroIconUrl } from '@/utils/heroIcons';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';
import { TBD_TEAM_LOGO_URL } from '@/utils/teamLogos';
import DetailTopbar from './components/DetailTopbar.vue';
import ContentChoiceGroup from './components/ContentChoiceGroup.vue';
import MatchMapTimeline from './components/MatchMapTimeline.vue';

const TBD_LOGO_URL = TBD_TEAM_LOGO_URL;

export default {
  name: 'MatchDetail',
  components: { DetailTopbar, ContentChoiceGroup, MatchMapTimeline },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const store = useStore();

    const isLoading = ref(true);
    const activeTab = ref('overall');
    const contentMode = ref('analysis');
    const overallModeTabs = [
      { value: 'analysis', label: '比赛分析' },
      { value: 'data', label: '选手总览' }
    ];
    const mapModeTabs = [
      { value: 'data', label: '选手数据' },
      { value: 'analysis', label: '地图分析' }
    ];
    const matchDetails = ref({ mapGames: [], playerStats: [] });
    const mapTimelineCache = ref({});
    const expandedMapPlayerKeys = ref([]);
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
      mitigation: Number(stat.mitigation || 0),
      heroStats: Array.isArray(stat.heroStats) ? stat.heroStats : []
    });

    // 把 player_hero_stats 行累加进「按英雄聚合」的 Map（同一选手可能有多条 stat 行）
    const accumulateHeroStats = (byHero, rows) => {
      (rows || []).forEach(r => {
        const heroName = r.hero?.name || r.heroName || '';
        if (!heroName) return;
        const key = r.heroId != null ? `id:${r.heroId}` : `name:${heroName}`;
        if (!byHero.has(key)) {
          byHero.set(key, {
            heroId: r.heroId != null ? Number(r.heroId) : null,
            heroName,
            iconUrl: getHeroIconUrl(heroName, store.state.heroes),
            iconFailed: false,
            usageSeconds: 0,
            finalBlows: 0,
            deathsByFinalBlow: 0,
            ultWeightedSum: 0,
            ultWeight: 0
          });
        }
        const agg = byHero.get(key);
        const usage = Number(r.usageSeconds) || 0;
        agg.usageSeconds += usage;
        agg.finalBlows += Number(r.finalBlows) || 0;
        agg.deathsByFinalBlow += Number(r.deathsByFinalBlow) || 0;
        if (r.avgUltChargeSeconds !== null && r.avgUltChargeSeconds !== undefined && usage > 0) {
          agg.ultWeightedSum += Number(r.avgUltChargeSeconds) * usage;
          agg.ultWeight += usage;
        }
      });
    };

    // 选手在该图的英雄数据终态：按英雄聚合出使用占比与（按时长加权的）平均大招充能
    const finalizePlayerHeroes = (player) => {
      const heroes = Array.from(player.heroAgg.values())
        .map(h => ({
          ...h,
          avgUltChargeSeconds: h.ultWeight > 0 ? h.ultWeightedSum / h.ultWeight : null
        }))
        .filter(h => h.usageSeconds > 0)
        .sort((a, b) => b.usageSeconds - a.usageSeconds);
      const totalUsage = heroes.reduce((sum, h) => sum + h.usageSeconds, 0);
      player.heroes = heroes.map(h => ({
        ...h,
        usagePct: totalUsage > 0 ? Math.round((h.usageSeconds / totalUsage) * 100) : 0
      }));
      delete player.heroAgg;
    };

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
          modeIcon: getMapModeInfo(mapGame.mapId).icon,
          winnerLogo,
          winnerSideClass,
          scoreText: `${displayScore(mapGame.team1Score)}:${displayScore(mapGame.team2Score)}`
        };
      });
    });

    const currentMapGame = computed(() => {
      return matchDetails.value.mapGames.find(mapGame => String(mapGame.id) === String(activeTab.value)) || null;
    });

    const currentMapTimeline = computed(() => {
      const key = String(currentMapGame.value?.id || '');
      return mapTimelineCache.value[key] || { payload: null, loading: false, error: '', revision: 0 };
    });

    const hasCurrentMapTimeline = computed(() => Boolean(currentMapGame.value?.timeline));
    const mapPlayerExpansionKey = (player) => `${currentMapGame.value?.id || 'map'}:${player?.playerId ?? player?.name ?? 'player'}`;
    const mapPlayerDrawerId = (player) => `map-player-heroes-${mapPlayerExpansionKey(player).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const canExpandMapPlayer = (player) => hasCurrentMapTimeline.value && Array.isArray(player?.heroes) && player.heroes.length > 0;
    const isMapPlayerExpanded = (player) => expandedMapPlayerKeys.value.includes(mapPlayerExpansionKey(player));
    const toggleMapPlayerHeroes = (player) => {
      if (!canExpandMapPlayer(player)) return;
      const key = mapPlayerExpansionKey(player);
      expandedMapPlayerKeys.value = isMapPlayerExpanded(player)
        ? expandedMapPlayerKeys.value.filter(item => item !== key)
        : [...expandedMapPlayerKeys.value, key];
    };
    const handleHeroIconError = (hero) => { hero.iconFailed = true; };
    const formatHeroCharge = (value) => (
      value === null || value === undefined || !Number.isFinite(Number(value))
        ? '—'
        : `${Math.round(Number(value))}s`
    );

    const loadMapTimeline = async (mapGame = currentMapGame.value) => {
      if (!mapGame?.id || !mapGame.timeline) return;
      const key = String(mapGame.id);
      const revision = Number(mapGame.timeline.revision) || 1;
      const cached = mapTimelineCache.value[key];
      if (cached?.loading || (cached?.payload && cached.revision === revision)) return;

      if (mapGame.timeline.payload) {
        mapTimelineCache.value = {
          ...mapTimelineCache.value,
          [key]: { payload: mapGame.timeline.payload, loading: false, error: '', revision }
        };
        return;
      }

      mapTimelineCache.value = {
        ...mapTimelineCache.value,
        [key]: { payload: cached?.payload || null, loading: true, error: '', revision }
      };
      try {
        const fullMap = await apiService.getMapGameById(mapGame.id);
        const payload = fullMap?.timeline?.payload || null;
        if (!payload) throw new Error('该地图尚未生成有效回合时间线');
        mapTimelineCache.value = {
          ...mapTimelineCache.value,
          [key]: { payload, loading: false, error: '', revision }
        };
      } catch (error) {
        const message = error?.response?.status
          ? `请求失败（${error.response.status}）`
          : (error instanceof Error ? error.message : String(error));
        mapTimelineCache.value = {
          ...mapTimelineCache.value,
          [key]: { payload: null, loading: false, error: message, revision }
        };
      }
    };

    const currentMapPlayers = computed(() => {
      if (!currentMapGame.value) return [];

      const filteredStats = matchDetails.value.playerStats.filter(
        stat => String(stat.mapGameId) === String(currentMapGame.value.id)
      );
      const playerMap = new Map();

      filteredStats.forEach(rawStat => {
        const stat = normalizePlayer(rawStat);
        if (!playerMap.has(stat.playerId)) {
          const heroAgg = new Map();
          accumulateHeroStats(heroAgg, stat.heroStats);
          playerMap.set(stat.playerId, { ...stat, heroAgg });
          return;
        }

        const player = playerMap.get(stat.playerId);
        player.kills += stat.kills;
        player.deaths += stat.deaths;
        player.assists += stat.assists;
        player.damage += stat.damage;
        player.healing += stat.healing;
        player.mitigation += stat.mitigation;
        accumulateHeroStats(player.heroAgg, stat.heroStats);
      });

      const allPlayers = Array.from(playerMap.values());
      allPlayers.forEach(finalizePlayerHeroes);

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

    // 该图双方的 ban（有才显示）
    const mapBanChips = computed(() => {
      const mg = currentMapGame.value;
      if (!mg) return [];
      const chips = [];
      if (mg.team1BanHero) {
        chips.push({
          side: 'team1',
          teamLogo: queryParams.value.team1Logo,
          heroName: mg.team1BanHero.name,
          iconUrl: getHeroIconUrl(mg.team1BanHero, store.state.heroes)
        });
      }
      if (mg.team2BanHero) {
        chips.push({
          side: 'team2',
          teamLogo: queryParams.value.team2Logo,
          heroName: mg.team2BanHero.name,
          iconUrl: getHeroIconUrl(mg.team2BanHero, store.state.heroes)
        });
      }
      return chips;
    });

    // ban 英雄图标（对标带内联展示用）
    const getBanIconUrl = (banHero) => (banHero ? getHeroIconUrl(banHero, store.state.heroes) : '');

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

    // 选手数据按队分组（一选手一行列表用）
    const mapPlayerGroups = computed(() => {
      const rows = currentStatsRows.value;
      return [
        { key: 'team1', name: queryParams.value.team1, logo: queryParams.value.team1Logo, players: rows.map(r => r.team1).filter(Boolean) },
        { key: 'team2', name: queryParams.value.team2, logo: queryParams.value.team2Logo, players: rows.map(r => r.team2).filter(Boolean) }
      ];
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

    // 地图分析：单一雷达 + 顶部职责筛选
    const selectedMapRole = ref('tank');

    const mapRoleTabs = computed(() => {
      const labels = { tank: '重装', damage: '输出', support: '支援' };
      return currentMapPlayerRadarCards.value.map(card => ({
        value: card.role,
        label: labels[card.role] || card.role
      }));
    });

    const activeMapRadarCard = computed(() => {
      const cards = currentMapPlayerRadarCards.value;
      if (!cards.length) return null;
      return cards.find(card => card.role === selectedMapRole.value) || cards[0];
    });

    const selectMapRole = (role) => {
      selectedMapRole.value = role;
      nextTick(() => {
        if (activeMapRadarCard.value) renderMapPlayerRadar(activeMapRadarCard.value);
      });
    };

    // 当前地图没有所选职责的选手时，回退到第一个可用职责
    watch(mapRoleTabs, (tabs) => {
      if (tabs.length && !tabs.some(t => t.value === selectedMapRole.value)) {
        selectedMapRole.value = tabs[0].value;
      }
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
      contentMode.value = tab === 'overall' ? 'analysis' : 'data';
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

    const setMapPlayerRadarRef = (card, el) => {
      if (el && card) {
        mapPlayerRadarRefs.value[card.key] = el;
        return;
      }
      if (el) return;
      // 节点卸载时 card 可能已为 null，这里统一清理脱离文档的引用与图表实例
      Object.keys(mapPlayerRadarRefs.value).forEach(key => {
        const node = mapPlayerRadarRefs.value[key];
        if (!node || !document.contains(node)) {
          delete mapPlayerRadarRefs.value[key];
        }
      });
      Object.keys(mapPlayerRadarInstances).forEach(key => {
        const instance = mapPlayerRadarInstances[key];
        if (!instance) return;
        const dom = instance.getDom ? instance.getDom() : null;
        if (!dom || !document.contains(dom)) {
          instance.dispose();
          delete mapPlayerRadarInstances[key];
        }
      });
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
            if (activeMapRadarCard.value) renderMapPlayerRadar(activeMapRadarCard.value);
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
      if (activeTab.value !== 'overall' && contentMode.value === 'analysis') {
        void loadMapTimeline();
      }
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

    watch(() => currentMapGame.value?.id, () => {
      expandedMapPlayerKeys.value = [];
    });

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
      overallModeTabs,
      mapModeTabs,
      winnerName,
      overallStats,
      overallTeamSections,
      teamAnalysis,
      teamAnalysisRadarRef,
      mapFlow,
      selectedMapRole,
      mapRoleTabs,
      activeMapRadarCard,
      currentMapGame,
      currentMapTimeline,
      hasCurrentMapTimeline,
      canExpandMapPlayer,
      isMapPlayerExpanded,
      toggleMapPlayerHeroes,
      mapPlayerDrawerId,
      handleHeroIconError,
      formatHeroCharge,
      selectMapRole,
      currentMapPlayerRadarCards,
      isSelectedMapRadarPlayer,
      selectMapRadarPlayer,
      currentStatsRows,
      mapBanChips,
      mapPlayerGroups,
      getBanIconUrl,
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

/* 浅色对位头图：白暖渐变底 + 左黑右橙队色晕染 + 斜线纹理（与对标带同源） */
.match-hero {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--vis-border, #e6e9f0);
  color: #111;
  background-color: #fffaf3;
  background-image:
    linear-gradient(90deg, rgba(17, 17, 17, 0.05) 0%, rgba(17, 17, 17, 0) 34%),
    linear-gradient(270deg, rgba(255, 106, 0, 0.1) 0%, rgba(255, 106, 0, 0) 38%),
    repeating-linear-gradient(115deg, rgba(17, 17, 17, 0.024) 0, rgba(17, 17, 17, 0.024) 1px, transparent 1px, transparent 13px),
    linear-gradient(135deg, #ffffff 0%, #fffaf3 58%, #fff3e2 100%);
}

.match-banner {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26px 40px 18px;
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
  filter: drop-shadow(0 3px 8px rgba(17, 17, 17, 0.14));
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
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--vis-border, #e6e9f0);
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
  background: #28a745;
  box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.12);
}

.match-summary-strip {
  position: relative;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 40px 18px;
  background: transparent;
}

.summary-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 4px 14px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--vis-border, #e6e9f0);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(17, 17, 17, 0.04);
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
  gap: 4px;
  padding: 0 16px;
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

/* 下划线 tab：与首页 vis-tabs 同语言，激活 = 深字 + 渐变斜切下划线 */
.tab-nav-item {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  min-height: 38px;
  padding: 0 10px;
  margin: 0 2px;
  border-radius: 0;
  background: transparent;
  color: var(--vis-text-tertiary);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  scroll-snap-align: start;
  transition: color 0.2s var(--vis-ease);
}

.tab-nav-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: var(--vis-primary-gradient);
  transform: translateX(-50%) skewX(var(--vis-slant, -8deg)) scaleX(0);
  transition: transform 0.25s var(--vis-ease);
}

.tab-nav-item:hover {
  color: #111;
  background: transparent;
}

.tab-nav-item.active {
  color: #111;
  background: transparent;
  box-shadow: none;
  font-weight: 800;
}

.tab-nav-item.active::after {
  transform: translateX(-50%) skewX(var(--vis-slant, -8deg)) scaleX(1);
}

.tab-map-score {
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.tab-nav-item.active .tab-map-score {
  color: var(--vis-accent);
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
  width: calc(100% + 40px);
  margin: 16px -20px;
  padding: 0;
}

.seamless-content > .content-mode-switch:first-child {
  margin-top: -20px;
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
  min-width: 0;
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

/* 职责对位模块已移除 */

/* 地图走势：模式图标代表地图、队标代表胜者，一排装下不滚动 */
.map-flow-strip {
  display: flex;
  align-items: stretch;
  width: 100%;
  margin-top: 4px;
  border-bottom: 1px solid var(--vis-border, #e3e6eb);
}

.map-flow-node {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 2px 10px;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
}

.map-flow-node.is-team1 {
  border-bottom-color: #111;
}

.map-flow-node.is-team2 {
  border-bottom-color: #ff6a00;
}

.map-flow-index {
  font-family: var(--vis-font-numeric);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #c0c4cc;
}

.map-flow-mode-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  display: block;
  /* 图标源文件为白色镂空字形，浅色背景下反色显示 */
  filter: invert(1);
  opacity: 0.72;
}

.map-flow-name {
  max-width: 100%;
  font-size: 11px;
  font-weight: 800;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-flow-winner-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
  display: block;
}

.map-flow-winner-placeholder {
  width: 22px;
  height: 22px;
  display: block;
}

.map-flow-score {
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 800;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.map-analysis-simple {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 四个地图信息卡已移除 */

.map-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 12px;
}

.map-analysis-card {
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
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

.map-player-radar-card {
  min-width: 0;
}

.map-role-filter {
  margin-bottom: 4px;
}

.map-player-selectors {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 0;
  padding: 10px 4px 0;
}

.map-player-team {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
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
  min-height: 0;
  padding: 2px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #606266;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(17, 17, 17, 0.18);
  text-underline-offset: 3px;
  transition: color 0.2s var(--vis-ease), text-decoration-color 0.2s var(--vis-ease);
}

.map-player-team1 .map-player-chip:hover {
  color: #111;
}

.map-player-team2 .map-player-chip:hover {
  color: #ff6a00;
}

.map-player-team1 .map-player-chip.active {
  color: #111;
  font-weight: 900;
  text-decoration-color: #111;
}

.map-player-team2 .map-player-chip.active {
  color: #ff6a00;
  font-weight: 900;
  text-decoration-color: #ff6a00;
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

/* 战队雷达：去卡壳，与前瞻页战队对比同款的扁平呈现 */
.analysis-card.radar-analysis-card {
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.analysis-card.radar-analysis-card::before {
  content: none;
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

/* 选手数据：一选手一行紧凑扁平行 */
.stats-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
}

.stats-team {
  min-width: 0;
}

.stats-team-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 8px;
  border-bottom: 2px solid var(--vis-team-left, #111);
  color: #111;
  font-size: 14px;
  font-weight: 800;
}

.stats-team.is-team2 .stats-team-header {
  border-bottom-color: var(--vis-team-right, #ff6a00);
}

.stats-team-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.stats-team-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-rows {
  display: flex;
  flex-direction: column;
}

.stat-player-entry {
  min-width: 0;
  border-bottom: 1px solid #eef1f4;
}

.stat-player-entry:last-child {
  border-bottom: 0;
}

.overall-team-section .stat-player-row {
  border-bottom: 1px solid #eef1f4;
}

.overall-team-section .stat-player-row:last-child {
  border-bottom: 0;
}

.overall-team-section.is-team2 .stat-player-row {
  border-bottom-color: #f7ece1;
}

.stat-player-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 7px;
  padding: 7px 2px;
  border: 0;
  color: inherit;
  background: transparent;
  font-family: inherit;
  text-align: left;
}

.stat-player-summary.is-expandable {
  position: relative;
  cursor: pointer;
}

.stat-player-summary.is-expandable:hover {
  background: #fafbfc;
}

.stat-player-summary.is-expandable:focus-visible {
  outline: 2px solid rgba(255, 106, 0, .55);
  outline-offset: -2px;
}

.sp-expand {
  position: absolute;
  right: 2px;
  bottom: 3px;
  display: grid;
  width: 20px;
  height: 12px;
  place-items: center;
  color: #8e959d;
}

.sp-expand i {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translate(-1px, -1px);
  transition: transform .16s ease;
}

.stat-player-summary.is-expanded .sp-expand i {
  transform: rotate(225deg) translate(-1px, -1px);
}

.player-hero-drawer {
  padding: 6px 2px 9px;
  background: #f8f9fb;
}

.player-hero-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.player-hero-card {
  display: grid;
  min-width: 0;
  min-height: 50px;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: stretch;
  gap: 6px;
  padding: 3px;
  border: 1px solid #e5e8ec;
  border-radius: 5px;
  background: #fff;
}

.player-hero-portrait {
  position: relative;
  display: grid;
  width: 100%;
  height: 44px;
  min-width: 0;
  aspect-ratio: 1;
  align-self: center;
  overflow: hidden;
  place-items: center;
  border-radius: 3px;
  background: #eceff2;
}

.player-hero-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.player-hero-portrait b {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  padding: 2px 3px;
  color: #fff;
  background: rgba(18, 20, 23, .76);
  font-size: 8px;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-hero-usage {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 1;
  padding: 2px 3px;
  border-radius: 3px;
  color: #fff;
  background: rgba(255, 106, 0, .92);
  box-shadow: 0 1px 3px rgba(19, 22, 26, .2);
  font: 800 7px/1 var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
}

.player-hero-fallback {
  color: #747c85;
  font-size: 18px;
  font-weight: 800;
}

.player-hero-metrics {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  align-content: center;
  gap: 3px;
  margin: 0;
}

.player-hero-metrics div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 3px;
}

.player-hero-metrics dt {
  overflow: hidden;
  color: #969da5;
  font-size: 8px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-hero-metrics dd {
  margin: 0;
  color: #25292e;
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.sp-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.sp-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sp-role-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
  opacity: 0.78;
  filter: brightness(0);
}

/* 黑橙对位装饰：右队（橙方）图标与 K/D/A 着橙色，分隔线转暖 */
.is-team2 .sp-role-icon {
  opacity: 1;
  filter: invert(56%) sepia(91%) saturate(1636%) hue-rotate(357deg) brightness(98%) contrast(106%);
}

.is-team2 .sp-kda {
  color: var(--vis-accent, #ff6a00);
}

.is-team2 .stat-player-entry {
  border-bottom-color: #f7ece1;
}

.is-team1 .sp-kda {
  color: #111;
}

.sp-name {
  min-width: 0;
  overflow: hidden;
  color: #111;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-kda {
  margin-left: auto;
  flex: 0 0 auto;
  color: #111;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sp-line2 {
  display: flex;
  gap: 14px;
  color: #303133;
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sp-line2 em {
  margin-right: 3px;
  color: #a0a6af;
  font-family: var(--vis-font-body);
  font-size: 10px;
  font-style: normal;
  font-weight: 500;
}

/* 两队对标带：地图底图 + 深色渐变遮罩，桌面端隐藏（桌面保留队头横线） */
.versus-band {
  display: none;
  position: relative;
  overflow: hidden;
  background-color: #141416;
  background-size: cover;
  background-position: center 32%;
  color: #f5f7fa;
}

.versus-band-overlay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 12px;
  /* 左黑右橙的双色队色晕染 + 整体轻压暗，保证文字可读 */
  background:
    linear-gradient(90deg, rgba(10, 10, 12, 0.62) 0%, rgba(10, 10, 12, 0.22) 36%, rgba(10, 10, 12, 0.08) 50%, rgba(255, 106, 0, 0.14) 72%, rgba(255, 106, 0, 0.32) 100%),
    linear-gradient(180deg, rgba(10, 10, 12, 0.3), rgba(10, 10, 12, 0.3));
}

/* 上下黑橙渐变缝线，衔接白带与底图 */
.versus-band::before,
.versus-band::after {
  content: '';
  position: absolute;
  right: 0;
  left: 0;
  z-index: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(17, 17, 17, 0.55), rgba(255, 106, 0, 0.55));
  pointer-events: none;
}

.versus-band::before {
  top: 0;
}

.versus-band::after {
  bottom: 0;
}

.vb-team {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
}

.vb-team-right {
  justify-content: flex-end;
}

.vb-logo {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  object-fit: contain;
}

.vb-name {
  overflow: hidden;
  font-family: var(--vis-font-display);
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vb-center {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.vb-map {
  color: rgba(245, 247, 250, 0.66);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.vb-score {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--vis-font-numeric);
  font-size: 21px;
  font-style: italic;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
}

.vb-score i {
  margin: 0 4px;
  color: rgba(245, 247, 250, 0.4);
  font-style: normal;
}

.vb-score b {
  font-weight: 800;
}

.vb-score b.win {
  color: #ff9e0f;
}

/* 禁用英雄：小方图 + 红斜杠 */
.vb-ban {
  position: relative;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
}

.vb-ban img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(0.4);
}

.vb-ban::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 135%;
  height: 1.5px;
  border-radius: 999px;
  background: #ff5252;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* 全场总览对标带：不指向具体地图——墨色底 + 斜切几何纹理 + 右侧微光 */
.versus-band--overall {
  background-color: #141416;
  background-image:
    repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.05) 0, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 12px),
    radial-gradient(58% 150% at 85% 50%, rgba(255, 255, 255, 0.07), transparent 60%),
    linear-gradient(135deg, #1b1c20 0%, #101013 100%);
}

.versus-band--overall .versus-band-overlay {
  background: none;
}

/* 缝线在墨底上改为中性灰 */
.versus-band--overall::before,
.versus-band--overall::after {
  background: rgba(255, 255, 255, 0.14);
}

/* 地图 ban 展示 */
.map-ban-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 2px;
}

.ban-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 6px;
  border: 1px solid #eceef2;
  border-radius: 999px;
  background: #fff;
}

.ban-team-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.ban-label {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
}

.ban-hero-icon {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  overflow: hidden;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ban-hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ban-hero-fallback {
  font-size: 11px;
  font-weight: 800;
  color: #909399;
}

.ban-hero-name {
  font-size: 12px;
  font-weight: 700;
  color: #303133;
}

.map-empty {
  grid-column: 1 / -1;
}

@media (prefers-reduced-motion: reduce) {
  .sp-expand i {
    transition: none;
  }
}

@media (max-width: 768px) {
  .match-banner {
    gap: 8px;
    padding: 18px 12px 12px;
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
    padding: 0 12px 12px;
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
    gap: 2px;
    padding: 0 10px;
  }

  .tab-nav-item {
    min-height: 40px;
    padding: 0 8px;
    font-size: 12px;
  }

  .tab-map-score {
    font-size: 9px;
  }

  .stats-list {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  /* 地图 Banner 贴边；选手数据模式下由中间对标带承担地图标识 */
  .map-info-banner {
    margin: 0 calc(-1 * var(--sc-pad, 12px));
    border-radius: 0;
  }

  /* 移动端两种模式都不显示顶部 Banner：数据模式由对标带承担，分析模式直接进内容 */
  .map-info-banner {
    display: none;
  }

  /* 移动端用中间对标带替代队头横线 */
  .stats-team-header {
    display: none;
  }

  /* 移动端禁用英雄并入对标带，旧禁用条隐藏（桌面端保留） */
  .map-ban-strip {
    display: none;
  }

  .versus-band {
    display: block;
  }

  .stats-list {
    margin: 0 calc(-1 * var(--sc-pad, 12px));
  }

  .stats-team-header {
    padding-right: var(--sc-pad, 12px);
    padding-left: var(--sc-pad, 12px);
  }

  .stat-player-row {
    padding-right: var(--sc-pad, 12px);
    padding-left: var(--sc-pad, 12px);
  }

  .player-hero-drawer {
    padding: 6px var(--sc-pad, 12px) 9px;
  }

  .player-hero-card {
    min-height: 44px;
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .player-hero-portrait {
    height: 34px;
  }

  .sp-expand {
    right: var(--sc-pad, 12px);
  }

  .seamless-content {
    --sc-pad: 12px;
    padding: 4px 12px 10px;
  }

  /* 选手总览：贴边整白带，队头由中间对标带承担 */
  .overall-stats-container {
    gap: 0;
    margin: 0 calc(-1 * var(--sc-pad, 12px));
  }

  .overall-team-header {
    display: none;
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
    width: calc(100% + var(--sc-pad, 12px) * 2);
    margin: -4px calc(-1 * var(--sc-pad, 12px)) 0;
    padding: 0;
  }

  .seamless-content > .content-mode-switch:first-child {
    margin-top: -4px;
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

  .map-flow-index,
  .map-flow-score {
    font-size: 10px;
  }

  .map-flow-name {
    font-size: 11px;
  }

  .map-analysis-grid {
    grid-template-columns: 1fr;
  }

  .map-analysis-card {
    padding: 0;
  }

  /* 地图分析整区贴边：筛选条/选择器保留文字内边距，雷达图吃满宽度 */
  .map-analysis-simple {
    margin: 0 calc(-1 * var(--sc-pad, 12px));
  }

  .map-player-selectors {
    padding-right: var(--sc-pad, 12px);
    padding-left: var(--sc-pad, 12px);
  }

  .map-analysis-title {
    font-size: 13px;
  }

  .map-analysis-card-subtitle {
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
  .match-banner {
    gap: 6px;
    padding: 14px 10px 10px;
  }

  .content-mode-switch {
    width: calc(100% + var(--sc-pad, 10px) * 2);
    margin-right: calc(-1 * var(--sc-pad, 10px));
    margin-left: calc(-1 * var(--sc-pad, 10px));
  }

  .seamless-content > .content-mode-switch:first-child {
    margin-top: -4px;
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
    padding: 0 10px 10px;
  }

  .summary-pill {
    min-height: 26px;
    padding: 3px 10px;
  }

  .custom-tabs-nav {
    padding: 0 10px;
  }

  .tab-nav-item {
    min-height: 28px;
    padding: 0 10px;
    font-size: 10px;
  }

  .seamless-content {
    --sc-pad: 10px;
    padding: 4px 10px 8px;
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

}
</style>
