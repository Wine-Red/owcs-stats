<template>
  <section class="tournament-board" aria-label="赛事赛制与对阵">
    <div v-if="!data?.blocks?.length" class="tournament-empty" :class="{ 'is-loading': loading || data?.loading }" role="status" aria-live="polite" :aria-busy="loading || data?.loading ? 'true' : 'false'">
      <template v-if="loading || data?.loading"><span class="tournament-spinner" aria-hidden="true"></span><strong>正在加载赛事进程</strong><span>稍后即可查看赛制与对阵</span></template>
      <template v-else-if="data?.configured === false || data?.offline"><strong>暂无赛事进程</strong><p>{{ data?.offline ? '当前离线数据未包含赛事进程，可在比赛列表中查看已收录的比赛。' : '该赛事暂无进程数据，可在比赛列表中查看已收录的比赛。' }}</p></template>
      <template v-else><strong>暂时无法读取赛制</strong><p>{{ error || 'Liquipedia 暂时无法访问，请稍后重试。' }}</p><button type="button" @click="load">重新读取</button></template>
    </div>
    <template v-else>
      <Teleport to="#tournament-stage-tabs-host">
        <DetailSectionTabs v-if="activeStage" class="tournament-tabs"
          :model-value="activeStage.id" :items="stageTabItems" aria-label="赛事阶段" @update:model-value="selectStage" />
      </Teleport>
      <div :id="stagePanelId" class="stage-panel" :class="{ 'has-previews': upcomingPreviews.length > 0 }" :role="activeStage ? 'tabpanel' : undefined"
        :aria-labelledby="activeStage ? stageTabId(activeStage.id) : undefined" :tabindex="activeStage ? 0 : undefined">
      <section v-if="upcomingPreviews.length" class="preview-section" aria-label="赛前前瞻">
        <div class="preview-cards">
        <router-link v-for="match in upcomingPreviews" :key="match.previewKey" class="preview-lead" :to="match.navigation.to"
          :aria-label="`${match.opponents[0].localName || match.opponents[0].name} 对 ${match.opponents[1].localName || match.opponents[1].name}，${match.navigation.date} ${match.navigation.time}，查看前瞻`"
          :title="`${match.opponents[0].localName || match.opponents[0].name} 对 ${match.opponents[1].localName || match.opponents[1].name} · 查看前瞻`">
          <span class="preview-lead-copy"><small><time :datetime="match.navigation.datetime">{{ match.navigation.date }} {{ match.navigation.time }}</time></small>
            <strong><template v-for="(team, index) in match.opponents" :key="team.teamId || index">
              <span v-if="index" class="preview-versus">vs</span>
              <span class="preview-team"><span class="preview-team-emblem"><img v-if="team.logo" :src="team.logo" alt="" class="preview-team-logo" /></span><span class="preview-team-name">{{ team.localName || team.shortName || team.name }}</span></span>
            </template></strong>
          </span>
        </router-link>
        </div>
        <router-link v-if="hasMorePreviews" class="preview-more" :to="matchListLocation" aria-label="查看更多未开赛比赛，前往比赛列表" @click="showMatchList">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>查看更多</span>
        </router-link>
      </section>
      <div v-for="block in visibleBlocks" :key="block.id" class="tournament-block" :class="{ 'is-decider': block.type === 'bracket' && block.matches.length === 1 }">
        <div v-if="groupLabel(block)" class="block-heading"><h3>{{ groupLabel(block) }}</h3></div>
        <div v-if="block.rows" class="table-scroll" tabindex="0" :aria-label="block.title">
          <table class="tournament-table" :class="{ swiss: block.type === 'swiss', 'has-rounds': resultLabels(block).length > 0 && resultsExpanded(block), 'has-game-results': !!block.gameLabels?.length }">
            <thead><tr>
              <th scope="col">排名</th>
              <th scope="col"><div class="team-column-heading">
                <span>队伍</span>
                <button v-if="resultLabels(block).length" type="button" class="rounds-toggle"
                  :class="{ 'is-expanded': resultsExpanded(block) }" :aria-expanded="resultsExpanded(block)"
                  :aria-label="toggleLabel(block)" :title="toggleLabel(block)" @click="toggleResults(block)">
                  {{ block.type === 'swiss' ? '逐轮' : '逐场' }}
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m4.5 3 3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
              </div></th>
              <th scope="col">大场</th><th scope="col">小局</th>
              <th v-if="block.type !== 'swiss'" scope="col">净胜局</th>
              <th v-for="(label, i) in (resultsExpanded(block) ? resultLabels(block) : [])" :key="i" scope="col" class="swiss-round-heading">{{ label }}</th>
            </tr></thead>
            <tbody><tr v-for="(row, index) in block.rows" :key="index">
              <td class="rank">{{ row.rank || '—' }}</td><th scope="row"><router-link v-if="row.team.teamId" :to="{ path: '/visualize/team-detail', query: { teamId: row.team.teamId, seasonId } }"><img v-if="row.team.logo" :src="row.team.logo" alt="" class="table-team-logo" />{{ row.team.localName || row.team.name }}</router-link><span v-else>{{ row.team.name }}</span></th>
              <td class="record">{{ row.matches || '—' }}</td><td>{{ row.maps || '—' }}</td><td v-if="block.type !== 'swiss'">{{ row.difference || '—' }}</td>
              <td v-for="(round, i) in visibleResults(block, row)" :key="i" class="swiss-round" :class="{ 'game-result-cell': block.type !== 'swiss' }">
                <component :is="round.navigation?.to ? 'router-link' : 'div'" class="swiss-result" :title="resultTitle(round)"
                  :to="round.navigation?.to || undefined"
                  :aria-label="round.navigation?.to ? `${resultLabels(block)[i]}，${row.team.localName || row.team.name} 对 ${round.opponent.localName || round.opponent.name}，${round.navigation.preview ? '查看前瞻' : `${round.score}，查看比赛详情`}，${round.navigation.date} ${round.navigation.time}` : undefined">
                  <time v-if="resultDate(round)" class="result-score-date" :datetime="round.navigation?.datetime">{{ resultDate(round) }}</time>
                  <strong v-else>{{ round.score || '—' }}</strong>
                  <small v-if="round.live" class="result-live">进行中</small>
                  <span v-if="round.opponent.name !== '待定'" class="swiss-opponent"><img v-if="round.opponent.logo" :src="round.opponent.logo" :alt="round.opponent.localName || round.opponent.shortName" :title="round.opponent.name" class="round-team-logo" /><template v-else>{{ round.opponent.localName || round.opponent.shortName }}</template></span>
                </component>
              </td>
            </tr></tbody>
          </table>
        </div>
        <div v-else-if="block.type === 'matches'" class="stage-match-list">
          <div v-for="match in block.matches" :key="match.id" class="stage-match-item">
            <time v-if="match.navigation?.datetime" class="round-time" :datetime="match.navigation.datetime">{{ match.navigation.date }} {{ match.navigation.time }}</time>
            <TournamentMatchCard :match="match" :season-id="seasonId" />
          </div>
        </div>
        <div v-else class="bracket-scroll" tabindex="0" :aria-label="`${block.title}对阵图`">
          <div class="bracket-canvas" :style="graphStyle(block)">
            <svg class="bracket-lines" :viewBox="`0 0 ${graphWidth(block)} ${graphHeight(block)}`" preserveAspectRatio="none" aria-hidden="true">
              <path v-for="(edge, i) in block.edges" :key="i" :d="edgePath(block, edge)" />
            </svg>
            <div v-for="match in block.matches" :key="match.id" class="bracket-node" :style="nodeStyle(block, match)">
              <div class="round-header">
                <span class="round-label" :title="match.round"><span class="round-label-full">{{ match.round }}</span><span class="round-label-compact">{{ compactRoundLabel(match.round) }}</span></span>
                <time v-if="match.navigation?.datetime" class="round-time" :datetime="match.navigation.datetime">{{ match.navigation.date }} {{ match.navigation.time }}</time>
              </div>
              <TournamentMatchCard :match="match" :season-id="seasonId" />
            </div>
          </div>
        </div>
        <p v-if="block.resultsStatus?.reasons.includes('standings-out-of-sync')" class="results-note">积分汇总更新中，逐场比分按赛程显示</p>
        <p v-else-if="block.resultsStatus?.state === 'partial'" class="results-note">部分赛程，按已知比赛时间排序</p>
        <p v-else-if="block.resultsStatus?.state === 'conflict'" class="results-note">逐场结果暂不可用</p>
        <p v-else-if="block.resultsStatus?.reasons.includes('unconfirmed-opponents')" class="results-note">对阵尚未确定</p>
      </div>
      </div>
      <p v-for="warning in data.warnings" :key="warning" class="sync-notice">{{ warning }}</p>
    </template>
  </section>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import apiService from '@/services/api';
