<template>
  <section class="map-timeline" aria-label="本局时间线">
    <div class="map-timeline__topline">
      <h3>时间线</h3>
      <nav v-if="hasTimeline && activeRound" class="map-timeline__rounds" aria-label="选择回合">
        <button
          v-for="round in roundViews"
          :key="round.roundId"
          type="button"
          :class="{ active: round.roundId === activeRoundId }"
          :aria-pressed="round.roundId === activeRoundId"
          @click="selectRound(round.roundId)"
        >
          <b>{{ round.label }}</b>
          <span>{{ clock(round.durationMs) }}</span>
        </button>
      </nav>
    </div>

    <div v-if="loading" class="map-timeline__state">
      <i class="map-timeline__spinner"></i>加载中
    </div>
    <div v-else-if="error" class="map-timeline__state is-error">读取失败</div>
    <div v-else-if="!hasTimeline || !payload || !activeRound" class="map-timeline__state">暂无时间线</div>

    <template v-else>
      <div class="map-timeline__toolbar">
        <div class="map-timeline__filters" aria-label="筛选事件">
          <button
            v-for="filter in availableFilters"
            :key="filter.value"
            type="button"
            :class="[filter.value, { active: activeFilter === filter.value }]"
            :aria-pressed="activeFilter === filter.value"
            @click="selectFilter(filter.value)"
          >
            <i></i>{{ filter.label }}
          </button>
        </div>
        <label
          class="map-timeline__zoom"
          :style="{ '--zoom-progress': `${zoomProgress}%` }"
        >
          <span>缩放</span>
          <input
            type="range"
            :min="minZoom"
            :max="maxZoom"
            :step="zoomStep"
            :value="zoom"
            aria-label="时间线缩放"
            :aria-valuetext="`${zoomPercent}%`"
            @input="handleZoomInput"
          />
          <output>{{ zoomPercent }}%</output>
        </label>
      </div>

      <div class="map-timeline__board">
        <div class="map-timeline__labels" aria-hidden="true">
          <div class="lane-label lane-label--axis">{{ activeRound.label }}</div>
          <div class="lane-label lane-label--last-blow">最后一击</div>
          <div
            v-for="lane in playerLanes"
            :key="lane.key"
            class="lane-label lane-label--player"
            :class="`is-${lane.side}`"
          >
            <i></i><span>{{ lane.name }}</span>
          </div>
        </div>

        <div
          ref="trackViewport"
          class="map-timeline__viewport"
          :class="{ dragging: isDragging }"
          aria-label="可左右拖动的回合时间线"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerEnd"
          @pointercancel="handlePointerEnd"
          @wheel="handleWheel"
          @dragstart.prevent
        >
          <div class="map-timeline__canvas" :style="{ width: `${canvasWidth}px`, '--tick-divisions': tickViews.length - 1 }">
            <div class="tick-lane" aria-hidden="true">
              <span v-for="tick in tickViews" :key="tick.timeMs" :style="{ left: `${tick.position}%` }">
                {{ clock(tick.timeMs) }}
              </span>
            </div>

            <div class="last-blow-lane lane-grid">
              <i
                v-for="event in visibleLastBlows"
                :key="`last-${eventKey(event)}`"
                class="last-blow-marker"
                :style="markerStyle(event, activeRound.durationMs)"
                :title="`${clock(event.timeMs)} ${eventSummary(event)}`"
              ></i>
            </div>

            <div
              v-for="lane in playerLanes"
              :key="lane.key"
              class="player-event-lane lane-grid"
              :class="`is-${lane.side}`"
            >
              <button
                v-for="event in lane.events"
                :key="event.renderKey"
                type="button"
                class="lane-marker"
                :class="[event.category, { selected: selectedEvent?.renderKey === event.renderKey }]"
                :style="markerStyle(event, activeRound.durationMs)"
                :aria-label="`${clock(event.timeMs)} ${eventSummary(event)}`"
                :title="`${clock(event.timeMs)} · ${eventSummary(event)}`"
                @click="selectEvent(event)"
              ></button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedEvent" class="map-timeline__selection">
        <time>{{ clock(selectedEvent.timeMs) }}</time>
        <b>{{ eventSummary(selectedEvent) }}</b>
        <span :class="selectedEvent.category">{{ eventKind(selectedEvent) }}</span>
        <button type="button" aria-label="关闭事件详情" @click="selectedEvent = null">×</button>
      </div>
    </template>
  </section>
