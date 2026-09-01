<template>
  <section class="timeline-inspector" :class="{ empty: !hasTimeline }" aria-label="Studio 原始时间线">
    <header class="timeline-inspector-head">
      <div class="timeline-title">
        <span class="section-index">02</span>
        <span class="raw-badge">RAW</span>
        <div>
          <strong>Studio 原始时间线</strong>
          <small v-if="hasTimeline">{{ isRoundLocal ? '只读审计 · 仅有效回合 · 回合内独立计时' : '只读审计 · 旧版视频时间' }}</small>
          <small v-else>Studio 数据镜像状态</small>
        </div>
      </div>
      <div v-if="hasTimeline" class="timeline-revision">
        <span>REVISION</span>
        <code>r{{ revision }}<template v-if="digest"> · {{ digest }}</template></code>
      </div>
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
      <div class="timeline-kpis" aria-label="时间线摘要">
        <span><em>{{ isRoundLocal ? '有效比赛时长' : '媒体时长' }}</em><b>{{ timelineClock(durationMs) }}</b></span>
        <span><em>选手</em><b>{{ players.length }}</b></span>
        <span><em>回合</em><b>{{ rounds.length }}</b></span>
        <span><em>语义区间</em><b>{{ phases.length }}</b></span>
        <span><em>事件</em><b>{{ events.length }}</b></span>
      </div>

      <div class="timeline-legend" aria-label="语义区间图例">
        <span><i class="gameplay"></i>有效比赛</span>
        <span><i class="pause"></i>暂停</span>
        <span><i class="intermission"></i>局间</span>
        <span><i class="replay"></i>回放</span>
      </div>

      <div class="timeline-inspector-body">
        <div v-if="isRoundLocal" class="timeline-round-stack">
          <section v-for="round in roundViews" :key="round.roundId" class="timeline-round-block">
            <header class="timeline-round-head">
              <b>R{{ round.index }}</b>
              <div>
                <strong>有效回合</strong>
                <span>{{ round.phases.length }} 个连续区间 · {{ round.events.length }} 个事件</span>
              </div>
              <time>0:00 — {{ timelineClock(round.durationMs) }}</time>
            </header>
            <div class="timeline-round-body">
              <div class="timeline-track-label">
                <span class="timeline-round-reset">从 0:00 计时</span>
                <span>回合内时间</span>
              </div>
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
.timeline-inspector {
  display: flex;
  flex: 0 0 auto;
  min-height: 0;
  margin: 0 9px 8px;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--admin-border, #e4e7ed);
  border-radius: 10px;
  color: var(--admin-text, #303133);
  background: var(--admin-surface-subtle, #f8f9fa);
}
.timeline-inspector.empty { min-height: 72px; border-style: dashed; background: #fafbfc; }
.timeline-inspector-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 8px 13px;
  border-bottom: 1px solid var(--admin-border-soft, #ebeef5);
  background: #fff;
}
.timeline-title { display: flex; min-width: 0; align-items: center; gap: 10px; }
.timeline-title>div { display: flex; min-width: 0; flex-direction: column; }
.section-index { color: #a1a6ad; font: 700 8px/1 'Orbitron',sans-serif; letter-spacing: .08em; }
.raw-badge { padding: 4px 6px; border-radius: 4px; color: #9c4308; background: #fff0e6; font: 800 8px/1 'Orbitron',sans-serif; letter-spacing: .08em; }
.timeline-inspector-head strong { color: var(--admin-text-strong, #111); font-size: 12px; }
.timeline-inspector-head small { overflow: hidden; color: var(--admin-text-soft, #909399); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.timeline-revision { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
.timeline-revision span { color: #a1a6ad; font: 700 8px/1 'Orbitron',sans-serif; letter-spacing: .08em; }
.timeline-revision code { padding: 5px 8px; border: 1px solid #eadfd7; border-radius: 5px; color: #93410d; background: #fffaf6; font: 9px/1.25 Consolas,monospace; }
.timeline-state { padding: 12px; color: #7d838a; font-size: 10px; }
.timeline-state--loading { display: flex; align-items: center; gap: 9px; }
.timeline-state--loading span { width: 9px; height: 9px; border: 2px solid #eadfd7; border-top-color: var(--admin-orange, #ff6a00); border-radius: 50%; animation: timeline-spin .8s linear infinite; }
.timeline-state--error { color: var(--admin-danger, #d92d20); }
.timeline-kpis {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(5,minmax(66px,1fr));
  padding: 0 12px;
  border-bottom: 1px solid var(--admin-border-soft, #ebeef5);
  background: #fff;
}
.timeline-kpis span { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 9px 11px; border-right: 1px solid var(--admin-border-soft, #ebeef5); }
.timeline-kpis span:last-child { border-right: 0; }
.timeline-kpis b { color: #1c1d20; font: 750 13px/1.1 'Oxanium',sans-serif; }
.timeline-kpis em { color: #92979e; font-size: 9px; font-style: normal; }
.timeline-legend { display: flex; align-items: center; justify-content: flex-end; gap: 16px; padding: 7px 14px; border-bottom: 1px solid var(--admin-border-soft, #ebeef5); color: #777d84; background: #fbfbfc; font-size: 9px; }
.timeline-legend span { display: inline-flex; align-items: center; gap: 5px; }
.timeline-legend i { width: 14px; height: 5px; border-radius: 99px; }
.timeline-legend i.gameplay { background: var(--admin-orange, #ff6a00); }
.timeline-legend i.pause { background: #e8ac2c; }
.timeline-legend i.intermission { background: #8d94a0; }
.timeline-legend i.replay { background: #8d6ba8; }
.timeline-inspector-body { min-height: 0; overflow: visible; }
.timeline-round-stack {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 12px;
  padding: 12px;
}
.timeline-round-block { min-width: 0; overflow: hidden; border: 1px solid #dfe3e7; border-radius: 9px; background: #fff; box-shadow: 0 3px 12px rgba(17,17,17,.025); }
.timeline-round-head { display: grid; grid-template-columns: 42px minmax(0,1fr) auto; align-items: center; gap: 11px; padding: 9px 12px; border-bottom: 1px solid #eceff2; background: #fbfbfc; }
.timeline-round-head>b { display: grid; place-items: center; width: 40px; height: 34px; border-radius: 7px; color: #fff; background: #202124; font: 750 12px/1 'Oxanium',sans-serif; }
.timeline-round-head>div { display: flex; min-width: 0; flex-direction: column; }
.timeline-round-head strong { color: #303236; font-size: 11px; }
.timeline-round-head span { overflow: hidden; color: #92979e; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.timeline-round-head time { color: #9c4308; font: 10px/1 Consolas,monospace; }
.timeline-round-body { padding: 10px 12px 12px; }
.timeline-track-label { display: flex; justify-content: space-between; margin-bottom: 5px; color: #9aa0a6; font-size: 9px; }
.timeline-round-reset { color: #9c4308 !important; font-weight: 700; }
.timeline-telemetry { padding: 14px; }
.timeline-telemetry-label { display: flex; justify-content: space-between; margin-bottom: 8px; color: #81868c; font-size: 10px; }
.timeline-track { position: relative; height: 19px; overflow: hidden; border: 1px solid #e0e3e6; border-radius: 5px; background-color: #f1f3f5; background-image: linear-gradient(90deg,rgba(123,128,134,.12) 1px,transparent 1px); background-size: 10% 100%; }
.timeline-track i { position: absolute; top: 3px; bottom: 3px; min-width: 2px; border-radius: 3px; opacity: .95; }
.timeline-track i.gameplay { background: var(--admin-orange, #ff6a00); }
.timeline-track i.pause { background: #e8ac2c; }
.timeline-track i.intermission { background: #8d94a0; }
.timeline-track i.replay { background: #8d6ba8; }
.timeline-track i.unknown { background: #b6bbc1; }
:deep(.timeline-event-list) { display: grid; gap: 4px; margin-top: 9px; overflow: visible; }
:deep(.timeline-event-row) { display: grid; grid-template-columns: 54px 122px minmax(0,1fr) auto; gap: 10px; align-items: center; min-height: 30px; padding: 5px 9px; border-left: 3px solid var(--admin-orange, #ff6a00); background: #fafafa; font-size: 10px; }
:deep(.timeline-event-row time) { color: #9c4308; font: 10px Consolas,monospace; }
:deep(.timeline-event-row b) { color: #34363a; font-size: 10px; letter-spacing: .1px; }
:deep(.timeline-event-row span) { min-width: 0; overflow: hidden; color: #767b81; text-overflow: ellipsis; white-space: nowrap; }
:deep(.timeline-event-row em) { padding: 2px 6px; border-radius: 99px; color: #62676d; background: #eceff1; font-size: 8px; font-style: normal; }
:deep(.timeline-event-more) { padding: 9px; color: #8d9298; font-size: 9px; text-align: center; }
@keyframes timeline-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .timeline-state--loading span { animation: none; } }
@media (max-width: 820px) {
  .timeline-inspector { flex: none; min-height: 0; }
  .timeline-round-stack { height: auto; overflow: visible; }
}
@media (max-width: 600px) {
  .timeline-inspector-head { align-items: flex-start; flex-direction: column; }
  .timeline-kpis { grid-template-columns: repeat(3,1fr); padding: 0; }
  .timeline-kpis span { border-bottom: 1px solid var(--admin-border-soft, #ebeef5); }
  .timeline-round-stack { grid-auto-rows: auto; }
  .timeline-round-head { grid-template-columns: 28px minmax(0,1fr); }
  .timeline-round-head time { grid-column: 2; }
  :deep(.timeline-event-row) { grid-template-columns: 40px 86px minmax(0,1fr); }
  :deep(.timeline-event-row em) { display: none; }
}
</style>
