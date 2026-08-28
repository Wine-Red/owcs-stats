<template>
  <el-drawer
    :model-value="modelValue"
    :with-header="false"
    class="entity-context-drawer"
    size="min(640px, 100vw)"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="context-shell" v-loading="loading">
      <header class="context-header">
        <div class="context-avatar" :class="{ 'is-player': type === 'player' }">
          <img
            v-if="type === 'team' && entity?.logo"
            :src="resolveMediaUrl(entity.logo)"
            :alt="entity.name"
          />
          <span v-else>{{ avatarText }}</span>
        </div>
        <div class="context-title">
          <span class="context-kicker">{{ type === 'team' ? 'TEAM DOSSIER' : 'PLAYER DOSSIER' }}</span>
          <h2>{{ entity?.name || '实体记录' }}</h2>
          <div class="context-meta">
            <span v-if="type === 'team'">{{ entity?.region || '未设置地区' }}</span>
            <span v-else>{{ roleLabel(entity?.role) }}</span>
            <span v-if="type === 'player'">{{ originLabel(entity?.identityOrigin) }}</span>
            <span v-if="entity?.orphanedAt" class="is-warning">孤儿身份</span>
          </div>
        </div>
        <div class="context-actions">
          <el-button size="small" @click="$emit('edit')">编辑资料</el-button>
          <button class="context-close" type="button" aria-label="关闭详情" @click="$emit('update:modelValue', false)">×</button>
        </div>
      </header>

      <template v-if="context && !loading">
        <section class="context-metrics" aria-label="历史数据摘要">
          <div v-for="metric in metrics" :key="metric.label" class="context-metric">
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.label }}</span>
          </div>
        </section>

        <section v-if="type === 'team' && entity?.aliases?.length" class="context-section">
          <div class="context-section-title">
            <h3>同步别名</h3>
            <span>{{ entity.aliases.length }} 个</span>
          </div>
          <div class="context-aliases">
            <span v-for="alias in entity.aliases" :key="alias">{{ alias }}</span>
          </div>
        </section>

        <section class="context-section">
          <div class="context-section-title">
            <h3>赛季关系</h3>
            <span>{{ context.memberships?.length || 0 }} 条</span>
          </div>
          <div v-if="context.memberships?.length" class="membership-timeline">
            <article v-for="membership in context.memberships" :key="membership.id" class="membership-record">
              <div class="membership-heading">
                <div>
                  <strong>{{ membership.season?.name || '未知赛季' }}</strong>
                  <span v-if="type === 'player'">{{ membership.team?.name || '未知队伍' }}</span>
                  <span v-else>{{ membership.roster?.length || 0 }} 名已关联选手</span>
                </div>
                <div class="evidence-tags">
                  <span
                    v-for="source in membership.sources || []"
                    :key="`${membership.id}-${source.sourceType}`"
                    :class="`source-${source.sourceType}`"
                  >{{ sourceLabel(source.sourceType) }}</span>
                  <span v-if="!membership.sources?.length" class="source-empty">无来源证据</span>
                </div>
              </div>
              <div v-if="type === 'team' && membership.roster?.length" class="roster-strip">
                <span
                  v-for="member in membership.roster"
                  :key="member.relationId"
                  :class="{ orphan: member.player?.orphanedAt }"
                  :title="member.sources?.map(source => sourceLabel(source.sourceType)).join(' / ')"
                >
                  <small>{{ roleShort(member.player?.role) }}</small>
                  {{ member.player?.name || '未知选手' }}
                </span>
              </div>
            </article>
          </div>
          <div v-else class="context-empty">还没有建立赛季关系，也没有比赛同步证据。</div>
        </section>

        <section class="context-section">
          <div class="context-section-title">
            <h3>最近出现的比赛</h3>
            <span>最多 20 场</span>
          </div>
          <div v-if="context.recentMatches?.length" class="match-history">
            <article v-for="match in context.recentMatches" :key="match.id" class="match-history-row">
              <div class="match-history-date">
                <strong>{{ match.matchDate || '-' }}</strong>
                <span>{{ match.season?.name || '未知赛季' }}</span>
              </div>
              <div class="match-history-versus">
                <span :class="{ active: isActiveSide(match, match.team1?.id) }">{{ match.team1?.name || '-' }}</span>
                <strong>{{ scoreText(match) }}</strong>
                <span :class="{ active: isActiveSide(match, match.team2?.id) }">{{ match.team2?.name || '-' }}</span>
              </div>
            </article>
          </div>
          <div v-else class="context-empty">没有找到比赛出场记录。</div>
        </section>
      </template>

      <el-empty v-else-if="!loading" description="未能加载实体历史" />
    </div>
  </el-drawer>
