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
  z-index: 5; /* 提升层级，确保投影覆盖在下方内容之上 */
}

/* 由于 overflow: visible，我们需要手动裁切背景 */
.slanted-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  
  /* 方案一 & 二：橙色渐变背景，右侧纹理局部化 */
  /* 左上角深橙色 (#FF6A00) -> 右侧逐渐变淡 (#FF9E0F) */
  background: linear-gradient(135deg, #FF6A00 0%, #FF9E0F 100%);
  
  /* 底部柔和暖色投影 - 营造悬浮感 */
  box-shadow: 0 4px 12px rgba(255, 106, 0, 0.3);
  
  z-index: 1;
  border-radius: 16px 16px 0 0;
  overflow: hidden; /* 确保伪元素不溢出圆角 */
}

/* 纹理和高光层 - 仅在右侧显示 */
.slanted-bg::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  
  /* 1. 真正的六边形蜂巢纹理 (SVG) + 右上角高光 */
  background-image: 
    /* 高光层 */
    radial-gradient(circle at 100% 0%, rgba(255, 230, 150, 0.25) 0%, transparent 45%),
    
    /* 蜂巢 SVG - 紧密排列的六边形网格 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23ffffff' stroke-width='2'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23ffffff' stroke-width='2'/%3E%3C/svg%3E");
    
  /* 调整纹理大小 - 30px 左右的大小能看清蜂巢结构 */
  background-size: 100% 100%, 30px auto; 
  background-repeat: no-repeat, repeat;
  
  /* 透明度 - 极淡，仅隐约可见 */
  opacity: 0.08;
  
  /* 混合模式 */
  background-blend-mode: overlay; 
  
  /* 遮罩：更严格限制在右上角区域 */
  mask-image: radial-gradient(circle at 100% 0%, black 0%, transparent 45%);
  -webkit-mask-image: radial-gradient(circle at 100% 0%, black 0%, transparent 45%);
    
  pointer-events: none;
}

/* 底部暖色投影 (内部) - 极淡，仅增加一点点体积感 */
.slanted-bg::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 12px; /* 高度减小 */
  background: linear-gradient(to top, rgba(200, 80, 0, 0.08), transparent); /* 透明度大幅降低 */
  pointer-events: none;
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
  /* 方案四：弱化分组 */
  margin-left: 12px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08); /* 更透明 */
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  transition: all 0.3s ease;
}

.title-suffix:hover {
  background: rgba(255, 255, 255, 0.15);
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
  /* .slanted-bg {
    clip-path: polygon(...) removed
  } */

  .title-content {
    flex-wrap: wrap;
    align-items: center;
    /* 减少底部内边距，不再需要避让斜切角 */
    padding: 12px 0; 
    gap: 8px;
    position: relative;
    z-index: 2;
  }

  .title-left {
    width: 100%;
    flex-grow: 1;
    margin-right: 0;
  }

  .title-suffix {
    margin-left: auto;
  }

  .title-right {
    display: contents; /* 使用 contents 让子元素直接参与 title-content 的布局 */
  }
}
</style>
