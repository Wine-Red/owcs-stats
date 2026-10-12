<template>
  <span class="fleta-value" :class="{ 'is-deadlift': value != null && value >= 100, 'is-empty': value == null, compact }">
    <span v-if="label" class="fleta-label">{{ label }}</span>
    <strong>{{ value == null ? '—' : Number(value).toFixed(1) }}<small v-if="value != null">%</small></strong>
  </span>
</template>

<script>
export default {
  name: 'FletaValue',
  props: {
    value: { type: Number, default: null },
    label: { type: String, default: '' },
    compact: { type: Boolean, default: false }
  }
};
</script>

<style scoped>
.fleta-value { display: inline-flex; align-items: baseline; gap: 8px; color: #ba4c00; white-space: nowrap; }
.fleta-label { display: inline-flex; align-items: center; font-family: var(--vis-font-body); font-size: 10px; font-weight: 600; color: #737b85; }
.fleta-value strong { font-family: var(--vis-font-numeric); font-size: 19px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.fleta-value small { margin-left: 2px; font-size: 10px; }
.fleta-value.compact strong { font-size: 15px; }
.fleta-value.is-deadlift strong { color: #fff; background: #b84900; padding: 3px 6px; border-radius: 3px; }
.fleta-value.is-empty strong { color: #969da5; }
</style>
