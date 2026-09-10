<template>
  <div v-if="status.error || status.updateAvailable || status.scheduleStale" class="site-data-status" role="status" aria-live="polite">
    <span>{{ status.error ? status.error.includes('不兼容') ? status.error : '数据连接失败，当前内容可能未更新' : status.updateAvailable ? '赛事数据已更新' : '赛程来源暂不可用，当前显示上次数据' }}</span>
    <button v-if="status.error || status.updateAvailable" type="button" @click="$emit('refresh')">{{ status.error ? '重试' : '刷新数据' }}</button>
  </div>
</template>
<script setup>
/* global defineEmits */
import { siteStatus as status } from '@/services/siteRuntime';
defineEmits(['refresh']);
</script>
<style scoped>
.site-data-status { position: fixed; z-index: 3000; bottom: max(16px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; width: max-content; max-width: calc(100vw - 24px); padding: 12px 16px; border: 1px solid var(--vis-border-color); border-left: 3px solid var(--vis-primary-color); border-radius: 8px; background: var(--vis-card-bg); color: var(--vis-text-primary); box-shadow: var(--vis-shadow); font: 13px var(--vis-font-body); }
.site-data-status button { flex-shrink: 0; min-height: 36px; padding: 6px 12px; border: 1px solid var(--vis-border-color); border-radius: 6px; background: var(--vis-bg-color); color: var(--vis-text-primary); font: inherit; cursor: pointer; }
.site-data-status button:focus-visible { outline: 2px solid var(--vis-primary-color); outline-offset: 2px; }
</style>