</template>

<script setup>
/* global defineProps */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  mapGame: { type: Object, default: null },
  payload: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const minZoom = 0.45;
const maxZoom = 1;
const zoomStep = 0.05;
const activeRoundId = ref('');
const activeFilter = ref('all');
const selectedEvent = ref(null);
const zoom = ref(maxZoom);
const isDragging = ref(false);
const trackViewport = ref(null);

let activePointerId = null;
let dragOrigin = null;
let dragSample = null;
let dragVelocity = 0;
let lastDragAt = 0;
let zoomFrame = 0;
let momentumFrame = 0;

const hasTimeline = computed(() => Boolean(props.mapGame?.timeline));
const players = computed(() => Array.isArray(props.payload?.players) ? props.payload.players : []);
const rounds = computed(() => Array.isArray(props.payload?.rounds) ? props.payload.rounds : []);
const events = computed(() => Array.isArray(props.payload?.events) ? props.payload.events : []);

const playerAliases = computed(() => {
  const aliases = new Map();
  players.value.forEach((player, index) => {
    const key = String(player?.playerId ?? player?.id ?? player?.name ?? `player-${index}`);
    [player?.playerId, player?.id, player?.name, player?.playerName].forEach(value => {
      if (value !== undefined && value !== null && value !== '') aliases.set(String(value).toLowerCase(), key);
    });
  });
  return aliases;
});

const resolvePlayerKey = value => {
  if (value === undefined || value === null || value === '') return '';
  return playerAliases.value.get(String(value).toLowerCase()) || '';
};

const roundViews = computed(() => rounds.value.map((round, index) => {
  const roundId = String(round?.roundId || `round-${index + 1}`);
  const roundIndex = Number(round?.index) || index + 1;
  const roundEvents = events.value
    .filter(event => String(event?.roundId || '') === roundId)
    .sort((left, right) => Number(left?.timeMs || 0) - Number(right?.timeMs || 0));
  return {
    roundId,
    index: roundIndex,
    label: String(round?.name || round?.label || round?.title || `R${roundIndex}`),
    durationMs: Math.max(
      1,
      Number(round?.durationMs) || Number(round?.endMs) || 0,
      ...roundEvents.map(event => Number(event?.timeMs) || 0)
    ),
    events: roundEvents
  };
}));

const activeRound = computed(() => (
  roundViews.value.find(round => round.roundId === activeRoundId.value) || roundViews.value[0] || null
));

const sourceCategory = event => {
  const type = String(event?.type || '').toLowerCase();
  if (type.includes('death')) return 'death';
  if (type.includes('kill') || type.includes('final_blow')) return 'kill';
  if (type.includes('ultimate') || type.includes('ult_')) return 'ultimate';
  if (type.includes('hero')) return 'hero';
  return 'other';
};

const actorKey = event => {
  const category = sourceCategory(event);
  if (category === 'death') return resolvePlayerKey(event?.playerId ?? event?.victimId ?? event?.targetId);
  return resolvePlayerKey(event?.playerId ?? event?.killerId ?? event?.actorId);
};

const normalizedLaneEvents = computed(() => (activeRound.value?.events || []).flatMap((event, index) => {
  const category = sourceCategory(event);
  const baseKey = eventKey(event, index);
  const result = [];
  const primaryLane = actorKey(event);
  if (primaryLane) result.push({ ...event, category, laneKey: primaryLane, renderKey: `${baseKey}-primary` });

  const victimLane = category === 'kill' ? resolvePlayerKey(event?.victimId ?? event?.targetId) : '';
  if (victimLane && victimLane !== primaryLane) {
    result.push({ ...event, category: 'death', laneKey: victimLane, renderKey: `${baseKey}-victim`, derivedDeath: true });
  }
  return result;
}));

const availableFilters = computed(() => {
  const categories = new Set(normalizedLaneEvents.value.map(event => event.category));
  return [
    { value: 'all', label: '全部' },
    { value: 'kill', label: '击杀' },
    { value: 'ultimate', label: '大招' },
    { value: 'hero', label: '英雄' },
    { value: 'death', label: '死亡' }
  ].filter(filter => filter.value === 'all' || categories.has(filter.value));
});

