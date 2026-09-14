<template>
  <div class="assistant-admin">
    <header class="admin-page-hero vis-clip-notch">
      <div class="admin-page-heading">
        <div class="admin-page-kicker"><span class="admin-slant-marker" aria-hidden="true"></span>ASSISTANT CONTROL</div>
        <h1>赛事助手</h1>
        <p>配置回答所用的模型，测试连接，再到赛事页面试聊。</p>
      </div>
      <div class="admin-page-hero-actions">
        <router-link to="/visualize" class="admin-preview-link">去页面试聊 <el-icon><ArrowRight /></el-icon></router-link>
      </div>
    </header>

    <section class="settings-panel display-control" aria-labelledby="assistant-display-title">
      <div>
        <h2 id="assistant-display-title">在可视化页面显示助手</h2>
        <p class="field-help">切换后自动保存，切回或刷新可视化页面时生效。</p>
      </div>
      <div class="display-action">
        <span>{{ busy === 'display' ? '保存中…' : typeof serviceStatus?.showInVisualize === 'boolean' ? (serviceStatus.showInVisualize ? '已显示' : '已隐藏') : '未读取' }}</span>
        <button type="button" class="display-switch" role="switch" aria-labelledby="assistant-display-title"
          :aria-checked="serviceStatus?.showInVisualize === true"
          :disabled="!loaded || typeof serviceStatus?.showInVisualize !== 'boolean' || checkingStatus || !!busy"
          @click="toggleDisplay"><span aria-hidden="true"></span></button>
      </div>
    </section>

    <div v-if="feedback" class="feedback" :class="feedbackKind" :role="feedbackKind === 'error' ? 'alert' : 'status'">
      <span>{{ feedback }}</span>
      <button v-if="!loaded" type="button" class="text-button" :disabled="!!busy" @click="loadSettings">重新读取配置</button>
    </div>

    <div class="settings-layout">
      <section class="settings-panel" aria-labelledby="model-settings-title">
        <div class="panel-heading"><h2 id="model-settings-title">模型配置</h2><span v-if="loaded" class="save-state">{{ dirty ? '有未保存的修改' : saved ? '已保存' : '尚未配置' }}</span><span v-else class="save-state">{{ busy === 'load' ? '读取中…' : '未读取' }}</span></div>
        <form class="model-form" @submit.prevent="save">
          <fieldset :disabled="!loaded || !!busy">
            <div class="field">
              <label for="assistant-protocol">接口协议</label>
              <select id="assistant-protocol" v-model="form.protocol"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select>
            </div>
            <div class="field">
              <label for="assistant-base-url">服务地址</label>
              <input id="assistant-base-url" v-model.trim="form.baseUrl" type="url" required placeholder="https://api.example.com/v1" autocomplete="off" aria-describedby="base-url-help">
              <p id="base-url-help" class="field-help">支持基础地址或完整接口地址，保存时会自动整理。</p>
            </div>
            <div class="field">
              <label for="assistant-model">模型名称</label>
              <input id="assistant-model" v-model.trim="form.model" required maxlength="180" placeholder="填写服务商提供的模型名称" autocomplete="off">
            </div>
            <div class="field">
              <label for="assistant-api-key">API Key <span v-if="hasKey" class="key-saved">已保存密钥</span></label>
              <input id="assistant-api-key" v-model="form.apiKey" type="password" autocomplete="new-password" :required="!hasKey" maxlength="4096" :placeholder="hasKey ? '留空保留已有密钥' : '填写模型服务的 API Key'" aria-describedby="api-key-help">
              <p id="api-key-help" class="field-help">已有密钥不会回显；更换服务商时请填写对应的新密钥。</p>
            </div>
            <div class="field">
              <label for="assistant-max-tokens">最大输出长度 <span class="field-unit">tokens</span></label>
              <input id="assistant-max-tokens" v-model.number="form.maxTokens" type="number" min="256" max="16000" step="1" required aria-describedby="max-tokens-help">
              <p id="max-tokens-help" class="field-help">范围 256–16000。额度太小可能使回答不完整；不是回答字数。</p>
            </div>
            <div v-if="showDotsThinking" class="field">
              <label for="assistant-dots-thinking">Dots 深度思考</label>
              <select id="assistant-dots-thinking" v-model="form.dotsThinking"><option value="default">跟随供应商默认</option><option value="off">关闭 · 直接回答</option><option value="on">开启 · 深度思考</option></select>
              <p class="field-help">开启后通常需要更多输出额度和更长等待。</p>
            </div>
          </fieldset>
          <div class="save-actions">
            <button class="primary-button" :disabled="!loaded || !!busy || !dirty">{{ busy === 'save' ? '保存中…' : '保存配置' }}</button>
            <span>保存后，无需重启助手。</span>
          </div>
        </form>
      </section>

      <aside class="check-column">
        <section class="settings-panel" aria-labelledby="service-title">
          <div class="panel-heading"><h2 id="service-title">助手服务</h2><button type="button" class="text-button" :disabled="checkingStatus || busy === 'display'" @click="refreshStatus">{{ checkingStatus ? '检查中…' : '刷新状态' }}</button></div>
          <div class="panel-body">
            <p class="service-state" :class="{ online: serviceStatus }"><span aria-hidden="true"></span>{{ checkingStatus ? '正在连接服务' : serviceStatus ? '服务在线' : '服务未连接' }}</p>
            <p class="field-help">{{ statusError || (serviceStatus?.configured ? (serviceStatus.showInVisualize === false ? '模型已配置，当前助手入口已隐藏。' : '模型已配置，可以到赛事页面发问。') : '保存模型配置后即可开始问答。') }}</p>
            <div v-if="saved" class="saved-model"><span>当前保存的模型</span><strong>{{ saved.model }}</strong><small>{{ saved.protocol === 'anthropic' ? 'Anthropic 兼容' : 'OpenAI 兼容' }}</small></div>
          </div>
        </section>

        <section class="settings-panel" aria-labelledby="test-title">
          <div class="panel-heading"><h2 id="test-title">连接测试</h2></div>
          <div class="panel-body">
            <p class="test-description">让当前保存的模型回答一句话，检查配置是否可用。</p>
            <button type="button" class="secondary-button test-button" :disabled="!loaded || !saved || dirty || !!busy" @click="test">{{ busy === 'test' ? '正在等待模型…' : '测试连接' }}</button>
            <p class="field-help">{{ dirty && loaded ? '请先保存修改，再测试新配置。' : '测试会实际调用模型，消耗少量额度。' }}</p>
            <div v-if="testResult" class="test-result" role="status"><strong>连接成功 · {{ (testResult.elapsed_ms / 1000).toFixed(1) }} 秒</strong><p>{{ testResult.text }}</p></div>
            <p class="test-boundary">连接成功只代表模型可以回复；比赛分析和工具调用请到赛事页面试聊。</p>
          </div>
        </section>

        <p class="privacy-note">对话记录加密保存在服务端，用于检查回答与改进助手，仅管理员可查看。对话与查询资料会发送给所配置的模型服务。</p>
      </aside>
    </div>
    <ConversationRecords :request="request" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import ConversationRecords from '@/components/assistant/ConversationRecords.vue';

