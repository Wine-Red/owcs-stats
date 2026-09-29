<template>
  <el-button :disabled="!seasonId" plain @click="openPreview">一键配置队伍</el-button>
  <el-dialog v-model="visible" class="liquipedia-team-dialog" title="从 Liquipedia 配置赛季队伍"
    width="760px" top="3vh" append-to-body :close-on-click-modal="false"
    :close-on-press-escape="!applying" :show-close="!applying">
    <div class="team-import" :aria-busy="loading || applying">
      <p>只根据赛事参赛队伍的页面链接，查找已绑定同一 Liquipedia 页面的本地队伍。不会新建队伍或配置选手阵容。</p>
      <div v-if="loading" class="team-import-loading" role="status">正在读取赛事页面并核对队伍页面，Liquipedia 可能需要约 30 秒。</div>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <template v-if="report">
        <div class="team-import-source">
          <strong>{{ report.seasonName }}</strong>
          <a :href="report.sourceUrl" target="_blank" rel="noopener noreferrer">查看赛事页面 ↗</a>
          <span>读取于 {{ new Date(report.fetchedAt).toLocaleString('zh-CN', { hour12: false }) }} · 页面版本 {{ report.revisionId || '未知' }}</span>
        </div>
        <el-alert v-if="result" :title="result.message" type="success" show-icon :closable="false" />
        <div class="team-import-counts" aria-live="polite">
          <div><strong>{{ report.summary.totalTeams }}</strong><span>页面参赛队伍</span></div>
          <div><strong>{{ report.summary.matchedTeams }}</strong><span>按页面匹配</span></div>
          <div><strong>{{ result ? result.createdTeams : report.summary.newTeams }}</strong><span>{{ result ? '已新增关联' : '待新增关联' }}</span></div>
          <div><strong>{{ report.summary.skippedTeams }}</strong><span>待处理</span></div>
        </div>
        <el-alert v-for="warning in report.warnings" :key="warning" :title="warning" type="warning" show-icon :closable="false" />
        <div class="team-import-list">
          <article v-for="team in report.teams" :key="team.canonicalPage" class="team-import-row" :class="{ excluded: excludedTeamLinks.includes(team.link) }">
            <div>
              <a :href="team.link" target="_blank" rel="noopener noreferrer">{{ team.name }}</a>
              <small v-if="team.status === 'matched'">→ {{ team.matchedName }} #{{ team.teamId }}</small>
              <small v-else class="team-import-reason">{{ team.reason }}</small>
            </div>
            <el-tag :type="team.status === 'matched' ? team.existing ? 'info' : 'success' : 'warning'" size="small">
              {{ team.status === 'matched' ? result ? excludedTeamLinks.includes(team.link) ? '本次排除' : '已关联' : team.existing ? '已关联' : '待加入' : '跳过' }}
            </el-tag>
            <el-button v-if="team.status === 'matched' && !result" text size="small" :disabled="applying" @click="toggleExcluded(team.link)">
              {{ excludedTeamLinks.includes(team.link) ? '恢复' : '本次排除' }}
            </el-button>
          </article>
        </div>
        <p class="team-import-credit">来源：Liquipedia（CC BY-SA）。未绑定页面或页面重复绑定的队伍会跳过；本次仅添加赛季队伍及来源记录。</p>
      </template>
    </div>
    <template #footer>
      <el-button :disabled="applying" @click="visible = false">{{ result ? '完成' : '取消' }}</el-button>
      <el-button :loading="loading" :disabled="applying" @click="loadPreview">重新预览</el-button>
      <el-button type="primary" :loading="applying" :disabled="loading || !!result || !report?.previewToken || !selectedCount" @click="applyPreview">
        配置 {{ selectedCount }} 支队伍
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, ref } from 'vue';
import api from '@/services/api';
import { normalizeLiquipediaTournamentUrl } from '@/utils/liquipediaTournament.mjs';
const props = defineProps({ seasonId: { type: [Number, String], default: '' }, draftUrl: { type: String, default: undefined } });
const emit = defineEmits(['applied']);
const visible = ref(false), loading = ref(false), applying = ref(false);
const report = ref(null), result = ref(null), error = ref(''), excludedTeamLinks = ref([]);
let selectedSeasonId = null, requestSequence = 0;
const selectedCount = computed(() => (report.value?.teams || []).filter(team => team.status === 'matched' && !excludedTeamLinks.value.includes(team.link)).length);
const toggleExcluded = link => {
  excludedTeamLinks.value = excludedTeamLinks.value.includes(link)
    ? excludedTeamLinks.value.filter(value => value !== link) : [...excludedTeamLinks.value, link];
};
const loadPreview = async () => {
  const sequence = ++requestSequence;
  loading.value = true; error.value = ''; report.value = null; result.value = null;
  try {
    const data = await api.previewLiquipediaTeams(selectedSeasonId);
    if (sequence !== requestSequence) return;
    if (props.draftUrl !== undefined && normalizeLiquipediaTournamentUrl(props.draftUrl) !== normalizeLiquipediaTournamentUrl(data.configuredUrl)) {
      error.value = '赛事页面有未保存的修改，请先保存赛季可视化配置，再重新预览。';
      return;
    }
    excludedTeamLinks.value = excludedTeamLinks.value.filter(link => data.teams.some(team => team.link === link));
    report.value = data;
  } catch (cause) {
    if (sequence === requestSequence) error.value = cause.response?.data?.error || '读取失败，请稍后重试';
  } finally { if (sequence === requestSequence) loading.value = false; }
};
const openPreview = () => {
  selectedSeasonId = Number(props.seasonId);
  excludedTeamLinks.value = []; visible.value = true;
  loadPreview();
};
const applyPreview = async () => {
  if (applying.value || !report.value?.previewToken || !selectedCount.value) return;
  applying.value = true; error.value = '';
  try {
    result.value = await api.applyLiquipediaTeams(selectedSeasonId, report.value.previewToken, excludedTeamLinks.value);
    emit('applied', selectedSeasonId);
  } catch (cause) {
    error.value = cause.response?.data?.error || '未收到配置结果；可以重试，重复提交不会新增重复关联';
    if (cause.response?.status === 409) report.value.previewToken = null;
  } finally { applying.value = false; }
};
</script>

