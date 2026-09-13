const $ = id => document.getElementById(id);
async function request(path, method = 'GET', body) {
  const r = await fetch('/assistant/v1/' + path, { method,
    credentials: 'same-origin', redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400) || [401, 403].includes(r.status))
    throw new Error('后台登录已失效或没有访问权限，请刷新页面重新登录。');
  const data = await r.json().catch(() => null);
  if (!r.ok || !data) throw new Error(data?.error || '无法连接本机助手，请确认服务已启动后重试。'); return data;
}
async function act(fn) {
  const buttons = document.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
  $('result').textContent = '正在处理…';
  try { await fn(); } catch (e) { $('result').textContent = e.message; }
  finally { buttons.forEach(b => b.disabled = false); }
}
$('load').onclick = () => act(async () => {
  const p = await request('settings');
  for (const key of ['protocol', 'baseUrl', 'model', 'maxTokens']) if (p[key] !== undefined) $(key).value = p[key];
  $('dotsThinking').value = p.dotsThinking || 'default';
  $('result').textContent = p.hasKey ? '已读取配置，密钥已保存。' : '尚未配置模型。';
});
$('settings').onsubmit = e => { e.preventDefault(); act(async () => {
  const p = Object.fromEntries(['protocol', 'baseUrl', 'model', 'apiKey', 'maxTokens', 'dotsThinking'].map(k => [k, $(k).value]));
  const result = await request('settings', 'PUT', p); $('apiKey').value = ''; $('baseUrl').value = result.baseUrl;
  $('result').textContent = '已保存。可以回到页面提问。';
}); };
$('test').onclick = () => act(async () => { const r = await request('test', 'POST', {}); $('result').textContent = `连接成功，用时 ${(r.elapsed_ms / 1000).toFixed(1)} 秒。\n${r.text}`; });
$('load').click();