const defaults = () => ({ protocol: 'openai', baseUrl: '', model: '', apiKey: '', maxTokens: 2048, dotsThinking: 'default' });
const form = reactive(defaults());
const loaded = ref(false), saved = ref(null), hasKey = ref(false);
const busy = ref(''), feedback = ref(''), feedbackKind = ref('success'), testResult = ref(null);
const serviceStatus = ref(null), checkingStatus = ref(false), statusError = ref('');
const controllers = new Set();
let disposed = false;
const dirty = computed(() => Object.keys(defaults()).some(key => form[key] !== (saved.value || defaults())[key]));
const showDotsThinking = computed(() => form.protocol === 'openai' && /^dots3-note-prev$/i.test(form.model));

async function request(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const controller = new AbortController(); controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`/assistant/v1/${path}`, {
      // Reuse the site's login cookie. Never replay a config PUT at a login
      // URL when the gateway returns a 307 after the session expires.
      method, signal: controller.signal, credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
      headers: body ? { 'content-type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) || [401, 403].includes(response.status)) {
      const error = new Error('后台登录已失效或没有访问权限，请刷新页面重新登录。');
      error.status = 401; throw error;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)) {
      const error = new Error(data?.error || '无法连接助手服务，请确认助手服务已启动后重试。');
      error.status = response.status; throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请检查助手服务或模型服务后重试。');
    if (error instanceof TypeError) throw new Error('无法连接助手服务，请确认助手服务已启动后重试。');
    throw error;
  } finally { clearTimeout(timer); controllers.delete(controller); }
}

