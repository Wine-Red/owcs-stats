<template>
  <el-dialog v-model="visible" class="manual-roster-dialog" title="手动补充赛季关联" width="min(760px, 94vw)" top="3vh"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @closed="emit('close')">
    <div class="manual-roster-content" :aria-busy="loading || saving">
      <p class="manual-hint">选择已有队伍和选手，或填写新记录。点击保存后统一新建并关联到本赛季；取消不会写入。</p>
      <el-alert v-if="seed.playerName || seed.teamName" :title="`正在补充：${seed.teamName || ''}${seed.playerName ? ` / ${seed.playerName}` : ''}。请核对要使用的数据库记录。`" type="info" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <p v-if="loading" role="status">正在读取队伍、选手与赛季关联…</p>
      <el-button v-if="!ready && !loading" @click="loadCatalog">重新加载基础数据</el-button>
      <el-form v-if="ready" label-position="top" :disabled="saving">
        <h3>队伍</h3>
        <el-radio-group v-model="teamMode" aria-label="队伍选择方式">
          <el-radio-button value="existing">选择已有队伍</el-radio-button>
          <el-radio-button value="new">新建队伍</el-radio-button>
        </el-radio-group>
        <el-form-item v-if="teamMode === 'existing'" label="已有队伍" class="manual-field">
          <el-select v-model="teamId" filterable clearable placeholder="搜索队伍名称" aria-label="选择已有队伍">
            <el-option v-for="team in teams" :key="team.id" :value="team.id" :label="`${team.name} · ${team.region || '未分区'} · #${team.id}${registeredTeamIds.has(team.id) ? ' · 已在赛季中' : ''}`" />
          </el-select>
        </el-form-item>
        <div v-else class="manual-new-team manual-field">
          <el-form-item label="队伍名称（简称）" required><el-input v-model="newTeam.name" maxlength="255" placeholder="如 WBG" aria-label="新队伍名称" /></el-form-item>
          <el-form-item label="地区" required><el-input v-model="newTeam.region" maxlength="255" placeholder="如 中国、北美" aria-label="新队伍地区" /></el-form-item>
        </div>
        <p v-if="currentRoster.length" class="manual-hint">该队当前已关联：{{ currentRoster.map(player => `${player.name} #${player.id}`).join('、') }}</p>

        <h3>选手 <small>可多选，也可以暂不添加选手</small></h3>
        <el-form-item label="已有选手">
          <el-select v-model="playerIds" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="4"
            :placeholder="seed.playerName ? `搜索选手，例如 ${seed.playerName}` : '搜索选手名称，可多选'" aria-label="选择已有选手">
            <el-option v-for="player in players" :key="player.id" :value="player.id" :label="playerLabel(player)" />
          </el-select>
        </el-form-item>
        <p class="manual-hint">同名记录通过位置和数据库编号区分。选择已有记录不会改名或修改位置。</p>
        <el-alert v-if="otherTeamNotice" :title="otherTeamNotice" type="warning" show-icon :closable="false" />
        <div v-for="(player, index) in newPlayers" :key="player.key" class="manual-new-player">
          <el-form-item :label="`新选手 ${index + 1} 名称`" required>
            <el-input v-model="player.name" maxlength="255" :aria-label="`新选手 ${index + 1} 名称`" placeholder="游戏内 ID" />
          </el-form-item>
          <el-form-item label="位置" required>
            <el-select v-model="player.role" :aria-label="`新选手 ${index + 1} 位置`" placeholder="选择位置">
              <el-option label="坦克" value="tank" /><el-option label="输出" value="damage" /><el-option label="辅助" value="support" />
            </el-select>
          </el-form-item>
          <el-button plain :aria-label="`移除新选手 ${index + 1}`" @click="newPlayers.splice(index, 1)">移除</el-button>
        </div>
        <el-button plain :disabled="newPlayers.length + playerIds.length >= 100" @click="addNewPlayer">新建选手</el-button>
        <p v-if="validationError" class="manual-validation" role="alert">{{ validationError }}</p>
        <p class="manual-hint">这些关联会标记为「手工配置」，已有比赛或 Liquipedia 来源会继续保留。手工选择可以处理自动匹配无法确认的同名或跨队情况。</p>
      </el-form>
    </div>
    <template #footer>
      <div class="manual-footer">
        <el-button :disabled="saving" @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!ready || !!validationError" @click="save">保存手工关联</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '@/services/api';

