<template>
  <div class="compact-leaderboard">
    <div class="ranking-heading">
      <span class="ranking-heading-position">排名</span>
      <span>{{ kind === 'player' ? '选手' : '队伍' }}</span>
      <div class="ranking-controls">
        <el-dropdown trigger="click" placement="bottom-end" popper-class="ranking-metric-menu" @command="changeMetric">
          <button type="button" class="ranking-metric" aria-label="排名指标">
            {{ metric.label }}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="m2 3.5 3 3 3-3" stroke="currentColor" stroke-width="1.4" /></svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in metrics" :key="item.prop" :command="item.prop" :style="item.prop === metric.prop ? { color: 'var(--vis-accent, #ff6a00)', fontWeight: 700 } : undefined">{{ item.label }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <FletaHelp v-if="metric.prop === 'fletaIndex'" />
        <button type="button" class="ranking-order" :title="ascending ? '当前升序，切换为降序' : '当前降序，切换为升序'" :aria-label="ascending ? '当前升序，切换为降序' : '当前降序，切换为升序'" @click="toggleOrder">
          <span class="ranking-sort-up" :class="{ active: ascending }" aria-hidden="true"></span>
          <span class="ranking-sort-down" :class="{ active: !ascending }" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <ol class="ranking-list" :aria-label="`${metric.label}排行榜，共${total}${kind === 'player' ? '人' : '支队伍'}`">
      <li v-for="(row, index) in rows" :key="kind === 'player' ? row.playerId : row.teamId">
        <button type="button" class="ranking-row" :class="{ 'is-podium': index < 3 }" @click="$emit('open', row)">
          <span class="ranking-position">{{ index + 1 }}</span>
          <span class="ranking-identity">
            <img v-if="row.logo" :src="row.logo" class="ranking-logo" alt="" />
            <span v-else class="ranking-logo ranking-logo-placeholder" aria-hidden="true">{{ name(row).slice(0, 1) }}</span>
            <span class="ranking-person">
              <span class="ranking-name">{{ name(row) }}<span class="ranking-chevron" aria-hidden="true">›</span></span>
              <span v-if="kind === 'player'" class="ranking-team">{{ row.teamName }} · {{ row.duration ?? '—' }} 分钟</span>
            </span>
          </span>
          <span class="ranking-value">
            <FletaValue v-if="metric.prop === 'fletaIndex'" :value="row.fletaIndex" compact />
            <span v-else>{{ formatValue(row[metric.prop]) }}</span>
          </span>
        </button>
      </li>
    </ol>
    <div v-if="!rows.length" class="ranking-empty">暂无数据</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import FletaValue from './FletaValue.vue';
import FletaHelp from './FletaHelp.vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  metrics: { type: Array, required: true },
  sortState: { type: Object, required: true },
  total: { type: Number, default: 0 },
  kind: { type: String, default: 'player' }
});
const emit = defineEmits(['sort-change', 'open']);
const metric = computed(() => props.metrics.find(item => item.prop === props.sortState.prop) || props.metrics[0]);
const ascending = computed(() => props.sortState.order === 'ascending');
const name = row => String((props.kind === 'player' ? row.playerName : row.teamName) || '—');
const formatValue = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const changeMetric = prop => emit('sort-change', { prop, order: 'descending' });
const toggleOrder = () => emit('sort-change', { prop: metric.value.prop, order: ascending.value ? 'descending' : 'ascending' });
</script>

<style scoped>
.compact-leaderboard { min-width: 0; color: var(--vis-text-primary); font-family: var(--vis-font-body); }
.ranking-heading, .ranking-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; padding-inline: 8px; }
.ranking-heading { min-height: 36px; background: #f8f9fb; color: #808691; font-size: 12px; font-weight: 600; border-block: 1px solid var(--vis-border, #e6e9f0); }
.ranking-heading-position { text-align: center; font-size: 11px; }
.ranking-controls { display: flex; align-items: center; gap: 1px; }
.ranking-metric { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; min-height: 34px; padding: 0 3px; border: 0; background: transparent; color: #727986; font: 600 12px var(--vis-font-body); white-space: nowrap; cursor: pointer; }
.ranking-metric svg { flex-shrink: 0; color: #989eaa; }
:global(.ranking-metric-menu .el-dropdown-menu__item) { font-family: var(--vis-font-body); font-size: 12px; }
:global(.ranking-metric-menu .el-dropdown-menu__item:not(.is-disabled):hover),
:global(.ranking-metric-menu .el-dropdown-menu__item:not(.is-disabled):focus) { background: #fff3e5; color: #ff6a00; }
.ranking-order { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 24px; min-height: 34px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.ranking-sort-up, .ranking-sort-down { width: 0; height: 0; border-inline: 4px solid transparent; }
.ranking-sort-up { border-bottom: 5px solid #b1b5be; }
.ranking-sort-down { border-top: 5px solid #b1b5be; }
.ranking-sort-up.active { border-bottom-color: var(--vis-accent); }
.ranking-sort-down.active { border-top-color: var(--vis-accent); }
.ranking-list { list-style: none; margin: 0; padding: 0; }
.ranking-list li { margin: 0; padding: 0; }
.ranking-row { width: 100%; min-height: 44px; padding-block: 6px; border: 0; border-bottom: 1px solid var(--vis-border, #e6e9f0); background: rgba(255, 255, 255, .48); text-align: left; color: inherit; font-family: inherit; cursor: pointer; }
.ranking-list li:nth-child(even) .ranking-row { background: rgba(255, 255, 255, .16); }
.ranking-row:focus-visible, .ranking-order:focus-visible, .ranking-metric:focus-visible { outline: 2px solid var(--vis-accent); outline-offset: -2px; }
.ranking-position { text-align: center; color: #909399; font: 600 14px var(--vis-font-numeric); font-variant-numeric: tabular-nums; }
.is-podium .ranking-position { color: var(--vis-accent); font-size: 18px; font-weight: 800; font-style: italic; }
.ranking-identity { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ranking-logo { width: 22px; height: 22px; flex: 0 0 22px; object-fit: contain; }
.ranking-logo-placeholder { display: grid; place-items: center; color: #8b929e; background: #e9ecf1; font-size: 11px; }
.ranking-person { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.ranking-name { font-size: 13px; font-weight: 600; line-height: 16px; overflow-wrap: anywhere; }
.ranking-team { color: var(--vis-text-placeholder); font-size: 10px; line-height: 11px; white-space: nowrap; }
.ranking-chevron { display: inline-block; margin-left: 5px; color: var(--vis-accent); font-size: 15px; line-height: 12px; vertical-align: baseline; }
.ranking-value { min-width: 68px; text-align: right; white-space: nowrap; color: #ba4c00; font: 700 16px var(--vis-font-numeric); font-variant-numeric: tabular-nums; }
.ranking-empty { padding: 24px 0; text-align: center; color: var(--vis-text-placeholder); font-size: 12px; }
@media (hover: hover) {
  .ranking-list .ranking-row:hover { background: #fff3e5; }
  .ranking-metric:hover { color: var(--vis-accent); }
}
@media (max-width: 360px) {
  .ranking-heading, .ranking-row { grid-template-columns: 26px minmax(0, 1fr) auto; column-gap: 6px; padding-inline: 6px; }
  .ranking-identity { gap: 5px; }
  .ranking-name { font-size: 12px; }
}
</style>