function applySettings(data) {
  const next = defaults();
  for (const key of Object.keys(next)) if (key !== 'apiKey' && data[key] !== undefined) next[key] = data[key];
  Object.assign(form, next); hasKey.value = !!data.hasKey;
  saved.value = data.model ? { ...next } : null;
  testResult.value = null;
}
async function act(action, fn) {
  if (busy.value) return;
  busy.value = action; feedback.value = '';
  try { await fn(); }
  catch (error) {
    if (disposed) return;
    if (error.status === 401) { loaded.value = false; applySettings({}); }
    feedbackKind.value = 'error'; feedback.value = error.message;
  } finally { busy.value = ''; }
}
function success(message) { feedbackKind.value = 'success'; feedback.value = message; }
function loadSettings() {
  return act('load', async () => {
    const data = await request('settings');
    if (disposed) return;
    applySettings(data); loaded.value = true;
  });
}
function save() {
  if (!loaded.value) return;
  return act('save', async () => {
    const data = await request('settings', { method: 'PUT', body: { ...form } });
    if (disposed) return;
    applySettings(data); success('配置已保存，下一次提问将使用新配置。');
    void refreshStatus();
  });
}
function test() {
  if (!loaded.value || !saved.value || dirty.value) return;
  return act('test', async () => {
    testResult.value = null;
    const result = await request('test', { method: 'POST', body: {}, timeout: 60000 });
    if (!disposed) testResult.value = result;
  });
}
function toggleDisplay() {
  if (!loaded.value || !serviceStatus.value || checkingStatus.value) return;
  return act('display', async () => {
    const result = await request('settings/display', { method: 'PUT', body: { showInVisualize: !serviceStatus.value.showInVisualize } });
    if (typeof result.showInVisualize !== 'boolean') throw new Error('显示设置返回异常，请刷新状态后重试。');
    if (disposed) return;
    serviceStatus.value = { ...serviceStatus.value, ...result };
    success(result.showInVisualize ? '已显示可视化页面的助手入口。' : '已隐藏可视化页面的助手入口。');
  });
}
async function refreshStatus() {
  if (checkingStatus.value || busy.value === 'display') return;
  checkingStatus.value = true;
  try {
    const result = await request('status', { timeout: 10000 });
    if (typeof result.configured !== 'boolean') throw new Error('助手服务返回了异常状态，请重试。');
    if (!disposed) { serviceStatus.value = result; statusError.value = ''; }
  } catch (error) {
    if (!disposed) { serviceStatus.value = null; statusError.value = error.message; }
  } finally { checkingStatus.value = false; }
}
onMounted(() => { void loadSettings(); void refreshStatus(); });
onUnmounted(() => { disposed = true; controllers.forEach(controller => controller.abort()); form.apiKey = ''; });
</script>