import { groupTournamentStages, selectTournamentStage, tournamentStageDisplayBlocks } from '@/utils/tournamentStages.mjs';
import { formatStageDateRange } from '@/utils/tournamentStageDates.mjs';
import { attachTournamentNavigation, collectTournamentPreviews } from '@/utils/tournamentMatchNavigation.mjs';
import { useStore } from 'vuex';
import TournamentMatchCard from './TournamentMatchCard.vue';
import DetailSectionTabs from './DetailSectionTabs.vue';
const props = defineProps({ seasonId: { type: [String, Number], required: true } });
const emit = defineEmits(['show-matches']);
const data = shallowRef(null), loading = ref(false), error = ref('');
const route = useRoute(), router = useRouter();
const store = useStore();
let generation = 0, timer;
const currentTime = ref(Date.now());
const clockTimer = setInterval(() => { currentTime.value = Date.now(); }, 60000);
const navigableData = computed(() => attachTournamentNavigation(data.value, {
  seasonId: props.seasonId, now: currentTime.value,
  tournament: store.state.seasons?.find(season => String(season.id) === String(props.seasonId))?.name || ''
}));
const stages = computed(() => groupTournamentStages(navigableData.value)
  .map(stage => ({ ...stage, blocks: tournamentStageDisplayBlocks(stage, navigableData.value) }))
  .filter(stage => stage.blocks.length));
