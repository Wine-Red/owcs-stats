<template>
  <el-drawer
    :model-value="modelValue"
    :with-header="false"
    :size="drawerSize"
    class="match-data-drawer"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <main class="match-data-shell" v-loading="loading">
      <header class="match-data-header">
        <div class="match-data-heading">
          <span class="match-data-kicker">MATCH DATA INSPECTION</span>
          <h2>{{ title }}</h2>
          <p>{{ subtitle }}</p>
        </div>
        <button type="button" class="match-data-close" aria-label="关闭比赛详情" @click="$emit('update:modelValue', false)">×</button>
      </header>

      <template v-if="detail && !loading">
        <section class="match-scoreboard" aria-label="比赛结果">
          <div class="score-team score-team--left" :class="{ 'is-winner': isWinner(matchData?.team1Id) }">
            <img v-if="teamOne?.logo" :src="resolveMediaUrl(teamOne.logo)" :alt="teamOne.name" />
            <span v-else>{{ initials(teamOne?.name) }}</span>
            <strong>{{ teamOne?.name || '未知队伍' }}</strong>
          </div>
          <div class="score-result">
            <small>{{ matchData?.boFormat || '赛制未设置' }}</small>
            <b>{{ scoreText }}</b>
            <em>{{ matchData?.matchDate || '日期未设置' }}</em>
          </div>
          <div class="score-team score-team--right" :class="{ 'is-winner': isWinner(matchData?.team2Id) }">
            <img v-if="teamTwo?.logo" :src="resolveMediaUrl(teamTwo.logo)" :alt="teamTwo.name" />
            <span v-else>{{ initials(teamTwo?.name) }}</span>
            <strong>{{ teamTwo?.name || '未知队伍' }}</strong>
          </div>
        </section>

        <section class="match-data-metrics" aria-label="数据覆盖摘要">
          <div v-for="metric in metrics" :key="metric.label">
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.label }}</span>
          </div>
        </section>

        <section v-if="mapGames.length" class="round-inspector">
          <nav class="round-rail" aria-label="选择地图局">
            <button
              v-for="(mapGame, index) in mapGames"
              :key="mapGame.id"
              type="button"
              :class="{ 'is-active': Number(selectedMapId) === Number(mapGame.id) }"
              @click="selectMap(mapGame.id)"
            >
              <i>{{ roundNumber(mapGame, index) }}</i>
              <span>
                <b>{{ mapName(mapGame) }}</b>
                <small>{{ formatDuration(mapGame.duration) }} · {{ mapGame.timeline ? `时间线 r${mapGame.timeline.revision}` : '旧版统计' }}</small>
              </span>
              <em :class="{ 'has-timeline': mapGame.timeline }">{{ mapGame.timeline ? 'RAW' : 'LEGACY' }}</em>
            </button>
          </nav>

          <article v-if="selectedMap" class="map-data-panel">
            <header class="map-data-titlebar">
              <div>
                <span>MAP {{ roundNumber(selectedMap, selectedMapIndex) }}</span>
                <h3>{{ mapName(selectedMap) }}</h3>
                <p>{{ mapMode(selectedMap) }} · {{ formatDuration(selectedMap.duration) }} · {{ mapWinner(selectedMap) }}</p>
              </div>
              <div class="map-data-bans">
                <span>禁用</span>
                <b>{{ selectedMap.team1BanHero?.name || '—' }}</b>
                <b>{{ selectedMap.team2BanHero?.name || '—' }}</b>
              </div>
            </header>

            <MatchTimelineInspector
              :map-game="selectedMap"
              :payload="selectedTimelinePayload"
              :loading="selectedTimelineLoading"
              :error="selectedTimelineError"
            />

            <section class="player-data-section">
              <div class="section-heading">
                <div><h4>选手与英雄数据</h4><span>{{ selectedMap.playerStats?.length || 0 }} 名选手</span></div>
                <small>展开选手可查看英雄使用、大招和最后一击明细</small>
              </div>
              <el-table v-if="selectedMap.playerStats?.length" :data="selectedMap.playerStats" size="small" stripe class="player-data-table">
                <el-table-column type="expand" width="44">
                  <template #default="scope">
                    <div class="hero-detail-wrap">
                      <div v-if="scope.row.heroStats?.length" class="hero-detail-grid">
                        <article v-for="hero in scope.row.heroStats" :key="hero.id || hero.heroExternalId || hero.heroName">
                          <header><b>{{ hero.hero?.name || hero.heroName }}</b><span>{{ formatDuration(hero.usageSeconds) }}</span></header>
                          <div><span>使用率 <b>{{ percent(hero.usagePercentage) }}</b></span><span>最后一击 <b>{{ hero.finalBlows || 0 }}</b></span></div>
                          <div><span>大招就绪 <b>{{ hero.ultReady || 0 }}</b></span><span>大招释放 <b>{{ hero.ultUsed || 0 }}</b></span></div>
                          <small>平均充能 {{ hero.avgUltChargeSeconds == null ? '—' : formatDuration(hero.avgUltChargeSeconds) }}</small>
                        </article>
                      </div>
                      <el-empty v-else description="该选手没有英雄明细" :image-size="48" />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="队伍" min-width="120">
                  <template #default="scope"><span class="team-cell" :class="teamClass(scope.row.teamId)">{{ scope.row.team?.name || teamName(scope.row.teamId) }}</span></template>
                </el-table-column>
                <el-table-column label="选手" min-width="130">
                  <template #default="scope"><div class="player-cell"><b>{{ scope.row.player?.name || '未知选手' }}</b><small>{{ roleLabel(scope.row.player?.role) }}</small></div></template>
                </el-table-column>
                <el-table-column label="K / D / A" min-width="105">
                  <template #default="scope"><b class="mono-stat">{{ scope.row.kills || 0 }} / {{ scope.row.deaths || 0 }} / {{ scope.row.assists || 0 }}</b></template>
                </el-table-column>
                <el-table-column prop="finalBlows" label="最后一击" width="90" />
                <el-table-column prop="damage" label="伤害" min-width="86" />
                <el-table-column prop="healing" label="治疗" min-width="86" />
                <el-table-column prop="mitigation" label="承伤减免" min-width="96" />
                <el-table-column prop="ultsUsed" label="大招" width="72" />
              </el-table>
              <el-empty v-else description="该地图局没有选手统计" />
            </section>
          </article>
        </section>
        <el-empty v-else description="这场比赛尚未同步地图局数据" />
      </template>

      <el-result v-else-if="error && !loading" icon="error" title="比赛数据读取失败" :sub-title="error">
        <template #extra><el-button type="primary" @click="loadDetail">重新读取</el-button></template>
      </el-result>
    </main>
  </el-drawer>

