<template>
  <header class="detail-topbar">
    <button type="button" class="detail-topbar__back" aria-label="返回上一页" title="返回上一页" @click="$emit('back')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 6 4 12l6 6M5 12h15" />
      </svg>
    </button>
    <span class="detail-topbar__title" :title="title">{{ title }}</span>
    <div class="detail-topbar__spacer" aria-hidden="true"></div>
  </header>
</template>

<script>
export default {
  name: 'DetailTopbar',
  props: {
    title: {
      type: String,
      required: true
    }
  },
  emits: ['back']
};
</script>

<style scoped>
.detail-topbar {
  display: grid;
  grid-template-columns: 1fr minmax(0, auto) 1fr;
  align-items: center;
  width: 100%;
  min-height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid var(--vis-border, #e6e9f0);
  background: #fff;
  box-shadow: 0 1px 2px rgba(17, 17, 17, 0.03);
  color: var(--vis-text-primary);
}

.detail-topbar__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vis-text-secondary);
  font: inherit;
  cursor: pointer;
  transition:
    color var(--vis-dur-fast) var(--vis-ease),
    opacity var(--vis-dur-fast) var(--vis-ease),
    transform var(--vis-dur-fast) var(--vis-ease);
}

.detail-topbar__back svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.detail-topbar__back:hover {
  color: var(--vis-accent);
  transform: translateX(-1px);
}

.detail-topbar__back:active {
  opacity: 0.62;
  transform: translateX(-1px) scale(0.94);
}

.detail-topbar__back:focus-visible {
  outline: 2px solid var(--vis-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.detail-topbar__title {
  max-width: min(50vw, 480px);
  overflow: hidden;
  color: #111;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-topbar__spacer {
  min-width: 38px;
}

@media (max-width: 680px) {
  .detail-topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    width: calc(100% + var(--detail-topbar-gutter, 0px) + var(--detail-topbar-gutter, 0px));
    min-height: 52px;
    margin-right: calc(0px - var(--detail-topbar-gutter, 0px));
    margin-left: calc(0px - var(--detail-topbar-gutter, 0px));
    padding: 0 12px;
    border-bottom: 1px solid var(--vis-border);
  }

  .detail-topbar__back {
    width: 36px;
    height: 36px;
  }

  .detail-topbar__title {
    max-width: 52vw;
    font-size: 14px;
  }
}
</style>
