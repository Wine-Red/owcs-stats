<template>
  <div class="slanted-title">
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
  color: #111;
  padding: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #111;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0;
  white-space: normal;
  font-family: var(--vis-font-display);
}

.text {
  min-width: 0;
}

.title-left::before {
  content: '';
  width: 6px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: linear-gradient(180deg, #ff6a00 0%, #ffb11a 100%);
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
    width: 5px;
    height: 26px;
  }
}
</style>
