<template>
  <div class="media-upload-field" :class="`media-upload-field--${variant}`">
    <div class="media-preview" :class="{ 'is-empty': !previewUrl }">
      <img v-if="previewUrl" :src="previewUrl" :alt="`${entityName} 图片预览`" />
      <div v-else class="media-empty-copy">
        <el-icon><Picture /></el-icon>
        <span>尚未配置图片</span>
      </div>
      <el-tag class="media-state" size="small" :type="sourceState.type" effect="dark">
        {{ pendingFile ? '待上传' : sourceState.label }}
      </el-tag>
    </div>

    <div class="media-upload-actions">
      <el-upload
        action="#"
        accept="image/png,image/jpeg,image/webp,image/avif"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileChange"
      >
        <el-button type="primary" plain>
          <el-icon><Upload /></el-icon>
          {{ previewUrl ? '选择替换图片' : '选择图片' }}
        </el-button>
      </el-upload>
      <el-button v-if="previewUrl" text type="danger" @click="clearSelection">
        移除图片
      </el-button>
      <p>PNG、JPEG、WebP 或 AVIF，最大 8 MB；保存时统一转换为 WebP。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Picture, Upload } from '@element-plus/icons-vue';
import { mediaSourceState, resolveMediaUrl } from '@/utils/media';

const props = defineProps({
  modelValue: { type: String, default: '' },
  entityName: { type: String, default: '当前条目' },
  variant: { type: String, default: 'logo' }
});

const emit = defineEmits(['file-change', 'clear']);
const pendingFile = ref(null);
const objectUrl = ref('');

const releaseObjectUrl = () => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  objectUrl.value = '';
};

const previewUrl = computed(() => objectUrl.value || resolveMediaUrl(props.modelValue));
const sourceState = computed(() => mediaSourceState(props.modelValue));

const handleFileChange = uploadFile => {
  const file = uploadFile?.raw;
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.error('图片不能超过 8 MB');
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
    ElMessage.error('仅支持 PNG、JPEG、WebP 或 AVIF 图片');
    return;
  }
  releaseObjectUrl();
  pendingFile.value = file;
  objectUrl.value = URL.createObjectURL(file);
  emit('file-change', file);
};

const clearSelection = () => {
  releaseObjectUrl();
  pendingFile.value = null;
  emit('file-change', null);
  emit('clear');
};

watch(() => props.modelValue, () => {
  if (!pendingFile.value) releaseObjectUrl();
});

onBeforeUnmount(releaseObjectUrl);
</script>

<style scoped>
.media-upload-field {
  display: grid;
  grid-template-columns: 156px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  width: 100%;
  padding: 14px;
  border: 1px solid #353535;
  background: #171717;
}

.media-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 156px;
  height: 120px;
  overflow: hidden;
  border: 1px solid #404040;
  background:
    linear-gradient(45deg, #202020 25%, transparent 25%),
    linear-gradient(-45deg, #202020 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #202020 75%),
    linear-gradient(-45deg, transparent 75%, #202020 75%), #151515;
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.media-upload-field--logo .media-preview {
  height: 156px;
}

.media-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.media-upload-field--banner .media-preview img {
  object-fit: cover;
}

.media-empty-copy {
  display: grid;
  justify-items: center;
  gap: 8px;
  color: #777;
  font-size: 12px;
}

.media-empty-copy .el-icon {
  font-size: 28px;
}

.media-state {
  position: absolute;
  top: 8px;
  right: 8px;
}

.media-upload-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.media-upload-actions p {
  flex-basis: 100%;
  margin: 4px 0 0;
  color: #8e8e8e;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .media-upload-field {
    grid-template-columns: 1fr;
  }

  .media-preview {
    width: 100%;
  }
}
</style>
