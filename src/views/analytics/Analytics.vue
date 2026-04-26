<template>
  <div class="analytics-container">
    <div class="header">
      <h2>访问统计</h2>
      <el-button type="primary" size="small" @click="openExternal">
        在 Umami 中打开 <el-icon class="el-icon--right"><Link /></el-icon>
      </el-button>
    </div>
    
    <div v-if="processedShareUrl" class="iframe-wrapper">
      <iframe 
        :src="processedShareUrl" 
        frameborder="0" 
        width="100%" 
        height="100%" 
        allowfullscreen>
      </iframe>
    </div>
    <div v-else class="empty-state">
      <el-empty description="未配置 Umami 共享链接">
        <template #extra>
          <p class="help-text">请在项目根目录的 <code>.env</code> 文件中配置 <code>VITE_UMAMI_SHARE_URL</code> 变量，并重启前端服务。</p>
          <ol class="help-steps">
            <li>登录 Umami 后台，进入 <strong>设置 (Settings)</strong> -> <strong>网站 (Websites)</strong></li>
            <li>点击当前统计网站对应的 <strong>编辑 (Edit)</strong></li>
            <li>切换到 <strong>共享链接 (Share URL)</strong> 面板并开启</li>
            <li>将生成的链接复制到 <code>.env</code> 文件中的 <code>VITE_UMAMI_SHARE_URL</code></li>
          </ol>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Link } from '@element-plus/icons-vue';

const shareUrl = ref(import.meta.env.VITE_UMAMI_SHARE_URL || '');

// 自动给 Umami 链接追加暗色主题参数，匹配系统当前的暗色调
const processedShareUrl = computed(() => {
  if (!shareUrl.value) return '';
  try {
    const url = new URL(shareUrl.value);
    url.searchParams.set('theme', 'dark');
    return url.toString();
  } catch (e) {
    return shareUrl.value; // 如果不是合法的 URL（可能只是占位符），原样返回
  }
});

const openExternal = () => {
  if (shareUrl.value) {
    window.open(shareUrl.value, '_blank');
  } else {
    window.open('https://cloud.umami.is/', '_blank');
  }
};
</script>

<style scoped>
.analytics-container {
  height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 20px;
}

.iframe-wrapper {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-darker);
  background-color: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color-overlay);
  border-radius: 8px;
  border: 1px dashed var(--el-border-color-darker);
}

.help-text {
  color: var(--el-text-color-regular);
  margin-bottom: 16px;
  font-size: 14px;
}

.help-steps {
  text-align: left;
  color: var(--el-text-color-secondary);
  line-height: 1.8;
  margin: 0 auto;
  display: inline-block;
  font-size: 14px;
  background-color: var(--el-fill-color-light);
  padding: 16px 20px 16px 36px;
  border-radius: 6px;
}

.help-steps strong {
  color: var(--el-text-color-primary);
}
</style>
