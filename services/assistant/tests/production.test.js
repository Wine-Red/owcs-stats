import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

test('production requires gateway login for management and isolates rate limits by forwarded visitor', async () => {
  const app = createApp({ production: true,
    settings: { get: () => null, getDisplay: () => ({ showInVisualize: true }) },
    client: { baseUrl: 'https://stats.owmini.xyz/data/v1' } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/assistant/v1`;
  const headers = { origin: 'https://stats.owmini.xyz', 'x-forwarded-host': 'stats.owmini.xyz', 'x-forwarded-for': '198.51.100.10' };
  const request = (path, extra = {}) => fetch(base + path, { ...extra, headers: { ...headers, ...extra.headers } });
  try {
    const status = await request('/status'); assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { configured: false, dataSource: 'https://stats.owmini.xyz/data/v1', showInVisualize: true });
    for (const [path, method] of [['/settings', 'GET'], ['/settings', 'PUT'], ['/settings/display', 'PUT'], ['/test', 'POST'], ['/admin', 'GET'], ['/admin.js', 'GET']]) {
      assert.equal((await request(path, { method })).status, 401, path);
    }
    assert.equal((await request('/settings', { headers: { 'remote-user': 'admin' } })).status, 200);
    assert.equal((await request('/status', { headers: { origin: 'https://evil.test' } })).status, 403);
    assert.equal((await request('/status', { headers: { 'x-forwarded-host': 'evil.test' } })).status, 403);
    const chat = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '介绍比赛', page: { kind: 'general', label: '自由问答' }, history: [] }) };
    for (let i = 0; i < 40; i++) assert.equal((await request('/chat', chat)).status, 409);
    assert.equal((await request('/chat', chat)).status, 429);
    assert.equal((await request('/chat', { ...chat, headers: { ...chat.headers, 'x-forwarded-for': '198.51.100.11' } })).status, 409);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

// Partner pages may call public chat/status, never management endpoints.
test('partner CORS permits public streaming only and rejects unknown origins and headers', async () => {
  const partner='https://partner.example';
  const app=createApp({production:true,partnerOrigins:[partner],settings:{get:()=>({model:'mock'}),getDisplay:()=>({showInVisualize:true})},client:{baseUrl:'https://stats.owmini.xyz/data/v1'},runner:async({emit})=>{emit({type:'text',text:'测试回答'});emit({type:'done'});return {metrics:{}};}});
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening'); const base=`http://127.0.0.1:${server.address().port}/assistant/v1`;
  const headers={origin:partner,'sec-fetch-site':'cross-site'};
  try {
    const options=await fetch(base+'/chat',{method:'OPTIONS',headers:{...headers,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
    assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),partner);assert.equal(options.headers.get('access-control-allow-credentials'),null);
    const response=await fetch(base+'/chat',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({text:'你好',page:{kind:'general',label:'自由问答'},history:[]})});
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),partner);assert.match(await response.text(),/测试回答/);
    for(const route of ['/settings','/settings/display','/admin','/test']){const r=await fetch(base+route,{headers:{...headers,'remote-user':'forged'}});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);}
    assert.equal((await fetch(base+'/status',{headers:{origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(base+'/chat',{method:'OPTIONS',headers:{...headers,'access-control-request-method':'POST','access-control-request-headers':'remote-user'}})).status,403);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('open partner policy allows arbitrary web origins without opening administration',async()=>{
 const app=createApp({production:true,partnerOrigins:['*'],settings:{get:()=>null,getDisplay:()=>({showInVisualize:true})},client:{baseUrl:'https://stats.owmini.xyz/data/v1'}});const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/assistant/v1`;
 try{for(const origin of ['https://arbitrary.example','http://localhost:1234']){const headers={origin,'sec-fetch-site':'cross-site'};const r=await fetch(base+'/status',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal((await fetch(base+'/chat',{method:'OPTIONS',headers:{...headers,'access-control-request-method':'POST','access-control-request-headers':'content-type'}})).status,204);assert.equal((await fetch(base+'/settings',{headers:{...headers,'remote-user':'spoof'}})).status,403);}assert.equal((await fetch(base+'/status',{headers:{origin:'null'}})).status,403);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
