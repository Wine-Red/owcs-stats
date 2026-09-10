# 接口驱动展示包（展示接口 v1）

同一份 Vue 页面、组件、图表和统计服务生成主站、纯静态快照包与接口驱动包。接口包由合作方托管一个包含 JS、CSS、字体及内置图片的 HTML；浏览器直接读取本站公开 JSON 和托管媒体。合作方不需要部署 Node、数据库、代理、登录、Cookie 或 API Key。两个交付包均只读，不启用投票或主站流量统计。

## 构建与发布

| 产物 | 本地命令 / 目录 | 数据更新 | 前端更新 |
| --- | --- | --- | --- |
| `owcs-stats-static-production.zip` | `npm run export:static:production` → `dist/` | 替换完整快照包 | 替换完整包 |
| `owcs-stats-api-production.zip` | `npm run build:api-static` → `dist-api/` | 页面按需读取接口，无需换包 | 替换完整包 |

`scripts/build-display.mjs` 是统一构建入口。Vite 生成共用页面的中间产物，再由 `scripts/lib/display-package.mjs` 将 JS、CSS、字体、本地图片和配置嵌入 `index.html`。两种包均使用 Hash 路由、不包含外部统计。接口模式排除 `static-data/`，无需先导出快照。最终输出没有供浏览器加载的拆分 JS/CSS 文件。

新增本地图片继续放在 `public/`，通过已有媒体工具或 `packageAssetUrl()` 引用；构建自动收集，无需维护第二份素材清单。普通主站仍使用原来的静态资源地址。

现有生产 release 工作流在成功部署后、每日定时及手动触发时，从同一提交生成两个包。两个包及生产接口通过校验、页面、更新/断网和 WebView 测试后，一次创建同一 GitHub Release，上传两个 ZIP 与各自 `.sha256`。每个 ZIP 都保留顶层 `dist/`。任何构建或检查失败均不创建该轮 release。

自动发布会更新可下载的包；合作方已部署的 JS 不会被远程替换。比赛数据更新无需合作方操作，前端功能升级仍由合作方部署新版包。没有远程 JS 热更新或 Service Worker 更新通道。

## 复用与接口边界

```mermaid
flowchart LR
  source[同一份前端源码] --> snapshot[纯静态包]
  source --> live[接口驱动包]
  snapshot --> local[随包 JSON 和媒体]
  live --> browser[合作方域名中的浏览器]
  browser --> api[/public-api/site/v1]
  browser --> media[/media 托管图片]
  api --> shared[现有控制器和共享统计服务]
  shared --> database[本站数据库]
  shared --> export[静态快照导出]
```

生产基础地址：`https://stats.owmini.xyz/public-api/site/v1`，网关转发到后端 `/api/site/v1`。这是既有展示页面的版本化接口，与分析接口 `/data/v1` 独立，后者契约不变。

路由和参数允许列表集中在 `backend/services/siteApi/contract.js`，直接复用现有控制器和 `PublicStatsService`、`SeasonStatsCalculator`、`RosterReadService`、`MatchDataDetailService` 等服务。不复制统计公式，也不转发整个管理路由。赛程复用快照导出使用的来源缓存，不执行投票身份补全。

主要资源：赛季、队伍、选手、地图、英雄目录；比赛/地图局及时间线详情；报名关系；选手档案；英雄总览/排行榜；赛季、阶段、队伍统计；公开展示配置；`/meta`。完整路径及参数以路由表为可执行契约。比赛分页支持 `page`、`pageSize`（1–10000）及既有赛季、队伍、地图和日期筛选。不支持的参数返回 400。

响应保持既有字段、集合包装与 null/0 语义，可选新增字段自动到达前端。v1 不删除字段或改变单位、类型和包装；不兼容变更发布 v2 并保留 v1，让旧包继续运行。包配置的 `schemaVersion: 1`、接口的 `apiVersion: 1` 与离线快照的 schemaVersion 2 分别管理。

仅开放 GET、HEAD、OPTIONS，写方法返回 JSON 405，未知路由/非公开配置返回 404。配置仅允许 `visualize_chart_config`、`visualize_stage_season_order`、`visualize_season_<id>` 和最后同步时间，后者只返回 `lastSyncAt`。管理上下文、凭据配置、同步和导入控制不在此边界内。

## 时效、缓存与失败

`GET /meta` 返回版本、修订摘要、刷新建议、赛程实际读取时间/过期状态与只读能力。摘要涵盖源表实际记录、时间线摘要/版本、名单证据、公开配置和赛程；无更新时间的统计表发生修改、删除也能发现。较大的时间线正文使用已有内容摘要，不重复读入。新增字段自动纳入，新增数据源时补充源模型列表。

- 后端共享 15 秒结果缓存，合并相同并发请求；最多 256 项 / 32 MiB、12 个不同查询同时计算。每 IP 默认每分钟 240 次读取，超限返回 429 与 Retry-After。错误不缓存，内部错误信息不对外泄露。
- JSON 带内容 ETag。每次网络读取要求重新验证，相同数据可返回 304，由浏览器处理条件缓存。客户端另有 15 秒、128 项内存缓存与请求合并；调用者拿到独立对象，避免图表排序污染共享数据。
- 打开和导航时按需取数；页面可见时默认每 60 秒检查修订，回到前台、恢复网络时也检查。新数据出现后提示“赛事数据已更新”；点击后清空缓存、重读基础数据并重载当前详情，保留 URL 中的赛事和实体 ID。页内临时图表选择可能复位，不强制打断用户操作。
- 断网、超时、服务异常显示重试入口并保留已显示内容，不把旧快照或空数据伪装成实时成功结果。赛程来源过期时，明确说明正在显示上次数据。
- 时效受既有同步和来源缓存影响：数据库同步与赛程源通常按 5 分钟更新，展示缓存最多再增加 15 秒，更新提示再等待一个检查周期。不保证跨多个 HTTP 请求的原子快照；需要固定一致数据时使用纯静态包。

