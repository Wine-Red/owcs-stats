<template>
  <Teleport to="body">
    <AssistantLauncher v-show="!open" ref="launcher" @open="show" />
    <div v-if="open" class="assistant-mobile-shade" @click="close"></div>
    <section v-if="open" ref="panel" class="owcs-assistant" role="dialog" aria-label="赛事助手" @keydown.esc="close" @keydown="trapFocus">
      <header class="assistant-header"><div><span class="assistant-eyebrow">OWCS STATS</span><h2>赛事助手 <span class="assistant-live-dot"></span></h2></div>
        <div class="assistant-actions"><button type="button" @click="clear" :disabled="busy || !messages.length" title="清空对话" aria-label="清空对话">↺</button><button type="button" @click="close" aria-label="关闭助手">×</button></div>
      </header>
      <div class="assistant-context"><button type="button" :class="{ detached: !withPage }" @click="withPage = !withPage" :aria-pressed="withPage" :title="withPage ? '点击取消当前页面范围' : '点击结合当前页面'">
        <span>{{ withPage ? '正在看' : '自由问答' }}</span><strong>{{ withPage ? currentPage.label : '不限定当前页面' }}</strong><b aria-hidden="true">{{ withPage ? '×' : '+' }}</b>
      </button><small v-if="withPage && currentPage.loading">页面数据加载中</small></div>
      <div ref="scrollArea" class="assistant-messages" role="log" aria-label="对话内容">
        <div v-if="!messages.length" class="assistant-welcome"><span class="welcome-symbol" aria-hidden="true">✦</span><h3>这场比赛，想了解什么？</h3><p>可以从眼前的数据聊起，也可以问其他赛事。</p>
          <div class="assistant-starters"><button v-for="question in starters" :key="question" type="button" @click="send(question)">{{ question }} <span aria-hidden="true">↗</span></button></div>
        </div>
        <article v-for="message in messages" :key="message.id" :class="['assistant-message', message.role]">
          <span class="assistant-speaker">{{ message.role === 'user' ? '你' : '赛事助手' }}</span>
          <div v-if="message.role === 'user'" class="assistant-user-text">{{ message.content }}</div>
          <div v-else-if="message.content.trim()" class="assistant-prose" v-html="renderAssistantMarkdown(message.content)"></div>
          <div v-if="message.pending" class="assistant-progress" role="status"><i></i>{{ message.content.trim() ? '正在回答…' : '正在思考…' }}</div>
          <p v-for="notice in message.notices" :key="notice" class="assistant-notice">{{ notice }}</p>
        </article>
      </div>
      <form class="assistant-composer" @submit.prevent="send()"><label class="assistant-sr-only" for="assistant-input">输入问题</label><textarea id="assistant-input" ref="input" v-model="draft" rows="2" maxlength="6000" placeholder="问比赛、比较选手，或让我解释这张图…" @keydown.enter="onEnter"></textarea><div class="assistant-composer-bottom"><span>临时对话 · 刷新后清空</span><button v-if="busy" class="assistant-send stop" type="button" @click="stop">停止</button><button v-else class="assistant-send" type="submit" :disabled="!draft.trim()">发送 <span aria-hidden="true">↑</span></button></div></form>
      <div v-if="serviceUnavailable" class="assistant-service-note">助手暂时不可用，请稍后重试。<template v-if="assistantManagementEnabled">管理员可打开<router-link to="/data-manage/assistant" target="_blank" rel="noopener">模型设置</router-link>。</template></div>
    </section>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref } from 'vue';
import AssistantLauncher from './AssistantLauncher.vue';
import { useCurrentAssistantPage, assistantManagementEnabled } from '@/services/assistantContext';
import { renderAssistantMarkdown, streamAssistant } from '@/services/assistantChat.mjs';
const currentPage = useCurrentAssistantPage();
const open = ref(false), withPage = ref(true), messages = ref([]), draft = ref(''), busy = ref(false);
const panel = ref(), launcher = ref(), input = ref(), scrollArea = ref(), serviceUnavailable = ref(false);
let controller;
const starters = computed(() => currentPage.value.kind === 'match'
  ? ['这场比赛有哪些值得关注的表现？', '比较一下当前选中的选手', '这些数据能说明哪些问题？']
  : currentPage.value.kind === 'player' ? ['这名选手有什么表现特点？', '解释一下这里的每十分钟指标', '他最近参加了哪些比赛？']
    : ['介绍一下当前赛事', '这页的数据应该怎么看？', '有哪些值得比较的选手？']);