</template>

<script setup>
/* global defineProps, defineEmits */
import { computed } from 'vue';
import { resolveMediaUrl } from '@/utils/media';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  type: { type: String, default: 'team' },
  entity: { type: Object, default: null },
  context: { type: Object, default: null },
  loading: { type: Boolean, default: false }
});

defineEmits(['update:modelValue', 'edit']);

const avatarText = computed(() => String(props.entity?.name || '?').slice(0, 2).toUpperCase());

const metrics = computed(() => {
  const counts = props.context?.counts || {};
  return props.type === 'team'
    ? [
      { label: '赛季', value: counts.seasons || 0 },
      { label: '阵容关系', value: counts.rosterRelations || 0 },
      { label: '比赛', value: counts.matches || 0 },
      { label: '地图局', value: counts.mapGames || 0 },
      { label: '统计行', value: counts.statRows || 0 }
    ]
    : [
      { label: '赛季', value: counts.seasons || 0 },
      { label: '队伍', value: counts.teams || 0 },
      { label: '关系', value: counts.memberships || 0 },
      { label: '比赛', value: counts.matches || 0 },
      { label: '统计行', value: counts.statRows || 0 }
    ];
});

const roleLabel = role => ({ tank: '坦克', damage: '输出', support: '辅助' }[role] || '未设置职责');
const roleShort = role => ({ tank: 'T', damage: 'D', support: 'S' }[role] || '?');
const originLabel = origin => ({ manual: '手工建立', matchweb: 'Matchweb 自动建立', sync: '同步建立' }[origin] || origin || '来源未知');
const sourceLabel = source => ({
  manual: '手工',
  match: '比赛',
  owtv: 'OWTV',
  liquipedia: 'Liquipedia',
  legacy: '旧数据'
}[source] || source);
const scoreText = match => match.team1Score !== null && match.team2Score !== null
  ? `${match.team1Score} : ${match.team2Score}`
  : 'VS';
const isActiveSide = (match, teamId) => props.type === 'team'
  ? Number(teamId) === Number(props.entity?.id)
  : Number(teamId) === Number(match.appearanceTeamId);
</script>

