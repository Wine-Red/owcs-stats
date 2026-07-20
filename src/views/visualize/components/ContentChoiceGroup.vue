<template>
  <div
    class="content-choice-group"
    role="radiogroup"
    :aria-label="ariaLabel || label"
    :style="{ '--choice-count': items.length }"
  >
    <span v-if="!hideLabel" class="content-choice-group__label">{{ label }}</span>
    <div class="content-choice-group__options">
      <button
        v-for="item in items"
        :key="item.value"
        type="button"
        class="content-choice-group__option"
        :class="{ 'is-active': String(modelValue) === String(item.value) }"
        role="radio"
        :aria-checked="String(modelValue) === String(item.value)"
        @click="$emit('update:modelValue', item.value)"
      >
        <span aria-hidden="true"></span>
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ContentChoiceGroup',
  props: {
    modelValue: { type: [String, Number], required: true },
    items: { type: Array, required: true },
    label: { type: String, default: '显示内容' },
    ariaLabel: { type: String, default: '' },
    hideLabel: { type: Boolean, default: false }
  },
  emits: ['update:modelValue']
};
</script>

<style scoped>
.content-choice-group {
  display: flex;
  align-items: center;
  justify-content: stretch;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.content-choice-group__label {
  flex: 0 0 auto;
  color: var(--vis-text-tertiary, #909399);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.content-choice-group__options {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(var(--choice-count, 3), minmax(0, 1fr));
  align-items: center;
  gap: 0;
  min-width: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--vis-border, #e3e6eb);
  border-radius: 0;
  background: #fff;
}

.content-choice-group__option {
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
  transition: color 0.18s var(--vis-ease, ease), background-color 0.18s var(--vis-ease, ease), box-shadow 0.18s var(--vis-ease, ease);
}

.content-choice-group__option > span {
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: #c6cbd3;
  transform: skewX(-16deg);
  transition: background-color 0.18s var(--vis-ease, ease), transform 0.18s var(--vis-ease, ease);
}

.content-choice-group__option:hover:not(.is-active) {
  color: #111;
  background: rgba(17, 17, 17, 0.025);
}

.content-choice-group__option.is-active {
  background: rgba(255, 106, 0, 0.04);
  color: #111;
  box-shadow: none;
}

.content-choice-group__option.is-active > span {
  background: var(--vis-accent, #ff6a00);
  transform: skewX(-16deg) scaleY(1.8);
}

.content-choice-group__option:focus-visible {
  outline: 2px solid rgba(255, 106, 0, 0.72);
  outline-offset: -2px;
}

@media (max-width: 768px) {
  .content-choice-group {
    align-items: stretch;
    justify-content: stretch;
    gap: 8px;
  }

  .content-choice-group__label {
    display: flex;
    align-items: center;
    width: 58px;
  }

  .content-choice-group__options {
    width: 100%;
  }

  .content-choice-group__option {
    min-height: 34px;
    padding: 0 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .content-choice-group__option,
  .content-choice-group__option > span {
    transition: none;
  }
}
</style>