const props = defineProps({ seasonId: { type: Number, required: true }, seed: { type: Object, default: () => ({}) } });
const emit = defineEmits(['close', 'saved']);
const visible = ref(true);
const loading = ref(false);
const saving = ref(false);
const ready = ref(false);
const error = ref('');
const teams = ref([]);
const players = ref([]);
const seasonTeams = ref([]);
const memberships = ref([]);
const teamMode = ref('existing');
const teamId = ref(props.seed.teamId || null);
const newTeam = ref({ name: props.seed.teamShortName || props.seed.teamName || '', region: '' });
const playerIds = ref([]);
const newPlayers = ref([]);
let nextKey = 0;
let alive = true;
onBeforeUnmount(() => { alive = false; });
const normalizeName = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const roleLabel = role => ({ tank: '坦克', damage: '输出', support: '辅助' }[role] || '位置未知');
const registeredTeamIds = computed(() => new Set(seasonTeams.value.map(row => Number(row.teamId))));
const relationTeamId = membership => Number(seasonTeams.value.find(row => Number(row.id) === Number(membership.seasonTeamId))?.teamId);
const currentRoster = computed(() => teamMode.value === 'existing' ? players.value.filter(player => memberships.value.some(row => Number(row.playerId) === player.id && relationTeamId(row) === teamId.value)) : []);
const playerTeamNames = playerId => [...new Set(memberships.value.filter(row => Number(row.playerId) === playerId).map(row => teams.value.find(team => team.id === relationTeamId(row))?.name).filter(Boolean))];
const playerLabel = player => `${player.name} · ${roleLabel(player.role)} · #${player.id}${playerTeamNames(player.id).length ? ` · 本赛季 ${playerTeamNames(player.id).join('/')}` : ''}`;
const otherTeamNotice = computed(() => {
  const names = playerIds.value.flatMap(id => {
    const other = memberships.value.filter(row => Number(row.playerId) === id && (teamMode.value === 'new' || relationTeamId(row) !== teamId.value));
    return other.length ? [`${players.value.find(player => player.id === id)?.name} #${id}（${playerTeamNames(id).join('/')}）`] : [];
  });
  return names.length ? `${names.join('、')} 已有关联队伍。本次手工添加会保留原关联，请确认确属该赛季阵容。` : '';
});
const validationError = computed(() => {
  if (teamMode.value === 'existing' && !teams.value.some(team => team.id === teamId.value)) return '请先选择队伍。';
  if (playerIds.value.length + newPlayers.value.length > 100) return '一次最多补充 100 位选手。';
  if (teamMode.value === 'new') {
    if (!newTeam.value.name.trim() || !newTeam.value.region.trim()) return '请填写新队伍名称和地区。';
    const duplicate = teams.value.find(team => [team.name, ...(team.aliases || [])].some(name => normalizeName(name) === normalizeName(newTeam.value.name)));
    if (duplicate) return `该队伍名称或别名已属于 ${duplicate.name} #${duplicate.id}，请从已有队伍中选择。`;
  }
  const seen = new Set();
  for (const player of newPlayers.value) {
    const key = normalizeName(player.name);
    if (!key || !player.role) return '请填写每位新选手的名称和位置。';
    if (seen.has(key)) return `新选手 ${player.name} 重复，请移除多余记录。`;
    seen.add(key);
    const existing = players.value.filter(row => normalizeName(row.name) === key);
    if (existing.length) return `${player.name} 已存在（${existing.map(row => `#${row.id}`).join('、')}），请改为选择已有选手。`;
  }
  return '';
});
const loadCatalog = async () => {
  loading.value = true;
  error.value = '';
  try {
    const data = await Promise.all([api.getTeams(), api.getPlayers(), api.getAllSeasonTeams(), api.getAllSeasonTeamPlayers()]);
    if (!alive) return;
    if (data.some(rows => !Array.isArray(rows))) throw new Error('基础数据格式无效，请刷新重试');
    teams.value = data[0].map(row => ({ ...row, id: Number(row.id) }));
    players.value = data[1].map(row => ({ ...row, id: Number(row.id) }));
    seasonTeams.value = data[2].filter(row => Number(row.seasonId) === props.seasonId);
    const ids = new Set(seasonTeams.value.map(row => Number(row.id)));
    memberships.value = data[3].filter(row => ids.has(Number(row.seasonTeamId)));
    ready.value = true;
  } catch (cause) { if (alive) error.value = cause.response?.data?.error || cause.message || '读取基础数据失败，请重试'; }
  finally { if (alive) loading.value = false; }
};
const addNewPlayer = () => {
  newPlayers.value.push({ key: ++nextKey, name: newPlayers.value.length ? '' : props.seed.playerName || '',
    role: newPlayers.value.length ? '' : ({ dps: 'damage', damage: 'damage', tank: 'tank', support: 'support' }[String(props.seed.playerRole || '').toLowerCase()] || '') });
};
const save = async () => {
  if (saving.value || !ready.value || validationError.value) return;
  saving.value = true;
  error.value = '';
  try {
    const result = await api.saveManualSeasonRoster(props.seasonId, {
      team: teamMode.value === 'existing' ? { id: teamId.value } : { new: { ...newTeam.value } },
      players: [...playerIds.value.map(id => ({ id })), ...newPlayers.value.map(({ name, role }) => ({ new: { name, role } }))]
    });
    emit('saved', result);
    visible.value = false;
  } catch (cause) {
    const message = cause.response?.data?.error || '未收到保存结果。请核对刷新后的基础数据；如记录已创建，请改选已有记录，避免重复新建。';
    if (!cause.response || cause.response.status === 409) await loadCatalog();
    if (alive) error.value = message;
  } finally { saving.value = false; }
};
onMounted(loadCatalog);
</script>

