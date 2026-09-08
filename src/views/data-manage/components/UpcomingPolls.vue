<template>
  <el-card class="data-card">
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
import { useMatchPolls } from '@/services/matchPolls';

defineProps({ seasons: { type: Array, default: () => [] } });
const seasonId = ref('');
const refreshing = ref(false);
const now = ref(Date.now());
const { entry, refresh } = useMatchPolls(seasonId);
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
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.poll-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
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
