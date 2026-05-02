<template>
  <div class="ai-report-chat" :class="{ 'standalone-mode': isStandalone }">
    <el-card class="chat-card">
      <template #header>
        <div class="card-header">
          <span>赛事数据助手</span>
          <div>
            <el-tag type="warning" size="small" v-if="isStandalone" style="margin-right: 10px;">外部访客模式</el-tag>
            <el-tag type="info" size="small">Beta</el-tag>
          </div>
        </div>
      </template>
      
      <div class="chat-window" ref="chatWindow">
        <div v-for="(msg, index) in messages" :key="index" :class="['chat-message', msg.role]">
          <div class="message-avatar">
            <el-icon v-if="msg.role === 'user'"><UserFilled /></el-icon>
            <img v-else :src="`${baseUrl}icons/OWCS_Dark.png`" alt="OWCS AI" class="ai-avatar-img" />
          </div>
          <div class="message-content">
            <div v-if="msg.role === 'user'" class="user-text">{{ msg.content }}</div>
            <div v-else class="ai-response">
              <div class="ai-text markdown-body" v-html="renderMarkdown(msg.reply)"></div>
              
              <div v-if="msg.sql && !isStandalone" class="sql-collapse">
                <el-collapse>
                  <el-collapse-item title="查看执行的 SQL">
                    <pre><code>{{ msg.sql }}</code></pre>
                  </el-collapse-item>
                </el-collapse>
              </div>

              <div v-if="msg.data && msg.data.length > 0 && !isStandalone" class="data-table-container">
                <el-table :data="msg.data" style="width: 100%" border max-height="300" size="small">
                  <el-table-column 
                    v-for="(val, key) in msg.data[0]" 
                    :key="key" 
                    :prop="key" 
                    :label="key"
                    min-width="120"
                    show-overflow-tooltip
                  />
                </el-table>
                <div class="export-actions">
                  <el-button type="success" icon="Download" size="small" @click="exportToExcel(msg.data, index)">
                    导出为 Excel
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="isLoading" class="chat-message ai loading-indicator">
          <div class="message-avatar">
            <img :src="`${baseUrl}icons/OWCS_Dark.png`" alt="OWCS AI" class="ai-avatar-img" />
          </div>
          <div class="message-content">
            <div class="ai-text">
              <el-icon class="is-loading"><Loading /></el-icon> 正在思考并执行数据库查询...
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <el-input
          v-model="currentInput"
          type="textarea"
          :rows="3"
          placeholder="请输入您的问题，例如：本赛季伤害排名前五的输出位选手是谁？"
          @keyup.enter.exact.prevent="sendMessage"
        />
        <div class="input-actions">
          <el-button v-if="!isLoading" type="primary" @click="sendMessage">
            <template #icon>
              <el-icon><Position /></el-icon>
            </template>
            发送
          </el-button>
          <el-button v-else type="danger" @click="abortRequest">
            <template #icon>
              <el-icon><VideoPause /></el-icon>
            </template>
            中止
          </el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { UserFilled, Service, Download, Position, Loading, VideoPause } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as xlsx from 'xlsx';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import apiService from '@/services/api';

const route = useRoute();
const baseUrl = import.meta.env.BASE_URL;
// 修正为根据路由 Name 匹配，防止 Nginx 的 base URL 和斜杠导致字符串匹配失败
const isStandalone = computed(() => route.name === 'AIGuest');
const inviteCode = ref(localStorage.getItem('ai_invite_code') || '');

onMounted(() => {
  if (isStandalone.value && !inviteCode.value) {
    ElMessageBox.prompt('请输入测试邀请码以使用 AI 助手', '身份验证', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '邀请码不能为空',
      closeOnClickModal: false,
      showClose: false,
      showCancelButton: false
    }).then(({ value }) => {
      inviteCode.value = value;
      localStorage.setItem('ai_invite_code', value);
    }).catch(() => {
      // 无法取消
    });
  }
});

const messages = ref([
  {
    role: 'ai',
    reply: '你好！我是数据分析助手。你可以用自然语言问我任何关于数据库中赛事、选手、队伍数据的问题。'
  }
]);

const currentInput = ref('');
const isLoading = ref(false);
const chatWindow = ref(null);
let abortController = null;

const scrollToBottom = async () => {
  await nextTick();
  if (chatWindow.value) {
    chatWindow.value.scrollTop = chatWindow.value.scrollHeight;
  }
};

const abortRequest = () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
    isLoading.value = false;
    messages.value.push({
      role: 'ai',
      reply: '⚠️ 您已手动中止了此次对话查询。'
    });
    scrollToBottom();
  }
};

