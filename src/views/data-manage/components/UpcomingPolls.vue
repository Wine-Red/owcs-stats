<template>
  <el-card class="data-card">
    <section class="poll-control" aria-labelledby="poll-control-title">
      <div>
        <h2 id="poll-control-title">启用投票功能</h2>
        <p class="poll-hint">控制主站和 API 静态包的投票入口及提交。切换自动保存，刷新或切回展示页面时生效。</p>
      </div>
      <div class="poll-control-action">
        <span role="status">{{ saving ? '保存中…' : checkingStatus ? '读取中…' : pollEnabled === null ? '未读取' : pollEnabled ? '已启用' : '已关闭' }}</span>
        <el-switch :model-value="pollEnabled === true" :loading="saving"
          :disabled="pollEnabled === null || checkingStatus || saving" aria-label="启用投票功能" @change="toggleVoting" />
        <el-button link type="primary" :loading="checkingStatus" :disabled="saving" @click="loadStatus">刷新状态</el-button>
      </div>
    </section>
    <el-alert v-if="settingsError" :title="settingsError" type="error" :closable="false" show-icon />
    <el-alert v-else-if="pollEnabled === false" title="投票功能已关闭，已有票数仍保留并可在后台查看。" type="info" :closable="false" show-icon />
    <div class="poll-toolbar">
      <label for="poll-season">赛季</label>
      <el-select id="poll-season" v-model="seasonId" filterable clearable placeholder="选择赛季" class="poll-season">
        <el-option v-for="season in seasons" :key="season.id" :label="season.name" :value="season.id" />
      </el-select>
      <el-button :disabled="!seasonId" :loading="refreshing" @click="reload">刷新投票</el-button>
    </div>
    <el-alert v-if="seasonId && entry.error" :title="entry.error + '；当前数据可能不是最新，请重试。'" type="error" :closable="false" show-icon />
    <el-alert v-else-if="seasonId && entry.stale" title="赛程暂时无法确认，以下可能为缓存数据，投票已暂停。" type="warning" :closable="false" show-icon />
    <template v-if="seasonId">
      <p v-if="entry.fetchedAt" class="poll-hint">最近更新：{{ formatTime(entry.fetchedAt) }} · {{ rows.length }} 场未开赛比赛 · 共 {{ total }} 票</p>
      <div v-loading="entry.loading || refreshing">
        <el-empty v-if="!rows.length && !entry.loading" :description="entry.error || entry.stale ? '暂时无法确认未开赛投票' : '暂无未开赛比赛'" />
        <article v-for="row in rows" :key="row.sourceId" class="poll-match">
          <div class="poll-meta"><time>{{ formatTime(row.timestamp) }}</time><span>{{ row.total }} 票 · {{ row.closed ? '暂停投票' : '投票中' }}</span></div>
          <div class="poll-teams">
            <div><strong>{{ row.team1Name || `队伍 #${row.team1Id}` }}</strong><p>{{ row.votes[row.team1Id] || 0 }} 票 · {{ percent(row, row.team1Id) }}</p></div>
            <span class="poll-vs">VS</span>
            <div><strong>{{ row.team2Name || `队伍 #${row.team2Id}` }}</strong><p>{{ row.votes[row.team2Id] || 0 }} 票 · {{ percent(row, row.team2Id) }}</p></div>
          </div>
        </article>
      </div>
    </template>
    <el-empty v-else description="请选择赛季" />
  </el-card>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/services/api';
import { getMatchPollStatus, useMatchPolls } from '@/services/matchPolls';

defineProps({ seasons: { type: Array, default: () => [] } });
const seasonId = ref('');
const refreshing = ref(false);
const now = ref(Date.now());
const pollEnabled = ref(null);
const checkingStatus = ref(false);
const saving = ref(false);
const settingsError = ref('');
const { entry, refresh } = useMatchPolls(seasonId);
const loadStatus = async () => {
  if (checkingStatus.value || saving.value) return;
  checkingStatus.value = true;
  settingsError.value = '';
  try {
    const status = await getMatchPollStatus();
    if (typeof status.enabled !== 'boolean') throw new Error('投票状态返回异常，请刷新状态后重试。');
    pollEnabled.value = status.enabled;
    void refresh(true);
  } catch (error) {
    pollEnabled.value = null;
    settingsError.value = error.message;
  } finally { checkingStatus.value = false; }
};
const toggleVoting = async enabled => {
  if (pollEnabled.value === null || checkingStatus.value || saving.value) return;
  saving.value = true;
  settingsError.value = '';
  try {
    const result = await api.updateConfig({ key: 'match_poll_settings', value: { enabled }, description: '比赛投票功能开关' });
    if (typeof result.config?.value?.enabled !== 'boolean') throw new Error('投票设置返回异常，请刷新状态后重试。');
    pollEnabled.value = result.config.value.enabled;
    ElMessage.success(pollEnabled.value ? '投票功能已启用' : '投票功能已关闭');
    void refresh(true);
  } catch (error) {
    settingsError.value = error.response?.data?.error || error.message || '投票设置保存失败，请重试。';
  } finally { saving.value = false; }
};
const rows = computed(() => Object.values(entry.value.sources || {})
  .filter(row => row.timestamp > now.value && !row.matchId)
  .sort((a, b) => a.timestamp - b.timestamp));
const total = computed(() => rows.value.reduce((sum, row) => sum + row.total, 0));
const percent = (row, teamId) => row.total ? `${((row.votes[teamId] || 0) / row.total * 100).toFixed(1)}%` : '—';
const formatTime = timestamp => new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const reload = async () => {
  refreshing.value = true;
  try { await refresh(true); } finally { refreshing.value = false; now.value = Date.now(); }
};
let timer;
onMounted(() => { void loadStatus(); timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.poll-control { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.poll-control h2 { margin: 0; font-size: 18px; }
.poll-control .poll-hint { margin: 8px 0 0; }
.poll-control-action { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.poll-control-action > span { color: var(--el-text-color-secondary); font-size: 13px; }
.poll-control-action :deep(.el-switch) { min-height: 44px; }
.poll-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.poll-season { width: 320px; max-width: 100%; }
.poll-hint { color: var(--el-text-color-secondary); line-height: 1.7; }
.poll-match { padding: 20px 0; border-top: 1px solid var(--el-border-color); }
.poll-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; color: var(--el-text-color-secondary); font-size: 13px; }
.poll-teams { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 16px; align-items: center; margin-top: 16px; }
.poll-teams > div { overflow-wrap: anywhere; }
.poll-teams > div:last-child { text-align: right; }
.poll-teams p { margin: 8px 0 0; font-variant-numeric: tabular-nums; }
.poll-vs { color: var(--el-text-color-secondary); }
@media (max-width: 600px) { .poll-season { width: 100%; } .poll-teams { gap: 8px; } }
</style>