const activeStage = computed(() => selectTournamentStage(stages.value,
  String(route.query.seasonId || props.seasonId) === String(props.seasonId) ? route.query.tournamentStage : null, currentTime.value));
const visibleBlocks = computed(() => activeStage.value?.blocks || []);
const stagePreviews = computed(() => collectTournamentPreviews(visibleBlocks.value));
const upcomingPreviews = computed(() => stagePreviews.value.slice(0, 3));
const hasMorePreviews = computed(() => stagePreviews.value.length > 3);
const matchListLocation = computed(() => ({ path: '/visualize', query: { ...route.query, seasonId: props.seasonId, tab: 'recent' } }));
const showMatchList = event => {
  // Keep modified clicks as normal links; the existing home view owns its tab state.
  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) emit('show-matches');
};
const stagePanelId = computed(() => `tournament-stage-panel-${props.seasonId}`);
const stageTabId = id => `tournament-stage-${props.seasonId}-${id}`;
const stageTabItems = computed(() => stages.value.map(stage => ({
  value: stage.id, id: stageTabId(stage.id),
  label: ({ 'playoff-seeding': '种子决定战', 'last-chance': '最后机会赛' })[stage.id] || stage.title,
  ariaLabel: stage.title, title: `${stage.title} · ${formatStageDateRange(stage.dateRange)}`,
  description: formatStageDateRange(stage.dateRange),
  controls: stagePanelId.value, describedby: `${stageTabId(stage.id)}-date`
})));
const groupLabel = block => {
  const heading = [...(block.sourceHeadings || []), block.sourceTitle].reverse()
    .find(title => /^Group\s+(?:[A-Z]|\d+)$/i.test(title || ''));
  return heading ? `${heading.replace(/^Group\s+/i, '')} 组` : '';
};
async function selectStage(id) {
  await router.replace({ query: { ...route.query, seasonId: props.seasonId, tab: 'overview', tournamentStage: id } });
}
const collapsedResults = ref(new Set());
const resultsExpanded = block => !collapsedResults.value.has(block.id);
const toggleResults = block => {
  const next = new Set(collapsedResults.value);
  if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
  collapsedResults.value = next;
};
const resultLabels = block => block.type === 'swiss'
  ? Array.from({ length: Math.max(0, ...block.rows.map(r => r.rounds?.length || 0)) }, (_, i) => block.roundLabels?.[i] || `第 ${i + 1} 轮`)
  : block.gameLabels || [];
const toggleLabel = block => `${resultsExpanded(block) ? '收起' : '展开'}${block.type === 'swiss' ? '逐轮' : '逐场'}结果`;
const visibleResults = (block, row) => resultsExpanded(block) ? resultLabels(block).map((_, i) =>
  (block.type === 'swiss' ? row.rounds : row.games)?.[i] || { score: '—', opponent: { name: '待定' } }) : [];
const resultDateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const resultTitle = result => result.timestamp ? `${resultDateFormatter.format(result.timestamp)} · ${result.opponent.localName || result.opponent.name} · ${result.score}` : undefined;
const resultDate = result => (result.score == null || result.score === '—') && result.navigation?.datetime
  ? result.navigation.date : '';
const compactRoundLabel = label => String(label || '').replace(/胜者组半决赛/g, '胜者半决').replace(/败者组半决赛/g, '败者半决')
  .replace(/胜者组/g, '胜者').replace(/败者组/g, '败者').replace(/第\s*(\d+)\s*轮/g, '第$1轮');
const nodeWidth = 106, columnStep = 120;
const columns = block => Math.max(...block.matches.map(m => m.depth)) + 1;
const graphWidth = block => columns(block) * columnStep - (columnStep - nodeWidth);
const graphHeight = block => Math.max(...block.matches.map(m => m.y)) * 92 + 72;
const graphStyle = block => ({ minWidth: `${graphWidth(block)}px`, maxWidth: `${columns(block) * 180 - 20}px`, height: block.matches.length === 1 ? 'auto' : `${graphHeight(block)}px` });
const nodeStyle = (block, match) => block.matches.length === 1 ? { position: 'relative', width: '100%' }
  : ({ left: `${match.depth * columnStep / graphWidth(block) * 100}%`, width: `${nodeWidth / graphWidth(block) * 100}%`, top: `${match.y * 92}px` });
const edgePath = (block, edge) => {
  const from = block.matches.find(m => m.id === edge.from), to = block.matches.find(m => m.id === edge.to);
  if (!from || !to) return '';
  const x1 = from.depth * columnStep + nodeWidth, x2 = to.depth * columnStep, y1 = from.y * 92 + 44, y2 = to.y * 92 + 44;
  return `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}`;
};
async function load() {
  const token = generation;
  clearTimeout(timer); loading.value = true; error.value = '';
  try {
    const result = await apiService.getSeasonTournament(props.seasonId);
    if (token !== generation) return;
    data.value = result;
    if (result.configured && !result.offline) timer = setTimeout(load, Math.max(5000, result.retryAfterMs || 300000));
  } catch {
    if (token !== generation) return;
    error.value = '来源暂时不可用，请稍后重试。';
    timer = setTimeout(load, 60000);
  } finally { if (token === generation) loading.value = false; }
}
watch(() => props.seasonId, () => { generation++; clearTimeout(timer); data.value = null; collapsedResults.value = new Set(); load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; clearTimeout(timer); clearInterval(clockTimer); });
</script>

