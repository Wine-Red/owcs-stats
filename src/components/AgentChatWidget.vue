<template>
  <Teleport to="body">
    <button
      v-if="!isOpen"
      class="agent-orb"
      type="button"
      aria-label="打开赛事数据助手"
      @click="openChat"
    >
      <span class="agent-orb-mark" aria-hidden="true">
        <i></i><i></i><i></i>
      </span>
      <span class="agent-orb-label">数据助手</span>
    </button>

    <Transition name="agent-panel">
      <section
        v-if="isOpen"
        ref="panelRef"
        class="agent-panel"
        role="dialog"
        aria-label="赛事数据助手"
      >
        <header class="agent-header">
          <div class="agent-heading">
            <span class="agent-heading-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <div>
              <h2>赛事数据助手</h2>
              <p><span :class="['agent-status-dot', { offline: !configured }]" aria-hidden="true"></span>{{ statusText }}</p>
            </div>
          </div>
          <div class="agent-header-actions">
            <button type="button" aria-label="清空对话" title="清空对话" @click="clearMessages">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
            </button>
            <button ref="closeButtonRef" type="button" aria-label="关闭助手" title="关闭" @click="closeChat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </header>

        <div ref="messageListRef" class="agent-messages" aria-live="polite">
          <article
            v-for="message in messages"
            :key="message.id"
            :class="['agent-message', message.role]"
          >
            <div class="agent-message-role">{{ message.role === 'user' ? '你' : '助手' }}</div>
            <div class="agent-bubble">
              <div class="agent-message-text">{{ message.content }}</div>
              <div v-if="message.meta" class="agent-message-meta">
                <span v-if="message.meta.scope">{{ message.meta.scope }}</span>
                <span v-if="message.meta.cost">{{ message.meta.cost }}</span>
                <span v-if="message.meta.cached">已复用</span>
              </div>
            </div>
            <div v-if="message.followUps?.length" class="agent-follow-ups">
              <button
                v-for="question in message.followUps"
                :key="question"
                type="button"
                @click="askSuggestion(question)"
              >{{ question }}</button>
            </div>
          </article>

          <article v-if="sending" class="agent-message assistant" aria-label="正在分析">
            <div class="agent-message-role">助手</div>
            <div class="agent-bubble agent-thinking">
              <span></span><span></span><span></span>
              <em>正在核对赛事数据</em>
            </div>
          </article>

          <div v-if="showSuggestions" class="agent-starters">
            <p>可以从这些问题开始</p>
            <button v-for="question in starters" :key="question" type="button" @click="askSuggestion(question)">
              <span>{{ question }}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <footer class="agent-composer">
          <div v-if="errorMessage" class="agent-error" role="alert">
            <span>{{ errorMessage }}</span>
            <button v-if="lastFailedQuestion" type="button" @click="retryLast">重试</button>
          </div>
          <form @submit.prevent="sendMessage">
            <label class="sr-only" for="agent-question">输入赛事数据问题</label>
            <textarea
              id="agent-question"
              ref="inputRef"
              v-model="draft"
              rows="1"
              maxlength="1200"
              :disabled="sending || !configured"
              :placeholder="configured ? '询问选手、战队、地图或英雄数据…' : '请先在服务端配置模型 API Key'"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
            <button class="agent-send" type="submit" :disabled="!canSend" aria-label="发送问题">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1Z" /><path d="m12 13 7-8" /></svg>
            </button>
          </form>
          <p class="agent-disclaimer">回答仅依据当前数据库，缺失范围会在答案中说明</p>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import apiService from '@/services/api';

let messageId = 0;
const newMessage = (role, content, extra = {}) => ({ id: ++messageId, role, content, ...extra });

