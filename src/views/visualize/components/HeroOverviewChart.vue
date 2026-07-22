<template>
  <div class="hero-overview-chart">
    <div v-if="rows.length" class="hero-filters">
      <ContentChoiceGroup
        :model-value="roleFilter"
        :items="roleOptions"
        hide-label
        compact
        aria-label="职责筛选"
        @update:model-value="roleFilter = $event"
      />
      <ContentChoiceGroup
        v-if="sortOptions.length > 1"
        :model-value="sortBy"
        :items="sortOptions"
        hide-label
        compact
        aria-label="英雄数据排序"
        @update:model-value="sortBy = $event"
      />
    </div>

    <div v-if="loading" class="status-text">数据加载中…</div>
    <div v-else-if="!rows.length" class="status-text">本赛季暂无英雄明细数据</div>

    <template v-else>
      <div class="hero-rows">
        <div v-for="row in displayedRows" :key="row.heroId" class="hero-item">
          <button
            type="button"
            class="hero-row"
            :class="{ 'not-expandable': !canExpand(row) }"
            @click="toggleExpand(row)"
          >
            <div class="hero-icon">
              <img
                v-if="row.iconUrl && !row.iconFailed"
                :src="row.iconUrl"
                :alt="row.heroName"
                loading="lazy"
                @error="row.iconFailed = true"
              />
              <span v-else class="hero-icon-fallback">{{ row.heroName.slice(0, 1) }}</span>
            </div>
            <div class="hero-main">
              <div class="hero-line1">
                <span class="hero-name">{{ row.heroName }}</span>
                <span v-if="row.subRole" class="hero-subrole">{{ row.subRole }}</span>
                <span class="hero-primary-metric">{{ primaryMetricText(row) }}</span>
              </div>
              <div v-if="hasPickData" class="hero-line2">
                <div class="metric-bar-track">
                  <div class="metric-bar-fill" :style="{ width: barWidthPct(row) + '%' }"></div>
                </div>
              </div>
            </div>
            <el-icon v-if="canExpand(row)" class="expand-icon" :class="{ expanded: isExpanded(row.heroId) }"><ArrowDown /></el-icon>
          </button>

          <div v-if="isExpanded(row.heroId)" class="hero-detail">
            <div v-if="row.playersLoading" class="detail-status">加载中…</div>
            <div v-else-if="row.players && row.players.length" class="player-ranks">
              <div
                class="player-metric-tabs"
                role="radiogroup"
                aria-label="选手排名维度"
                :style="{ '--metric-count': row.playerMetricOptions.length }"
              >
                <span class="player-metric-spacer" aria-hidden="true"></span>
                <button
                  v-for="opt in row.playerMetricOptions"
                  :key="opt.value"
                  type="button"
                  class="player-metric-tab"
                  :class="{ 'is-active': row.playerSortBy === opt.value }"
                  role="radio"
                  :aria-checked="row.playerSortBy === opt.value"
                  @click="row.playerSortBy = opt.value"
                ><span aria-hidden="true"></span>{{ opt.label }}</button>
              </div>
              <div
                v-for="(player, idx) in sortedPlayers(row)"
                :key="player.playerId"
                class="player-rank-row"
                :style="{ '--metric-count': row.playerMetricOptions.length }"
                role="link"
                tabindex="0"
                @click="goToPlayerDetail(player)"
                @keydown.enter.prevent="goToPlayerDetail(player)"
              >
                <div class="player-id">
                  <span class="rank-no" :class="{ 'rank-top': idx < 3 }">{{ idx + 1 }}</span>
                  <span class="player-name">{{ player.playerName }}</span>
                  <span v-if="player.teamName" class="player-team">{{ player.teamName }}</span>
                </div>
                <span
                  v-for="opt in row.playerMetricOptions"
                  :key="opt.value"
                  class="player-cell"
                  :class="{ 'is-sort-metric': row.playerSortBy === opt.value }"
                >{{ playerCellText(player, opt.value) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!expanded && filteredSortedRows.length > COLLAPSED_COUNT" class="expand-toggle" @click="expanded = true">
        展开全部 {{ filteredSortedRows.length }} 位英雄
      </div>
      <div v-else-if="expanded && filteredSortedRows.length > COLLAPSED_COUNT" class="expand-toggle" @click="expanded = false">
        收起
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import apiService from '@/services/api';
import ContentChoiceGroup from './ContentChoiceGroup.vue';
import { getHeroIconUrl } from '@/utils/heroIcons';

const COLLAPSED_COUNT = 12;

export default {
  name: 'HeroOverviewChart',
  components: {
    ArrowDown,
    ContentChoiceGroup
  },
  props: {
    seasonId: {
      type: [String, Number],
      default: ''
    }
  },
  setup(props) {
    const store = useStore();
    const router = useRouter();
    const rows = ref([]);
    const loading = ref(false);
    const sortBy = ref('winRate');
    const roleFilter = ref('all');
    const expanded = ref(false);
    const expandedHeroIds = ref(new Set());

    const roleOptions = [
      { value: 'all', label: '全部' },
      { value: 'tank', label: '重装' },
      { value: 'damage', label: '输出' },
      { value: 'support', label: '支援' }
    ];

    // 本赛季是否有任何选用数据（选用/胜率排序 tab 与卡片进度条的门控；没有时只按禁用排）
    const hasPickData = computed(() => rows.value.some(r => (Number(r.mapsAppeared) || 0) > 0));

    // 排序 tab：按胜率第一、按禁用最后；没有选用数据时只保留按禁用
    const sortOptions = computed(() => {
      if (!hasPickData.value) return [{ value: 'ban', label: '按禁用' }];
      return [
        { value: 'winRate', label: '按胜率' },
        { value: 'pick', label: '按选用' },
        { value: 'ban', label: '按禁用' }
      ];
    });

    const load = async () => {
      if (!props.seasonId) {
        rows.value = [];
        return;
      }
      loading.value = true;
      try {
        const res = await apiService.getHeroOverviewData({ seasonId: props.seasonId });
        const list = Array.isArray(res?.data) ? res.data : [];
        rows.value = list.map(item => ({
          ...item,
          pickRate: Number(item.pickRate) || 0,
          banRate: Number(item.banRate) || 0,
          winRate: Number(item.winRate) || 0,
          finalBlowsPer10: Number(item.finalBlowsPer10) || 0,
          iconUrl: getHeroIconUrl(item.heroName),
          iconFailed: false,
          players: null,
          playersLoading: false,
          playerMetricOptions: [],
          playerSortBy: 'fb'
        }));
        expandedHeroIds.value = new Set();
        // 默认按胜率排；本赛季没有选用数据时回落到按禁用
        sortBy.value = hasPickData.value ? 'winRate' : 'ban';
      } catch (error) {
        console.error('获取英雄总览数据失败:', error);
        rows.value = [];
      } finally {
        loading.value = false;
      }
    };

    // 排序维度决定展示集合：按禁用只列被禁过的英雄；按选用/胜率只列上过场的英雄
    const filteredSortedRows = computed(() => {
      let list = rows.value;
      if (sortBy.value === 'ban') {
        list = list.filter(r => (Number(r.banCount) || 0) > 0);
      } else {
        list = list.filter(r => (Number(r.mapsAppeared) || 0) > 0);
      }
      if (roleFilter.value !== 'all') {
        list = list.filter(r => r.role === roleFilter.value);
      }
      list = [...list];
      if (sortBy.value === 'pick') {
        list.sort((a, b) => (b.mapsAppeared - a.mapsAppeared) || (b.pickCount - a.pickCount));
      } else if (sortBy.value === 'winRate') {
        list.sort((a, b) => (b.winRate - a.winRate) || (b.pickCount - a.pickCount));
      } else {
        list.sort((a, b) => (b.banCount - a.banCount) || (b.mapsAppeared - a.mapsAppeared));
      }
      return list;
    });

    const displayedRows = computed(() => {
      if (expanded.value) return filteredSortedRows.value;
      return filteredSortedRows.value.slice(0, COLLAPSED_COUNT);
    });

    const maxMetric = computed(() => {
      const list = filteredSortedRows.value;
      if (!list.length) return 0;
      if (sortBy.value === 'pick') return Math.max(...list.map(r => r.pickRate), 0);
      if (sortBy.value === 'winRate') return Math.max(...list.map(r => r.winRate), 0);
      return Math.max(...list.map(r => r.banRate), 0);
    });

    const metricOf = (row) => {
      if (sortBy.value === 'pick') return row.pickRate;
      if (sortBy.value === 'winRate') return row.winRate;
      return row.banRate;
    };

    const barWidthPct = (row) => {
      const max = maxMetric.value;
      if (!max) return 0;
      return Math.max(2, (metricOf(row) / max) * 100);
    };

    const pct = (v) => `${((Number(v) || 0) * 100).toFixed(0)}%`;

    const primaryMetricText = (row) => {
      if (sortBy.value === 'pick') return `选用 ${pct(row.pickRate)}`;
      if (sortBy.value === 'winRate') return `胜率 ${pct(row.winRate)}`;
      return `禁用 ${row.banCount}`;
    };

    // ---- 展开：英雄 → 选手数据排名（懒加载 + 缓存） ----
    // 没有选用记录的英雄（pickCount = 0）不可能有选手使用，直接不可展开
    const canExpand = (row) => (Number(row.pickCount) || 0) > 0;

    const isExpanded = (heroId) => expandedHeroIds.value.has(heroId);

    const resolveTeamName = (teamId) => {
      const team = store.getters.getTeamById
        ? store.getters.getTeamById(teamId)
        : (store.state.teams || []).find(t => Number(t.id) === Number(teamId));
      return team?.name || '';
    };

    const PLAYER_METRIC_DEFS = [
      { value: 'fb', label: '最后一击/10min' },
      { value: 'ult', label: '大招充能时间' },
      { value: 'ratio', label: '最后一击/死亡' }
    ];

    // 选手在某维度上的可排序值；无数据返回 null（排序时沉底）
    const playerMetricValue = (player, key) => {
      if (key === 'fb') {
        return (Number(player.finalBlows) || 0) > 0 ? Number(player.finalBlowsPer10) || 0 : null;
      }
      if (key === 'ult') {
        return player.avgUltChargeSeconds !== null && player.avgUltChargeSeconds !== undefined
          ? Number(player.avgUltChargeSeconds)
          : null;
      }
      return player.fbPerDeath !== null && player.fbPerDeath !== undefined
        ? Number(player.fbPerDeath)
        : null;
    };

    // 单元格展示值；无数据留空
    const playerCellText = (player, key) => {
      const v = playerMetricValue(player, key);
      if (v === null) return '';
      if (key === 'fb') return v.toFixed(1);
      if (key === 'ult') return `${Math.round(v)} 秒`;
      return v.toFixed(2);
    };

    const sortedPlayers = (row) => {
      const key = row.playerSortBy;
      return [...(row.players || [])].sort((a, b) => {
        const va = playerMetricValue(a, key);
        const vb = playerMetricValue(b, key);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return vb - va;
      });
    };

    const toggleExpand = async (row) => {
      if (!canExpand(row)) return;
      const next = new Set(expandedHeroIds.value);
      if (next.has(row.heroId)) {
        next.delete(row.heroId);
        expandedHeroIds.value = next;
        return;
      }
      next.add(row.heroId);
      expandedHeroIds.value = next;

      if (row.players !== null || row.playersLoading) return;
      row.playersLoading = true;
      try {
        const res = await apiService.getHeroPlayersData({ seasonId: props.seasonId, heroId: row.heroId });
        const players = (Array.isArray(res?.data) ? res.data : []).map(p => ({
          ...p,
          teamName: resolveTeamName(p.teamId)
        }));
        // 指标级门控：该英雄所有选手都没有的维度不生成对应列
        const available = [];
        if (players.some(p => (Number(p.finalBlows) || 0) > 0)) available.push('fb');
        if (players.some(p => p.avgUltChargeSeconds !== null && p.avgUltChargeSeconds !== undefined)) available.push('ult');
        if (players.some(p => p.fbPerDeath !== null && p.fbPerDeath !== undefined)) available.push('ratio');
        row.playerMetricOptions = PLAYER_METRIC_DEFS.filter(d => available.includes(d.value));
        row.playerSortBy = available[0] || 'fb';
        row.players = players;
      } catch (error) {
        console.error('获取英雄选手数据失败:', error);
        row.players = [];
      } finally {
        row.playersLoading = false;
      }
    };

    watch(() => props.seasonId, load);
    onMounted(load);

    // 展开榜单里的选手行 → 选手详情页（同赛季）
    const goToPlayerDetail = (player) => {
      const playerId = player?.playerId;
      if (!playerId || !props.seasonId) return;
      router.push({
        path: '/visualize/player-detail',
        query: {
          playerId: String(playerId),
          seasonId: String(props.seasonId),
          from: 'visualize'
        }
      });
    };

    return {
      rows,
      loading,
      sortBy,
      sortOptions,
      roleFilter,
      roleOptions,
      expanded,
      COLLAPSED_COUNT,
      hasPickData,
      filteredSortedRows,
      displayedRows,
      barWidthPct,
      pct,
      primaryMetricText,
      canExpand,
      isExpanded,
      toggleExpand,
      sortedPlayers,
      playerCellText,
      goToPlayerDetail
    };
  }
};
</script>

<style scoped>
.hero-overview-chart {
  position: relative;
}

/* 筛选区与主分类 tab 一样贴页面左右边（抵消父级 32px 内边距），两组 tab 之间无缝相贴 */
.hero-filters {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: -20px -32px 10px;
}

.status-text {
  padding: 40px 0;
  text-align: center;
  color: #909399;
  font-size: 14px;
  font-weight: 600;
}

.hero-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-item {
  border-radius: 8px;
  transition: background 0.2s;
}

.hero-item:hover {
  background: rgba(17, 17, 17, 0.03);
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.hero-row.not-expandable {
  cursor: default;
}

.hero-icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(16, 21, 28, 0.12);
}

.hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-icon-fallback {
  font-size: 16px;
  font-weight: 800;
  color: #909399;
}

.hero-main {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-line1 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.hero-name {
  font-size: 14px;
  font-weight: 800;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-subrole {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 0 4px;
  line-height: 16px;
}

.hero-primary-metric {
  flex: 0 0 auto;
  margin-left: auto;
  font-family: var(--vis-font-numeric);
  font-size: 13px;
  font-weight: 800;
  color: #ff6a00;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.hero-line2 {
  margin-bottom: 4px;
}

.metric-bar-track {
  height: 5px;
  border-radius: 3px;
  background: #f0f2f5;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #ff9e0f 0%, #ff6a00 100%);
  transition: width 0.4s var(--vis-ease, ease);
}

.expand-icon {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #eef0f4;
  font-size: 14px;
  color: #606266;
  transition: transform 0.25s var(--vis-ease, ease), background-color 0.18s var(--vis-ease, ease), color 0.18s var(--vis-ease, ease);
}

.expand-icon.expanded {
  transform: rotate(180deg);
  color: #ff6a00;
  background: rgba(255, 106, 0, 0.12);
}

/* 展开：选手数据排名 */
.hero-detail {
  padding: 6px 8px 10px 60px;
}

.detail-status {
  font-size: 12px;
  color: #c0c4cc;
  padding: 4px 0;
}

.player-ranks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 维度表头与数据行共用同一网格：左侧选手名列 + 右侧等宽数据列 */
.player-metric-tabs,
.player-rank-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(var(--metric-count, 3), 60px);
  column-gap: 5px;
}

.player-metric-tabs {
  align-items: end;
  border-bottom: 1px solid var(--vis-border, #e3e6eb);
}

.player-metric-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  padding: 3px 2px 5px;
  border: 0;
  background: transparent;
  color: var(--vis-text-tertiary, #909399);
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
  transition: color 0.18s var(--vis-ease, ease);
}

.player-metric-tab > span {
  flex: 0 0 auto;
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: #c6cbd3;
  transform: skewX(-16deg);
  transition: background-color 0.18s var(--vis-ease, ease), transform 0.18s var(--vis-ease, ease);
}

.player-metric-tab:hover:not(.is-active) {
  color: #111;
}

.player-metric-tab.is-active {
  color: #111;
}

.player-metric-tab.is-active > span {
  background: var(--vis-accent, #ff6a00);
  transform: skewX(-16deg) scaleY(1.8);
}

.player-rank-row {
  align-items: baseline;
  padding: 1px 0;
  cursor: pointer;
}

.player-id {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.rank-no {
  flex: 0 0 auto;
  width: 18px;
  text-align: center;
  font-family: var(--vis-font-numeric);
  font-size: 12px;
  font-weight: 800;
  font-style: italic;
  color: #c0c4cc;
}

.rank-no.rank-top {
  color: #ff6a00;
}

.player-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.18);
  text-underline-offset: 3px;
}

/* 按压反馈：名字变为橙色强调色 */
.player-rank-row:active .player-name {
  color: #ff6a00;
  text-decoration-color: rgba(255, 106, 0, 0.55);
}

.player-team {
  flex: 0 0 auto;
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}

.player-cell {
  min-width: 0;
  text-align: center;
  font-size: 11px;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.player-cell.is-sort-metric {
  color: #ff6a00;
  font-weight: 700;
}

.expand-toggle {
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #ff6a00;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 6px;
  transition: background 0.2s;
}

.expand-toggle:hover {
  background: rgba(255, 106, 0, 0.06);
}

/* 桌面端仅放大表头字号，数据列保持紧凑，避免挤压选手名 */
@media (min-width: 769px) {
  .player-metric-tab {
    font-size: 11px;
  }
}

@media (max-width: 768px) {
  .hero-filters {
    margin: -14px -10px 10px;
  }

  .hero-detail {
    padding-left: 8px;
  }
}
</style>
