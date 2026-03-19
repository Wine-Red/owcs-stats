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
  padding: 10px;
}
.preview-image {
  max-width: 100%;
  max-height: 70vh;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  border: 1px solid #eee;
}
.export-tip {
  margin-top: 16px;
  color: #909399;
  font-size: 14px;
  font-weight: 500;
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
</style>