<style scoped>
.assistant-admin { max-width: 1260px; margin: 0 auto; color: var(--admin-text); }
.settings-panel { border: 1px solid var(--admin-border); border-radius: 12px; background: var(--admin-surface); }
h2 { font-size: 16px; font-weight: 750; color: var(--admin-text-strong); }
.display-control { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; margin-bottom: 16px; }
.display-action { display: flex; align-items: center; gap: 10px; flex-shrink: 0; color: var(--admin-text-muted); font-size: 12px; }
.display-switch { width: 46px; height: 26px; padding: 3px; border: 0; border-radius: 20px; background: var(--admin-text-soft); }
.display-switch > span { display: block; width: 20px; height: 20px; border-radius: 50%; background: var(--admin-surface); }
.display-switch[aria-checked="true"] { background: var(--admin-orange); }
.display-switch[aria-checked="true"] > span { transform: translateX(20px); }
.field-help, .privacy-note, .test-boundary { color: var(--admin-text-muted); font-size: 13px; line-height: 1.7; }
.settings-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 24px; border-bottom: 1px solid var(--admin-border-soft); }
.save-state, .field-unit { color: var(--admin-text-muted); font-size: 12px; font-weight: 400; }
.model-form fieldset { border: 0; margin: 0; padding: 24px; display: grid; gap: 21px; }
.field label { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; font-size: 14px; font-weight: 600; }
input, select { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid var(--admin-border); border-radius: 7px; background: var(--admin-surface); color: var(--admin-text-strong); font: inherit; font-size: 14px; }
input::placeholder { color: var(--admin-text-soft); }
input:disabled, select:disabled { background: var(--admin-surface-subtle); color: var(--admin-text-soft); cursor: not-allowed; }
.field-help { margin-top: 7px; font-size: 12px; }
.key-saved { color: var(--admin-success); font-size: 12px; font-weight: 400; }
.save-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 18px 24px; border-top: 1px solid var(--admin-border-soft); }
.save-actions span { color: var(--admin-text-muted); font-size: 12px; }
button { font: inherit; cursor: pointer; }
.primary-button, .secondary-button { min-height: 42px; padding: 10px 18px; border-radius: 7px; font-size: 13px; font-weight: 650; white-space: nowrap; }
.primary-button { background: var(--admin-ink); color: var(--admin-surface); border: 1px solid var(--admin-ink); }
.primary-button:hover:enabled { background: var(--admin-ink-soft); border-color: var(--admin-orange); }
.secondary-button { background: var(--admin-surface); border: 1px solid var(--admin-border); color: var(--admin-text-strong); }
.secondary-button:hover:enabled { border-color: var(--admin-orange); }
button:disabled { opacity: .5; cursor: not-allowed; }
.text-button { padding: 4px 0; border: 0; background: transparent; color: var(--admin-text-muted); font-size: 12px; }
.text-button:hover:enabled { color: var(--admin-text-strong); }
input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--admin-orange); outline-offset: 3px; }
.check-column { display: grid; gap: 16px; min-width: 0; }
.panel-body { padding: 22px 24px; }
.service-state { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 650; }
.service-state > span { width: 7px; height: 7px; border-radius: 50%; background: var(--admin-text-soft); }
.service-state.online > span { background: var(--admin-success); }
.saved-model { margin-top: 21px; padding-left: 13px; border-left: 3px solid var(--admin-orange); display: grid; gap: 5px; overflow-wrap: anywhere; }
.saved-model span, .saved-model small { color: var(--admin-text-muted); font-size: 12px; }
.saved-model strong { color: var(--admin-text-strong); font-family: var(--vis-font-display); font-size: 18px; font-weight: 650; }
.test-description { font-size: 14px; line-height: 1.8; }
.test-button { width: 100%; margin-top: 16px; }
.test-boundary { margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--admin-border-soft); font-size: 12px; }
.test-result { margin-top: 20px; font-size: 13px; overflow-wrap: anywhere; }
.test-result strong { color: var(--admin-success); }
.test-result p { margin-top: 8px; line-height: 1.7; white-space: pre-wrap; }
.privacy-note { padding: 0 4px; font-size: 12px; }
.feedback { padding: 12px 16px; margin-bottom: 16px; border: 1px solid var(--admin-border); border-left: 3px solid var(--admin-success); border-radius: 6px; background: var(--admin-surface); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.feedback.error { border-left-color: var(--admin-danger); color: var(--admin-danger); }
.feedback .text-button { margin-left: 12px; text-decoration: underline; }
@media (max-width: 1100px) {
  .settings-layout { grid-template-columns: minmax(0, 1fr) 290px; }
}
@media (max-width: 700px) {
  .display-control { padding: 18px; flex-wrap: wrap; }
  .settings-layout { grid-template-columns: minmax(0, 1fr); }
  .panel-body, .model-form fieldset { padding: 18px; }
  .panel-heading, .save-actions { padding: 16px 18px; }
  .assistant-admin .admin-page-hero { align-items: start; flex-direction: column; gap: 14px; }
}
</style>