<style scoped>
:global(.el-dialog.liquipedia-team-dialog){display:flex;flex-direction:column;max-width:calc(100vw - 24px);max-height:94dvh}
:global(.el-dialog.liquipedia-team-dialog .el-dialog__body){min-height:0;overflow-y:auto}
.team-import{display:grid;gap:16px;line-height:1.55}
.team-import>p{margin:0;color:var(--el-text-color-regular)}
.team-import-loading{padding:22px;background:var(--el-fill-color-light)}
.team-import-source{display:flex;flex-wrap:wrap;gap:6px 18px}
.team-import-source span{width:100%;color:var(--el-text-color-secondary);font-size:12px}
.team-import a{color:var(--el-color-primary);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.team-import-counts{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--el-border-color);border-radius:8px}
.team-import-counts>div{display:grid;gap:2px;padding:12px;border-right:1px solid var(--el-border-color)}
.team-import-counts>div:last-child{border:0}
.team-import-counts strong{font-size:22px;font-variant-numeric:tabular-nums}
.team-import-counts span,.team-import-credit{color:var(--el-text-color-secondary);font-size:12px}
.team-import-list{display:grid;gap:8px}
.team-import-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--el-border-color-lighter);border-radius:7px}
.team-import-row.excluded{opacity:.5}
.team-import-row>div{display:grid;min-width:0}
.team-import-row small{overflow-wrap:anywhere;color:var(--el-text-color-secondary)}
.team-import-row .team-import-reason{color:var(--el-color-warning-dark-2)}
.team-import-credit{margin:0}
@media(max-width:600px){.team-import-counts{grid-template-columns:repeat(2,1fr)}.team-import-counts>div:nth-child(2){border-right:0}.team-import-counts>div:nth-child(-n+2){border-bottom:1px solid var(--el-border-color)}.team-import-row{grid-template-columns:minmax(0,1fr) auto}.team-import-row>.el-button{grid-column:1/-1;justify-self:start}}
</style>
