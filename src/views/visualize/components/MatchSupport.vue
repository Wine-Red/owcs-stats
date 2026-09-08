<template>
  <span v-if="summary" class="match-support" :class="{ compact, interactive: canVote, empty: !summary.total || !showResults, concealed: !showResults }"
    :aria-label="readonly || summary.closed ? '赛前观众支持率' : '观众支持率'" :aria-busy="busy">
    <span class="support-actions">
      <component :is="canVote ? 'button' : 'span'" v-for="(team, index) in choices" :key="team.id" :type="canVote ? 'button' : undefined" class="support-choice"
        :class="{ right: index === 1 }" :disabled="canVote ? busy : undefined"
        :aria-pressed="canVote ? Number(summary.myTeamId) === Number(team.id) : undefined"
        :aria-label="`${Number(summary.myTeamId) === Number(team.id) ? '已支持' : '支持'} ${team.name}`"
        @click="canVote && cast(team.id)">
        <svg v-if="canVote" viewBox="0 0 24 24" aria-hidden="true" class="support-icon">
          <path d="M7 10v11H3V10h4Zm0 0 5-7c1.7 0 2.5 1.3 2 3l-1 4h5.5a2 2 0 0 1 2 2.4l-1.2 6.5a2.5 2.5 0 0 1-2.5 2.1H7" />
        </svg>
        <Transition name="support-reveal"><span v-if="showResults" class="support-percent">{{ team.percent }}</span></Transition>
      </component>
    </span>
    <span class="support-track" :style="{ '--split': splitPosition }">
      <span class="support-fill left-fill" aria-hidden="true"></span>
      <span class="support-fill right-fill" aria-hidden="true"></span>
    </span>
  </span>
</template>

<script setup>
/* global defineProps */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
const props = defineProps({
  summary: { type: Object, default: null }, compact: Boolean, readonly: Boolean,
  error: { type: String, default: '' }, leftId: [String, Number], rightId: [String, Number],
  leftName: { type: String, default: '' }, rightName: { type: String, default: '' },
  submit: { type: Function, default: null }
});
const busy = ref(false);
const canVote = computed(() => !props.readonly && !props.summary?.closed);
// Closed polls remain readable to visitors who can no longer participate.
const showResults = computed(() => !canVote.value || [Number(props.leftId), Number(props.rightId)].includes(Number(props.summary?.myTeamId)));
const splitPosition = computed(() => {
  if (!showResults.value || !props.summary?.total) return '50%';
  if (!leftVotes.value) return '-4px';
  if (!rightVotes.value) return 'calc(100% + 4px)';
  return `${leftVotes.value / props.summary.total * 100}%`;
});
const leftVotes = computed(() => props.summary?.votes?.[props.leftId] || 0);
const rightVotes = computed(() => props.summary?.votes?.[props.rightId] || 0);
const leftPercent = computed(() => props.summary?.total ? Math.round(leftVotes.value / props.summary.total * 100) : 0);
const choices = computed(() => [
  { id: props.leftId, name: props.leftName, percent: props.summary?.total ? `${leftPercent.value}%` : '—' },
  { id: props.rightId, name: props.rightName, percent: props.summary?.total ? `${100 - leftPercent.value}%` : '—' }
]);
const cast = async teamId => {
  if (!props.submit || busy.value) return;
  if (props.error) {
    ElMessage.warning({ message: props.error, grouping: true, duration: 3000 });
    return;
  }
  busy.value = true;
  try { await props.submit(props.summary, teamId); }
  catch (error) { ElMessage.warning({ message: error.message || '投票未成功，请稍后再试', grouping: true, duration: 3000 }); }
  finally { busy.value = false; }
};
</script>

<style scoped>
.match-support { --support-black: #34363b; --support-orange: #d98245; display: block; width: 100%; box-sizing: border-box; font-variant-numeric: tabular-nums; }
.support-actions { position: relative; z-index: 1; display: block; height: 18px; }
/* The touch target extends above the 18px visual without adding layout height. */
.support-choice { position: absolute; bottom: 0; left: 0; display: flex; align-items: center; gap: 3px; width: 64px; height: 18px; box-sizing: border-box; padding: 0 5px; border: 0; border-radius: 0; background: transparent; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: default; -webkit-tap-highlight-color: transparent; }
.support-choice::before { content: ''; position: absolute; inset: auto 0 -1px; height: 19px; background: var(--support-black); clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%); }
.support-choice.right { color: #30251c; left: auto; right: 0; flex-direction: row-reverse; }
.interactive .support-choice { height: 44px; padding-top: 26px; cursor: pointer; }
.support-choice.right::before { background: var(--support-orange); clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%); }
.support-percent, .support-icon { position: relative; }
.support-percent { white-space: nowrap; }
.support-icon { width: 12px; height: 12px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.support-choice[aria-pressed="true"] .support-icon { fill: currentColor; }
.support-choice:focus-visible { outline: none; box-shadow: inset 0 0 0 2px currentColor; }
.support-choice:disabled { opacity: .45; cursor: default; }
.support-track { transition: background-color .3s ease; position: relative; display: flex; justify-content: space-between; align-items: center; height: 4px; overflow: hidden; background: #fff; }
.support-fill { position: absolute; inset: 0; transition: clip-path .36s ease, opacity .3s ease, background-color .3s ease; }
.concealed .support-track { background: #e7e8ea; }
.concealed .support-fill { opacity: 0; }
.support-choice::before { transition: background-color .3s ease; }
.support-reveal-enter-active { transition: opacity .25s ease, transform .25s ease; }
.support-reveal-enter-from { opacity: 0; transform: translateY(4px); }
.left-fill { background: var(--support-black); clip-path: polygon(0 0, calc(var(--split) + 2px) 0, calc(var(--split) - 2px) 100%, 0 100%); }
.right-fill { background: var(--support-orange); clip-path: polygon(calc(var(--split) + 3px) 0, 100% 0, 100% 100%, calc(var(--split) - 1px) 100%); }
.match-support.empty { --support-black: #dfe1e4; --support-orange: #f0ddce; }
.empty .support-choice { color: #535861; }
.empty .support-choice.right { color: #79563e; }
@media (hover: hover) { .support-choice:not(:disabled):hover .support-icon { transform: translateY(-1px); } }
@media (prefers-reduced-motion: reduce) { .support-choice, .support-choice::before, .support-fill, .support-track, .support-reveal-enter-active { transition: none; } }
</style>