<style scoped>
.tournament-board{color:var(--vis-text-primary);min-width:0;padding:0 4px;font-size:14px}
.tournament-tabs{margin-bottom:0}
.stage-panel{padding-top:12px}
.stage-panel.has-previews{padding-top:4px}
.preview-section{--preview-accent:#a84e12;--preview-edge:0px;--preview-logo-size:16px;position:relative;margin-bottom:6px}
.preview-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.preview-lead{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:0;min-height:44px;padding:4px;border:1px solid var(--vis-border);border-radius:8px;background:var(--vis-bg-card);color:var(--vis-text-strong);text-align:center;text-decoration:none;box-shadow:0 1px 2px rgba(29,36,47,.035)}
.preview-lead-copy{display:flex;flex-direction:column;gap:2px;width:100%;min-width:0}
.preview-lead-copy small{font-size:10px;line-height:12px;color:var(--vis-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:center}
.preview-lead-copy strong{display:grid;grid-template-columns:minmax(0,1fr) 10px minmax(0,1fr);align-items:center;gap:2px;min-width:0;font-family:var(--vis-font-display);font-size:11px;font-weight:600;line-height:16px;white-space:nowrap}
.preview-team{display:grid;grid-template-columns:var(--preview-logo-size) minmax(0,1fr);align-items:center;gap:2px;min-width:0}
.preview-team:last-child{grid-template-columns:minmax(0,1fr) var(--preview-logo-size)}
.preview-team:last-child .preview-team-emblem{grid-column:2;grid-row:1}
.preview-team:last-child .preview-team-name{grid-column:1;grid-row:1}
.preview-team-emblem{display:flex;align-items:center;justify-content:center;width:var(--preview-logo-size);height:var(--preview-logo-size)}
.preview-team-logo{width:var(--preview-logo-size);height:var(--preview-logo-size);object-fit:contain}
.preview-team-name{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;text-align:center}
.preview-versus{color:var(--vis-text-secondary);font-size:9px;font-weight:500;line-height:16px;text-align:center;text-transform:uppercase}
.preview-more{position:absolute;z-index:1;top:0;right:calc(-1 * var(--preview-edge));bottom:0;display:flex;width:48px;min-height:44px;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:var(--preview-accent);text-decoration:none;font-size:10px;font-weight:600;line-height:14px;white-space:nowrap;isolation:isolate}
.preview-more::before{content:'';position:absolute;z-index:-1;inset:0 0 0 -16px;background:linear-gradient(90deg,transparent,var(--vis-bg-page,#f4f5f8) 50%);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);mask-image:linear-gradient(90deg,transparent,#000 40%);-webkit-mask-image:linear-gradient(90deg,transparent,#000 40%);pointer-events:none}
.preview-lead:focus-visible,.preview-more:focus-visible{outline:2px solid var(--preview-accent);outline-offset:2px;border-radius:8px}
@media(hover:hover){.preview-lead:hover{border-color:#e8b18a;background:#fffaf5}.preview-more:hover{color:#de5900}}
@media (max-width: 768px), (min-width: 769px) and (max-width: 1199px) and (orientation: portrait){.preview-section{--preview-edge:14px}}
@media(max-width:360px){.preview-section{--preview-logo-size:14px}.preview-cards{gap:4px}.preview-lead-copy strong{font-size:10px}.preview-lead-copy small{font-size:9px}}
.tournament-block{margin-bottom:20px;min-width:0}
.result-live{color:#168a59;font-size:9px;line-height:12px;white-space:nowrap}
.stage-match-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.stage-match-item{min-width:0}
.block-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px}
.block-heading h3{font-size:14px;font-weight:600;margin:0}
.team-column-heading{display:flex;align-items:center;justify-content:space-between;gap:6px}
.rounds-toggle{display:inline-flex;align-items:center;justify-content:center;gap:1px;min-height:24px;margin:-4px 0;padding:0 3px;border:0;border-radius:3px;background:none;color:var(--vis-text-secondary);font:inherit;white-space:nowrap;cursor:pointer}
.rounds-toggle:hover{color:var(--vis-text-strong);background:var(--vis-bg-muted)}
.rounds-toggle.is-expanded svg{transform:rotate(180deg)}
.table-scroll{overflow:auto;max-width:100%;overscroll-behavior-x:contain}
.tournament-table{border-collapse:collapse;width:100%;font-size:13px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}
.tournament-table th,.tournament-table td{padding:6px 8px;border-bottom:1px solid var(--vis-border);font-weight:400;text-align:center;vertical-align:middle}
.tournament-table thead{color:var(--vis-text-secondary);font-size:12px}
.tournament-table tbody th{text-align:left;font-weight:600}
.tournament-table thead th:nth-child(2){text-align:left}
.tournament-table th:first-child,.tournament-table td:first-child{text-align:center;width:24px;color:#667386}
.tournament-table a{color:inherit;text-decoration:none}
.tournament-table a:hover{text-decoration:underline}
.record{font-weight:600!important}
.swiss-round-heading,.swiss-round{text-align:center}
.swiss-round{min-width:30px}.swiss-round strong{font-weight:500}
.tournament-table.has-rounds tbody th,.tournament-table.has-rounds tbody td{padding-top:0;padding-bottom:0}
.swiss-result{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:44px;border-radius:3px}
.result-score-date{font-family:var(--vis-font-numeric);font-size:10px;line-height:1.2;font-weight:500;color:var(--vis-text-secondary);font-variant-numeric:tabular-nums}
.swiss-opponent{display:block;min-height:20px;font-size:11px;color:var(--vis-text-secondary)}
.tournament-table a.swiss-result:hover{background:var(--vis-bg-subtle);text-decoration:none}
.round-group{margin-bottom:18px}.round-group h4{font-size:12px;font-weight:400;color:#617084;margin:14px 0 2px}
.sync-notice{color:#776247;font-size:12px;line-height:1.7}.tournament-empty button{background:none;border:0;color:#9b4b10;font:inherit;text-decoration:underline;cursor:pointer;padding:8px}
.tournament-empty{padding:28px 0;color:var(--vis-text-secondary);font-size:13px}.tournament-empty strong{font-weight:500}
.tournament-empty.is-loading{display:flex;min-height:120px;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 12px;text-align:center;font-size:12px}
.tournament-empty.is-loading strong{color:var(--vis-text-secondary);font-size:14px;font-weight:600}
.tournament-spinner{width:22px;height:22px;border:2px solid rgba(17,17,17,.08);border-top-color:var(--vis-accent);border-radius:50%;animation:tournament-spin .8s linear infinite}
@keyframes tournament-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.tournament-spinner{animation:none}}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid #c56a25;outline-offset:3px}
@media(min-width:768px){.tournament-board{max-width:760px;margin:0 auto;padding:0 12px}.tournament-table th,.tournament-table td{padding:6px 12px}.round-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}.round-group{min-width:0}}
/* Compact source-shaped bracket: three columns fit a phone without scaling text. */
.bracket-scroll{overflow-x:auto;max-width:100%;padding:4px 0;overscroll-behavior-x:contain}
.bracket-canvas{position:relative;width:100%}
.bracket-lines{position:absolute;width:100%;height:100%;inset:0;pointer-events:none}
.bracket-lines path{fill:none;stroke:#a2adb9;stroke-width:1;vector-effect:non-scaling-stroke}
.bracket-node{position:absolute;min-width:0}
.round-header{display:flex;align-items:center;gap:3px;height:18px;margin-bottom:3px;min-width:0}
.round-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:18px;color:var(--vis-text-secondary)}
.round-label-compact{display:none}
.round-time{display:block;height:13px;line-height:13px;text-align:right;color:var(--vis-text-secondary);font-family:var(--vis-font-numeric);font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap}
.round-header .round-time{flex:none;font-size:9px}
.stage-match-item .round-time{margin-bottom:3px}
@media(max-width:640px){.tournament-table{font-size:11px}.tournament-table th,.tournament-table td{padding:4px 3px}.tournament-table thead{font-size:10px}.swiss-opponent{font-size:9px;max-width:42px;overflow:hidden;text-overflow:ellipsis}.tournament-table th:first-child,.tournament-table td:first-child{width:20px}}
/* Reuse the site's standings hierarchy, slanted accent and numeric typography. */
.tournament-board{font-family:var(--vis-font-body)}
.block-heading h3{display:flex;align-items:center;gap:8px;font-family:var(--vis-font-display);font-style:italic;font-weight:800;font-size:16px;color:var(--vis-text-strong)}
.block-heading h3:before{content:'';width:3px;height:14px;background:var(--vis-primary-gradient);transform:skewX(var(--vis-slant));flex-shrink:0}
.game-result-cell{min-width:42px}
.has-game-results.has-rounds th:nth-child(2){position:sticky;left:0;z-index:1;background:var(--vis-bg-card);box-shadow:1px 0 var(--vis-border)}
.has-game-results.has-rounds thead th:nth-child(2){z-index:2;background:var(--vis-bg-subtle)}
.results-note{margin:6px 0 0;color:var(--vis-text-secondary);font-size:11px}
.table-scroll{background:var(--vis-bg-card);border:1px solid var(--vis-border);border-radius:8px}
.tournament-table thead{background:var(--vis-bg-subtle);font-weight:700}.tournament-table td{font-family:var(--vis-font-numeric)}
.tournament-table tbody th{font-family:var(--vis-font-display);font-weight:700}.tournament-table tbody th a{display:flex;align-items:center;gap:4px}
.table-team-logo{width:18px;height:18px;object-fit:contain}.round-team-logo{display:inline-block;width:20px;height:20px;object-fit:contain;vertical-align:middle}
.round-label{font-family:var(--vis-font-display);font-weight:700}
.is-decider{display:inline-block;width:calc(33.333% - 8px);margin-right:8px;vertical-align:top}.is-decider .block-heading{display:none}
.is-decider .round-header{display:block;height:auto}
.is-decider .round-label{display:block;overflow:visible;white-space:normal;overflow-wrap:anywhere}
.is-decider .round-time{text-align:left}
@media(max-width:360px){.is-decider{width:calc(50% - 8px)}}
@media(max-width:640px){.round-label-full{display:none}.round-label-compact{display:inline}}
@media (max-width: 768px), (min-width: 769px) and (max-width: 1199px) and (orientation: portrait){.tournament-board{width:calc(100% + 20px);max-width:none;margin:0 -10px;padding:0 14px}}
</style>
