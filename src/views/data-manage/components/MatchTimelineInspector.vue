<template>
  <section class="timeline-inspector" :class="{ empty: !hasTimeline }" aria-label="Studio 原始时间线">
    <header class="timeline-inspector-head">
      <span class="signal" aria-hidden="true"></span>
      <strong>Studio 原始时间线</strong>
      <small v-if="hasTimeline">{{ isRoundLocal ? '只读 · 仅有效回合 · 回合内独立计时' : '只读 · 旧版视频时间' }}</small>
      <span class="spacer"></span>
      <code v-if="hasTimeline">r{{ revision }}<template v-if="digest"> · {{ digest }}</template></code>
    </header>

    <div v-if="!hasTimeline" class="timeline-state">
      这张地图尚未同步 OWCS Studio 时间线。
    </div>
    <div v-else-if="loading" class="timeline-state timeline-state--loading">
      <span></span>正在读取时间线…
    </div>
    <div v-else-if="error" class="timeline-state timeline-state--error">
      时间线读取失败：{{ error }}
    </div>
    <div v-else-if="!payload" class="timeline-state">
      时间线数据不可用。
    </div>
    <template v-else>
      <div class="timeline-kpis">
        <span><b>{{ timelineClock(durationMs) }}</b><em>{{ isRoundLocal ? '有效比赛时长' : '媒体时长' }}</em></span>
        <span><b>{{ players.length }}</b><em>选手</em></span>
        <span><b>{{ rounds.length }}</b><em>回合</em></span>
        <span><b>{{ phases.length }}</b><em>语义区间</em></span>
        <span><b>{{ events.length }}</b><em>事件</em></span>
      </div>

      <div class="timeline-inspector-body">
        <div v-if="isRoundLocal" class="timeline-round-stack">
          <section v-for="round in roundViews" :key="round.roundId" class="timeline-round-block">
            <header class="timeline-round-head">
              <b>R{{ round.index }}</b>
              <span class="timeline-round-reset">从 0:00 计时</span>
              <span>{{ round.phases.length }} 个无缝有效区间 · {{ round.events.length }} 个事件</span>
              <time>0:00 — {{ timelineClock(round.durationMs) }}</time>
            </header>
            <div class="timeline-round-body">
              <div class="timeline-track" :aria-label="`R${round.index} 语义区间`">
                <i
                  v-for="(phase, index) in round.phases"
                  :key="phase.phaseId || `${round.roundId}-phase-${index}`"
                  :class="phaseKind(phase)"
                  :style="phaseStyle(phase, round.durationMs)"
                  :title="phaseTitle(phase)"
                ></i>
              </div>
              <TimelineEvents :events="round.events" :limit="80" />
            </div>
          </section>
          <div v-if="!roundViews.length" class="timeline-event-more">时间线中没有有效回合</div>
        </div>

        <div v-else class="timeline-telemetry">
          <div class="timeline-telemetry-label"><span>旧版视频时间轴</span><span>0:00 — {{ timelineClock(durationMs) }}</span></div>
          <div class="timeline-track" aria-label="视频语义区间">
            <i
              v-for="(phase, index) in phases"
              :key="phase.phaseId || `phase-${index}`"
              :class="phaseKind(phase)"
              :style="phaseStyle(phase, durationMs)"
              :title="phaseTitle(phase)"
            ></i>
          </div>
          <TimelineEvents :events="events" :limit="120" />
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
/* global defineProps */
import { computed, defineComponent, h } from 'vue';

