<template>
  <el-dialog :model-value="modelValue" :title="`合并${label}`" width="720px" class="entity-merge-dialog"
    :close-on-click-modal="false" :close-on-press-escape="!applying" :show-close="!applying"
    @update:model-value="$emit('update:modelValue', $event)">
    <p class="merge-intro">将重复身份归到一份档案。保留目标名称和资料，原名称作为别名，历史比赛、阵容和来源一并迁移。</p>
    <el-form label-position="top">
      <el-form-item label="将此身份合入">
        <div class="merge-source"><strong>{{ source?.name }}</strong><span>#{{ source?.id }} · 合并后成为别名</span></div>
      </el-form-item>
      <el-form-item :label="`选择保留的${label}`">
        <el-select v-model="targetId" filterable :disabled="applying" placeholder="搜索名称、别名或 ID" style="width: 100%" @change="resetPreview">
          <el-option v-for="entity in candidates" :key="entity.id" :value="entity.id"
            :label="`${entity.name} #${entity.id}${entity.aliases?.length ? ` · ${entity.aliases.join(' / ')}` : ''}`" />
        </el-select>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <div v-if="preview" class="merge-preview" aria-live="polite">
      <p class="merge-direction"><strong>{{ preview.source.name }} #{{ preview.source.id }}</strong><span>合入</span><strong>{{ preview.target.name }} #{{ preview.target.id }}</strong></p>
      <dl class="merge-facts">
        <dt>保留别名</dt><dd>{{ preview.aliases.join('、') || '名称相同，无需新增别名' }}</dd>
        <template v-if="preview.externalIds.length"><dt>外部选手 ID</dt><dd>{{ preview.externalIds.join('、') }}</dd></template>
        <template v-if="preview.liquipediaUrls.length"><dt>Liquipedia 页面</dt><dd><a v-for="url in preview.liquipediaUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer">{{ decodeURI(url.split('/').pop()) }}</a></dd></template>
      </dl>
      <el-table :data="impactRows" size="small" style="width: 100%">
        <el-table-column prop="label" label="受影响的数据" />
        <el-table-column prop="description" label="处理方式" />
      </el-table>
      <p v-if="preview.coalescedMemberships" class="merge-note">{{ preview.coalescedMemberships }} 条重复阵容关系将合并，保留双方的来源证据。</p>
      <el-alert v-for="warning in preview.warnings" :key="warning" :title="warning" type="warning" :closable="false" show-icon />
      <el-alert v-for="conflict in preview.conflicts" :key="`${conflict.code}:${conflict.ids.join(',')}`" type="error" :closable="false" show-icon
        :title="conflict.message" :description="conflict.ids.length ? `涉及记录：${conflict.ids.join('、')}` : ''" />
      <p class="merge-note">原始时间线及统计数值保持不变。合并会记录审计；执行后如需恢复，须结合数据库备份处理。</p>
      <el-checkbox v-if="preview.canMerge" v-model="confirmed" :disabled="applying">已核实这两份档案属于同一{{ label }}，并确认保留方向</el-checkbox>
    </div>
    <template #footer>
      <el-button :disabled="applying" @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button :disabled="!targetId || applying" :loading="loading" @click="loadPreview">{{ preview ? '重新预览' : '预览合并影响' }}</el-button>
      <el-button v-if="preview?.canMerge" type="primary" :disabled="!confirmed || loading" :loading="applying" @click="apply">确认合入 {{ preview.target.name }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed, ref, watch } from 'vue';
import apiService from '@/services/api';
const props = defineProps({ modelValue: Boolean, kind: { type: String, default: 'team' }, source: { type: Object, default: null }, entities: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue', 'merged']);
const targetId = ref(null), preview = ref(null), error = ref(''), confirmed = ref(false), loading = ref(false), applying = ref(false);
const label = computed(() => props.kind === 'team' ? '队伍' : '选手');
const candidates = computed(() => props.entities.filter(row => Number(row.id) !== Number(props.source?.id)));
const tableLabels = { matches: '比赛', map_games: '地图局', player_stats: '选手统计', season_teams: '赛季参赛关系',
  season_team_players: '选手阵容', season_team_sources: '队伍来源证据', season_team_player_sources: '选手来源证据',
  match_polls: '赛前投票', match_votes: '已投选票', player_external_identities: '外部选手身份' };
const impactRows = computed(() => Object.entries(preview.value?.counts || {}).filter(([key]) => tableLabels[key]).map(([key, counts]) => ({
  label: tableLabels[key], description: [counts.update && `迁移 ${counts.update} 条`, counts.delete && `归并 ${counts.delete} 条`, counts.insert && `保留 ${counts.insert} 条`].filter(Boolean).join('，')
})));
let requestVersion = 0;
const resetPreview = () => { requestVersion++; preview.value = null; confirmed.value = false; error.value = ''; loading.value = false; };
watch(() => [props.modelValue, props.source?.id, props.kind], () => { resetPreview(); targetId.value = null; });
const loadPreview = async () => {
  resetPreview();
  const version = requestVersion;
  loading.value = true;
  try {
    const result = await apiService.previewEntityMerge(props.kind, props.source.id, targetId.value);
    if (version === requestVersion) preview.value = result;
  } catch (reason) {
    if (version === requestVersion) error.value = reason.response?.data?.error || reason.message;
  } finally { if (version === requestVersion) loading.value = false; }
};
const apply = async () => {
  if (!confirmed.value || !preview.value?.canMerge || applying.value) return;
  applying.value = true; error.value = '';
  try {
    const result = await apiService.applyEntityMerge(props.kind, props.source.id, targetId.value, preview.value.fingerprint);
    emit('merged', result); emit('update:modelValue', false);
  } catch (reason) {
    error.value = reason.response?.data?.error || reason.message;
    confirmed.value = false;
    if (reason.response?.data?.code === 'MERGE_PREVIEW_STALE') preview.value = null;
  } finally { applying.value = false; }
};
</script>

<style scoped>
.merge-intro,.merge-note{color:var(--el-text-color-regular);line-height:1.65;margin:0 0 16px}
.merge-source,.merge-direction{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.merge-source span,.merge-direction>span{color:var(--el-text-color-secondary)}
.merge-preview{display:grid;gap:14px;margin-top:18px}
.merge-direction{padding:14px;background:var(--el-fill-color-light);border-radius:8px;margin:0}
.merge-facts{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;margin:0}
.merge-facts dt{color:var(--el-text-color-secondary)}
.merge-facts dd{margin:0;overflow-wrap:anywhere;line-height:1.5}
.merge-facts a{display:block;color:var(--el-color-primary)}
.merge-preview :deep(.el-checkbox){height:auto;white-space:normal}
.merge-preview :deep(.el-checkbox__label){white-space:normal;line-height:1.6}
.merge-note{font-size:13px;margin:0}
@media(max-width:600px){.merge-facts{grid-template-columns:1fr;gap:5px}}
</style>
<style>
.entity-merge-dialog{max-width:calc(100vw - 24px)}
.el-dialog.entity-merge-dialog{display:flex;flex-direction:column;max-height:94dvh;margin-top:3dvh}
html.admin-theme .entity-merge-dialog .el-dialog__body{flex:1;min-height:0;max-height:none;overflow-y:auto}
.entity-merge-dialog .el-dialog__header,.entity-merge-dialog .el-dialog__footer{flex-shrink:0}
.entity-merge-dialog .el-dialog__footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.entity-merge-dialog .el-dialog__footer .el-button{margin-left:0;min-height:40px}
</style>
