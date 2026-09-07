<template>
  <el-button :disabled="!seasonId" plain @click="openPreview">从 Liquipedia 配置阵容</el-button>
  <el-dialog v-model="visible" class="liquipedia-roster-dialog" title="自动配置赛季队伍与选手" width="min(1680px, 96vw)" top="3vh"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!applying" :show-close="!applying">
    <template #header="{ titleId, titleClass }">
      <div class="import-header">
        <span :id="titleId" :class="titleClass">自动配置赛季队伍与选手</span>
        <el-button :disabled="applying" :icon="Plus" @click="openManual()">手动补充关联</el-button>
      </div>
    </template>
    <div class="roster-import" :aria-busy="loading || applying">
      <el-alert v-if="manualNotice" :title="manualNotice" type="success" show-icon :closable="false" />
      <div v-if="loading" class="import-loading" role="status">正在读取赛事页面并匹配数据库，请稍候。Liquipedia 请求间隔可能需要约 30 秒。</div>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <template v-if="report">
        <div class="import-source">
          <strong>{{ report.seasonName }}</strong>
          <a :href="report.sourceUrl" target="_blank" rel="noopener noreferrer">查看 Liquipedia 赛事页面 ↗</a>
          <span>读取于 {{ formatTime(report.fetchedAt) }} · 页面版本 {{ report.revisionId || '未知' }}</span>
        </div>
        <el-alert v-if="result" :title="result.message" type="success" show-icon :closable="false" />
        <div class="import-counts" aria-live="polite">
          <div><strong>{{ selectionSummary.matchedTeams }} / {{ selectionSummary.totalTeams }}</strong><span>队伍匹配成功</span></div>
          <div><strong>{{ selectionSummary.matchedPlayers }} / {{ selectionSummary.totalPlayers }}</strong><span>选手匹配成功</span></div>
          <div><strong>{{ result ? result.createdTeams : selectionSummary.newTeams }} / {{ result ? result.createdPlayers : selectionSummary.newPlayers }}</strong><span>{{ result ? '已新增队伍 / 选手关联' : '待新增队伍 / 选手关联' }}</span></div>
        </div>
        <div v-if="excludedTeamLinks.length" class="import-excluded">
          <span>已排除 {{ excludedTeamLinks.length }} 支队伍</span>
          <el-button v-if="!result" size="small" :disabled="applying" @click="excludedTeamLinks = []">恢复全部</el-button>
        </div>
        <div class="import-teams">
          <details v-for="team in visibleTeams" :key="team.link" class="import-team" >
            <summary>
              <span class="import-team-name">{{ team.shortNames.join(' / ') || team.name }}<small>{{ team.name }}</small></span>
              <div class="import-team-meta">
                <span class="import-team-count">{{ team.players.filter(player => player.status === 'matched').length }} / {{ team.players.length }} 位选手</span>
                <el-tag size="small" :type="team.status === 'matched' ? 'success' : 'warning'">{{ team.status === 'matched' ? (team.existing ? '队伍已关联' : result ? '队伍已配置' : '队伍可关联') : '队伍已跳过' }}</el-tag>
              </div>
              <el-button v-if="!result" class="exclude-team-button" text :icon="Close" :disabled="applying" title="排除此队伍的匹配" :aria-label="`排除 ${team.shortNames[0] || team.name} 的匹配`" @click.stop.prevent="excludeTeam(team)" />
            </summary>
            <div class="import-team-body">
              <div class="team-roster-actions">
                <el-button text :icon="Plus" :disabled="applying" @click="openManual(team)">添加选手</el-button>
                <el-button v-if="!result && hasExcludedPlayers(team)" text :disabled="applying" @click="restorePlayers(team)">恢复移除</el-button>
              </div>
              <p v-if="team.reason" class="import-warning">{{ team.reason }}</p>
              <p v-for="warning in team.warnings" :key="warning" class="import-warning">{{ warning }}</p>
              <ul class="import-players">
                <li v-for="player in team.players" :key="`${player.link}:${player.name}`">
                  <a :href="player.link" target="_blank" rel="noopener noreferrer">{{ player.name }}</a>
                  <el-button v-if="!result" text :icon="Close" :disabled="applying" title="从本次匹配中移除" :aria-label="`移除 ${player.name} 的匹配`" @click="excludedPlayers.push(playerKey(team, player))" />
                  <span v-if="player.status === 'matched'" class="import-matched">{{ player.matchedName }} · {{ player.existing ? '已有关联' : result ? '已配置' : '可关联' }}</span>
                  <span v-else class="import-warning">{{ player.reason }}</span>
                </li>
              </ul>
            </div>
          </details>
          <el-empty v-if="!visibleTeams.length" description="没有待应用的队伍" :image-size="60" />
        </div>
        <p class="import-attribution">阵容来源：Liquipedia（CC BY-SA）。预览 15 分钟内有效；再次预览可能复用 5 分钟内的页面缓存。</p>
      </template>
    </div>
    <template #footer>
      <div class="import-footer">
        <el-button :disabled="applying" @click="visible = false">{{ result ? '完成' : '取消' }}</el-button>
        <el-button :loading="loading" :disabled="applying" @click="loadPreview">重新预览</el-button>
        <el-button type="primary" :loading="applying" :disabled="loading || !report?.previewToken || !selectionSummary.matchedTeams || !!result" @click="applyPreview">应用已匹配关联</el-button>
      </div>
    </template>
  </el-dialog>
  <ManualSeasonRosterDialog v-if="manualVisible" :season-id="selectedSeasonId" :seed="manualSeed" @close="manualVisible = false" @saved="manualSaved" />
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, onBeforeUnmount, ref } from 'vue';
import { Close, Plus } from '@element-plus/icons-vue';
import api from '@/services/api';
import { normalizeLiquipediaTournamentUrl } from '@/utils/liquipediaTournament.mjs';
import ManualSeasonRosterDialog from './ManualSeasonRosterDialog.vue';