const eventMatchesFilter = event => activeFilter.value === 'all' || event.category === activeFilter.value;

const playerLanes = computed(() => {
  const midpoint = Math.ceil(players.value.length / 2);
  const team1Id = props.mapGame?.team1Id;
  const team2Id = props.mapGame?.team2Id;
  return players.value.map((player, index) => {
    const key = String(player?.playerId ?? player?.id ?? player?.name ?? `player-${index}`);
    const teamId = player?.teamId ?? player?.Team?.id ?? player?.team?.id;
    const side = team1Id !== undefined && String(teamId) === String(team1Id)
      ? 'team1'
      : team2Id !== undefined && String(teamId) === String(team2Id)
        ? 'team2'
        : index < midpoint ? 'team1' : 'team2';
    return {
      key,
      side,
      name: String(player?.name || player?.playerName || player?.playerId || player?.id || `选手 ${index + 1}`),
      events: normalizedLaneEvents.value.filter(event => event.laneKey === key && eventMatchesFilter(event))
    };
  });
});

const lastBlowEvents = computed(() => (activeRound.value?.events || [])
  .filter(event => sourceCategory(event) === 'kill'));
const visibleLastBlows = computed(() => ['all', 'kill'].includes(activeFilter.value) ? lastBlowEvents.value : []);

const baseCanvasWidth = computed(() => {
  const durationSeconds = Math.max(1, Number(activeRound.value?.durationMs || 0) / 1000);
  const densityWidth = Math.max(durationSeconds * 4.2, normalizedLaneEvents.value.length * 24);
  return Math.round(Math.min(4200, Math.max(820, densityWidth)));
});
const canvasWidth = computed(() => Math.round(baseCanvasWidth.value * zoom.value));
const zoomPercent = computed(() => Math.round(zoom.value * 100));
const zoomProgress = computed(() => (
  (zoom.value - minZoom) / Math.max(0.01, maxZoom - minZoom) * 100
));
const tickViews = computed(() => {
  const duration = Math.max(1, Number(activeRound.value?.durationMs || 0));
  const divisions = Math.max(4, Math.min(8, Math.round(canvasWidth.value / 180)));
  return Array.from({ length: divisions + 1 }, (_, index) => ({
    timeMs: duration * index / divisions,
    position: index / divisions * 100
  }));
});

watch(roundViews, value => {
  if (!value.some(round => round.roundId === activeRoundId.value)) activeRoundId.value = value[0]?.roundId || '';
}, { immediate: true });

watch(() => props.mapGame?.id, () => resetView(true));

watch(availableFilters, filters => {
  if (!filters.some(filter => filter.value === activeFilter.value)) activeFilter.value = 'all';
});

const selectRound = roundId => {
  activeRoundId.value = roundId;
  activeFilter.value = 'all';
  resetView();
};

const selectFilter = value => {
  activeFilter.value = value;
  selectedEvent.value = null;
};

function resetView(resetRound = false) {
  if (resetRound) activeRoundId.value = '';
  zoom.value = maxZoom;
  selectedEvent.value = null;
  cancelMomentum();
  activePointerId = null;
  dragOrigin = null;
  dragSample = null;
  dragVelocity = 0;
  isDragging.value = false;
  nextTick(() => { if (trackViewport.value) trackViewport.value.scrollLeft = 0; });
}

const clampZoom = value => Math.max(minZoom, Math.min(maxZoom, Number(value) || minZoom));

const setZoomAround = (value, clientX) => {
  const viewport = trackViewport.value;
  const nextZoom = clampZoom(value);
  if (!viewport || nextZoom === zoom.value) return;
  cancelMomentum();
  const rect = viewport.getBoundingClientRect();
  const offset = Number.isFinite(clientX) ? clientX - rect.left : viewport.clientWidth / 2;
  const ratio = (viewport.scrollLeft + offset) / Math.max(1, canvasWidth.value);
  zoom.value = nextZoom;
  cancelAnimationFrame(zoomFrame);
  zoomFrame = requestAnimationFrame(() => {
    viewport.scrollLeft = ratio * canvasWidth.value - offset;
  });
};

