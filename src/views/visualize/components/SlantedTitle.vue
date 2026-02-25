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
  min-height: 56px; /* 改为 min-height 以适应内容高度 */
  display: flex;
  align-items: center;
  padding: 0 24px;
  overflow: visible;
  margin-bottom: 0; /* 移除底部外边距，让内容紧贴标题栏 */
  border-radius: 16px 16px 0 0;
}

/* 由于 overflow: visible，我们需要手动裁切背景 */
.slanted-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--vis-primary-gradient, linear-gradient(90deg, #ff9e0f 0%, #FF6A00 100%));
  clip-path: polygon(
    0 0, 
    100% 0, 
    100% 90%, 
    0 100%
  );
  z-index: 1;
  border-radius: 16px 16px 0 0;
}

.title-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  color: white;
  flex-wrap: wrap; /* 允许换行 */
  padding: 8px 0; /* 增加上下内边距 */
}

.title-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.title-suffix {
  display: flex;
  align-items: center;
  margin-left: 8px; /* 紧贴标题 */
}

.title-right {
  display: flex;
  align-items: center;
  padding-right: 20px; 
}

/* 移动端适配 */
@media (max-width: 768px) {
  .slanted-title {
    padding: 0 16px;
    height: auto;
    min-height: auto;
  }

  /* 移动端保留斜切，但使其更平缓，防止遮挡内容 */
  .slanted-bg {
    clip-path: polygon(
      0 0, 
      100% 0, 
      100% 90%, 
      0 100%
    );
  }

  .title-content {
    flex-wrap: wrap;
    align-items: center;
    /* 增加底部内边距，确保内容不被斜切角切掉 */
    padding: 12px 0 24px 0; 
    gap: 8px;
    position: relative;
    z-index: 2;
  }

  .title-left {
    width: auto;
    flex-grow: 0;
    margin-right: auto;
  }

  .title-right {
    display: contents; /* 使用 contents 让子元素直接参与 title-content 的布局 */
  }
}
</style>