</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, ref, watch } from 'vue';
import apiService from '@/services/api';
import { resolveMediaUrl } from '@/utils/media';
import MatchTimelineInspector from './MatchTimelineInspector.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  match: { type: Object, default: null }
});
defineEmits(['update:modelValue']);

const loading = ref(false);
const error = ref('');
const detail = ref(null);
const selectedMapId = ref(null);
const timelinePayloads = ref({});
const timelineLoadStates = ref({});
const timelineErrors = ref({});
const drawerSize = computed(() => window.innerWidth < 768 ? '100%' : 'min(1480px, 96vw)');
const matchData = computed(() => detail.value?.match || props.match || null);
const mapGames = computed(() => detail.value?.mapGames || []);
const selectedMap = computed(() => mapGames.value.find(map => Number(map.id) === Number(selectedMapId.value)) || mapGames.value[0] || null);
const selectedMapIndex = computed(() => Math.max(0, mapGames.value.findIndex(map => Number(map.id) === Number(selectedMap.value?.id))));
const teamOne = computed(() => matchData.value?.team1 || matchData.value?.Team1 || null);
const teamTwo = computed(() => matchData.value?.team2 || matchData.value?.Team2 || null);
const title = computed(() => `${teamOne.value?.name || '队伍 A'} vs ${teamTwo.value?.name || '队伍 B'}`);
const subtitle = computed(() => `${matchData.value?.Season?.name || matchData.value?.season?.name || '未知赛季'} · MatchWeb ${matchData.value?.externalId || matchData.value?.id || '—'}`);
const scoreText = computed(() => matchData.value?.team1Score != null && matchData.value?.team2Score != null
  ? `${matchData.value.team1Score} : ${matchData.value.team2Score}` : 'VS');