<style scoped>
.context-shell { min-height: 100%; color: #202124; background: #f5f6f7; }
.context-header { position: sticky; top: 0; z-index: 3; display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 18px 20px; border-bottom: 1px solid #e1e3e6; background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(12px); }
.context-avatar { display: grid; place-items: center; width: 64px; height: 64px; overflow: hidden; border: 1px solid #e1e3e6; border-radius: 14px; color: #fff; background: #1b1c1f; font-family: 'Oxanium', sans-serif; font-weight: 800; }
.context-avatar.is-player { border-radius: 50%; background: linear-gradient(135deg, #ff6a00, #ff9e0f); }
.context-avatar img { width: 100%; height: 100%; padding: 7px; object-fit: contain; }
.context-kicker { color: #ff6a00; font: 700 9px/1 'Orbitron', sans-serif; letter-spacing: .14em; }
.context-title h2 { margin: 4px 0 5px; color: #111; font: 800 23px/1.15 'Oxanium', sans-serif; }
.context-meta { display: flex; flex-wrap: wrap; gap: 6px; color: #6b7078; font-size: 12px; }
.context-meta span + span::before { content: '·'; margin-right: 6px; }
.context-meta .is-warning { color: #b54708; }
.context-actions { display: flex; align-items: center; gap: 8px; }
.context-close { width: 36px; height: 36px; border: 1px solid #dfe1e5; border-radius: 9px; color: #4f5359; background: #fff; cursor: pointer; font-size: 22px; line-height: 1; }
.context-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 14px 14px 0; overflow: hidden; border: 1px solid #e1e3e6; border-radius: 12px; background: #fff; }
.context-metric { display: flex; min-width: 0; flex-direction: column; gap: 2px; padding: 12px; border-right: 1px solid #eceef0; }
.context-metric:last-child { border-right: 0; }
.context-metric strong { color: #111; font: 800 20px/1 'Oxanium', sans-serif; }
.context-metric span { color: #7a7f87; font-size: 11px; }
.context-section { margin: 14px; padding: 16px; border: 1px solid #e1e3e6; border-radius: 12px; background: #fff; }
.context-section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.context-section-title h3 { margin: 0; color: #191a1c; font-size: 14px; }
.context-section-title span { color: #8b9098; font-size: 11px; }
.context-aliases, .evidence-tags, .roster-strip { display: flex; flex-wrap: wrap; gap: 6px; }
.context-aliases span { padding: 5px 9px; border-radius: 999px; color: #8a3b00; background: #fff0e7; font-size: 12px; }
.membership-timeline { display: flex; flex-direction: column; gap: 9px; }
.membership-record { padding: 12px; border: 1px solid #eceef0; border-left: 3px solid #ff7a1a; border-radius: 8px; background: #fafafa; }
.membership-heading { display: flex; justify-content: space-between; gap: 12px; }
.membership-heading > div:first-child { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.membership-heading strong { overflow: hidden; color: #202124; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.membership-heading span { color: #7a7f87; font-size: 11px; }
.evidence-tags { justify-content: flex-end; }
.evidence-tags span { align-self: flex-start; padding: 3px 6px; border-radius: 5px; color: #5f6368; background: #eceef0; font-size: 10px; }
.evidence-tags .source-manual { color: #943f00; background: #ffeadb; }
.evidence-tags .source-match { color: #116b3b; background: #e4f6ec; }
.evidence-tags .source-legacy { color: #7a4b00; background: #fff3cf; }
.roster-strip { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dfe1e5; }
.roster-strip > span { padding: 4px 7px; border: 1px solid #e1e3e6; border-radius: 6px; color: #34373b; background: #fff; font-size: 11px; }
.roster-strip > span.orphan { border-color: #f2c8b5; color: #b54708; }
.roster-strip small { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-right: 3px; border-radius: 4px; color: #fff; background: #34373b; font-size: 8px; }
.match-history { display: flex; flex-direction: column; }
.match-history-row { display: grid; grid-template-columns: 126px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid #eff0f2; }
.match-history-row:first-child { border-top: 0; }
.match-history-date { display: flex; min-width: 0; flex-direction: column; }
.match-history-date strong { color: #44484e; font-size: 11px; }
.match-history-date span { overflow: hidden; color: #92969c; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.match-history-versus { display: grid; grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1fr); gap: 8px; align-items: center; text-align: center; font-size: 12px; }
.match-history-versus span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-history-versus span:first-child { text-align: right; }
.match-history-versus span:last-child { text-align: left; }
.match-history-versus span.active { color: #d95700; font-weight: 750; }
.match-history-versus strong { color: #111; font: 800 11px/1 'Oxanium', sans-serif; }
.context-empty { padding: 22px 10px; color: #8b9098; text-align: center; font-size: 12px; }
@media (max-width: 600px) {
  .context-header { grid-template-columns: 50px minmax(0, 1fr); padding: 14px; }
  .context-avatar { width: 50px; height: 50px; }
  .context-actions { grid-column: 1 / -1; }
  .context-actions :deep(.el-button) { flex: 1; }
  .context-metrics { grid-template-columns: repeat(3, 1fr); }
  .context-metric { border-bottom: 1px solid #eceef0; }
  .membership-heading { flex-direction: column; }
  .evidence-tags { justify-content: flex-start; }
  .match-history-row { grid-template-columns: 1fr; }
}
</style>