export default {
  name: 'AgentChatWidget',
  setup() {
    const route = useRoute();
    const isOpen = ref(false);
    const configured = ref(true);
    const modelName = ref('Qwen/Qwen3.5-4B');
    const sending = ref(false);
    const draft = ref('');
    const errorMessage = ref('');
    const lastFailedQuestion = ref('');
    const panelRef = ref(null);
    const closeButtonRef = ref(null);
    const inputRef = ref(null);
    const messageListRef = ref(null);
    const messages = ref([
      newMessage('assistant', '你好，我可以根据当前赛事数据库回答选手、战队、地图和英雄数据问题。涉及缺失数据时，我会明确说明覆盖范围。')
    ]);
    const starters = [
      '最新赛季的战队比赛胜率排行',
      '国服第二阶段输出位每10分钟伤害前十是谁？',
      '国服第二阶段英雄使用率最高的是谁？'
    ];

    const statusText = computed(() => configured.value ? `${modelName.value} · 数据库已连接` : '尚未配置模型');
    const canSend = computed(() => configured.value && !sending.value && draft.value.trim().length > 0);
    const showSuggestions = computed(() => messages.value.length === 1 && !sending.value);

    const scrollToBottom = async () => {
      await nextTick();
      if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    };

    const openChat = async () => {
      isOpen.value = true;
      await nextTick();
      inputRef.value?.focus();
    };
    const closeChat = async () => {
      isOpen.value = false;
      await nextTick();
      document.querySelector('.agent-orb')?.focus();
    };
    const clearMessages = () => {
      messages.value = [newMessage('assistant', '对话已清空。告诉我想查询的赛季、阶段或对象即可。')];
      errorMessage.value = '';
      lastFailedQuestion.value = '';
      nextTick(() => inputRef.value?.focus());
    };

    const buildContext = () => ({
      route: route.fullPath,
      seasonId: route.query.seasonId || route.params.seasonId || 0,
      stageId: route.query.stageId || route.params.stageId || 0
    });

    const scopeLabel = scope => {
      if (!scope?.seasonName) return '';
      return [scope.seasonName, scope.stageName].filter(Boolean).join(' · ');
    };

    const submitQuestion = async question => {
      const clean = String(question || '').trim();
      if (!clean || sending.value) return;
      messages.value.push(newMessage('user', clean));
      draft.value = '';
      errorMessage.value = '';
      lastFailedQuestion.value = '';
      sending.value = true;
      await scrollToBottom();
      try {
        const history = messages.value
          .filter(message => message.role === 'user' || message.role === 'assistant')
          .slice(-8)
          .map(message => ({ role: message.role, content: message.content }));
        const response = await apiService.askAgent({ messages: history, context: buildContext() });
        const cost = Number(response?.usage?.estimatedCostCny || 0);
        messages.value.push(newMessage('assistant', response.answer, {
          followUps: response.followUps || [],
          meta: {
            scope: scopeLabel(response.scope),
            cost: cost > 0 ? `约 ¥${cost.toFixed(4)}` : '',
            cached: Boolean(response.cached)
          }
        }));
      } catch (error) {
        const responseError = error?.response?.data;
        const traceId = String(responseError?.traceId || '').slice(0, 8);
        const message = responseError?.error || '本次回答失败，请检查模型配置或稍后重试。';
        errorMessage.value = traceId ? `${message}（编号 ${traceId}）` : message;
        lastFailedQuestion.value = clean;
      } finally {
        sending.value = false;
        await scrollToBottom();
        inputRef.value?.focus();
      }
    };

    const sendMessage = () => submitQuestion(draft.value);
    const askSuggestion = question => submitQuestion(question);
    const retryLast = () => {
      const question = lastFailedQuestion.value;
      const last = messages.value[messages.value.length - 1];
      if (last?.role === 'user' && last.content === question) messages.value.pop();
      submitQuestion(question);
    };

    const handleEscape = event => {
      if (event.key === 'Escape' && isOpen.value) closeChat();
    };

    onMounted(async () => {
      window.addEventListener('keydown', handleEscape);
      try {
        const status = await apiService.getAgentStatus();
        configured.value = Boolean(status.configured);
        modelName.value = status.model || modelName.value;
      } catch {
        configured.value = false;
      }
    });
    onBeforeUnmount(() => window.removeEventListener('keydown', handleEscape));

    return {
      isOpen, configured, sending, draft, messages, starters, errorMessage, lastFailedQuestion,
      panelRef, closeButtonRef, inputRef, messageListRef, statusText, canSend, showSuggestions,
      openChat, closeChat, clearMessages, sendMessage, askSuggestion, retryLast
    };
  }
};
</script>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.agent-orb { position: fixed; right: 24px; bottom: 24px; z-index: 900; min-width: 56px; height: 56px; padding: 0 17px 0 13px; border: 1px solid rgba(255,255,255,.12); border-radius: 18px; background: #111; color: #fff; box-shadow: 0 14px 32px rgba(0,0,0,.24); display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background-color .18s ease, box-shadow .18s ease; }
.agent-orb:hover { background: #1d1d1d; box-shadow: 0 16px 36px rgba(0,0,0,.3); }
.agent-orb:focus-visible, .agent-panel button:focus-visible, .agent-panel textarea:focus-visible { outline: 3px solid rgba(255,106,0,.34); outline-offset: 2px; }
.agent-orb-mark, .agent-heading-mark { display: flex; align-items: flex-end; gap: 3px; }
.agent-orb-mark i, .agent-heading-mark i { display: block; width: 4px; border-radius: 1px; background: #ff6a00; transform: skewX(-8deg); }
.agent-orb-mark i:nth-child(1), .agent-heading-mark i:nth-child(1) { height: 10px; opacity: .62; }
.agent-orb-mark i:nth-child(2), .agent-heading-mark i:nth-child(2) { height: 17px; }
.agent-orb-mark i:nth-child(3), .agent-heading-mark i:nth-child(3) { height: 13px; opacity: .8; }
.agent-orb-label { font: 700 14px/1 'Inter', sans-serif; white-space: nowrap; }
.agent-panel { position: fixed; right: 24px; bottom: 24px; z-index: 900; width: min(420px, calc(100vw - 32px)); height: min(660px, calc(100vh - 48px)); overflow: hidden; border: 1px solid #dfe3e8; border-radius: 18px; background: #fff; color: #171717; box-shadow: 0 24px 64px rgba(0,0,0,.25); display: grid; grid-template-rows: auto 1fr auto; font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.agent-panel::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: #ff6a00; z-index: 1; }
.agent-header { min-height: 68px; padding: 14px 14px 12px 16px; border-bottom: 1px solid #eceff2; display: flex; align-items: center; justify-content: space-between; background: #fff; }
.agent-heading { display: flex; align-items: center; gap: 11px; min-width: 0; }
.agent-heading-mark { width: 30px; height: 30px; flex: 0 0 30px; align-items: center; justify-content: center; border-radius: 9px; background: #111; }
.agent-heading h2 { margin: 0; color: #111; font-size: 15px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; }
.agent-heading p { margin: 4px 0 0; color: #6f7782; font-size: 11px; line-height: 1.2; display: flex; align-items: center; gap: 5px; }
.agent-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #24a148; box-shadow: 0 0 0 3px rgba(36,161,72,.1); }
.agent-status-dot.offline { background: #d33; box-shadow: 0 0 0 3px rgba(221,51,51,.1); }
.agent-header-actions { display: flex; gap: 4px; }
.agent-header-actions button { width: 40px; height: 40px; border: 0; border-radius: 10px; background: transparent; color: #717780; display: grid; place-items: center; cursor: pointer; transition: background-color .18s ease, color .18s ease; }
.agent-header-actions button:hover { background: #f2f3f5; color: #111; }
.agent-header-actions svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.agent-messages { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 16px 20px; background: #f7f8fa; scrollbar-width: thin; scrollbar-color: #c8ccd1 transparent; }
.agent-message { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 18px; }
.agent-message.user { align-items: flex-end; }
.agent-message-role { margin: 0 4px 6px; color: #858c95; font-size: 11px; font-weight: 700; }
.agent-bubble { max-width: 88%; padding: 11px 13px; border: 1px solid #e1e4e8; border-radius: 5px 14px 14px 14px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.03); }
.agent-message.user .agent-bubble { border-color: #111; border-radius: 14px 5px 14px 14px; background: #111; color: #fff; }
.agent-message-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.7; }
.agent-message-meta { margin-top: 9px; padding-top: 8px; border-top: 1px solid #eceff2; display: flex; flex-wrap: wrap; gap: 5px 9px; color: #858c95; font-size: 10px; }
.agent-follow-ups { width: 88%; margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.agent-follow-ups button { padding: 7px 10px; border: 1px solid #d8dce1; border-radius: 9px; background: #fff; color: #444b54; font: 600 11px/1.35 inherit; text-align: left; cursor: pointer; transition: border-color .18s ease, color .18s ease; }
.agent-follow-ups button:hover { border-color: #ff6a00; color: #b94d00; }
.agent-thinking { display: flex; align-items: center; gap: 4px; color: #6f7782; }
.agent-thinking span { width: 5px; height: 5px; border-radius: 50%; background: #ff6a00; animation: agent-pulse 1s ease-in-out infinite; }
.agent-thinking span:nth-child(2) { animation-delay: .12s; }.agent-thinking span:nth-child(3) { animation-delay: .24s; }
.agent-thinking em { margin-left: 5px; font-size: 11px; font-style: normal; }
.agent-starters { margin: 2px 0 4px; }
.agent-starters p { margin: 0 0 8px; color: #7b828b; font-size: 11px; font-weight: 700; }
.agent-starters button { width: 100%; min-height: 44px; margin-top: 7px; padding: 10px 11px; border: 1px solid #dfe3e8; border-radius: 10px; background: #fff; color: #30343a; display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 600 12px/1.4 inherit; text-align: left; cursor: pointer; transition: border-color .18s ease, background-color .18s ease; }
.agent-starters button:hover { border-color: #ff6a00; background: #fffaf6; }
.agent-starters svg { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: #ff6a00; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.agent-composer { padding: 11px 12px 10px; border-top: 1px solid #e7eaee; background: #fff; }
.agent-composer form { min-height: 48px; padding: 5px 5px 5px 12px; border: 1px solid #cfd4da; border-radius: 13px; display: flex; align-items: flex-end; gap: 8px; transition: border-color .18s ease, box-shadow .18s ease; }
.agent-composer form:focus-within { border-color: #ff6a00; box-shadow: 0 0 0 3px rgba(255,106,0,.09); }
.agent-composer textarea { min-width: 0; width: 100%; max-height: 104px; padding: 8px 0; resize: none; border: 0; outline: 0; background: transparent; color: #171717; font: 13px/1.5 inherit; }
.agent-composer textarea::placeholder { color: #9aa0a8; }
.agent-send { width: 38px; height: 38px; flex: 0 0 38px; border: 0; border-radius: 10px; background: #ff6a00; color: #fff; display: grid; place-items: center; cursor: pointer; transition: background-color .18s ease, opacity .18s ease; }
.agent-send:hover:not(:disabled) { background: #e85f00; }.agent-send:disabled { opacity: .34; cursor: not-allowed; }
.agent-send svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.agent-disclaimer { margin: 7px 2px 0; color: #969ca4; font-size: 10px; line-height: 1.3; text-align: center; }
.agent-error { margin-bottom: 8px; padding: 8px 10px; border-left: 3px solid #d33; border-radius: 6px; background: #fff1f0; color: #94241f; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; line-height: 1.4; }
.agent-error button { min-height: 32px; padding: 0 9px; border: 1px solid #d33; border-radius: 7px; background: #fff; color: #a52620; font-weight: 700; cursor: pointer; }
.agent-panel-enter-active, .agent-panel-leave-active { transition: opacity .2s ease, transform .2s cubic-bezier(.2,.8,.2,1); transform-origin: bottom right; }
.agent-panel-enter-from, .agent-panel-leave-to { opacity: 0; transform: translateY(10px) scale(.97); }
@keyframes agent-pulse { 0%, 100% { opacity: .28; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
@media (max-width: 600px) {
  .agent-orb { right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); min-width: 54px; height: 54px; border-radius: 17px; }
  .agent-orb-label { display: none; }
  .agent-panel { inset: 0; width: 100vw; height: 100dvh; max-height: none; border: 0; border-radius: 0; }
  .agent-header { padding-top: calc(14px + env(safe-area-inset-top)); }
  .agent-messages { padding-inline: 12px; }
  .agent-composer { padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
  .agent-bubble, .agent-follow-ups { max-width: 92%; width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-panel-enter-active, .agent-panel-leave-active, .agent-orb, .agent-panel button { transition: none; }
  .agent-thinking span { animation: none; opacity: .75; }
}
</style>