const metrics = computed(() => [
  { label: '地图局', value: detail.value?.summary?.mapGames || 0 },
  { label: '比赛时长', value: formatDuration(detail.value?.summary?.totalDurationSeconds) },
  { label: '选手统计', value: detail.value?.summary?.playerStats || 0 },
  { label: '英雄明细', value: detail.value?.summary?.heroStats || 0 },
  { label: '时间线覆盖', value: `${detail.value?.summary?.timelineMaps || 0}/${detail.value?.summary?.mapGames || 0}` }
]);
const selectedTimelineKey = computed(() => String(selectedMap.value?.id || ''));
const selectedTimelinePayload = computed(() => timelinePayloads.value[selectedTimelineKey.value]?.payload || null);
const selectedTimelineLoading = computed(() => timelineLoadStates.value[selectedTimelineKey.value] === 'loading');
const selectedTimelineError = computed(() => timelineErrors.value[selectedTimelineKey.value] || '');

const loadTimeline = async map => {
  if (!map?.id || !map.timeline) return;
  const key = String(map.id);
  const revision = Number(map.timeline.revision) || 1;
  if (timelinePayloads.value[key]?.revision === revision || timelineLoadStates.value[key] === 'loading') return;
  timelineLoadStates.value = { ...timelineLoadStates.value, [key]: 'loading' };
  timelineErrors.value = { ...timelineErrors.value, [key]: '' };
  try {
    const fullMap = await apiService.getMapGameById(map.id);
    const payload = fullMap?.timeline?.payload || null;
    if (!payload) throw new Error('该地图局没有可读取的时间线');
    timelinePayloads.value = { ...timelinePayloads.value, [key]: { revision, payload } };
    timelineLoadStates.value = { ...timelineLoadStates.value, [key]: 'ready' };
  } catch (reason) {
    timelineLoadStates.value = { ...timelineLoadStates.value, [key]: 'error' };
    timelineErrors.value = {
      ...timelineErrors.value,
      [key]: reason?.response?.data?.error || reason?.message || '未知错误'
    };
  }
};

const loadDetail = async () => {
  if (!props.match?.id) return;
  loading.value = true;
  error.value = '';
  timelinePayloads.value = {};
  timelineLoadStates.value = {};
  timelineErrors.value = {};
  try {
    detail.value = await apiService.getMatchData(props.match.id);
    const firstMap = detail.value?.mapGames?.[0] || null;
    selectedMapId.value = firstMap?.id || null;
    void loadTimeline(firstMap);
  } catch (reason) {
    error.value = reason?.response?.data?.error || reason?.message || '未知错误';
    detail.value = null;
  } finally {
    loading.value = false;
  }
};

watch(() => [props.modelValue, props.match?.id], ([visible]) => {
  if (visible) void loadDetail();
  else {
    detail.value = null;
    timelinePayloads.value = {};
    timelineLoadStates.value = {};
    timelineErrors.value = {};
  }
});

const selectMap = id => {
  selectedMapId.value = id;
  const map = mapGames.value.find(candidate => Number(candidate.id) === Number(id));
  void loadTimeline(map);
};