<style scoped>
:global(.el-dialog.manual-roster-dialog) { display: flex; flex-direction: column; max-height: 94dvh; }
:global(.el-dialog.manual-roster-dialog .el-dialog__body) { display: flex; min-height: 0; overflow: hidden; }
:global(.el-dialog.manual-roster-dialog .el-dialog__header), :global(.el-dialog.manual-roster-dialog .el-dialog__footer) { flex-shrink: 0; }
.manual-roster-content { overflow-y: auto; width: 100%; padding-right: 4px; }
.manual-hint { color: var(--el-text-color-regular); line-height: 1.7; }
.manual-roster-content h3 { font-size: 16px; margin: 20px 0 12px; }
.manual-roster-content h3 small { color: var(--el-text-color-regular); font-weight: 400; font-size: 12px; }
.manual-roster-content .el-select { width: 100%; }
.manual-field { margin-top: 16px; }
.manual-new-team { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.manual-new-player { display: grid; grid-template-columns: minmax(0, 1fr) 130px auto; gap: 10px; align-items: start; }
.manual-new-player > .el-button { margin-top: 30px; }
.manual-validation { color: var(--el-color-danger); line-height: 1.6; }
.manual-footer { display: flex; gap: 8px; justify-content: flex-end; }
.manual-footer .el-button + .el-button { margin-left: 0; }
@media (max-width: 600px) {
  .manual-new-team, .manual-new-player { grid-template-columns: 1fr; gap: 0; }
  .manual-new-player { border-top: 1px solid var(--el-border-color); padding-top: 12px; margin-bottom: 16px; }
  .manual-new-player > .el-button { margin-top: 0; justify-self: end; }
  .manual-footer .el-button { min-height: 44px; }
}
</style>