const handleZoomInput = event => {
  setZoomAround(Number(event.target?.value), Number.NaN);
};

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

function cancelMomentum() {
  cancelAnimationFrame(momentumFrame);
  momentumFrame = 0;
}

const startMomentum = initialVelocity => {
  const viewport = trackViewport.value;
  if (!viewport || prefersReducedMotion() || Math.abs(initialVelocity) < 0.06) return;
  cancelMomentum();
  let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity));
  let previousTime = performance.now();
  const glide = currentTime => {
    const deltaTime = Math.min(32, Math.max(1, currentTime - previousTime));
    previousTime = currentTime;
    const previousScroll = viewport.scrollLeft;
    viewport.scrollLeft += velocity * deltaTime;
    const actualDelta = viewport.scrollLeft - previousScroll;
    velocity *= Math.pow(0.94, deltaTime / 16.67);
    if (Math.abs(velocity) < 0.025 || Math.abs(actualDelta) < 0.1) {
      momentumFrame = 0;
      return;
    }
    momentumFrame = requestAnimationFrame(glide);
  };
  momentumFrame = requestAnimationFrame(glide);
};

const handlePointerDown = event => {
  const viewport = trackViewport.value;
  if (!viewport || activePointerId !== null) return;
  cancelMomentum();
  activePointerId = event.pointerId;
  try { viewport.setPointerCapture(event.pointerId); } catch { /* synthetic pointers do not support capture */ }
  dragOrigin = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, axis: event.pointerType === 'mouse' ? 'x' : '' };
  dragSample = { scrollLeft: viewport.scrollLeft, time: performance.now() };
  dragVelocity = 0;
  isDragging.value = event.pointerType === 'mouse';
};

const handlePointerMove = event => {
  const viewport = trackViewport.value;
  if (!viewport || event.pointerId !== activePointerId) return;
  if (!dragOrigin) return;
  const dx = event.clientX - dragOrigin.x;
  const dy = event.clientY - dragOrigin.y;
  if (!dragOrigin.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 5) {
    dragOrigin.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  }
  if (dragOrigin.axis !== 'x') return;
  event.preventDefault();
  viewport.scrollLeft = dragOrigin.scrollLeft - dx;
  const now = performance.now();
  if (dragSample) {
    const deltaTime = Math.max(1, now - dragSample.time);
    const instantVelocity = (viewport.scrollLeft - dragSample.scrollLeft) / deltaTime;
    dragVelocity = dragVelocity * 0.62 + instantVelocity * 0.38;
  }
  dragSample = { scrollLeft: viewport.scrollLeft, time: now };
  isDragging.value = true;
  if (Math.abs(dx) > 4) lastDragAt = Date.now();
};

const handlePointerEnd = event => {
  if (event.pointerId !== activePointerId) return;
  const shouldGlide = event.type !== 'pointercancel' && dragOrigin?.axis === 'x';
  const releaseDelay = dragSample ? performance.now() - dragSample.time : Number.POSITIVE_INFINITY;
  const releaseVelocity = releaseDelay < 100
    ? dragVelocity * Math.max(0, 1 - releaseDelay / 140)
    : 0;
  try { trackViewport.value?.releasePointerCapture(event.pointerId); } catch { /* pointer capture may already be released */ }
  activePointerId = null;
  dragOrigin = null;
  dragSample = null;
  isDragging.value = false;
  if (shouldGlide) {
    lastDragAt = Date.now();
    startMomentum(releaseVelocity);
  }
  dragVelocity = 0;
};

const handleWheel = event => {
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && trackViewport.value) {
    event.preventDefault();
    cancelMomentum();
    trackViewport.value.scrollLeft += event.deltaY;
  }
};

const selectEvent = event => {
  if (Date.now() - lastDragAt < 160) return;
  selectedEvent.value = selectedEvent.value?.renderKey === event.renderKey ? null : event;
};