const initials = name => String(name || '?').split(/\s+/u).map(word => word[0]).join('').slice(0, 2).toUpperCase();
const isWinner = teamId => Number(matchData.value?.winnerId) === Number(teamId);
const roundNumber = (map, index) => Number.isInteger(map?.externalRoundIndex) ? map.externalRoundIndex + 1 : index + 1;
const mapName = map => map?.Map?.name || map?.map?.name || '未知地图';
const mapMode = map => map?.Map?.type || map?.map?.type || '模式未设置';
const teamName = teamId => Number(teamId) === Number(matchData.value?.team1Id) ? teamOne.value?.name : teamTwo.value?.name;
const teamClass = teamId => Number(teamId) === Number(matchData.value?.team1Id) ? 'is-team-one' : 'is-team-two';
const mapWinner = map => `胜者：${map?.winner?.name || teamName(map?.winnerId) || '未记录'}`;
const roleLabel = role => ({ tank: '坦克', damage: '输出', support: '辅助' }[role] || role || '职责未知');
const formatDuration = value => {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const percent = value => `${Math.round((Number(value) || 0) * 100) / 100}%`;
</script>

<style scoped>
:global(.match-data-drawer .el-drawer__body) { overflow: hidden; padding: 0; }
.match-data-shell { display: flex; height: 100dvh; min-height: 0; overflow: hidden; flex-direction: column; color: #202124; background: #f4f6f8; }
.match-data-header { z-index: 4; display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 18px; border-bottom: 1px solid #dfe3e8; background: rgba(255,255,255,.96); backdrop-filter: blur(12px); }
.match-data-kicker { color: #1677a6; font: 700 9px/1 'Orbitron',sans-serif; letter-spacing: .15em; }
.match-data-heading h2 { margin: 3px 0 2px; color: #111418; font: 800 20px/1.1 'Oxanium',sans-serif; }
.match-data-heading p { margin: 0; color: #7a818a; font-size: 11px; }
.match-data-close { width: 34px; height: 34px; border: 1px solid #dbe0e5; border-radius: 9px; color: #59616a; background: #fff; cursor: pointer; font-size: 22px; }
.match-scoreboard { display: grid; flex: 0 0 auto; grid-template-columns: minmax(0,1fr) 130px minmax(0,1fr); align-items: center; margin: 9px 14px 7px; padding: 10px 14px; border: 1px solid #dce1e6; border-radius: 11px; background: #fff; }
.score-team { display: flex; min-width: 0; gap: 12px; align-items: center; color: #555e67; }
.score-team--right { flex-direction: row-reverse; text-align: right; }
.score-team img,.score-team>span { display: grid; flex: 0 0 38px; place-items: center; width: 38px; height: 38px; object-fit: contain; border: 1px solid #e1e5e9; border-radius: 9px; background: #f7f8fa; font: 800 12px 'Oxanium',sans-serif; }
.score-team strong { overflow: hidden; font: 750 15px 'Oxanium',sans-serif; text-overflow: ellipsis; white-space: nowrap; }
.score-team.is-winner strong { color: #111; }
.score-team.is-winner img,.score-team.is-winner>span { border-color: #77bfdc; box-shadow: inset 0 -3px #1c94c3; }
.score-result { display: flex; flex-direction: column; align-items: center; }
.score-result small,.score-result em { color: #8a929a; font-size: 10px; font-style: normal; }
.score-result b { margin: 2px 0; color: #111; font: 800 24px/1 'Oxanium',sans-serif; }
.match-data-metrics { display: grid; flex: 0 0 auto; grid-template-columns: repeat(5,minmax(0,1fr)); margin: 0 14px 7px; overflow: hidden; border: 1px solid #dfe3e8; border-radius: 10px; background: #fff; }
.match-data-metrics>div { display: flex; flex-direction: column; gap: 2px; padding: 7px 12px; border-right: 1px solid #e8ebee; }
.match-data-metrics>div:last-child { border-right: 0; }
.match-data-metrics strong { color: #16191d; font: 800 16px/1 'Oxanium',sans-serif; }
.match-data-metrics span { color: #868d95; font-size: 10px; }
.round-inspector { display: grid; flex: 1 1 auto; min-height: 0; grid-template-columns: 220px minmax(0,1fr); gap: 10px; margin: 0 14px 10px; overflow: hidden; align-items: stretch; }
.round-rail { display: flex; min-height: 0; flex-direction: column; overflow: auto; border: 1px solid #dce1e6; border-radius: 10px; background: #fff; }
.round-rail button { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 9px 10px; border: 0; border-bottom: 1px solid #edf0f2; color: #555d65; background: transparent; cursor: pointer; text-align: left; }
.round-rail button:last-child { border-bottom: 0; }
.round-rail button:hover { background: #f5f9fb; }
.round-rail button.is-active { color: #0c5d80; background: #eaf6fb; box-shadow: inset 3px 0 #1b96c4; }
.round-rail i { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid #dce2e7; border-radius: 8px; font: 700 11px 'Oxanium',sans-serif; font-style: normal; }
.round-rail span { display: flex; min-width: 0; flex-direction: column; }
.round-rail b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.round-rail small { color: #9299a1; font-size: 9px; }
.round-rail em { align-self: start; padding: 3px 5px; border-radius: 4px; color: #8a9198; background: #eceff1; font: 700 7px 'Orbitron',sans-serif; font-style: normal; }
.round-rail em.has-timeline { color: #076588; background: #d9f1fa; }
.map-data-panel { display: flex; min-height: 0; overflow: hidden; flex-direction: column; border: 1px solid #dce1e6; border-radius: 10px; background: #fff; }
.map-data-titlebar { display: flex; flex: 0 0 auto; justify-content: space-between; gap: 14px; align-items: end; padding: 9px 14px; border-bottom: 1px solid #e7eaed; background: linear-gradient(110deg,#17212a,#223a48); }
.map-data-titlebar span { color: #5bc5eb; font: 700 8px 'Orbitron',sans-serif; letter-spacing: .14em; }
.map-data-titlebar h3 { margin: 2px 0; color: #fff; font: 800 18px 'Oxanium',sans-serif; }
.map-data-titlebar p { margin: 0; color: #a9bbc5; font-size: 10px; }
.map-data-bans { display: grid; grid-template-columns: auto auto; gap: 4px 6px; text-align: right; }
.map-data-bans span { grid-column: 1/-1; color: #8199a7; }
.map-data-bans b { padding: 5px 7px; border: 1px solid #3b5361; border-radius: 5px; color: #d5e0e5; font-size: 10px; }
.player-data-section { display: flex; flex: 1 1 auto; min-height: 0; padding: 0 9px 8px; flex-direction: column; }
.section-heading { display: flex; flex: 0 0 auto; justify-content: space-between; gap: 12px; align-items: end; padding: 2px 2px 5px; }
.section-heading>div { display: flex; align-items: baseline; gap: 8px; }
.section-heading h4 { margin: 0; color: #202429; font-size: 13px; }
.section-heading span,.section-heading small { color: #8b9299; font-size: 9px; }
.player-cell { display: flex; flex-direction: column; }
.player-cell b { color: #22272c; font-size: 12px; }
.player-cell small { color: #92989e; font-size: 9px; }
.team-cell { padding-left: 7px; border-left: 3px solid #2aa3ce; font-size: 11px; }
.team-cell.is-team-two { border-left-color: #ef7c39; }
.mono-stat { font-family: 'Oxanium',sans-serif; font-size: 11px; }
.player-data-table { flex: 1 1 auto; }
:deep(.player-data-table .el-table__cell) { padding: 3px 0; }
:deep(.player-data-table .cell) { line-height: 1.15; }
:deep(.player-data-table .el-table__row) { height: 38px; }
:deep(.player-data-table th.el-table__cell) { height: 34px; padding: 2px 0; }
.hero-detail-wrap { padding: 12px 18px; background: #f6f8fa; }
.hero-detail-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap: 8px; }
.hero-detail-grid article { padding: 10px; border: 1px solid #dfe4e8; border-radius: 8px; background: #fff; }
.hero-detail-grid header,.hero-detail-grid div { display: flex; justify-content: space-between; gap: 8px; }
.hero-detail-grid header { padding-bottom: 6px; border-bottom: 1px solid #edf0f2; }
.hero-detail-grid header b { color: #182026; font-size: 12px; }
.hero-detail-grid header span,.hero-detail-grid div span,.hero-detail-grid small { color: #7e878e; font-size: 9px; }
.hero-detail-grid div { margin-top: 6px; }
@media (max-width: 820px) {
  :global(.match-data-drawer .el-drawer__body) { overflow: auto; }
  .match-data-shell { height: auto; min-height: 100dvh; overflow: visible; }
  .round-inspector { grid-template-columns: 1fr; }
  .round-inspector { flex: 0 0 auto; overflow: visible; }
  .round-rail { flex-direction: row; overflow-x: auto; }
  .map-data-panel { min-height: auto; }
  .round-rail button { min-width: 210px; border-right: 1px solid #edf0f2; border-bottom: 0; }
}
@media (max-width: 600px) {
  .match-data-header { padding: 15px; }
  .match-scoreboard { grid-template-columns: 1fr 84px 1fr; margin: 10px; padding: 14px 8px; }
  .score-team { flex-direction: column; text-align: center; }
  .score-team--right { flex-direction: column; }
  .score-team strong { font-size: 12px; white-space: normal; }
  .score-result b { font-size: 22px; }
  .match-data-metrics { grid-template-columns: repeat(3,1fr); margin: 10px; }
  .match-data-metrics>div { border-bottom: 1px solid #e8ebee; }
  .round-inspector { margin: 10px; }
  .map-data-titlebar,.section-heading { align-items: flex-start; flex-direction: column; }
}
</style>