const props = defineProps({
  seasonId: { type: [Number, String], default: '' },
  draftUrl: { type: String, default: undefined }
});
const emit = defineEmits(['applied']);
const visible = ref(false);
const loading = ref(false);
const applying = ref(false);
const report = ref(null);
const result = ref(null);
const error = ref('');
const excludedTeamLinks = ref([]);
const excludedPlayers = ref([]);
const playerKey = (team, player) => JSON.stringify([team.link, player.link, player.name]);
const hasExcludedPlayers = team => excludedPlayers.value.some(key => JSON.parse(key)[0] === team.link);
const restorePlayers = team => { excludedPlayers.value = excludedPlayers.value.filter(key => JSON.parse(key)[0] !== team.link); };
const manualVisible = ref(false);
const manualSeed = ref({});
const manualNotice = ref('');
let selectedSeasonId = null;
let requestSequence = 0;
onBeforeUnmount(() => { requestSequence += 1; });
const visibleTeams = computed(() => (report.value?.teams || []).filter(team => !excludedTeamLinks.value.includes(team.link)).map(team => ({ ...team, players: team.players.filter(player => !excludedPlayers.value.includes(playerKey(team, player))) })));
const selectionSummary = computed(() => {
  const teams = visibleTeams.value;
  const players = teams.flatMap(team => team.players);
  return {
    totalTeams: teams.length, matchedTeams: teams.filter(team => team.status === 'matched').length,
    newTeams: teams.filter(team => team.status === 'matched' && !team.existing).length,
    totalPlayers: players.length, matchedPlayers: players.filter(player => player.status === 'matched').length,
    newPlayers: players.filter(player => player.status === 'matched' && !player.existing).length
  };
});
const excludeTeam = team => {
  if (!applying.value && !result.value && !excludedTeamLinks.value.includes(team.link)) excludedTeamLinks.value.push(team.link);
};
const formatTime = value => new Date(value).toLocaleString('zh-CN', { hour12: false });

