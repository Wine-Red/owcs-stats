import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { openDisplayPackage, replaceDisplayResources } from './lib/display-package.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { createApp } from '../services/assistant/server/app.js';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express'), cors = require('cors');
const { createPollRouter } = require('../backend/routes/polls.js');
const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));
let html;
const host = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Encoding', 'gzip'); res.end(gzipSync(html)); });
const origin = await listen(host);
process.env.POLL_PARTNER_ORIGINS = origin;
process.env.NODE_ENV = 'production';
let identities = 0, chosen = null, calls = [], chatInput;
const summary = () => ({ sources: { fixture: { sourceId: 'fixture', team1Id: 1, team2Id: 2, closed: false, myTeamId: chosen, total: chosen ? 1 : 0, votes: { 1: chosen === 1 ? 1 : 0, 2: chosen === 2 ? 1 : 0 } } }, matches: {} });
const app = express();
app.use((req,_res,next)=>{ calls.push({method:req.method,path:req.path}); next(); });
app.use('/public-api/site/v1', cors(), (req,res)=>{
 const values = { '/teams': [{id:1,name:'QA Alpha'},{id:2,name:'QA Beta'}], '/seasons': [{id:25,name:'QA Season',status:'in_progress'}], '/seasons/25': {id:25,name:'QA Season'}, '/matches': {data:[],total:0} };
 res.json(values[req.path] || (req.path.includes('/config') ? {} : []));
});
app.use('/poll-api', cors(), express.json(), createPollRouter({createVisitor:async()=>{identities++;return 'a'.repeat(64);},getSummary:async()=>summary(),castVote:async(body,token)=>{assert.equal(token,'a'.repeat(64));assert.equal(body.sourceId,'fixture');chosen=body.teamId;return summary();}}));
app.use(createApp({production:true,partnerOrigins:[origin],settings:{get:()=>({model:'mock'}),getDisplay:()=>({showInVisualize:true})},client:{baseUrl:'https://stats.owmini.xyz/data/v1'},runner:async({input,emit})=>{chatInput=input;emit({type:'text',text:'这是隔离测试的流式回答。'});emit({type:'done'});return {metrics:{}};}}));
const server=createServer(app), apiOrigin=await listen(server);
const bundle=await openDisplayPackage('dist-api');
html=replaceDisplayResources(bundle.html,{'site-config.json':{schemaVersion:1,apiBaseUrl:apiOrigin+'/public-api/site/v1',mediaOrigin:apiOrigin,timeoutMs:30000,interactions:{voting:true,assistant:true},pollApiBaseUrl:apiOrigin+'/poll-api',assistantApiBaseUrl:apiOrigin+'/assistant/v1'}}).replace("connect-src 'self'",`connect-src 'self' ${apiOrigin}`);
const browser=await launchBrowser();
try {
 for(const width of [1440,390]) {
  chosen=null;const before=identities;const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  await page.goto(origin+'/partner/index.html#/visualize/upcoming-match?seasonId=25&sourceId=fixture&t1=QA%20Alpha&t2=QA%20Beta&time='+String(Date.now()+3600000));
  const vote=page.getByRole('button',{name:'支持 QA Alpha',exact:true});await vote.click();await page.getByRole('button',{name:'已支持 QA Alpha',exact:true}).waitFor();assert.equal(chosen,1);assert.equal(identities,before+1);
  await page.reload();await page.getByRole('button',{name:'已支持 QA Alpha',exact:true}).waitFor();await page.getByRole('button',{name:'支持 QA Beta',exact:true}).click();await page.getByRole('button',{name:'已支持 QA Beta',exact:true}).waitFor();assert.equal(identities,before+1);
  await page.getByRole('button',{name:'打开赛事助手',exact:true}).click();await page.locator('#assistant-input').fill('解释当前比赛');await page.getByRole('button',{name:'发送',exact:false}).click();await page.getByText('这是隔离测试的流式回答。',{exact:true}).waitFor();assert.equal(chatInput.page.competition_id,25);
  assert.ok(!calls.some(c=>/\/assistant\/v1\/(settings|admin|test)/.test(c.path)));assert.ok(calls.some(c=>c.method==='OPTIONS'&&c.path==='/assistant/v1/chat'));assert.ok(calls.some(c=>c.method==='OPTIONS'&&c.path==='/poll-api/vote'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const summaryReads = calls.filter(c=>c.path==='/poll-api/summary').length;
  await page.clock.install(); await page.clock.fastForward(65000);
  assert.equal(calls.filter(c=>c.path==='/poll-api/summary').length,summaryReads,'no background vote polling');
  await context.close();console.log(`PASS ${width}px: cross-origin vote, identity persistence, change vote, stream, page context, no management requests or polling`);
 }
 const denied=await fetch(apiOrigin+'/poll-api/vote',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
}finally{await browser.close();for(const s of [server,host]){s.closeAllConnections();await new Promise(r=>s.close(r));}}
