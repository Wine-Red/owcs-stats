<template>
  <div class="player-detail-page">
    <div v-if="isLoading" class="page-state" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true"></div>
      <span>正在整理选手数据...</span>
    </div>

    <div v-else-if="errorMessage" class="page-state error-state">
      <span class="state-kicker">PLAYER NOT FOUND</span>
      <h1>暂时无法打开选手页面</h1>
      <p>{{ errorMessage }}</p>
      <button type="button" class="state-action" @click="goBack">返回上一页</button>
    </div>

    <main v-else class="detail-container">
      <DetailTopbar title="选手详情" @back="goBack" />

      <section class="player-hero vis-arena-banner" aria-labelledby="player-name">
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="hero-role-mark" aria-hidden="true">{{ roleCode }}</div>

        <div class="hero-topline">
          <div class="identity-meta">
            <span class="role-chip">
              <img :src="roleIconUrl" alt="" />
              {{ roleLabel }}
            </span>
          </div>
          <button v-if="currentTeam" type="button" class="team-link" @click="goToTeamDetail">
            <img :src="teamLogo" alt="" />
            <span>{{ currentTeam.name }}</span>
            <el-icon><ArrowRight /></el-icon>
          </button>
          <span v-else class="team-link is-static">暂无队伍信息</span>
        </div>

        <div class="identity-block">
          <h1 id="player-name" ref="playerNameElement">{{ player?.name }}</h1>
        </div>

        <div class="season-control">
          <span class="season-label">数据赛季</span>
          <el-dropdown trigger="click" placement="bottom-end" @command="selectSeason">
            <button type="button" class="season-button">
              <span>{{ currentSeasonName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu class="minimal-dropdown-menu">
                <el-dropdown-item
                  v-for="season in availableSeasons"
                  :key="season.id"
                  :command="season.id"
                  :class="{ 'is-active': String(currentSeasonId) === String(season.id) }"
                >
                  {{ season.name }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </section>

      <DetailSectionTabs
        class="player-detail-tabs"
        :model-value="activeTab"
        :items="detailTabs"
        aria-label="选手详情分区"
        @update:model-value="switchTab"
      />

      <div v-show="activeTab === 'overview'" class="player-tab-panel">
        <div class="content-grid">
        <section class="content-section performance-section" aria-labelledby="performance-title">
          <div class="section-heading">
            <div>
              <span class="section-kicker">ROLE BENCHMARK</span>
              <h2 id="performance-title">同位置表现</h2>
            </div>
            <span class="sample-note role-sample-note">
              <img :src="roleIconUrl" alt="" aria-hidden="true" />
              {{ peerSampleLabel }}
            </span>
          </div>

          <div v-if="peerRanks.length" class="benchmark-list">
            <div v-for="metric in peerRanks" :key="metric.key" class="benchmark-item" :class="{ 'is-open': expandedMetric === metric.key }">
              <div class="benchmark-row">
                <div class="benchmark-copy">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.displayValue }}</strong>
                </div>
                <div class="benchmark-track" aria-hidden="true">
                  <span :style="{ width: `${metric.percentile}%` }"></span>
                  <i :style="{ left: `${metric.percentile}%` }"></i>
                </div>
                <button
                  type="button"
                  class="benchmark-rank"
                  :aria-expanded="expandedMetric === metric.key"
                  @click="toggleMetricRank(metric.key)"
                >
                  第 {{ metric.rank }} / {{ metric.total }}
                  <svg class="chev" :class="{ 'is-open': expandedMetric === metric.key }" viewBox="0 0 10 6" aria-hidden="true">
                    <path d="M1 1.2 5 5 9 1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
              <div v-if="expandedMetric === metric.key" class="metric-leaderboard">
                <div
                  v-for="row in metricLeaderboard(metric)"
                  :key="row.rank"
                  class="lb-row"
                  :class="{ 'is-self': row.isSelf, 'is-link': !row.isSelf && !!row.playerId }"
                  @click="goToPeerDetail(row)"
                >
                  <span class="lb-rank">{{ row.rank }}</span>
                  <span class="lb-name">{{ row.name }}</span>
                  <span class="lb-team">{{ row.teamName }}</span>
                  <span class="lb-value">{{ row.value }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="inline-empty">当前赛季暂无足够的同位置数据用于比较</div>
        </section>

        <section class="content-section trajectory-section" aria-labelledby="trajectory-title">
          <div class="section-heading">
            <div>
              <span class="section-kicker">SEASON TRACE</span>
              <h2 id="trajectory-title">赛季轨迹</h2>
            </div>
            <span class="sample-note">最终名次</span>
          </div>

          <div v-if="historyBars.length" class="history-chart">
            <div v-for="item in historyBars" :key="item.id" class="history-column" :class="{ active: String(item.id) === String(currentSeasonId) }">
              <span class="history-value">{{ item.value }}</span>
              <div class="history-bar-wrap">
                <span class="history-bar" :style="{ height: `${item.height}%` }"></span>
              </div>
              <span class="history-label" :title="item.name">{{ item.name }}</span>
            </div>
          </div>
          <div v-else class="inline-empty">暂无跨赛季记录</div>

          <div class="trajectory-summary">
            <div>
              <span>收录赛季</span>
              <strong>{{ seasonHistory.length }}</strong>
            </div>
            <div>
              <span>生涯比赛时长</span>
              <strong>{{ careerMinutes }}m</strong>
            </div>
          </div>
        </section>
        </div>
      </div>

      <div v-if="hasHeroData" v-show="activeTab === 'heroes'" class="player-tab-panel">
        <section class="content-section heroes-section" aria-label="英雄数据">
          <div class="ph-strip" role="tablist" aria-label="本赛季使用过的英雄">
            <button
              v-for="h in playerHeroes"
              :key="h.heroId"
              type="button"
              class="ph-hero"
              :class="{ 'is-active': selectedHeroId === h.heroId }"
              role="tab"
              :aria-selected="selectedHeroId === h.heroId"
              :title="getHeroName(h.heroId)"
              @click="selectedHeroId = h.heroId"
            >
              <span class="ph-hero-icon">
                <img
                  v-if="getHeroIcon(h.heroId) && !failedHeroIcons.has(h.heroId)"
                  :src="getHeroIcon(h.heroId)"
                  :alt="getHeroName(h.heroId)"
                  loading="lazy"
                  @error="markHeroIconFailed(h.heroId)"
                />
                <span v-else class="ph-hero-fallback">{{ getHeroName(h.heroId).slice(0, 1) }}</span>
              </span>
            </button>
          </div>

          <div v-if="selectedHero" class="ph-detail">
            <div class="ph-detail-head">
              <span class="ph-detail-name">{{ getHeroName(selectedHero.heroId) }}</span>
              <span class="ph-detail-meta">{{ selectedHero.mapsPlayed }} 图 · {{ Math.round(selectedHero.usageSeconds / 60) }} 分钟</span>
            </div>
            <div class="ph-usage-track" aria-hidden="true">
              <span :style="{ width: `${heroUsagePct(selectedHero)}%` }"></span>
            </div>
            <div class="ph-stats">
              <div v-for="m in heroMetrics" :key="m.key" class="ph-stat">
                <span class="ph-stat-label">{{ m.label }}</span>
                <strong class="ph-stat-value">{{ m.display }}</strong>
                <button
                  v-if="m.rank"
                  type="button"
                  class="ph-stat-rank"
                  :aria-expanded="expandedHeroMetric === m.key"
                  @click="toggleHeroMetric(m.key)"
                >
                  第 {{ m.rank }} / {{ m.total }}
                  <svg class="chev" :class="{ 'is-open': expandedHeroMetric === m.key }" viewBox="0 0 10 6" aria-hidden="true">
                    <path d="M1 1.2 5 5 9 1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div v-if="expandedHeroMetric && expandedHeroLeaderboard.length" class="metric-leaderboard">
              <div
                v-for="row in expandedHeroLeaderboard"
                :key="row.rank"
                class="lb-row"
                :class="{ 'is-self': row.isSelf, 'is-link': !row.isSelf && !!row.playerId }"
                @click="goToPeerDetail(row)"
              >
                <span class="lb-rank">{{ row.rank }}</span>
                <span class="lb-name">{{ row.name }}</span>
                <span class="lb-team">{{ row.teamName }}</span>
                <span class="lb-value">{{ row.value }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div v-show="activeTab === 'maps'" class="player-tab-panel">
        <section class="recent-matches-panel" aria-label="近期出场">
        <div v-if="recentMatches.length" class="recent-match-list">
          <button
            v-for="match in recentMatches"
            :key="match.matchId"
            type="button"
            class="recent-match-card"
            @click="goToMatchDetail(match)"
          >
            <span class="match-card-top">
              <span class="match-date">{{ formatDate(match.matchDate) }}<template v-if="match.boFormat"> · {{ match.boFormat }}</template></span>
              <span class="result-cell" :class="getMatchResultClass(match)">{{ getMatchResultLabel(match) }}</span>
            </span>
            <span class="match-teams">
              <span class="match-team">
                <img :src="getTeamLogo(match.teamId)" alt="" />
                <span>{{ getTeamName(match.teamId) }}</span>
              </span>
              <span class="match-score">{{ matchScoreLabel(match) }}</span>
              <span class="match-team is-opponent">
                <span>{{ getTeamName(match.opponentId) }}</span>
                <img :src="getTeamLogo(match.opponentId)" alt="" />
              </span>
            </span>
          </button>
        </div>
        <div v-else class="inline-empty">该赛季暂无比赛记录</div>
        </section>
      </div>
    </main>
  </div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import apiService from '@/services/api';
import { trackPerformance, trackPublicEvent } from '@/utils/analytics';
import { getHeroIconUrl } from '@/utils/heroIcons';
import DetailTopbar from './components/DetailTopbar.vue';
import DetailSectionTabs from './components/DetailSectionTabs.vue';

const ROLE_META = {
  tank: { label: '重装', code: 'TNK', icon: 'Tank.png', keyMetric: 'mitigationPer10', keyLabel: '减伤 / 10m' },
  damage: { label: '输出', code: 'DPS', icon: 'DPS.png', keyMetric: 'damagePer10', keyLabel: '伤害 / 10m' },
  support: { label: '支援', code: 'SUP', icon: 'Support.png', keyMetric: 'healingPer10', keyLabel: '治疗 / 10m' }
};

const toArray = value => Array.isArray(value) ? value : value?.data || value?.list || [];
const number = value => Number(value) || 0;

export default {
  name: 'PlayerDetail',
  components: { ArrowDown, ArrowRight, DetailTopbar, DetailSectionTabs },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const store = useStore();

    const isLoading = ref(true);
    const activeTab = ref(['overview', 'heroes', 'maps'].includes(String(route.query.tab)) ? String(route.query.tab) : 'overview');
    const playerHeroes = ref([]);
    const selectedHeroId = ref(null);
    const failedHeroIcons = ref(new Set());
    const hasHeroData = computed(() => playerHeroes.value.length > 0);
    const detailTabs = computed(() => {
      const tabs = [{ value: 'overview', label: '表现概览' }];
      if (hasHeroData.value) tabs.push({ value: 'heroes', label: '英雄数据' });
      tabs.push({ value: 'maps', label: '近期出场' });
      return tabs;
    });
    const errorMessage = ref('');
    const player = ref(null);
    const profile = ref(null);
    const seasonHistory = ref([]);
    const seasonPeers = ref([]);
    const currentStat = ref(null);
    const currentSeasonId = ref(route.query.seasonId ? String(route.query.seasonId) : '');
    const playerNameElement = ref(null);

    const switchTab = async (tab) => {
      if (activeTab.value === tab) return;
      activeTab.value = tab;
      trackPublicEvent('选手详情-切换标签', { tab, playerId: route.query.playerId }, route);
      await router.replace({ query: { ...route.query, tab } });
    };

    const playerId = computed(() => String(route.query.playerId || ''));
    const role = computed(() => player.value?.role || currentStat.value?.role || 'damage');
    const roleMeta = computed(() => ROLE_META[role.value] || ROLE_META.damage);
    const roleLabel = computed(() => roleMeta.value.label);
    const roleCode = computed(() => roleMeta.value.code);
    const roleIconUrl = computed(() => `${import.meta.env.BASE_URL || '/'}icons/role/${roleMeta.value.icon}`);

    const normalizedHistory = computed(() => seasonHistory.value
      .filter(item => item?.seasonId)
      .sort((a, b) => number(a.seasonId) - number(b.seasonId)));

    const availableSeasons = computed(() => normalizedHistory.value
      .map(item => item.season || store.state.seasons.find(season => String(season.id) === String(item.seasonId)))
      .filter(Boolean)
      .filter((item, index, items) => items.findIndex(candidate => String(candidate.id) === String(item.id)) === index)
      .sort((a, b) => number(b.id) - number(a.id)));

    const currentSeasonName = computed(() => {
      const season = availableSeasons.value.find(item => String(item.id) === String(currentSeasonId.value))
        || store.state.seasons.find(item => String(item.id) === String(currentSeasonId.value));
      return season?.name || '全部赛季';
    });

    const currentTeam = computed(() => currentStat.value?.team
      || seasonHistory.value.find(item => String(item.seasonId) === String(currentSeasonId.value))?.team
      || profile.value?.recentMaps?.[0]?.team
      || store.state.teams.find(item => String(item.id) === String(route.query.teamId))
      || null);

    const teamLogo = computed(() => currentTeam.value?.logo || 'https://owmini.xyz/images/tbd.png');

    const normalizeStat = stat => {
      if (!stat) return null;
      const minutes = number(stat.gameTime || stat.totalDuration);
      const per10 = (totalKey, perMinKey) => {
        if (stat[perMinKey] !== undefined && stat[perMinKey] !== null) return number(stat[perMinKey]) * 10;
        return minutes > 0 ? number(stat[totalKey]) / minutes * 10 : 0;
      };
      const elims = number(stat.elims ?? stat.totalKills);
      const assists = number(stat.assists ?? stat.totalAssists);
      const deaths = number(stat.deaths ?? stat.totalDeaths);
      return {
        ...stat,
        role: stat.player?.role || stat.role || player.value?.role || 'damage',
        gameTime: minutes,
        kd: stat.kd !== undefined && stat.kd !== null ? number(stat.kd) : (deaths > 0 ? elims / deaths : elims),
        kad: stat.kad !== undefined && stat.kad !== null ? number(stat.kad) : (deaths > 0 ? (elims + assists) / deaths : elims + assists),
        elimsPer10: per10('elims', 'elimsPerMin'),
        assistsPer10: per10('assists', 'assistsPerMin'),
        deathsPer10: per10('deaths', 'deathsPerMin'),
        damagePer10: per10('damage', 'damagePerMin'),
        healingPer10: per10('healing', 'healingPerMin'),
        mitigationPer10: per10('mitigation', 'mitigationPerMin')
      };
    };

    const fallbackStat = computed(() => {
      const totals = profile.value?.totals;
      if (!totals) return null;
      const minutes = number(totals.duration) / 60;
      return normalizeStat({
        role: role.value,
        gameTime: minutes,
        elims: totals.kills,
        deaths: totals.deaths,
        assists: totals.assists,
        damage: totals.damage,
        healing: totals.healing,
        mitigation: totals.mitigation
      });
    });

    const activeStat = computed(() => normalizeStat(currentStat.value) || fallbackStat.value || normalizeStat({ role: role.value }));

    const formatNumber = (value, digits = 2) => {
      const numeric = number(value);
      return numeric.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: numeric % 1 ? Math.min(1, digits) : 0 });
    };

    const normalizedPeers = computed(() => seasonPeers.value
      .map(normalizeStat)
      .filter(item => item && item.role === role.value && item.gameTime > 0));

    const rankMetric = (key, label, lowerIsBetter = false) => {
      const value = number(activeStat.value[key]);
      const values = normalizedPeers.value.map(item => number(item[key]));
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => lowerIsBetter ? a - b : b - a);
      let rank = sorted.findIndex(item => Math.abs(item - value) < 0.0001) + 1;
      if (rank === 0) rank = sorted.filter(item => lowerIsBetter ? item < value : item > value).length + 1;
      const percentile = sorted.length <= 1 ? 100 : Math.max(4, ((sorted.length - rank) / (sorted.length - 1)) * 96 + 4);
      return { key, label, rank, total: sorted.length, percentile, lowerIsBetter, displayValue: formatNumber(value) };
    };

    const peerRanks = computed(() => [
      rankMetric(role.value === 'support' ? 'kad' : 'kd', role.value === 'support' ? 'KA/D' : 'K/D'),
      rankMetric(roleMeta.value.keyMetric, roleMeta.value.keyLabel),
      rankMetric('elimsPer10', '消灭 / 10m'),
      rankMetric('deathsPer10', '死亡 / 10m', true)
    ].filter(Boolean));

    const peerSampleLabel = computed(() => normalizedPeers.value.length ? `${roleLabel.value} ${normalizedPeers.value.length} 人` : '暂无同位置数据');

    // 同位置表现：点击最右侧排名可展开该指标的同位置完整榜单
    const expandedMetric = ref(null);
    const toggleMetricRank = (key) => {
      expandedMetric.value = expandedMetric.value === key ? null : key;
    };
    const metricLeaderboard = (metric) => {
      const lower = metric.lowerIsBetter;
      return [...normalizedPeers.value]
        .sort((a, b) => lower ? number(a[metric.key]) - number(b[metric.key]) : number(b[metric.key]) - number(a[metric.key]))
        .map((item, index) => ({
          rank: index + 1,
          playerId: item.playerId || item.player?.id || null,
          name: item.player?.name || `选手#${item.playerId || ''}`,
          teamName: item.team?.name || '',
          value: formatNumber(item[metric.key]),
          isSelf: String(item.playerId || item.player?.id) === playerId.value
        }));
    };

    // 英雄数据 tab：该选手本赛季使用过的英雄（按使用时长降序）
    const getHero = heroId => store.state.heroes.find(hero => String(hero.id) === String(heroId)) || null;
    const getHeroName = heroId => getHero(heroId)?.name || '未知英雄';
    const getHeroIcon = heroId => {
      const name = getHero(heroId)?.name;
      return name ? getHeroIconUrl(name) : '';
    };
    const markHeroIconFailed = heroId => {
      const next = new Set(failedHeroIcons.value);
      next.add(heroId);
      failedHeroIcons.value = next;
    };
    const selectedHero = computed(() => playerHeroes.value.find(h => h.heroId === selectedHeroId.value) || null);
    // 使用占比条：以使用时长最高的英雄为 100%
    const heroUsagePct = hero => {
      const max = Math.max(...playerHeroes.value.map(h => h.usageSeconds), 0);
      return max ? Math.round((hero.usageSeconds / max) * 100) : 0;
    };

    // 英雄数据 tab：该英雄全部使用选手的数据（用于排名与展开榜单），按英雄缓存
    const heroPlayersByHero = ref({});
    const expandedHeroMetric = ref(null);
    const ensureHeroPlayers = async (heroId) => {
      if (!heroId || !currentSeasonId.value || heroPlayersByHero.value[heroId]) return;
      try {
        const res = await apiService.getHeroPlayersData({ seasonId: currentSeasonId.value, heroId });
        heroPlayersByHero.value = { ...heroPlayersByHero.value, [heroId]: toArray(res) };
      } catch {
        heroPlayersByHero.value = { ...heroPlayersByHero.value, [heroId]: [] };
      }
    };
    watch(selectedHeroId, (id) => {
      expandedHeroMetric.value = null;
      ensureHeroPlayers(id);
    });

    const HERO_METRIC_DEFS = [
      { key: 'fb', label: '最后一击 / 10min', field: 'finalBlowsPer10', lower: false, fmt: v => formatNumber(v) },
      { key: 'ult', label: '大招充能时间', field: 'avgUltChargeSeconds', lower: true, fmt: v => `${Math.round(v)} 秒` },
      { key: 'fbd', label: '最后一击 / 死亡', field: 'fbPerDeath', lower: false, fmt: v => formatNumber(v) }
    ];

    // 三项英雄指标：横向展示，右侧排名基于本赛季所有使用该英雄的选手
    const heroMetrics = computed(() => {
      const hero = selectedHero.value;
      if (!hero) return [];
      const players = heroPlayersByHero.value[hero.heroId] || [];
      return HERO_METRIC_DEFS
        .filter(def => hero[def.field] !== null && hero[def.field] !== undefined)
        .map(def => {
          const myValue = Number(hero[def.field]);
          const ranked = players.filter(p => p[def.field] !== null && p[def.field] !== undefined);
          const better = ranked.filter(p => def.lower ? Number(p[def.field]) < myValue : Number(p[def.field]) > myValue).length;
          return {
            ...def,
            display: def.fmt(myValue),
            rank: ranked.length ? better + 1 : null,
            total: ranked.length
          };
        });
    });

    const toggleHeroMetric = (key) => {
      expandedHeroMetric.value = expandedHeroMetric.value === key ? null : key;
    };

    const expandedHeroLeaderboard = computed(() => {
      const hero = selectedHero.value;
      const def = HERO_METRIC_DEFS.find(d => d.key === expandedHeroMetric.value);
      if (!hero || !def) return [];
      const players = heroPlayersByHero.value[hero.heroId] || [];
      return players
        .filter(p => p[def.field] !== null && p[def.field] !== undefined)
        .sort((a, b) => def.lower ? Number(a[def.field]) - Number(b[def.field]) : Number(b[def.field]) - Number(a[def.field]))
        .map((p, index) => ({
          rank: index + 1,
          playerId: p.playerId || null,
          name: p.playerName || `选手#${p.playerId}`,
          teamName: getTeamName(p.teamId),
          value: def.fmt(Number(p[def.field])),
          isSelf: String(p.playerId) === playerId.value
        }));
    });
    const seasonStandings = ref({});

    // 赛季轨迹：所属队伍在该赛季积分榜的最终名次（排序规则与积分榜一致：大场胜场 → 小分净胜）
    const historyBars = computed(() => {
      const items = normalizedHistory.value.slice(-6).map(item => {
        const seasonName = item.season?.name || `赛季 ${item.seasonId}`;
        const teamId = item.team?.id ?? item.teamId ?? null;
        const standings = [...(seasonStandings.value[String(item.seasonId)] || [])]
          .sort((a, b) => (number(b.matchWin) - number(a.matchWin)) || (number(b.mapDiff) - number(a.mapDiff)));
        const index = standings.findIndex(row => String(row.teamId ?? row.team?.id) === String(teamId));
        const rank = index >= 0 ? index + 1 : null;
        return {
          id: item.seasonId,
          name: seasonName,
          rank,
          total: standings.length,
          value: rank ? `第 ${rank} 名` : '—'
        };
      });
      return items.map(item => ({
        ...item,
        height: item.rank && item.total ? Math.max(12, ((item.total - item.rank + 1) / item.total) * 100) : 4
      }));
    });

    const careerMinutes = computed(() => Math.round(seasonHistory.value.reduce((sum, item) => sum + number(item.gameTime), 0)));
    const recentMaps = computed(() => profile.value?.recentMaps || []);

    // 按比赛去重：recentMaps 是逐图记录，同一场比赛只保留第一条
    const recentMatches = computed(() => {
      const seen = new Map();
      for (const item of recentMaps.value) {
        if (!item.matchId || seen.has(item.matchId)) continue;
        seen.set(item.matchId, item);
      }
      return [...seen.values()];
    });

    const matchScoreLabel = match => {
      const isTeam1 = String(match.matchTeam1Id) === String(match.teamId);
      const mine = isTeam1 ? match.matchTeam1Score : match.matchTeam2Score;
      const theirs = isTeam1 ? match.matchTeam2Score : match.matchTeam1Score;
      if (mine === null || mine === undefined || theirs === null || theirs === undefined) return '- : -';
      return `${mine} : ${theirs}`;
    };
    const getMatchResultLabel = match => !match.matchWinnerId ? '—' : String(match.matchWinnerId) === String(match.teamId) ? '胜' : '负';
    const getMatchResultClass = match => !match.matchWinnerId ? 'is-unknown' : String(match.matchWinnerId) === String(match.teamId) ? 'is-win' : 'is-loss';

    const getTeamName = teamId => store.state.teams.find(item => String(item.id) === String(teamId))?.name || '未知对手';
    const getTeamLogo = teamId => store.state.teams.find(item => String(item.id) === String(teamId))?.logo || 'https://owmini.xyz/images/tbd.png';
    const formatDate = value => {
      if (!value) return '--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };
    const getResultLabel = map => !map.winnerId ? '—' : String(map.winnerId) === String(map.teamId) ? '胜' : '负';
    const getResultClass = map => !map.winnerId ? 'is-unknown' : String(map.winnerId) === String(map.teamId) ? 'is-win' : 'is-loss';

    const loadSeason = async seasonId => {
      const [profileResponse, seasonResponse, heroesResponse] = await Promise.all([
        apiService.getPlayerProfile(playerId.value, seasonId ? { seasonId } : undefined),
        seasonId ? apiService.getSeasonPlayerStats(seasonId) : Promise.resolve([]),
        seasonId
          ? apiService.getPlayerHeroesData({ seasonId, playerId: playerId.value }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] })
      ]);
      profile.value = profileResponse;
      player.value = profileResponse.player || player.value;
      seasonHistory.value = toArray(profileResponse.seasonHistory);
      seasonPeers.value = toArray(seasonResponse);
      currentStat.value = seasonPeers.value.find(item => String(item.playerId || item.player?.id) === playerId.value) || null;

      playerHeroes.value = toArray(heroesResponse);
      heroPlayersByHero.value = {};
      expandedHeroMetric.value = null;
      selectedHeroId.value = playerHeroes.value.length ? playerHeroes.value[0].heroId : null;
      if (activeTab.value === 'heroes' && !playerHeroes.value.length) {
        activeTab.value = 'overview';
      }

      const historySeasonIds = [...new Set(seasonHistory.value.map(item => item.seasonId).filter(Boolean))];
      const standingsEntries = await Promise.all(historySeasonIds.map(async id => {
        try {
          return [String(id), toArray(await apiService.getSeasonTeamScoreStats(id))];
        } catch {
          return [String(id), []];
        }
      }));
      seasonStandings.value = Object.fromEntries(standingsEntries);
    };

    const loadData = async () => {
      const startTime = performance.now();
      isLoading.value = true;
      errorMessage.value = '';
      try {
        if (!playerId.value) throw new Error('缺少选手 ID');
        if (!store.state.players.length || !store.state.teams.length || !store.state.seasons.length) {
          await store.dispatch('loadBaseData');
        }

        await loadSeason(currentSeasonId.value || null);
        if (!currentSeasonId.value && availableSeasons.value.length) {
          currentSeasonId.value = String(availableSeasons.value[0].id);
          await loadSeason(currentSeasonId.value);
        }
      } catch (error) {
        console.error('Failed to load player profile:', error);
        errorMessage.value = error?.response?.status === 404 ? '没有找到这名选手。' : '数据加载失败，请稍后重试。';
      } finally {
        isLoading.value = false;
        trackPerformance('选手个人页加载', performance.now() - startTime, {
          playerId: playerId.value,
          seasonId: currentSeasonId.value
        }, route);
      }
    };

    const selectSeason = async seasonId => {
      if (!seasonId || String(seasonId) === String(currentSeasonId.value)) return;
      currentSeasonId.value = String(seasonId);
      await router.replace({ query: { ...route.query, seasonId: String(seasonId) } });
      isLoading.value = true;
      try {
        await loadSeason(seasonId);
        trackPublicEvent('选手个人页-切换赛季', { playerId: playerId.value, seasonId }, route);
      } catch (error) {
        errorMessage.value = '赛季数据加载失败，请稍后重试。';
      } finally {
        isLoading.value = false;
      }
    };

    const goBack = () => {
      trackPublicEvent('选手个人页-返回上一页', { playerId: playerId.value, seasonId: currentSeasonId.value }, route);
      if (route.query.from) {
        router.back();
      } else {
        router.push({ path: '/visualize', query: currentSeasonId.value ? { seasonId: currentSeasonId.value } : {} });
      }
    };

    const goToTeamDetail = () => {
      if (!currentTeam.value?.id) return;
      router.push({
        path: '/visualize/team-detail',
        query: { teamId: String(currentTeam.value.id), seasonId: currentSeasonId.value, from: 'player-detail' }
      });
    };

    const goToMatchDetail = map => {
      if (!map.matchId) return;
      router.push({
        path: '/visualize/match-detail',
        query: {
          matchId: String(map.matchId),
          seasonId: currentSeasonId.value,
          from: 'player-detail',
          team1Id: String(map.teamId || ''),
          team2Id: String(map.opponentId || '')
        }
      });
    };

    // 榜单里其他选手的名字 → 该选手的详情页（同赛季）；本人行不跳
    const goToPeerDetail = row => {
      if (!row?.playerId || row.isSelf) return;
      router.push({
        path: '/visualize/player-detail',
        query: {
          playerId: String(row.playerId),
          seasonId: currentSeasonId.value,
          from: 'player-detail'
        }
      });
    };

    const fitPlayerName = async () => {
      await nextTick();
      const element = playerNameElement.value;
      if (!element) return;

      element.classList.remove('is-multiline');
      element.style.removeProperty('--fitted-player-name-size');

      const availableWidth = element.clientWidth;
      const maxFontSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      if (!availableWidth || !maxFontSize || element.scrollWidth <= availableWidth) return;

      const minimumFontSize = 14;
      let lowerBound = minimumFontSize;
      let upperBound = maxFontSize;
      let fittedSize = minimumFontSize;

      while (upperBound - lowerBound > 0.25) {
        const candidate = (lowerBound + upperBound) / 2;
        element.style.setProperty('--fitted-player-name-size', `${candidate}px`);
        if (element.scrollWidth <= availableWidth) {
          fittedSize = candidate;
          lowerBound = candidate;
        } else {
          upperBound = candidate;
        }
      }

      element.style.setProperty('--fitted-player-name-size', `${fittedSize.toFixed(2)}px`);
      if (element.scrollWidth > availableWidth) element.classList.add('is-multiline');
    };

    watch(
      [() => player.value?.name, isLoading],
      ([, loading]) => {
        if (!loading) fitPlayerName();
      },
      { flush: 'post' }
    );

    onMounted(() => {
      loadData();
      window.addEventListener('resize', fitPlayerName);
    });

    onBeforeUnmount(() => window.removeEventListener('resize', fitPlayerName));

    return {
      isLoading,
      activeTab,
      detailTabs,
      switchTab,
      errorMessage,
      player,
      roleLabel,
      roleCode,
      roleIconUrl,
      currentTeam,
      teamLogo,
      availableSeasons,
      currentSeasonId,
      playerNameElement,
      currentSeasonName,
      peerRanks,
      peerSampleLabel,
      expandedMetric,
      toggleMetricRank,
      metricLeaderboard,
      playerHeroes,
      selectedHeroId,
      hasHeroData,
      selectedHero,
      failedHeroIcons,
      getHeroName,
      getHeroIcon,
      markHeroIconFailed,
      heroUsagePct,
      heroMetrics,
      expandedHeroMetric,
      toggleHeroMetric,
      expandedHeroLeaderboard,
      historyBars,
      seasonHistory,
      careerMinutes,
      recentMaps,
      recentMatches,
      matchScoreLabel,
      getMatchResultLabel,
      getMatchResultClass,
      selectSeason,
      goBack,
      goToTeamDetail,
      goToMatchDetail,
      goToPeerDetail,
      getTeamName,
      getTeamLogo,
      formatDate,
      formatNumber,
      getResultLabel,
      getResultClass
    };
  }
};
</script>