const clock = milliseconds => {
  const total = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const markerStyle = (event, durationValue) => {
  const duration = Math.max(1, Number(durationValue) || 0);
  const position = Math.max(0.35, Math.min(99.65, (Number(event?.timeMs) || 0) / duration * 100));
  return { left: `${position.toFixed(3)}%` };
};

function eventKey(event, fallback = 0) {
  return String(event?.eventId || `${event?.roundId || 'round'}-${event?.timeMs || fallback}-${event?.type || 'event'}`);
}

const playerName = value => {
  const key = resolvePlayerKey(value);
  const player = players.value.find((item, index) => String(item?.playerId ?? item?.id ?? item?.name ?? `player-${index}`) === key);
  return String(player?.name || player?.playerName || value || '');
};

const eventKind = event => ({ kill: '击杀', ultimate: '大招', hero: '英雄', death: '死亡', other: '事件' }[event.category || sourceCategory(event)]);

const eventSummary = event => {
  const category = event.category || sourceCategory(event);
  const actor = playerName(event?.playerId ?? event?.killerId ?? event?.actorId);
  const target = playerName(event?.victimId ?? event?.targetId);
  const hero = String(event?.heroName || event?.hero || event?.heroId || '');
  if (category === 'death') return `${target || actor || '选手'} · 死亡`;
  if (category === 'kill') return actor && target ? `${actor} → ${target}` : actor || target || '击杀';
  if (category === 'hero') return [actor, hero].filter(Boolean).join(' · ') || '英雄切换';
  if (category === 'ultimate') return [actor, hero].filter(Boolean).join(' · ') || '使用大招';
  return [actor, String(event?.type || '').replaceAll('_', ' ')].filter(Boolean).join(' · ') || '比赛事件';
};

onBeforeUnmount(() => {
  cancelAnimationFrame(zoomFrame);
  cancelMomentum();
});
</script>

<style scoped>
.map-timeline {
  --lane-label-width: 104px;
  --lane-height: 18px;
  --event-kill: #d9ac32;
  --event-ultimate: #7658d6;
  --event-hero: #5f82dc;
  --event-death: #df5b6b;
  margin-top: 20px;
  padding: 0 2px 8px;
  color: #202226;
  background: #fff;
}

.map-timeline__topline {
  display: flex;
  min-height: 42px;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #e3e6ea;
}
.map-timeline__topline h3 { position: relative; margin: 0; padding: 0 0 11px 10px; color: #17191c; font: 900 15px/1 var(--vis-font-display); }
.map-timeline__topline h3::before { position: absolute; top: 0; bottom: 10px; left: 0; width: 4px; background: #ff6a00; content: ''; transform: skewX(-9deg); }

.map-timeline__rounds { display: flex; align-self: flex-end; overflow-x: auto; scrollbar-width: none; }
.map-timeline__rounds::-webkit-scrollbar { display: none; }
.map-timeline__rounds button { position: relative; display: flex; min-width: 62px; align-items: baseline; justify-content: center; gap: 5px; padding: 0 9px 10px; border: 0; color: #9a9fa7; background: transparent; cursor: pointer; }
.map-timeline__rounds button::after { position: absolute; right: 7px; bottom: -1px; left: 7px; height: 2px; background: transparent; content: ''; }
.map-timeline__rounds button.active { color: #1c1f23; }
.map-timeline__rounds button.active::after { background: #ff6a00; }
.map-timeline__rounds b { font: 900 12px/1 var(--vis-font-display); }
.map-timeline__rounds span { font: 700 9px/1 var(--vis-font-numeric); }

.map-timeline__toolbar { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 10px; }
.map-timeline__filters { display: flex; min-width: 0; flex: 1 1 auto; gap: 5px; overflow-x: auto; scrollbar-width: none; }
.map-timeline__filters::-webkit-scrollbar { display: none; }
.map-timeline__filters button { display: inline-flex; min-height: 34px; flex: 0 0 auto; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid transparent; border-radius: 4px; color: #7c828b; background: #f5f6f8; cursor: pointer; font-size: 9px; font-weight: 700; }
.map-timeline__filters button i { width: 6px; height: 6px; border-radius: 50%; background: #9299a2; }
.map-timeline__filters button.kill i { border-radius: 1px; background: var(--event-kill); transform: rotate(45deg); }
.map-timeline__filters button.ultimate i { border-radius: 1px; background: var(--event-ultimate); }
.map-timeline__filters button.hero i { background: var(--event-hero); }
.map-timeline__filters button.death i { background: var(--event-death); }
.map-timeline__filters button.active { border-color: #dfe3e7; color: #26292e; background: #fff; }

.map-timeline__zoom { display: inline-flex; min-height: 44px; flex: 0 0 auto; align-items: center; gap: 6px; color: #747c84; font-size: 8px; font-weight: 800; white-space: nowrap; }
.map-timeline__zoom > span { color: #858c94; }
.map-timeline__zoom input { width: 92px; height: 44px; margin: 0; appearance: none; background: transparent; cursor: pointer; touch-action: manipulation; }
.map-timeline__zoom input::-webkit-slider-runnable-track { height: 3px; border-radius: 99px; background: linear-gradient(90deg, #ff7a2f 0 var(--zoom-progress), #dfe3e7 var(--zoom-progress) 100%); }
.map-timeline__zoom input::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -6.5px; appearance: none; border: 2px solid #fff; border-radius: 50%; background: #ff6a00; box-shadow: 0 1px 4px rgba(31, 36, 41, .28); }
.map-timeline__zoom input::-moz-range-track { height: 3px; border: 0; border-radius: 99px; background: #dfe3e7; }
.map-timeline__zoom input::-moz-range-progress { height: 3px; border-radius: 99px; background: #ff7a2f; }
.map-timeline__zoom input::-moz-range-thumb { width: 13px; height: 13px; border: 2px solid #fff; border-radius: 50%; background: #ff6a00; box-shadow: 0 1px 4px rgba(31, 36, 41, .28); }
.map-timeline__zoom input:focus-visible { outline: 2px solid rgba(255, 106, 0, .45); outline-offset: -8px; border-radius: 99px; }
.map-timeline__zoom output { min-width: 28px; color: #444b52; font: 800 8px/1 var(--vis-font-numeric); text-align: right; }

.map-timeline__board { display: grid; grid-template-columns: var(--lane-label-width) minmax(0, 1fr); overflow: hidden; border: 1px solid #dce2e7; border-radius: 7px; background: #fff; box-shadow: 0 6px 18px rgba(24, 31, 38, .055); }
.map-timeline__labels { z-index: 3; color: #626b74; background: #f5f7f9; box-shadow: 4px 0 10px rgba(29, 38, 46, .07); }
.lane-label { display: flex; align-items: center; min-width: 0; padding: 0 9px; border-bottom: 1px solid #e2e7eb; font-size: 7px; }
.lane-label--axis { height: 20px; color: #626b74; font-weight: 800; }
.lane-label--last-blow { height: 18px; color: #8b939b; }
.lane-label--player { height: var(--lane-height); gap: 6px; }
.lane-label--player i { width: 3px; height: 9px; flex: 0 0 3px; background: #38b9dc; }
.lane-label--player.is-team2 i { background: #ff7a2f; }
.lane-label--player span { min-width: 0; overflow: hidden; color: #626b74; font: 700 7px/1 var(--vis-font-numeric); text-overflow: ellipsis; white-space: nowrap; }

.map-timeline__viewport { min-width: 0; overflow-x: auto; overflow-y: hidden; cursor: grab; scrollbar-color: #aab2b9 #f1f3f5; scrollbar-width: thin; touch-action: pan-y pinch-zoom; overscroll-behavior-x: contain; user-select: none; }
.map-timeline__viewport.dragging { cursor: grabbing; }
.map-timeline__viewport::-webkit-scrollbar { height: 7px; }
.map-timeline__viewport::-webkit-scrollbar-track { background: #f1f3f5; }
.map-timeline__viewport::-webkit-scrollbar-thumb { border: 2px solid #f1f3f5; border-radius: 99px; background: #aab2b9; }
.map-timeline__canvas { position: relative; min-width: 100%; color: #4c555e; background: #fff; }

.tick-lane { position: relative; height: 20px; border-bottom: 1px solid #e1e6ea; background: #fafbfc; }
.tick-lane span { position: absolute; top: 0; bottom: 0; padding-top: 7px; border-left: 1px solid #e1e6ea; color: #8c949c; font: 6px/1 var(--vis-font-numeric); transform: translateX(-50%); }
.tick-lane span:first-child { padding-left: 4px; transform: none; }
.tick-lane span:last-child { padding-right: 4px; transform: translateX(-100%); }

.lane-grid { position: relative; border-bottom: 1px solid #e5e9ed; background-color: #fff; background-image: linear-gradient(90deg, rgba(204, 211, 217, .58) 1px, transparent 1px); background-size: calc(100% / var(--tick-divisions, 8)) 100%; }
.last-blow-lane { height: 18px; background-color: #fafbfc; }
.player-event-lane { height: var(--lane-height); }
.player-event-lane.is-team2 { background-color: #fffdfb; }
.last-blow-marker { position: absolute; top: 4px; width: 2px; height: 10px; background: #ff7a2f; transform: translateX(-50%); }

.lane-marker { position: absolute; top: 50%; z-index: 2; width: 8px; height: 8px; padding: 0; border: 1px solid transparent; background: #8a949e; cursor: pointer; transform: translate(-50%, -50%); transition: filter .12s ease, transform .12s ease; }
.lane-marker:hover,
.lane-marker:focus-visible,
.lane-marker.selected { z-index: 4; filter: brightness(1.05); outline: 1px solid #313840; outline-offset: 2px; transform: translate(-50%, -50%) scale(1.18); }
.lane-marker.kill { border-radius: 1px; background: var(--event-kill); transform: translate(-50%, -50%) rotate(45deg); }
.lane-marker.kill:hover,
.lane-marker.kill:focus-visible,
.lane-marker.kill.selected { transform: translate(-50%, -50%) rotate(45deg) scale(1.16); }
.lane-marker.ultimate { border-radius: 2px; border-color: #5f45b8; background: var(--event-ultimate); }
.lane-marker.hero { border-radius: 50%; background: var(--event-hero); }
.lane-marker.death { border-radius: 50%; background: var(--event-death); }
.lane-marker.other { border-radius: 2px; background: #8d98a2; }

.map-timeline__selection { display: grid; min-height: 34px; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 9px; padding: 0 9px; border: 1px solid #e5e8eb; border-top: 0; color: #34383e; background: #fafbfc; }
.map-timeline__selection time { color: #777f88; font: 800 9px/1 var(--vis-font-numeric); }
.map-timeline__selection b { min-width: 0; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.map-timeline__selection > span { padding: 3px 5px; border-radius: 3px; color: #6d747c; background: #eceff2; font-size: 8px; }
.map-timeline__selection > span.kill { color: #9a6612; background: #fff5d8; }
.map-timeline__selection > span.ultimate { color: #6649b5; background: #f1edfb; }
.map-timeline__selection > span.hero { color: #3e62bc; background: #edf2ff; }
.map-timeline__selection > span.death { color: #bd4051; background: #ffedf0; }
.map-timeline__selection button { border: 0; color: #9299a1; background: transparent; cursor: pointer; font-size: 15px; }

.map-timeline__state { display: flex; min-height: 78px; align-items: center; justify-content: center; gap: 7px; color: #999fa7; font-size: 10px; }
.map-timeline__state.is-error { color: #bd3a31; }
.map-timeline__spinner { width: 13px; height: 13px; border: 2px solid #e5e8ec; border-top-color: #ff6a00; border-radius: 50%; animation: timeline-spin .8s linear infinite; }

@keyframes timeline-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .map-timeline__spinner { animation: none; }
  .lane-marker { transition: none; }
}

@media (max-width: 768px) {
  .map-timeline { --lane-label-width: 84px; --lane-height: 18px; margin-top: 18px; padding: 0 8px 8px; }
  .map-timeline__topline { min-height: 40px; }
  .map-timeline__topline h3 { font-size: 14px; }
  .map-timeline__rounds button { min-width: 56px; padding-right: 7px; padding-left: 7px; }
  .map-timeline__toolbar { min-height: 44px; gap: 7px; }
  .map-timeline__filters { margin-right: -4px; }
  .map-timeline__filters button { padding-right: 7px; padding-left: 7px; }
  .map-timeline__zoom { gap: 4px; }
  .map-timeline__zoom > span { display: none; }
  .map-timeline__zoom input { width: 72px; }
  .map-timeline__zoom output { min-width: 26px; }
  .lane-label { padding-right: 7px; padding-left: 7px; }
  .lane-label--player { gap: 5px; }
  .lane-label--player span { font-size: 7px; }
  .map-timeline__selection { grid-template-columns: auto minmax(0, 1fr) auto auto; }
}
</style>