const props = defineProps({
  mapGame: { type: Object, default: null },
  payload: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const hasTimeline = computed(() => Boolean(props.mapGame?.timeline));
const players = computed(() => Array.isArray(props.payload?.players) ? props.payload.players : []);
const rounds = computed(() => Array.isArray(props.payload?.rounds) ? props.payload.rounds : []);
const phases = computed(() => Array.isArray(props.payload?.phases) ? props.payload.phases : []);
const events = computed(() => Array.isArray(props.payload?.events) ? props.payload.events : []);
const isRoundLocal = computed(() => Number(props.payload?.schemaVersion) >= 2 && props.payload?.timebase?.kind === 'round-local');
const revision = computed(() => Number(props.mapGame?.timeline?.revision) || 1);
const digest = computed(() => String(props.mapGame?.timeline?.digest || '').slice(0, 12));
const durationMs = computed(() => Math.max(
  1,
  Number(props.payload?.media?.durationMs) || 0,
  ...rounds.value.map(round => Number(round.durationMs) || Number(round.endMs) || 0),
  ...phases.value.map(phase => Number(phase.endMs) || 0)
));
const roundViews = computed(() => rounds.value.map((round, index) => {
  const roundId = String(round.roundId || `round-${index + 1}`);
  return {
    roundId,
    index: Number(round.index) || index + 1,
    durationMs: Math.max(1, Number(round.durationMs) || Number(round.endMs) || 0),
    phases: phases.value.filter(phase => String(phase.roundId || '') === roundId),
    events: events.value.filter(event => String(event.roundId || '') === roundId)
  };
}));

const timelineClock = milliseconds => {
  const total = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const phaseKind = phase => ['gameplay', 'pause', 'intermission', 'replay'].includes(phase?.kind)
  ? phase.kind : 'unknown';
const phaseStyle = (phase, railDuration) => {
  const duration = Math.max(1, Number(railDuration) || 0);
  const start = Math.max(0, Math.min(100, (Number(phase?.startMs) || 0) / duration * 100));
  const end = Math.max(start, Math.min(100, (Number(phase?.endMs) || 0) / duration * 100));
  return { left: `${start.toFixed(3)}%`, width: `${Math.max(0.15, end - start).toFixed(3)}%` };
};
const phaseTitle = phase => `${phase?.kind || 'unknown'} · ${timelineClock(phase?.startMs)}–${timelineClock(phase?.endMs)}`;
const eventDetail = event => {
  const actor = event?.playerId || event?.killerId || '';
  const target = event?.victimId ? ` → ${event.victimId}` : '';
  const hero = event?.heroName || event?.heroId || event?.hero || '';
  return `${actor}${target}${hero ? ` · ${hero}` : ''}` || '—';
};

const TimelineEvents = defineComponent({
  name: 'TimelineEvents',
  props: {
    events: { type: Array, default: () => [] },
    limit: { type: Number, default: 80 }
  },
  setup(componentProps) {
    return () => {
      const visible = componentProps.events.slice(0, componentProps.limit);
      const rows = visible.map((event, index) => h('div', {
        class: 'timeline-event-row',
        key: event.eventId || `event-${index}`
      }, [
        h('time', timelineClock(event.timeMs)),
        h('b', String(event.type || 'unknown')),
        h('span', { title: eventDetail(event) }, eventDetail(event)),
        h('em', String(event.status || ''))
      ]));
      if (!visible.length) rows.push(h('div', { class: 'timeline-event-more' }, '本回合没有事件'));
      if (componentProps.events.length > visible.length) {
        rows.push(h('div', { class: 'timeline-event-more' }, `仅显示前 ${visible.length} 条，共 ${componentProps.events.length} 条`));
      }
      return h('div', { class: 'timeline-event-list' }, rows);
    };
  }
});
</script>

<style scoped>
.timeline-inspector { display: flex; flex: 0 1 23%; min-height: 155px; margin: 0 9px 7px; overflow: hidden; flex-direction: column; border: 1px solid #294559; border-radius: 8px; color: #91a9b6; background: #101923; }
.timeline-inspector.empty { flex: 0 0 auto; min-height: 0; border-style: dashed; background: #f7f9fa; }
.timeline-inspector-head { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; padding: 6px 9px; border-bottom: 1px solid #294559; background: linear-gradient(90deg,rgba(41,176,227,.12),transparent 68%); }
.empty .timeline-inspector-head { border-bottom-color: #d9e1e6; background: linear-gradient(90deg,rgba(41,176,227,.08),transparent 68%); }
.signal { width: 8px; height: 8px; border-radius: 50%; background: #43d7ff; box-shadow: 0 0 0 4px rgba(67,215,255,.12),0 0 18px rgba(67,215,255,.55); }
.timeline-inspector-head strong { color: #d9f6ff; font-size: 11px; }
.empty .timeline-inspector-head strong { color: #25576c; }
.timeline-inspector-head small { color: #7393a6; font-size: 9px; }
.timeline-inspector-head .spacer { flex: 1; }
.timeline-inspector-head code { color: #78dffb; font: 9px/1.4 Consolas,monospace; }
.timeline-state { padding: 14px 12px; color: #71838d; font-size: 10px; }
.timeline-state--loading { display: flex; align-items: center; gap: 9px; }
.timeline-state--loading span { width: 9px; height: 9px; border: 2px solid #31556a; border-top-color: #43d7ff; border-radius: 50%; animation: timeline-spin .8s linear infinite; }
.timeline-state--error { color: #f09aa9; }
.timeline-kpis { display: grid; flex: 0 0 auto; grid-template-columns: repeat(5,minmax(66px,1fr)); border-bottom: 1px solid #223747; }
.timeline-kpis span { padding: 4px 9px; border-right: 1px solid #223747; }
.timeline-kpis span:last-child { border-right: 0; }
.timeline-kpis b { display: block; color: #e8f7fb; font: 700 11px/1.1 Consolas,monospace; }
.timeline-kpis em { color: #6f8999; font-size: 8px; font-style: normal; }
.timeline-inspector-body { min-height: 0; overflow: auto; scrollbar-color: #345467 #101923; }
.timeline-round-stack { display: grid; gap: 6px; padding: 5px; }
.timeline-round-block { overflow: hidden; border: 1px solid #294559; border-radius: 6px; background: #0c141c; }
.timeline-round-head { display: flex; align-items: center; gap: 7px; padding: 4px 6px; border-bottom: 1px solid #223747; background: rgba(41,176,227,.055); }
.timeline-round-head b { color: #d9f6ff; font: 700 10px/1 Consolas,monospace; }
.timeline-round-head span { color: #6f8999; font-size: 8px; }
.timeline-round-head time { margin-left: auto; color: #78dffb; font: 9px/1 Consolas,monospace; }
.timeline-round-reset { padding: 2px 5px; border: 1px solid #2d7f98; border-radius: 99px; color: #70dffb !important; background: rgba(40,186,223,.09); }
.timeline-round-body { padding: 4px 6px 5px; }
.timeline-telemetry { padding: 9px; }
.timeline-telemetry-label { display: flex; justify-content: space-between; margin-bottom: 6px; color: #7191a2; font-size: 9px; }
.timeline-track { position: relative; height: 16px; overflow: hidden; border: 1px solid #2c4555; border-radius: 4px; background: #0b1118; }
.timeline-track i { position: absolute; top: 3px; bottom: 3px; min-width: 2px; border-radius: 2px; opacity: .9; }
.timeline-track i.gameplay { background: #28badf; }
.timeline-track i.pause { background: #e3a329; }
.timeline-track i.intermission { background: #7969d9; }
.timeline-track i.replay { background: #e15a7a; }
.timeline-track i.unknown { background: #617481; }
:deep(.timeline-event-list) { display: grid; gap: 3px; max-height: 112px; margin-top: 4px; overflow: auto; }
:deep(.timeline-event-row) { display: grid; grid-template-columns: 52px 110px minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 3px 6px; border-left: 2px solid #2a9fc4; background: rgba(255,255,255,.025); font-size: 9px; }
:deep(.timeline-event-row time) { color: #79daf4; font: 9px Consolas,monospace; }
:deep(.timeline-event-row b) { color: #cceaf3; font-size: 9px; letter-spacing: .2px; }
:deep(.timeline-event-row span) { min-width: 0; overflow: hidden; color: #91a9b6; text-overflow: ellipsis; white-space: nowrap; }
:deep(.timeline-event-row em) { color: #657d8b; font-size: 8px; font-style: normal; }
:deep(.timeline-event-more) { padding: 6px 7px; color: #6f8999; font-size: 9px; text-align: center; }
@keyframes timeline-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .timeline-state--loading span { animation: none; } }
@media (max-width: 820px) {
  .timeline-inspector { flex: none; min-height: 300px; }
  .timeline-inspector.empty { min-height: 0; }
  .timeline-inspector-body { max-height: 60vh; }
}
@media (max-width: 600px) {
  .timeline-kpis { grid-template-columns: repeat(2,1fr); }
  .timeline-kpis span { border-bottom: 1px solid #223747; }
  .timeline-round-head { align-items: flex-start; flex-wrap: wrap; }
  .timeline-round-head time { width: 100%; margin-left: 0; }
  :deep(.timeline-event-row) { grid-template-columns: 48px 94px minmax(0,1fr); }
  :deep(.timeline-event-row em) { display: none; }
}
</style>
