<template>
  <div class="analytics-container">
    <div v-if="processedShareUrl" class="iframe-wrapper">
      <div class="toolbar">
        <a :href="processedShareUrl" target="_blank" rel="noopener noreferrer" class="open-link">
          在新标签打开 Umami 看板
        </a>
      </div>
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
          <p class="help-text">请优先检查 <code>src/config/analytics.js</code> 是否已填写自建 Umami 配置；如果你仍想走环境变量，也可以补 <code>VITE_UMAMI_SHARE_URL</code> 后重启前端服务。</p>
          <ol class="help-steps">
            <li>登录你的自建 Umami 域名后台，进入当前站点的详情页</li>
            <li>开启当前站点的 <strong>共享链接 (Share URL)</strong></li>
            <li>复制完整共享链接到 <code>src/config/analytics.js</code> 的 <code>umamiShareUrl</code></li>
            <li>如果脚本地址和 Website ID 也未配置，请同时补齐 <code>umamiScriptUrl</code> 与 <code>umamiWebsiteId</code></li>
          </ol>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import analyticsConfig from '@/config/analytics';

const shareUrl = ref(analyticsConfig.umamiShareUrl || import.meta.env.VITE_UMAMI_SHARE_URL || '');

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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--el-bg-color);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  background-color: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.open-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.open-link:hover {
  text-decoration: underline;
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