## 跨域与资源

公开 JSON 使用 `Access-Control-Allow-Origin: *`，不允许凭据；前端 `credentials: omit`，只发送简单 GET 的 Accept 头。OPTIONS 支持 If-None-Match 预检，错误也保留 CORS。媒体同时允许 CORS 和 `Cross-Origin-Resource-Policy: cross-origin`，覆盖图片显示及 canvas 导出两条路径。参考：[MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、[MDN CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy)。

字体内联，地图/英雄兼容图片、图标和 TBD 图片随包。API 中 `/media/…` 指向配置的本站媒体源，`/heroes/…`、`/maps/…` 等内置路径解析为包内 Blob URL。上传图片使用现有内容摘要文件名，变更生成新 URL，可长期缓存。

未托管外部图片不在信任范围，由页面沿用缺图回退；不提供任意 URL 图片代理。发布检查会拒绝未托管队伍图标，应通过现有媒体上传/迁移流程处理。用户主动点击的资料来源链接不受该资源规则影响。

`site-package.config.json` 是维护者的统一配置源，构建时校验并内嵌，同时输出 `site-config.json` 和 `package-manifest.json` 供核对。运行不请求这些旁置 JSON；直接修改旁置 JSON 不会生效。修改超时、周期、路径或源地址时，以 `OWCS_SITE_CONFIG` 指向新配置重构建，内嵌配置和 CSP 自动同步，无需改前端源码。公开服务使用 HTTPS，HTTP 仅允许本机预览。

脚本使用精确 SHA-256 CSP 授权，不依赖 `unsafe-inline` 或 `unsafe-eval`。本地图标、地图和导出素材按需变为页面自己的 Blob URL，不经过合作方 CDN。配置与离线 JSON 以压缩记录内置，沿用既有资源适配层按需解压；不挂接全局 fetch，也不改变业务接口。

## 首次部署与日常维护

1. 发布后端及 Docker Nginx 配置。宿主机 1Panel 的 `stats-openresty-root.conf` 不由应用部署自动覆盖，首次需要应用其中 `/public-api/site/v1/` 的专用 location，检查配置并平滑重载。它允许预检通过，保持管理 `/api` 的原有认证；仅首次接入或换路由时需要。
2. 运行 `npm run verify:site-api` 验证真实公开地址，包括匿名 JSON、GET/HEAD/OPTIONS、ETag/304、400/404/405 和媒体。首次未更新网关时，release 会在该检查停止。
3. 解压任一 ZIP，将 `dist/index.html` 上传 HTTP(S) 静态目录。Hash 路由支持根目录/子目录，无需 SPA 回退；不承诺 file:// 双击运行。
4. 运行只需 `index.html`，其余文件是版本/配置核对材料。HTML 使用 `Cache-Control: no-cache`，建议开启 gzip/Brotli 传输压缩。平台可继续把普通外链资源改写到 CDN，本包没有需要改写的本地 JS/CSS/JSON/图片请求。完整新文件上传、验收后切换，保留旧文件回滚。
5. 平台需保留 HTML 内的脚本、样式与 CSP 哈希，自己的 CSP 也需允许对应哈希和本站接口/媒体源。不要再次将内联代码拆成无 CORS 的模块文件。资源随 HTML 传输，首次下载体积比原来的 HTML 大；它不再依赖平台资源目录布局。实际 App 对文件大小、HTML 改写和网络的额外限制仍以接入验收为准。

日常只改页面或组件，三种构建自动共用。只改既有统计算法，主站、新接口与下一份离线导出同步使用。新增展示接口在路由表登记并复用控制器；全新数据源还需接入离线快照/读取适配、元数据指纹和契约验证，无需另建前端项目或复制页面。

## 本地验证

```powershell
node --test src/services/siteClient.test.mjs backend/tests/site-api.test.js
npm run build:api-static
npm run verify:api-bundle
npm run verify:site-api
```

尚未发布后端时，`node backend/scripts/serve-site-api.js` 用本地数据库启动 4180 端口只读预览，只注册模型关系，不执行初始化、迁移、同步和投票。设置 `OWCS_SITE_CONFIG` 指向本机 API 的临时配置再构建；媒体源可继续使用生产本站媒体。

```powershell
$env:OWCS_PREVIEW_DIR = 'dist-api'
$env:PORT = '4175'
npm run preview:static
# 另一个终端
$env:OWCS_STATIC_PREVIEW_URL = 'http://127.0.0.1:4175/partner/owcs/'
npm run smoke:api-static
npm run verify:api-runtime
npm run verify:embedded-webview
```

`verify:api-runtime` 用真实浏览器测试跨源图片和 canvas，随后仅在测试浏览器内替换修订/队名响应、模拟断网与 503，验证更新、基础数据刷新和重试；不修改数据库。纯静态包继续运行既有快照、页面、时间线及 WebView 检查。两种包的构建与校验目录彼此独立。

`npm run verify:api-partner-host` 使用两个真实 HTTP 服务模拟页面域与无 CORS CDN：对照模块确实被浏览器阻止，新包则只请求 HTML 和本站公开接口/媒体。覆盖根目录、子目录、桌面、手机、刷新和包内图片 canvas 导出。该检查已纳入每次 Release。
