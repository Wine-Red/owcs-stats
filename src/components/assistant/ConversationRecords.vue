<template>
  <section class="records" aria-labelledby="conversation-records-title">
    <div class="toolbar"><h2 id="conversation-records-title">对话记录</h2><button :disabled="busy" @click="load(0)">刷新记录</button><button :disabled="busy || !data.items.length" @click="exportPage">导出本页 JSON</button></div>
    <p>用于检查回答与调整助手。保留 {{ data.retentionDays }} 天，最多 {{ data.maxRecords }} 条。每条包含当次问题、回答与随请求提交的历史上下文。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">处理中…</p>
    <p v-else-if="!data.items.length && !error">暂无记录，启用后收到的新对话会显示在这里。</p>
    <ul><li v-for="item in data.items" :key="item.id"><button class="record" :disabled="busy" @click="show(item.id)"><span>{{ item.text }}</span><small>{{ new Date(item.recordedAt).toLocaleString() }} · {{ statusLabel(item.status) }} · {{ item.model }} · {{ item.metrics?.total_ms == null ? '-' : (item.metrics.total_ms / 1000).toFixed(1) + ' 秒' }}</small></button></li></ul>
    <div class="toolbar"><button :disabled="busy || !data.offset" @click="load(Math.max(0, data.offset - data.limit))">上一页</button><span>共 {{ data.total }} 条</span><button :disabled="busy || data.offset + data.limit >= data.total" @click="load(data.offset + data.limit)">下一页</button></div>
    <article v-if="detail" class="detail">
      <div class="toolbar"><h3>问答详情</h3><button @click="detail = null">收起详情</button><button :disabled="busy" @click="remove">删除这条记录</button></div>
      <p>来源：{{ detail.origin || '未提供' }} · 会话：{{ detail.conversationId || '旧版客户端未提供' }}</p>
      <p>输入 Token：{{ detail.metrics?.input_tokens ?? '-' }} · 输出 Token：{{ detail.metrics?.output_tokens ?? '-' }} · 工具调用：{{ detail.metrics?.tool_calls ?? '-' }}</p>
      <details><summary>页面上下文与历史消息</summary><pre>{{ JSON.stringify({ page: detail.page, history: detail.history }, null, 2) }}</pre></details>
      <h4>用户问题</h4><pre>{{ detail.text }}</pre><h4>助手回答 · {{ statusLabel(detail.status) }}</h4><pre>{{ detail.answer || '未产生正文' }}</pre><p v-if="detail.errorCode">错误：{{ detail.errorCode }}</p>
    </article>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
const props = defineProps({ request: { type: Function, required: true } });
const data = ref({ items: [], total: 0, offset: 0, limit: 25, retentionDays: 90, maxRecords: 2000 });
const detail = ref(null), error = ref(''), busy = ref(false);
const statusLabel = value => ({ completed: '已完成', failed: '失败', stopped: '已停止' }[value] || value);
async function act(fn) { busy.value = true; error.value = ''; try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
const load = offset => act(async () => { data.value = await props.request(`conversations?offset=${offset}`); });
const show = id => act(async () => { detail.value = await props.request(`conversations/${id}`); });
async function exportPage() {
  await act(async () => {
    const records = [];
    for (const item of data.value.items) records.push(await props.request(`conversations/${item.id}`));
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `assistant-records-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
async function remove() {
  if (!window.confirm('删除这条问答记录？其他记录中携带的历史上下文仍会保留。')) return;
  await act(async () => { await props.request(`conversations/${detail.value.id}`, { method: 'DELETE', body: {} }); detail.value = null; data.value = await props.request(`conversations?offset=${data.value.offset}`); });
}
onMounted(() => load(0));
</script>
<style scoped>
.records { margin-top: 20px; padding: 24px; border: 1px solid var(--admin-border); border-radius: 12px; background: var(--admin-surface); }
.toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
h2 { font-size: 16px; margin-right: auto; } p, small { font-size: 12px; color: var(--admin-text-muted); line-height: 1.7; overflow-wrap: anywhere; }
button { padding: 8px 12px; border: 1px solid var(--admin-border); border-radius: 6px; background: var(--admin-surface); color: var(--admin-text); cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
ul { padding: 0; list-style: none; } .record { display: grid; gap: 6px; width: 100%; text-align: left; margin-bottom: 8px; overflow-wrap: anywhere; }
.detail { border-top: 1px solid var(--admin-border); margin-top: 20px; padding-top: 16px; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.7; max-height: 450px; overflow: auto; } h4 { margin: 14px 0 4px; }
@media(max-width: 700px) { .records { padding: 16px; } }
</style>