<style scoped>
.player-detail-page {
  min-height: 100vh;
  background: #fafafa;
  color: var(--vis-text-primary);
  font-family: var(--vis-font-body);
}

button {
  font: inherit;
}

.detail-container {
  width: min(1240px, calc(100% - 64px));
  margin: 0 auto;
  padding-bottom: 64px;
}

.team-link,
.season-button,
.state-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--vis-text-secondary);
  cursor: pointer;
  transition: color var(--vis-dur-fast) var(--vis-ease), transform var(--vis-dur-fast) var(--vis-ease);
}

.team-link:hover {
  color: var(--vis-accent);
}

.team-link:active {
  transform: translateY(1px);
}

.team-link:focus-visible,
.season-button:focus-visible,
.recent-match-card:focus-visible,
.state-action:focus-visible {
  outline: 2px solid var(--vis-accent);
  outline-offset: 3px;
}

.player-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  overflow: hidden;
  padding: 64px 40px 20px;
  background-color: #fff4e6;
  background-image:
    radial-gradient(56% 130% at 88% 112%, rgba(255, 106, 0, 0.08), rgba(255, 106, 0, 0) 62%),
    repeating-linear-gradient(115deg, rgba(17, 17, 17, 0.03) 0, rgba(17, 17, 17, 0.03) 1px, transparent 1px, transparent 13px),
    linear-gradient(135deg, #ffffff 0%, #fffaf3 55%, #fff4e6 100%);
  border-radius: 0;
  color: #111;
  isolation: isolate;
}

