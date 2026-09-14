import MarkdownIt from 'markdown-it';
import { interactionBase } from './interactionEndpoints.mjs';
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
let conversationId;
const defaultLink = markdown.renderer.rules.link_open || ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
markdown.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i].attrSet('target', '_blank'); tokens[i].attrSet('rel', 'noopener noreferrer');
  return defaultLink(tokens, i, options, env, self);
};
// No remote images: answers can cite sources without triggering arbitrary
// third-party network requests or tracking pixels in the visitor's browser.
markdown.renderer.rules.image = (tokens, i) => markdown.utils.escapeHtml(tokens[i].content || '');
export const renderAssistantMarkdown = text => markdown.render(text || '');

export async function streamAssistant({ text, history, page, signal, onEvent, fetcher = fetch }) {
  if (!history?.length || !conversationId) conversationId = globalThis.crypto?.randomUUID?.();
  const base = await interactionBase('assistant');
  if (!base) throw new Error('当前页面未启用助手');
  const networkError = error => error.name === 'TypeError' ? new Error('连接中断，回答可能不完整，请稍后重试。') : error;
  const r = await fetcher(`${base}/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ text, history, page, conversationId }), signal,
  }).catch(error => { throw networkError(error); });
  if (!r.ok) {
    let detail; try { detail = await r.json(); } catch { /* gateway error */ }
    throw new Error(detail?.error || '助手暂时无法连接，请稍后重试。');
  }
  if (!r.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('助手返回了异常响应，请稍后重试。');
  const reader = r.body.getReader(), decoder = new TextDecoder();
  let buffer = '', terminal = false;
  const consume = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line); if (['done', 'error'].includes(event.type)) terminal = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(consume);
      if (done) { consume(buffer); break; }
    }
    if (!terminal) throw new Error('连接中断，回答可能不完整，请重试。');
  } catch (error) { throw networkError(error); }
  finally { reader.releaseLock(); }
}
