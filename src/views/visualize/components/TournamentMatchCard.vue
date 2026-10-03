<template>
  <component :is="navigation.to ? 'router-link' : 'div'" :to="navigation.to || undefined"
    class="tournament-match" :class="{ linked: navigation.to }" :aria-label="description" :title="`${description} · ${navigation.date} ${navigation.time} ${match.bestOf || ''}`">
    <div v-for="(team, i) in match.opponents" :key="i" class="opponent" :class="{ winner: team.winner }">
      <img v-if="team.logo" :src="team.logo" alt="" class="team-logo" />
      <span class="team-name" :title="teamName(team)">{{ teamName(team) }}</span><strong>{{ team.score ?? '—' }}</strong>
    </div>
  </component>
</template>

<script setup>
import { computed } from 'vue';
import { tournamentMatchNavigation } from '@/utils/tournamentMatchNavigation.mjs';
const props = defineProps({ match: { type: Object, required: true }, seasonId: { type: [Number, String], required: true } });
const teamName = team => {
  const name = team.localName || team.shortName || team.name || '待定';
  return /^(?:TBD\s*)+$/i.test(name.trim()) ? 'TBD' : name;
};
const navigation = computed(() => props.match.navigation || tournamentMatchNavigation(props.match, { seasonId: props.seasonId }));
const description = computed(() => `${props.match.round || ''} ${props.match.opponents.map(t => `${teamName(t)} ${t.score ?? '待定'}`).join(' 对 ')}${navigation.value.preview ? '，查看前瞻' : navigation.value.to ? '，查看比赛详情' : ''}`);
</script>

<style scoped>
.tournament-match{display:block;text-decoration:none;color:var(--vis-text-secondary);border:1px solid var(--vis-border-strong);background:var(--vis-bg-card);font-size:11px;font-family:var(--vis-font-display);border-radius:3px;overflow:hidden}
.opponent{display:flex;align-items:center;gap:4px;height:23px;padding-left:4px;min-width:0}.opponent+.opponent{border-top:1px solid var(--vis-border)}
.team-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1}.team-logo{width:15px;height:15px;object-fit:contain;flex-shrink:0}
.opponent strong{align-self:stretch;display:flex;align-items:center;justify-content:center;min-width:17px;background:var(--vis-bg-subtle);font-size:11px;font-family:var(--vis-font-numeric);font-variant-numeric:tabular-nums;font-weight:500}
.winner{color:var(--vis-text-strong);font-weight:600}.winner strong{color:#d96700;font-weight:700}
.linked:hover{border-color:#c67535;background:#fff9f2}.tournament-match:focus-visible{outline:2px solid #c56a25;outline-offset:2px}
@media(min-width:768px){.tournament-match{font-size:12px}}
</style>