.player-hero::after {
  position: absolute;
  inset: auto 0 0;
  width: auto;
  height: 3px;
  background: var(--vis-primary-gradient);
  content: '';
}

.hero-grid {
  display: none;
}

.hero-role-mark {
  position: absolute;
  right: -12px;
  bottom: -45px;
  z-index: -1;
  color: transparent;
  font-family: var(--vis-font-heading);
  font-size: clamp(150px, 20vw, 260px);
  font-weight: 900;
  letter-spacing: -0.08em;
  line-height: 1;
  opacity: 1;
  -webkit-text-stroke: 1px rgba(255, 106, 0, 0.14);
}

.hero-topline {
  position: absolute;
  top: 24px;
  right: 40px;
  left: 40px;
  bottom: auto;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  pointer-events: none;
}

.identity-block {
  position: relative;
  z-index: 1;
  width: min(100%, 800px);
  align-self: auto;
  min-width: 0;
  text-align: center;
}

.identity-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  pointer-events: auto;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.role-chip {
  gap: 7px;
  background: #111;
  color: #fff;
}

.role-chip img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.identity-block h1 {
  --player-name-max-size: clamp(44px, 6vw, 72px);

  width: 100%;
  max-width: none;
  margin: 0 auto;
  color: #111;
  font-family: var(--vis-font-display);
  font-size: var(--fitted-player-name-size, var(--player-name-max-size));
  font-style: normal;
  font-weight: 900;
  letter-spacing: -0.045em;
  line-height: 1;
  text-transform: none;
  white-space: nowrap;
}