async function show() { open.value = true; await nextTick(); input.value?.focus(); }
async function close() { open.value = false; await nextTick(); launcher.value?.focus(); }
function clear() { messages.value = []; draft.value = ''; serviceUnavailable.value = false; }
function stop() { controller?.abort(); }
function onEnter(e) { if (!e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy.value) send(); } }
function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const nodes = [...panel.value.querySelectorAll('button:not(:disabled),textarea,a,summary')].filter(x => x.getClientRects().length);
  const first = nodes[0], last = nodes.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
}
async function scroll(force = false) {
  const area = scrollArea.value, nearBottom = area && area.scrollHeight - area.scrollTop - area.clientHeight < 160;
  await nextTick(); if (area && (force || nearBottom)) area.scrollTop = area.scrollHeight;
}
async function send(value = draft.value) {
  const text = value.trim(); if (!text || busy.value) return;
  const page = withPage.value ? JSON.parse(JSON.stringify(currentPage.value)) : { kind: 'general', label: '自由问答' };
  const history = messages.value.filter(m => !m.failed && m.content).slice(-14).map(m => ({ role: m.role, content: m.content.slice(0, 20000), ...(m.page ? { page: m.page } : {}) }));
  messages.value.push({ id: crypto.randomUUID(), role: 'user', content: text, page });
  const message = { id: crypto.randomUUID(), role: 'assistant', content: '', notices: [], pending: true };
  messages.value.push(message); const response = messages.value.at(-1);
  draft.value = ''; busy.value = true; serviceUnavailable.value = false; controller = new AbortController();
  scroll(true);
  try {
    await streamAssistant({ text, history, page, signal: controller.signal, onEvent(event) {
      if (event.type === 'text') response.content += event.text;
      if (event.type === 'notice') response.notices.push(event.text);
      if (event.type === 'error') { response.notices.push(event.text); response.failed = true; }
      if (event.type === 'done') response.metrics = event.metrics;
      scroll();
    } });
  } catch (e) {
    response.failed = true;
    response.notices.push(e.name === 'AbortError' ? '已停止，以上回答可能不完整。' : e.message);
    if (e.name !== 'AbortError') serviceUnavailable.value = true;
  } finally { response.pending = false; busy.value = false; controller = null; scroll(); }
}
onUnmounted(() => controller?.abort());
</script>

