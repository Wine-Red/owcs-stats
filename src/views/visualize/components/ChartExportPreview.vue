<template>
  <el-dialog
    v-model="dialogVisible"
    :show-close="true"
    width="90%"
    top="5vh"
    append-to-body
    class="chart-export-dialog"
  >
    <div class="export-preview-container">
      <img :src="imageUrl" alt="Chart Preview" class="preview-image" />
      <p class="export-tip">长按图片保存到本地</p>
    </div>
  </el-dialog>
</template>

<script>
import { computed } from 'vue';

export default {
  name: 'ChartExportPreview',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    imageUrl: {
      type: String,
      default: ''
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const dialogVisible = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    });

    return {
      dialogVisible
    };
  }
};
</script>

<style scoped>
.export-preview-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px;
}
.preview-image {
  max-width: 100%;
  max-height: 70vh;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  border: 1px solid var(--vis-border, #ebeef5);
  background-color: #fff;
  background-image: 
    linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee),
    linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee);
  background-size: 20px 20px;
  background-position: 0 0, 10px 10px;
}
.export-tip {
  margin-top: 16px;
  color: var(--vis-text-tertiary, #909399);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* 弹窗本体：白底 + 细边框 + 轻阴影（DESIGN.md 卡片规范） */
:deep(.el-dialog) {
  border-radius: 16px;
  border: 1px solid var(--vis-border, #ebeef5);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* 隐藏弹窗的 header 区域（如果不想要标题栏但想要右上角的关闭按钮，可以只隐藏标题文字） */
:deep(.el-dialog__header) {
  padding: 0;
  margin: 0;
}
:deep(.el-dialog__headerbtn) {
  top: 15px;
  right: 15px;
  z-index: 10;
}

/* 关闭按钮 hover 使用品牌橙，避免 Element Plus 默认蓝色 */
:deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: var(--vis-accent, #ff6a00);
}

@media (max-width: 768px) {
  .export-preview-container {
    padding: 8px;
  }
  .preview-image {
    max-height: 64vh;
  }
  .export-tip {
    margin-top: 12px;
    font-size: 11px;
  }
}
</style>
