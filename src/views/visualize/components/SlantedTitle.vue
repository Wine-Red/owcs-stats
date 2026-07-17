<template>
  <div class="slanted-title" :class="[`size-${size}`, `tone-${tone}`]">
    <div class="title-content">
      <div class="title-left">
        <div class="icon-wrapper" v-if="icon">
          <i :class="icon"></i>
        </div>
        <span class="text">{{ title }}</span>
        <div class="title-suffix">
          <slot name="title-suffix"></slot>
        </div>
      </div>
      <div class="title-right">
        <slot name="extra"></slot>
      </div>
    </div>
    <div class="slanted-bg"></div>
  </div>
</template>

<script>
export default {
  name: 'SlantedTitle',
  props: {
    title: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      default: ''
    },
    // M1 变体：sm / md(默认，保持原有观感) / lg
    size: {
      type: String,
      default: 'md'
    },
    // M1 变体：dark(默认，浅色底) / ink(深色赛事面)
    tone: {
      type: String,
      default: 'dark'
    }
  }
}
</script>

<style scoped>
.slanted-title {
  position: relative;
  display: block;
  min-height: auto;
  margin-bottom: 22px;
  padding: 0;
  overflow: visible;
  border-radius: 0;
  z-index: 5;
}

.slanted-bg {
  display: none;
}

.title-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
  color: var(--vis-text-strong, #111);
  padding: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
  white-space: normal;
  font-family: var(--vis-font-display);
}

.text {
  min-width: 0;
  font-style: italic;
}

/* M1 · 斜切标题条：渐变斜块锚点（--vis-slant） */
.title-left::before {
  content: '';
  width: 4px;
  height: 18px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient, linear-gradient(90deg, #ff6a00 0%, #ff9e0f 100%));
  transform: skewX(var(--vis-slant, -8deg));
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 0.85em;
  color: var(--vis-accent, #ff6a00);
}

.title-suffix {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.title-right {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-right: 0;
}

/* size 变体（默认 md 与原有观感一致） */
.size-sm .title-left {
  gap: 8px;
  font-size: 15px;
}

.size-sm .title-left::before {
  width: 4px;
  height: 14px;
}

.size-lg .title-left {
  font-size: 26px;
}

.size-lg .title-left::before {
  width: 5px;
  height: 22px;
}

/* tone 变体：ink 用于深色赛事面（横幅/深底数据卡） */
.tone-ink .title-content,
.tone-ink .title-left {
  color: var(--vis-on-ink, #f5f7fa);
}

@media (max-width: 768px) {
  .slanted-title {
    margin-bottom: 14px;
  }

  .title-content {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .title-left,
  .title-right {
    width: 100%;
  }

  .title-left {
    gap: 8px;
    font-size: 20px;
  }

  .title-right {
    margin-left: 0;
  }

  .title-left::before {
    width: 4px;
    height: 16px;
  }

  .size-lg .title-left {
    font-size: 22px;
  }

  .size-sm .title-left {
    font-size: 14px;
  }
}
</style>
