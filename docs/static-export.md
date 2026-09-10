# 完全静态展示包（v2）

同一 release 还会发布[接口驱动展示包](api-static-package.md)：共用前端，运行时读取公开接口。本文描述的数据随包和离线边界保持不变。

合作方包直接构建主站的公开展示页面。布局、组件、图表和交互只有一份源码；公开页面改动随下一次构建进入静态包。包内包含赛事数据、赛程、图片、字体及已收录时间线，没有投票、访客身份、轮询或外部数据请求。通过 HTTP(S) 静态托管使用，不依赖 Node、数据库、API 代理或登录；不承诺通过 file:// 双击运行。

## 数据与维护边界

`StaticExportSnapshotService` 使用同一个数据库事务读取完整集合，然后将已读取的数据交给共享服务生成展示视图。赛程在数据库事务之前独立采集，保留实际来源读取时间；来源失败或已过期时不发布新的空赛程包。

线上接口与静态导出共同调用 `PublicStatsService`（选手档案、英雄总览、英雄选手榜、选手英雄数据、赛季数据维度判断）、`SeasonStatsCalculator`（跨赛季履历、赛季及阶段统计）和 `MatchDataDetailService`（比赛详情）。计算规则只有一份，导出服务不再单独实现上述聚合。线上请求从数据库取数；导出传入事务中已读取的 `rawData`，共享服务不会在快照之外重新查库。

例如修改最近比赛数量、英雄统计公式或跨赛季履历口径，应修改对应共享服务，线上结果和下一次导出结果会同时采用新规则。不要在控制器或导出服务内新增另一份聚合实现。基于随包时间线在前端计算团战分析，则直接复用同一份前端代码。

名单读取统一调用 `RosterReadService`，在线和导出均保留报名选手关系、所属赛季队伍和公开来源类型 `sources`；导出的来源读取使用同一快照事务。阶段字段由 `SeasonStageService.serializeStageRange` 统一输出。前端每十分钟、KD/KAD 的转换集中在 `statMetrics.mjs`，保留各页面现有统计范围、分母和显示精度。公开统计的 `gameTime`、`totalDuration`、档案 `totals.duration` 均按分钟消费；英雄 `usageSeconds` 和时间线时间仍使用各自明确的单位。

地图局 `createdAt` 日期过滤在线与静态共用日期边界：`endDate=2026-08-24` 包含 UTC 当天全部时间，精确时间参数则包含该时刻；同时间记录按 ID 降序稳定分页。非法日期和倒置范围返回错误。比赛本身的日期字段筛选保持原有语义。

快照 v2 包含 `collections`、`views`、`timelines`、`schedule`，不再包含按 URL 和查询参数保存的 `responses`。比赛和地图集合不截取前 1000/2000 条。本地查询层处理分页、队伍/地图/日期等筛选，并保留真实零、缺失值及未知状态。阶段数据、名单外的实际出场选手和完整时间线均随包保存。

`export-static.mjs` 只消费快照格式，发现并本地化媒体，输出带内容摘要的资源文件及清单。它不维护页面请求列表，也不通过浏览器爬取页面。展示视图按赛事/选手等实体分文件，时间线按地图局分文件，访问时才加载。

一般页面改动、使用已有字段的新图表，以及上述共享服务返回结果中的聚合调整不需要修改导出脚本。共享结果新增字段会随结果一起序列化。新增接口、查询参数或尚未纳入快照的数据源仍需接入快照资源和读取适配；不支持的接口/参数必须显式报错，不能伪装成空数据。当前合作方数据包依赖专用只读导出端点，不把 `/data/v1` 误当作完整网站展示接口。

## 生产导出

先部署支持 v2 的后端，再运行：

```powershell
npm run export:static:production
npm run verify:static-bundle
```

默认数据源在 `static-export.config.json` 中，为 `https://stats.owmini.xyz/public-api`；导出请求 `/static-export/snapshot`。可以用 `OWCS_PRODUCTION_API_BASE` 覆盖。生产导出拒绝本机地址和本地快照文件，且不回退到 v1，以防导出缺项或把本机数据标为生产数据。

后端、赛程、图片或校验失败时保留原有 `public/static-data`；所有资源完成后才替换生成目录。`build:static` 会先检查资源清单和文件摘要，避免把旧版或损坏数据编入新页面。

## 本地只读验证

需要已安装后端依赖，并在 `backend/.env` 中配置可读取的数据库：

```powershell
node backend/scripts/export-static-snapshot.js .local/static-v2-source.json
$env:OWCS_STATIC_SNAPSHOT_FILE = '.local/static-v2-source.json'
$env:OWCS_EXPORT_API_BASE = 'https://stats.owmini.xyz/public-api'
npm run export:static
```

这里的 API 地址用于解析和下载媒体。本地来源会单独记录为数据库/文件来源，`exportMode` 为 `development`，`sourceApi` 为 null；不能把这个包当作最新生产数据。只读 CLI 只注册模型关系，不执行数据库初始化、迁移、同步任务或投票关联。

## 验收

```powershell
npm run test:static-export
npm run test:stat-metrics
node --test backend/tests/static-export-snapshot.test.js backend/tests/public-stats-service.test.js backend/tests/roster-read-service.test.js backend/tests/map-game-controller.test.js
npm run verify:static-bundle
npm run preview:static
```

另一个终端中运行：

```powershell
$env:OWCS_STATIC_PREVIEW_URL = 'http://127.0.0.1:4174/partner/owcs/'
npm run smoke:static
npm run verify:static-timeline
npm run verify:embedded-webview
```

预览服务器只提供子目录静态文件，没有 API 代理和 SPA 回退。页面冒烟测试拦截外部请求，检查首页、赛程、战队、选手、比赛和未开赛详情，同时拒绝投票组件。WebView 检查真实触摸滚动和移动端尺寸。单元回归覆盖超过 2000 条的分页、组合筛选、阶段视图、时间线延迟读取、资源损坏及失败保留旧包。

`manifest.json` 包含格式版本、数据来源、快照生成时间、赛程来源时间、集合数量、资源摘要与 `datasetId`。页面页脚明确显示数据快照生成时间；赛程不会随网站数据库更新而自动更新。

## GitHub 自动交付

生产部署成功后、每天北京时间 06:00 或手动触发工作流，导出并验证完整包。部署触发使用该次部署的提交；页面和导出程序随同一提交构建。只有完整验收通过才发布 `owcs-stats-static-production.zip` 及 SHA-256 文件，失败不发布空包，保留以前成功的版本。

## 合作方部署与更新

解压后上传 `dist` 的全部内容，保持目录结构。支持域名根目录和子目录，详情使用 Hash 路由，刷新不要求后端路由配置。字体和图片在包内，CSP 限制页面对外部服务的主动连接。普通跳转到资料来源的链接仍可由用户主动打开。

第一版只交付完整包。更新时上传到新的发布目录，校验后切换，保留上一版以便回滚；不要对当前服务目录做半包覆盖。正在浏览旧页面的用户在切换后可能需要刷新。后续如需要独立的数据更新包，再基于数据格式兼容性和资源保留策略扩展。
