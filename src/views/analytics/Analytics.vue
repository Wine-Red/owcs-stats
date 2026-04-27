<template>
  <div class="analytics-container">
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
</script>

<style scoped>
.analytics-container {
  flex: 1; /* Fill the whole right side in flex container */
  display: flex;
  flex-direction: column;
  padding: 0;
  box-sizing: border-box;
}

.iframe-wrapper {
  flex: 1;
  overflow: hidden;
  background-color: var(--el-bg-color);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color-overlay);
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
