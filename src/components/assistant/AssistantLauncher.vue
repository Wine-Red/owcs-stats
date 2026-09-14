<template>
  <div ref="root" class="assistant-launcher-dock compact" :class="{ dragging }" :style="positionStyle">
    <button ref="button" class="owcs-assistant-launcher" type="button"
      aria-label="打开赛事助手"
      title="点击提问 · 拖动调整位置 · 方向键移动"
      @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag"
      @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @click="activate" @keydown="moveByKey">
      <span class="assistant-mark" aria-hidden="true">✦</span>
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
const emit = defineEmits(['open']);
const root = ref(), button = ref(), dragging = ref(false), position = ref(null);
const positionStyle = computed(() => position.value ? { left: `${position.value.x}px`, top: `${position.value.y}px`, right: 'auto', bottom: 'auto' } : {});
let gesture, suppressClick = false;
const storageKey = 'owcs-assistant-launcher-v2';
function save() {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ position: position.value })); } catch { /* Storage can be disabled. */ }
}
function clamp(x, y) {
  const rect = root.value.getBoundingClientRect();
  return { x: Math.max(8, Math.min(x, innerWidth - rect.width - 8)), y: Math.max(8, Math.min(y, innerHeight - rect.height - 8)) };
}
function fit() {
  if (!position.value || !root.value?.getClientRects().length) return;
  position.value = clamp(position.value.x, position.value.y);
  save();
}
function startDrag(e) {
  if (!e.isPrimary || e.button !== 0) return;
  suppressClick = false;
  const rect = root.value.getBoundingClientRect();
  gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
}
function moveDrag(e) {
  if (!gesture || gesture.id !== e.pointerId) return;
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  if (!dragging.value && Math.hypot(dx, dy) < 6) return;
  if (!dragging.value) e.currentTarget.setPointerCapture(e.pointerId);
  dragging.value = true; suppressClick = true;
  position.value = clamp(gesture.left + dx, gesture.top + dy);
}
function endDrag(e) {
  if (!gesture || gesture.id !== e.pointerId) return;
  const wasDragging = dragging.value;
  gesture = null; dragging.value = false;
  fit();
  // Handle a touch tap directly; browsers can omit the compatibility click
  // after pointer capture. Ignore a synthesized click if one does follow.
  if (e.pointerType === 'touch') {
    if (!wasDragging) activate({ detail: 0 });
    suppressClick = true;
  }
}
function cancelDrag() { gesture = null; dragging.value = false; }
function activate(e) {
  if (suppressClick && e.detail !== 0) { suppressClick = false; return; }
  emit('open');
}
function moveByKey(e) {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!directions[e.key]) return;
  e.preventDefault();
  const rect = root.value.getBoundingClientRect(), [dx, dy] = directions[e.key], step = e.shiftKey ? 40 : 10;
  position.value = clamp(rect.left + dx * step, rect.top + dy * step);
  fit();
}
onMounted(() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)) {
      position.value = saved.position; nextTick(fit);
    }
  } catch { /* Ignore unavailable or invalid saved preferences. */ }
  window.addEventListener('resize', fit);
});
onUnmounted(() => window.removeEventListener('resize', fit));
defineExpose({ focus: () => { fit(); button.value?.focus(); } });
</script>

<style scoped>
.assistant-launcher-dock{position:fixed;right:24px;bottom:96px;z-index:2500;display:flex;width:max-content;white-space:nowrap;align-items:center;border:1px solid #e2e5eb;border-radius:28px;background:#fff;box-shadow:0 6px 28px #22304722;color:#252938;font-family:Inter,"Microsoft YaHei",sans-serif}
.owcs-assistant-launcher{display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:8px 12px 8px 18px;border:0;border-radius:28px;background:transparent;color:inherit;font-family:inherit;font-size:14px;font-weight:700;cursor:grab;touch-action:none;user-select:none}
.assistant-mark{color:#c75113;font-size:24px;line-height:1}
.dragging .owcs-assistant-launcher{cursor:grabbing}.compact{border-radius:16px}.compact .owcs-assistant-launcher{width:44px;min-height:44px;padding:0;border-radius:16px}
button:focus-visible{outline:2px solid #e87525;outline-offset:3px}
@media(max-width:600px){.assistant-launcher-dock{right:8px;bottom:calc(56px + env(safe-area-inset-bottom))}}
</style>