const sendMessage = async () => {
  const text = currentInput.value.trim();
  if (!text) return;

  // Add user message
  messages.value.push({
    role: 'user',
    content: text
  });

  currentInput.value = '';
  isLoading.value = true;
  
  // Create a new AbortController for this request
  abortController = new AbortController();
  
  await scrollToBottom();

  try {
    const contextMessages = messages.value
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => ({ role: 'user', content: m.content }));

    const config = {
      signal: abortController.signal
    };
    if (isStandalone.value && inviteCode.value) {
      config.headers = { 'x-invite-code': inviteCode.value };
    } else if (!isStandalone.value) {
      // 如果是在管理后台，发送后台专用的通信密钥
      config.headers = { 'x-invite-code': 'ADMIN-INTERNAL-KEY' };
    }

    const response = await apiService.chatWithAI(contextMessages, config);

    if (response) {
      messages.value.push({
        role: 'ai',
        reply: response.reply,
        sql: response.sql,
        data: response.data
      });
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.message === 'canceled') {
      // 请求被用户中止，不需要额外处理，abortRequest 中已经处理了
      return;
    }

    console.error('Chat error:', error);
    let errorMsg = '抱歉，请求失败，请稍后重试。';
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMsg = '请求超时！AI 思考时间过长。';
    } else if (error.response && error.response.status === 504) {
      errorMsg = '网关超时 (504)。AI 思考时间超过了 Nginx 的限制，请联系管理员调大 Nginx 的 proxy_read_timeout。';
    } else if (error.response && error.response.status === 502) {
      errorMsg = '网关错误 (502)。后端服务可能未启动或正在重启。';
    } else if (error.response && error.response.status === 403) {
      errorMsg = '抱歉，邀请码无效或未授权。';
      // 验证失败，清除本地无效的邀请码，让用户刷新后重试
      if (isStandalone.value) {
        localStorage.removeItem('ai_invite_code');
        inviteCode.value = '';
      }
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMsg = error.response.data.error;
    }

    messages.value.push({
      role: 'ai',
      reply: errorMsg
    });
  } finally {
    isLoading.value = false;
    await scrollToBottom();
  }
};

const renderMarkdown = (text) => {
  if (!text) return '';
  const rawHtml = marked(text);
  return DOMPurify.sanitize(rawHtml);
};

const exportToExcel = (data, index) => {
  try {
    if (!data || data.length === 0) {
      ElMessage.warning('没有可导出的数据');
      return;
    }
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '查询结果');
    
    // Generate filename based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ai_report_${timestamp}.xlsx`;
    
    xlsx.writeFile(wb, filename);
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('Export error:', error);
    ElMessage.error('导出失败: ' + error.message);
  }
};
</script>

<style scoped>
.ai-report-chat {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-card {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 160px);
}

.standalone-mode .chat-card {
  height: 100dvh; /* 使用 dvh 替代 vh 解决移动端浏览器地址栏问题 */
  border: none;
  border-radius: 0;
}

.chat-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f7fa;
}

:root.dark .chat-window {
  background-color: #1a1a1a;
}

.chat-message {
  display: flex;
  margin-bottom: 20px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #e4e7ed;
  margin: 0 15px;
  font-size: 20px;
  flex-shrink: 0;
}

.chat-message.user .message-avatar {
  background-color: #409eff;
  color: white;
}

.chat-message.ai .message-avatar {
  background-color: transparent;
  color: white;
}

.ai-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.message-content {
  max-width: 75%;
}

@media screen and (max-width: 768px) {
  .message-content {
    max-width: 85%;
  }
  
  .chat-window {
    padding: 10px;
  }
  
  .message-avatar {
    margin: 0 8px;
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
}

.user-text {
  background-color: #409eff;
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
  border-top-right-radius: 0;
  word-break: break-word;
}

.ai-response {
  background-color: white;
  padding: 15px;
  border-radius: 8px;
  border-top-left-radius: 0;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

:root.dark .ai-response {
  background-color: #2c2c2c;
  color: #e5eaf3;
}

.ai-text {
  line-height: 1.6;
  white-space: normal;
}

.ai-text.markdown-body :deep(p) {
  margin-top: 0;
  margin-bottom: 1em;
}

.ai-text.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-text.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 1em;
  display: block;
  overflow-x: auto;
  white-space: nowrap;
}

.ai-text.markdown-body :deep(th),
.ai-text.markdown-body :deep(td) {
  border: 1px solid #dcdfe6;
  padding: 8px 12px;
}

.ai-text.markdown-body :deep(th) {
  background-color: #f5f7fa;
  font-weight: bold;
}

:root.dark .ai-text.markdown-body :deep(th),
:root.dark .ai-text.markdown-body :deep(td) {
  border-color: #4c4d4f;
}

:root.dark .ai-text.markdown-body :deep(th) {
  background-color: #303133;
}

.sql-collapse {
  margin-top: 15px;
}

.sql-collapse pre {
  margin: 0;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
  overflow-x: auto;
}

:root.dark .sql-collapse pre {
  background-color: #1e1e1e;
  color: #d4d4d4;
}

.data-table-container {
  margin-top: 15px;
}

.export-actions {
  margin-top: 10px;
  text-align: right;
}

.chat-input-area {
  padding: 15px;
  background-color: white;
  border-top: 1px solid #ebeef5;
}

:root.dark .chat-input-area {
  background-color: #141414;
  border-top-color: #333;
}

.input-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.loading-indicator {
  opacity: 0.7;
}
</style>