const loadPreview = async () => {
  const sequence = ++requestSequence;
  loading.value = true;
  error.value = '';
  report.value = null;
  result.value = null;
  try {
    const data = await api.previewLiquipediaRoster(selectedSeasonId);
    if (sequence !== requestSequence) return;
    if (props.draftUrl !== undefined && normalizeLiquipediaTournamentUrl(props.draftUrl) !== normalizeLiquipediaTournamentUrl(data.sourceUrl)) {
      error.value = '当前填写的赛事页面尚未保存，请先保存赛季可视化配置，再重新预览。';
      return;
    }
    excludedTeamLinks.value = excludedTeamLinks.value.filter(link => data.teams.some(team => team.link === link));
    const keys = new Set(data.teams.flatMap(team => team.players.map(player => playerKey(team, player))));
    excludedPlayers.value = excludedPlayers.value.filter(key => keys.has(key));
    report.value = data;
  } catch (cause) {
    if (sequence === requestSequence) error.value = cause.response?.data?.error || '读取失败，请稍后重新预览。';
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
};
const openPreview = () => {
  selectedSeasonId = Number(props.seasonId);
  excludedTeamLinks.value = [];
  excludedPlayers.value = [];
  manualNotice.value = '';
  visible.value = true;
  loadPreview();
};
const openManual = (team, player) => {
  manualSeed.value = { teamId: team?.status === 'matched' ? team.teamId : null, teamName: team?.name,
    teamShortName: team?.shortNames?.[0], playerName: player?.name, playerRole: player?.role };
  manualVisible.value = true;
};
const manualSaved = data => {
  manualNotice.value = data.message;
  manualVisible.value = false;
  // Catalog additions must reach the parent as well as the refreshed preview.
  emit('applied', selectedSeasonId, { refreshCatalog: true });
  loadPreview();
};
const applyPreview = async () => {
  if (applying.value || !report.value?.previewToken) return;
  applying.value = true;
  error.value = '';
  try {
    result.value = await api.applyLiquipediaRoster(selectedSeasonId, report.value.previewToken, excludedTeamLinks.value, excludedPlayers.value);
    emit('applied', selectedSeasonId);
  } catch (cause) {
    error.value = cause.response?.data?.error || '未收到应用结果；可以重试，重复应用不会重复创建关联。';
    if (cause.response?.status === 409) report.value.previewToken = null;
  } finally {
    applying.value = false;
  }
};
</script>

<style scoped>
:global(.el-dialog.liquipedia-roster-dialog) { display: flex; flex-direction: column; max-height: 94dvh; }
:global(.el-dialog.liquipedia-roster-dialog .el-dialog__body) { display: flex; min-height: 0; overflow: hidden; }
:global(.el-dialog.liquipedia-roster-dialog .el-dialog__header),
:global(.el-dialog.liquipedia-roster-dialog .el-dialog__footer) { flex-shrink: 0; }
.roster-import { color: var(--el-text-color-primary); overflow-y: auto; width: 100%; padding-right: 4px; }
.import-attribution { line-height: 1.6; color: var(--el-text-color-regular); }
.import-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding-right: 28px; }
.import-loading { padding: 32px 16px; background: var(--el-fill-color-light); line-height: 1.8; }
.import-source { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin: 0 0 18px; }
.import-source span { width: 100%; color: var(--el-text-color-regular); font-size: 12px; }
.roster-import a { color: var(--el-color-primary); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
.import-counts { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--el-border-color); border-radius: 8px; margin: 16px 0; }
.import-counts > div { display: grid; gap: 8px; padding: 16px; }
.import-counts strong { font-size: 23px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.import-counts span { color: var(--el-text-color-regular); font-size: 12px; }
.import-excluded { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.import-team summary > .exclude-team-button { grid-column: 3; grid-row: 1; align-self: start; width: 32px; height: 32px; padding: 0; margin: -6px -6px 0 0; color: var(--el-text-color-secondary); border-radius: 6px; }
.import-team summary > .exclude-team-button:not(:disabled):hover { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.import-team summary:focus-visible, .exclude-team-button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.import-teams { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; gap: 12px; margin: 12px 0; }
.import-teams > .el-empty { grid-column: 1 / -1; }
.import-team { min-width: 0; border: 1px solid var(--el-border-color); border-radius: 8px; }
.import-team summary { display: grid; grid-template-columns: 10px minmax(0, 1fr) 24px; align-items: center; gap: 12px 8px; padding: 16px; cursor: pointer; list-style: none; }
.import-team summary::before { content: '▸'; grid-row: 1; align-self: start; line-height: 20px; color: var(--el-text-color-secondary); }
.import-team[open] summary::before { content: '▾'; }
.import-team-name { grid-column: 2; font-weight: 600; overflow-wrap: anywhere; }
.import-team-meta { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.import-team-count { color: var(--el-text-color-regular); font-size: 12px; }
.import-team-name small { display: block; margin-top: 4px; font-weight: 400; color: var(--el-text-color-regular); }
.import-team-body { border-top: 1px solid var(--el-border-color-lighter); padding: 4px 16px 12px; }
.team-roster-actions { display: flex; justify-content: space-between; gap: 4px; padding-top: 8px; }
.team-roster-actions .el-button { margin-left: 0; padding: 8px 4px; }
.import-players li > .el-button { width: 32px; height: 32px; padding: 0; color: var(--el-text-color-secondary); }
.import-players li > .el-button:hover { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.import-players { list-style: none; padding: 0; margin: 0; }
.import-players li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; padding: 10px 0; line-height: 1.5; align-items: start; border-bottom: 1px solid var(--el-border-color-lighter); }
.import-players li:last-child { border-bottom: 0; }
.import-players li > a { grid-column: 1; grid-row: 1; }
.import-players li > .el-button { grid-column: 2; grid-row: 1; }
.import-players li > .import-matched, .import-players li > .import-warning { grid-column: 1 / -1; overflow-wrap: anywhere; font-size: 12px; }
.import-warning { color: var(--el-text-color-primary); line-height: 1.6; }
.import-players .import-warning::before { content: '跳过 · '; color: var(--el-color-warning-dark-2); }
.import-matched { color: var(--el-text-color-regular); }
.import-attribution { font-size: 12px; }
.import-footer { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.import-footer .el-button + .el-button { margin-left: 0; }
.import-footer .el-button:first-child { margin-right: auto; }
@media (max-width: 999px) {
  .import-teams { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .import-header { align-items: flex-start; }
  .import-team summary > .exclude-team-button { width: 44px; height: 44px; margin-top: -10px; margin-right: -10px; }
  .import-teams { grid-template-columns: minmax(0, 1fr); }
  .import-counts > div { padding: 12px 8px; }
  .import-counts strong { font-size: 16px; }
  .import-footer .el-button { min-height: 44px; }
}
</style>
