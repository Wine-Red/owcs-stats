<template>
  <nav
    class="detail-section-tabs"
    :style="{ '--detail-tab-count': items.length }"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <button
      v-for="item in items"
      :key="item.value"
      :id="item.id"
      type="button"
      class="detail-section-tabs__item"
      :class="{ 'is-active': String(modelValue) === String(item.value), 'has-description': item.description }"
      role="tab"
      :aria-selected="String(modelValue) === String(item.value)"
      :aria-label="item.ariaLabel"
      :aria-controls="item.controls"
      :aria-describedby="item.describedby"
      :title="item.title"
      :tabindex="String(modelValue) === String(item.value) ? 0 : -1"
      @click="$emit('update:modelValue', item.value)"
      @keydown.left.prevent="focusRelativeTab($event, -1)"
      @keydown.right.prevent="focusRelativeTab($event, 1)"
      @keydown.home.prevent="focusEdgeTab($event, 0)"
      @keydown.end.prevent="focusEdgeTab($event, -1)"
    >
      <template v-if="item.description">
        <span class="detail-section-tabs__label"><span class="detail-section-tabs__marker" aria-hidden="true"></span>{{ item.label }}</span>
        <span :id="item.describedby" class="detail-section-tabs__description">{{ item.description }}</span>
      </template>
      <template v-else>
        <span class="detail-section-tabs__marker" aria-hidden="true"></span>
        {{ item.label }}
      </template>
    </button>
  </nav>
</template>

<script>
export default {
  name: 'DetailSectionTabs',
  props: {
    modelValue: { type: [String, Number], required: true },
    items: { type: Array, required: true },
    ariaLabel: { type: String, default: '详情内容分区' }
  },
  emits: ['update:modelValue'],
  methods: {
    focusRelativeTab(event, offset) {
      const tabs = Array.from(event.currentTarget.parentElement.querySelectorAll('[role="tab"]'));
      const currentIndex = tabs.indexOf(event.currentTarget);
      const target = tabs[(currentIndex + offset + tabs.length) % tabs.length];
      target?.focus();
      target?.click();
    },
    focusEdgeTab(event, index) {
      const tabs = Array.from(event.currentTarget.parentElement.querySelectorAll('[role="tab"]'));
      const target = index === -1 ? tabs[tabs.length - 1] : tabs[index];
      target?.focus();
      target?.click();
    }
  }
};
</script>

<style scoped>
.detail-section-tabs {
  display: grid;
  grid-template-columns: repeat(var(--detail-tab-count), minmax(0, 1fr));
  width: 100%;
  background: #fff;
  border-bottom: 1px solid var(--vis-border, #e5e7eb);
}

.detail-section-tabs__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  min-height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--vis-text-secondary, #606266);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s var(--vis-ease, ease), background-color 0.2s var(--vis-ease, ease);
}

.detail-section-tabs__marker {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: #c6cbd3;
  transform: skewX(-16deg);
  transition: background-color 0.18s var(--vis-ease, ease), transform 0.18s var(--vis-ease, ease);
}

.detail-section-tabs__item:hover:not(.is-active) {
  background: rgba(17, 17, 17, 0.025);
  color: #111;
}

.detail-section-tabs__item.is-active {
  background: rgba(255, 106, 0, 0.04);
  color: var(--vis-text-strong, #111);
  font-weight: 800;
}

.detail-section-tabs__item.is-active .detail-section-tabs__marker {
  background: var(--vis-accent, #ff6a00);
  transform: skewX(-16deg) scaleY(1.8);
}

.detail-section-tabs__item:focus-visible {
  z-index: 1;
  outline: 2px solid rgba(255, 106, 0, 0.72);
  outline-offset: -4px;
}

.detail-section-tabs__item.has-description {
  flex-direction: column;
  gap: 1px;
  min-height: 40px;
  padding: 4px 4px;
}

.detail-section-tabs__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  line-height: 16px;
}

.detail-section-tabs__description {
  color: var(--vis-text-secondary, #606266);
  font-family: var(--vis-font-numeric, inherit);
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  line-height: 14px;
}

@media (max-width: 768px), (min-width: 769px) and (max-width: 1199px) and (orientation: portrait) {
  .detail-section-tabs__item {
    min-height: 34px;
    padding: 0 8px;
    font-size: 12px;
  }
}

@media (max-width: 380px) {
  .detail-section-tabs__item {
    font-size: 11px;
  }
  .detail-section-tabs__description {
    font-size: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .detail-section-tabs__item,
  .detail-section-tabs__marker {
    transition: none;
  }
}
</style>
