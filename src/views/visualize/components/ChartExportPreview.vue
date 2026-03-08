<template>
  <el-dialog
    v-model="dialogVisible"
    title="图表导出预览"
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
</style>