.identity-block h1.is-multiline {
  overflow-wrap: anywhere;
  white-space: normal;
}

.team-link {
  width: fit-content;
  max-width: min(240px, 42vw);
  min-height: 40px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  color: #606266;
  font-family: var(--vis-font-display);
  font-size: 14px;
  font-weight: 700;
  pointer-events: auto;
}

.team-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-link img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.team-link.is-static {
  cursor: default;
}

.season-control {
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  align-self: auto;
  margin-top: 2px;
}

.season-label {
  display: none;
}

.season-button {
  justify-content: space-between;
  min-width: 164px;
  min-height: 32px;
  padding: 0 13px;
  border: 1px solid rgba(17, 17, 17, 0.06);
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.05);
  color: #606266;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(8px);
}

.season-button:hover {
  border-color: rgba(17, 17, 17, 0.1);
  background: rgba(17, 17, 17, 0.08);
  color: #111;
}

.sample-note,
.trajectory-summary span {
  color: var(--vis-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(340px, 0.82fr);
  gap: 24px;
  margin-top: 20px;
}

.player-detail-tabs {
  margin-top: 20px;
}

.player-tab-panel {
  width: 100%;
  animation: tabPanelIn 0.24s var(--vis-ease) both;
}

@keyframes tabPanelIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.content-section {
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.section-kicker,
.state-kicker {
  display: block;
  margin-top: 4px;
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-display);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.section-heading > div {
  display: flex;
  flex-direction: column-reverse;
}

.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: var(--vis-text-strong);
  font-family: var(--vis-font-body);
  font-size: 18px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.section-heading h2::before {
  width: 4px;
  height: 17px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  content: '';
  transform: skewX(var(--vis-slant));
}

.role-sample-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role-sample-note img {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  filter: brightness(0);
  object-fit: contain;
  opacity: 0.58;
}

.benchmark-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.benchmark-row {
  display: grid;
  grid-template-columns: 118px minmax(90px, 1fr) 64px;
  align-items: center;
  gap: 14px;
}

.benchmark-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.benchmark-copy span,
.benchmark-rank {
  color: var(--vis-text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.benchmark-copy strong {
  color: var(--vis-text-strong);
  font-family: var(--vis-font-numeric);
  font-size: 16px;
  font-style: italic;
}

.benchmark-track {
  position: relative;
  height: 5px;
  background: var(--vis-bg-muted);
  border-radius: 10px;
}

.benchmark-track span {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #111 0%, #303133 62%, #ff6a00 100%);
}

.benchmark-track i {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--vis-accent);
  box-shadow: 0 0 0 1px rgba(255, 106, 0, 0.32);
  transform: translate(-50%, -50%);
}

.benchmark-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.benchmark-rank {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: right;
  white-space: nowrap;
  transition: color 0.18s var(--vis-ease);
}

.benchmark-rank:hover {
  color: var(--vis-accent);
}

.chev {
  width: 9px;
  height: 6px;
  flex: 0 0 auto;
  color: var(--vis-text-tertiary);
  transition: transform 0.2s var(--vis-ease), color 0.18s var(--vis-ease);
}

.benchmark-rank:hover .chev,
.ph-stat-rank:hover .chev {
  color: var(--vis-accent);
}

.chev.is-open {
  transform: rotate(180deg);
}

.metric-leaderboard {
  display: flex;
  flex-direction: column;
  padding: 4px 0 6px;
  border-top: 1px solid #f0f2f5;
}

.lb-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 11px;
}

.lb-rank {
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-weight: 700;
  text-align: center;
}

.lb-name {
  min-width: 0;
  overflow: hidden;
  color: #1a1a1a;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-team {
  color: var(--vis-text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.lb-value {
  color: #606266;
  font-family: var(--vis-font-numeric);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.lb-row.is-self .lb-rank,
.lb-row.is-self .lb-name,
.lb-row.is-self .lb-value {
  color: var(--vis-accent);
}

/* 可跳转的选手行：整行可点，但下划线只落在名字上；本人行保持高亮、不加下划线 */
.lb-row.is-link {
  cursor: pointer;
}

.lb-row.is-link .lb-name {
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.18);
  text-underline-offset: 3px;
}

.lb-row.is-link:active .lb-name {
  color: var(--vis-accent);
  text-decoration-color: var(--vis-accent);
}

/* 英雄数据 tab */
.ph-strip {
  display: flex;
  gap: 8px;
  margin: -4px -2px 0;
  padding: 4px 2px 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.ph-strip::-webkit-scrollbar {
  display: none;
}

.ph-hero {
  display: flex;
  flex: 0 0 auto;
  padding: 2px 2px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
}

.ph-hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  background: #eceff3;
  border-radius: 10px;
  opacity: 0.5;
  transition: opacity 0.18s var(--vis-ease), transform 0.18s var(--vis-ease);
}

.ph-hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ph-hero:hover .ph-hero-icon {
  opacity: 0.85;
}

.ph-hero.is-active {
  border-bottom-color: var(--vis-accent);
}

.ph-hero.is-active .ph-hero-icon {
  opacity: 1;
  transform: translateY(-1px);
}

.ph-hero-fallback {
  color: #909399;
  font-size: 14px;
  font-weight: 800;
}

.ph-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.ph-detail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.ph-detail-name {
  color: #111;
  font-size: 15px;
  font-weight: 800;
}

.ph-detail-meta {
  color: var(--vis-text-tertiary);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ph-usage-track {
  height: 3px;
  overflow: hidden;
  background: rgba(17, 17, 17, 0.07);
  border-radius: 2px;
}

.ph-usage-track span {
  display: block;
  height: 100%;
  background: var(--vis-primary-gradient, #111);
  border-radius: 2px;
}

.ph-stats {
  display: flex;
  gap: 14px;
  padding-top: 2px;
}

.ph-stat {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ph-stat-label {
  color: var(--vis-text-tertiary);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.3;
}

.ph-stat-value {
  color: #111;
  font-family: var(--vis-font-numeric);
  font-size: 17px;
  font-style: italic;
  font-variant-numeric: tabular-nums;
}

.ph-stat-rank {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
  border: 0;
  background: transparent;
  color: var(--vis-text-secondary);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.18s var(--vis-ease);
}

.ph-stat-rank:hover {
  color: var(--vis-accent);
}

.history-chart {
  display: grid;
  grid-template-columns: repeat(6, minmax(38px, 1fr));
  gap: 9px;
  min-height: 200px;
  padding-top: 12px;
}

.history-column {
  display: grid;
  grid-template-rows: 24px 118px auto;
  gap: 7px;
  min-width: 0;
  text-align: center;
}

.history-value {
  color: var(--vis-text-secondary);
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 700;
}

.history-bar-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 108px;
  border-bottom: 1px solid var(--vis-border);
}

.history-bar {
  width: min(28px, 68%);
  min-height: 4px;
  background: #dfe1e5;
  border-radius: 3px 3px 0 0;
  transition: height 320ms var(--vis-ease), background-color 180ms var(--vis-ease);
}

.history-column.active .history-bar {
  background: var(--vis-primary-gradient);
  box-shadow: 0 3px 10px rgba(255, 106, 0, 0.2);
}

.history-column.active .history-value {
  color: var(--vis-accent);
}

.history-label {
  align-self: start;
  color: var(--vis-text-tertiary);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.trajectory-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--vis-border);
}

.trajectory-summary div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.trajectory-summary strong {
  color: var(--vis-text-strong);
  font-family: var(--vis-font-numeric);
  font-size: 15px;
}

.recent-matches-panel {
  margin-top: 20px;
}

.recent-match-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.recent-match-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--vis-border);
  border-radius: 10px;
  background: var(--vis-bg-elevated, #fff);
  color: var(--vis-text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--vis-dur-fast) var(--vis-ease), transform var(--vis-dur-fast) var(--vis-ease), box-shadow var(--vis-dur-fast) var(--vis-ease);
}

.recent-match-card:hover {
  border-color: var(--vis-accent);
  box-shadow: 0 6px 18px rgba(17, 17, 17, 0.06);
}

.recent-match-card:active {
  transform: scale(0.99);
}

.match-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.match-date {
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-size: 11px;
  font-weight: 650;
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.match-team {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--vis-text-strong);
  font-size: 13px;
  font-weight: 700;
}

.match-team.is-opponent {
  justify-content: flex-end;
  text-align: right;
}

.match-team img {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  object-fit: contain;
}

.match-team span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-score {
  flex: 0 0 auto;
  font-family: var(--vis-font-numeric);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.result-cell {
  justify-self: end;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-family: var(--vis-font-display);
  font-size: 11px;
  font-weight: 800;
  line-height: 28px;
  text-align: center;
}

.result-cell.is-win {
  background: rgba(40, 167, 69, 0.1);
  color: var(--vis-success);
}

.result-cell.is-loss {
  background: rgba(220, 53, 69, 0.08);
  color: var(--vis-error);
}

.result-cell.is-unknown {
  background: var(--vis-bg-muted);
  color: var(--vis-text-tertiary);
}

.page-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 72vh;
  color: var(--vis-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--vis-border);
  border-top-color: var(--vis-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.error-state {
  flex-direction: column;
  padding: 40px 20px;
  text-align: center;
}

.error-state h1 {
  margin: 0;
  color: var(--vis-text-strong);
  font-family: var(--vis-font-display);
  font-size: 26px;
}

.error-state p {
  margin: 0 0 8px;
  color: var(--vis-text-secondary);
  font-weight: 500;
}

.state-action {
  justify-content: center;
  padding: 0 18px;
  border-radius: 8px;
  background: #111;
  color: #fff;
}

.inline-empty {
  display: grid;
  min-height: 144px;
  place-items: center;
  color: var(--vis-text-tertiary);
  font-size: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 960px) {
  .detail-container {
    width: min(100% - 40px, 880px);
  }

  .player-hero {
    min-height: 260px;
    padding: 36px 34px;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .player-detail-page {
    background: #fafafa;
  }

  .detail-container {
    --detail-topbar-gutter: 10px;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
    padding: 0 10px calc(36px + env(safe-area-inset-bottom));
  }

  .detail-container > * {
    min-width: 0;
    max-width: 100%;
  }

  .player-hero {
    order: 1;
    min-height: 196px;
    max-width: none;
    margin-right: -10px;
    margin-left: -10px;
    padding: 62px 18px 14px;
    border-radius: 0;
  }

  .player-hero::after {
    width: auto;
    height: 3px;
  }

  .hero-grid {
    background-size: 26px 26px;
  }

  .identity-block {
    align-self: auto;
    order: initial;
  }

  .identity-block h1 {
    --player-name-max-size: clamp(42px, 13vw, 54px);

    max-width: calc(100vw - 56px);
    line-height: 1;
  }

  .team-link {
    min-height: 40px;
    max-width: 47vw;
    margin: 0;
    font-size: 13px;
  }

  .team-link img {
    width: 22px;
    height: 22px;
  }

  .season-control {
    align-items: center;
    justify-content: center;
    order: initial;
    width: auto;
    gap: 0;
    margin-top: 0;
  }

  .season-label {
    padding-bottom: 0;
    font-size: 10px;
  }

  .season-button {
    min-width: 156px;
    width: auto;
    min-height: 34px;
    padding: 0 11px;
    font-size: 11px;
  }

  .season-button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hero-role-mark {
    right: -4px;
    bottom: -18px;
    font-size: 124px;
  }

  .hero-topline {
    top: 14px;
    right: 16px;
    left: 18px;
    gap: 12px;
  }

  .player-detail-tabs {
    width: auto;
    max-width: none;
    margin-right: -10px;
    order: 3;
    margin-top: 2px;
    margin-left: -10px;
  }

  .player-tab-panel {
    order: 4;
  }

  .recent-section {
    margin-top: 14px;
  }

  .content-grid {
    gap: 14px;
    margin-top: 14px;
  }

  .content-section {
    padding: 0;
  }

  .section-heading {
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 17px;
  }

  .section-heading h2 {
    font-size: 18px;
  }

  .sample-note {
    max-width: 46%;
    padding-top: 3px;
    font-size: 10px;
    line-height: 1.35;
    text-align: right;
  }

  .benchmark-list {
    gap: 16px;
  }

  .benchmark-row {
    grid-template-columns: 88px minmax(68px, 1fr) 54px;
    gap: 9px;
  }

  .benchmark-copy span,
  .benchmark-rank {
    font-size: 10px;
  }

  .benchmark-copy strong {
    font-size: 15px;
  }

  .benchmark-track {
    height: 4px;
  }

  .history-chart {
    gap: 4px;
    min-height: 176px;
    padding-top: 6px;
  }

  .history-column {
    grid-template-rows: 20px 96px auto;
  }

  .history-bar-wrap {
    min-height: 92px;
  }

  .history-value,
  .history-label {
    font-size: 9px;
  }

  .trajectory-summary {
    margin-top: 12px;
  }

  .recent-match-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 380px) {
  .detail-container {
    --detail-topbar-gutter: 8px;
    padding-right: 8px;
    padding-left: 8px;
  }

  .player-hero {
    min-height: 190px;
    max-width: none;
    margin-right: -8px;
    margin-left: -8px;
    padding-right: 15px;
    padding-left: 15px;
  }

  .identity-block h1 {
    --player-name-max-size: 50px;
  }

  .season-button {
    width: auto;
  }

  .content-section {
    padding: 0;
  }

  .benchmark-row {
    grid-template-columns: 82px minmax(58px, 1fr) 50px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-tab-panel {
    animation: none;
  }
  .loading-spinner {
    animation-duration: 1.8s;
  }

  .history-bar,
  .back-btn,
  .team-link,
  .season-button,
  .recent-match-card {
    transition: none;
  }
}
</style>