<style scoped>
.owcs-assistant{--a-ink:#252938;--a-muted:#687488;--a-line:#e1e5ec;--a-accent:#c75113;font-family:Inter,"Microsoft YaHei",sans-serif;color:var(--a-ink)}
.owcs-assistant{position:fixed;right:20px;bottom:20px;z-index:3000;width:420px;height:min(760px,calc(100dvh - 40px));display:flex;flex-direction:column;background:#fff;border:1px solid var(--a-line);border-radius:18px;box-shadow:0 18px 70px #17233529;overflow:hidden}.assistant-header{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 14px;border-bottom:1px solid var(--a-line)}.assistant-eyebrow{font:11px/1.4 Oxanium,Inter,sans-serif;letter-spacing:1.5px;color:var(--a-muted)}.assistant-header h2{font-size:18px;font-weight:700;margin:3px 0 0;display:flex;align-items:center;gap:9px}.assistant-live-dot{width:6px;height:6px;border-radius:50%;background:var(--a-accent)}.assistant-actions{display:flex;gap:6px}.assistant-actions button{border:0;background:#f3f5f8;width:34px;height:34px;border-radius:8px;font-size:23px;color:var(--a-muted);cursor:pointer}.assistant-actions button:disabled{opacity:.35;cursor:default}
.assistant-context{padding:12px 18px 0}.assistant-context button{width:100%;display:flex;align-items:center;gap:9px;border:0;border-left:3px solid #e87525;border-radius:3px;background:#fff4eb;padding:8px 10px;text-align:left;cursor:pointer;font-family:inherit;font-size:12px;line-height:1.5;color:#783d20}.assistant-context strong{flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.assistant-context span{font-size:11px;white-space:nowrap}.assistant-context b{font-size:16px;font-weight:400}.assistant-context .detached{background:#f3f5f8;border-color:#cbd3df;color:var(--a-muted)}.assistant-context small{font-size:11px;color:var(--a-muted)}
.assistant-messages{flex:1;min-height:0;overflow-y:auto;padding:22px 20px;overscroll-behavior:contain}.assistant-welcome{padding-top:20px}.welcome-symbol{font-size:34px;color:#e87525}.assistant-welcome h3{font-size:19px;line-height:1.5;margin:14px 0 8px}.assistant-welcome p{font-size:13px;color:var(--a-muted);line-height:1.7;margin:0}.assistant-starters{margin-top:22px;display:grid;gap:9px}.assistant-starters button{padding:12px;border:1px solid var(--a-line);border-radius:9px;background:#fff;text-align:left;font-family:inherit;font-size:13px;line-height:1.6;color:var(--a-ink);cursor:pointer;display:flex;justify-content:space-between;gap:12px}.assistant-starters button:hover{border-color:#e87525;background:#fffaf5}.assistant-starters span{color:var(--a-accent)}
.assistant-message{margin-bottom:24px}.assistant-speaker{font-size:11px;color:var(--a-muted);display:block;margin-bottom:7px}.assistant-message.user{margin-left:28px}.assistant-message.user .assistant-speaker{text-align:right}.assistant-user-text{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;background:#edf0f5;padding:11px 14px;border-radius:12px 12px 2px 12px;line-height:1.7}.assistant-prose{font-size:14px;line-height:1.85;overflow-wrap:anywhere}.assistant-prose :deep(p){margin:0 0 10px}.assistant-prose :deep(ul),.assistant-prose :deep(ol){padding-left:20px;margin:8px 0}.assistant-prose :deep(h1),.assistant-prose :deep(h2),.assistant-prose :deep(h3){font-size:16px;line-height:1.5;margin:15px 0 8px}.assistant-prose :deep(a){color:#b74812;text-decoration:underline;text-underline-offset:3px}.assistant-prose :deep(table){display:block;max-width:100%;overflow:auto;border-collapse:collapse;font-size:12px;margin:12px 0}.assistant-prose :deep(th),.assistant-prose :deep(td){border:1px solid var(--a-line);padding:6px 9px;white-space:nowrap}.assistant-prose :deep(th){background:#f3f5f8}.assistant-prose :deep(pre){overflow:auto;background:#f3f5f8;padding:10px;border-radius:6px;font-size:12px}.assistant-prose :deep(blockquote){border-left:3px solid #d9e0ea;padding-left:12px;color:var(--a-muted);margin:10px 0}
.assistant-progress{font-size:12px;color:var(--a-muted);display:flex;gap:7px;align-items:center;min-height:24px}.assistant-progress i{width:5px;height:5px;background:#e87525;border-radius:50%;animation:assistant-pulse 1.4s infinite}.assistant-notice{font-size:12px;color:#914019;line-height:1.6;background:#fff4eb;padding:8px 10px;border-radius:6px;margin:8px 0}
.assistant-composer{margin:0 14px 12px;border:1px solid #cbd2dd;border-radius:12px;padding:10px 12px;background:#fff}.assistant-composer:focus-within{border-color:#d67439;box-shadow:0 0 0 2px #d6743912}.assistant-composer textarea{display:block;width:100%;resize:none;border:0;background:transparent;outline:none;font:14px/1.6 Inter,"Microsoft YaHei",sans-serif;color:var(--a-ink);min-height:48px;max-height:120px;padding:0}.assistant-composer textarea::placeholder{color:#929baa;font-size:12px}.assistant-composer-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:5px}.assistant-composer-bottom>span{font-size:10px;color:var(--a-muted)}.assistant-send{background:#25344b;color:#fff;border:0;border-radius:7px;padding:7px 12px;font-size:12px;cursor:pointer}.assistant-send:disabled{opacity:.4;cursor:default}.assistant-send span{margin-left:8px}.assistant-send.stop{background:#eef1f5;color:var(--a-ink)}.assistant-service-note{font-size:11px;padding:0 18px 12px;color:var(--a-muted)}.assistant-service-note a{color:var(--a-accent)}.assistant-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.assistant-mobile-shade{display:none}button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid #e87525;outline-offset:3px}
@keyframes assistant-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.assistant-progress i{animation:none}}@media(max-width:600px){.owcs-assistant{width:100%;right:0;bottom:0;height:88dvh;border-radius:18px 18px 0 0;padding-bottom:env(safe-area-inset-bottom)}.assistant-mobile-shade{display:block;position:fixed;inset:0;background:#17233555;z-index:2999}.assistant-header{padding:14px 18px}.assistant-messages{padding:18px}.assistant-composer textarea{font-size:16px}}
</style>
