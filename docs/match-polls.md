# 赛前观众投票 / Pre-match audience voting

## 数据边界

赛程继续来自 Liquipedia 的当前抓取结果，沿用服务端 5 分钟缓存；不建立本地赛程副本，不提前创建 Match，不修改 Matchweb。额外批量读取赛事页面 wikitext，将摘要中双方身份及时间与 Bracket / Matchlist 对应，取得 `overwatch:<groupId>_<matchPosition>`。当前仅支持明确的 TeamOpponent 和可解析的时区／时间；未确定对手、源码转引、多个候选或不同版本时间不一致时保留赛程展示，暂停该场投票，绝不使用队名／时间哈希冒充源站 ID。

`match_polls` 只在首票时创建，保存源标识、赛事页面、双方 teamId、截止时间和可空的正式 matchId；唯一键为源标识 + 无序双方 teamId。相同源比赛在不同 Stats 阶段展示时共用投票。源站同一位置换对手后不会沿用旧票。普通改期只更新投票截止时间。签表位置迁移不自动搬票。

正式比赛同步后（以及读取支持率时重试），只在对应 Liquipedia 赛事页面所配置的 Stats 赛季范围内，以双方 teamId + 中国时区比赛日期关联。仅双向唯一时绑定；重复交手、竞争投票记录或跨日期改期无法明确匹配时不自动关联。当前没有后台人工关联界面。正式比赛被删除时关联清空，投票保留；比赛双方被纠正时会复查关联。

## 匿名投票与部署

未开赛比赛可在赛程和前瞻页投票，选择后展示比例。已导入的完赛比赛暂不展示支持率：正式详情、赛程列表及旧前瞻入口均隐藏投票组件，后端拒绝继续投票；已关联的投票数据继续保留。

- `POST /poll-api/visitor`：签发随机匿名凭证；数据库只保存摘要，浏览器 localStorage 保存凭证。没有登录要求，清除数据或换设备仍可取得新身份。
- `GET /poll-api/upcoming`：静态版也读取最新赛程，不将旧导出快照当成当前赛程。
- `GET /poll-api/summary?seasonId=...`：批量返回源比赛及已关联正式比赛支持率；可选 `X-Vote-Token` 返回自己的选择。响应 `private, no-store`，不能配置 CDN 共享缓存。
- `POST /poll-api/vote`：传入 seasonId、sourceId、team1Id、team2Id、teamId；服务端复核当前源站对阵、时间及身份，数据库唯一约束和行锁保证重复／并发请求不增票。开赛前可改选，开赛后只读。源站数据过期回退时拒绝写入。
- 各进程内按 IP 和匿名凭证限流；身份签发也限流。多副本部署应另加共享限流／网关限流。此机制不能保证一个自然人一票，也未接入人机验证。
- `POLL_ALLOWED_ORIGINS`：逗号分隔的投票页面 origin，默认 `https://stats.owmini.xyz`。合作方静态站须加入实际域名。若宿主确实使用不透明 origin，需要显式配置 `null` 并在该 WebView 实测；优先使用 HTTPS 页面。
- `VITE_POLL_API_BASE_URL`：静态版实时接口地址，默认 `https://stats.owmini.xyz/poll-api`。常规版本默认同源 `/poll-api`。
- 部署需同步仓库内两层 Nginx 的 `/poll-api/` 配置。公开入口覆盖传入 X-Forwarded-For，后端只信任回环／私有网络代理；后端端口不应直接暴露公网。
- 不同宿主域名的 localStorage 身份互不共享。真实 App WebView 的持久化和联网行为仍需宿主验收。

## 本地验证

后端在 `backend/` 下运行 `node app.js`。`MATCH_SYNC_DISABLED=1` 可关闭本地自动比赛同步；`PORT` 指定端口。Vite 的 `API_PROXY_TARGET` 可指向该后端，例如 `http://127.0.0.1:3100`。

在已有本地后端和 Vite 服务时，从 `backend/` 运行 `node scripts/verify-match-polls-local.js`。默认使用 3100 / 8180 端口，仅允许 `127.0.0.1` 上的 `localstats` 数据库。验证真实并发投票、第二身份、改选、浏览器刷新、赛程展示及正式比赛关联；临时测试票和身份在结束时清理，正式比赛数据不修改。截图保存于 `.local/poll-preview/`。

完整生命周期本地演练：在 `backend/` 运行 `node scripts/verify-match-poll-lifecycle-local.js`。仅允许本地 `localstats`，使用独立临时赛季、真实投票服务和真实增量导入逻辑；Liquipedia 响应、外部比赛详情和队列为测试夹具，不请求或修改 Matchweb。覆盖先投票后导入、源比赛消失、左右队伍反转、重复同步、截止拒投、列表及详情隐藏。结束后按本次创建的 ID 清理临时记录。

## English

Run `node scripts/verify-match-poll-lifecycle-local.js` from `backend/` for a local-only lifecycle rehearsal against `localstats`. It uses an isolated temporary season, the real voting service and transactional match importer, with fixture source responses/client/queue. It checks voting before import, source disappearance, reversed teams, repeated sync, closed-vote rejection, hidden list and detail support. Only this run's records are removed afterward; Matchweb is not contacted or modified.

Upcoming fixtures allow voting from the schedule and preview, revealing percentages after selection. Imported completed matches currently hide support in the detail, schedule and old preview. Linked votes remain stored, and the server rejects further votes.

The live Liquipedia ticker remains the schedule authority (existing five-minute cache). No local schedule or pre-created formal matches are introduced, and Matchweb is unchanged. Source identities are enriched from tournament wikitext using bracket/list identifiers, exact team identities and timestamps. Unsupported, ambiguous, TBD or revision-inconsistent records remain visible but cannot be voted on.

Polls are created on the first vote and keyed by source identity plus the unordered team-ID pair. Different Stats stages displaying the same source match share a poll. A changed opponent does not inherit the old votes. Ordinary rescheduling updates the cutoff; moving a matchup to a different source slot does not automatically move votes. Formal match linkage is restricted to Stats seasons configured for the same Liquipedia tournament page, the same team pair and the Shanghai calendar date, and requires uniqueness in both directions. Ambiguous cases remain unlinked; no manual association UI is included.

Anonymous credentials are issued server-side and stored in localStorage, with only a token digest in MySQL. Unique constraints and row locks prevent duplicate counts; changing a selection before kickoff updates one vote. Stale source data cannot authorize writes. Per-process IP/visitor limits raise abuse costs but cannot guarantee one person per vote. Multiple backend replicas need shared/edge limits. No CAPTCHA is integrated.

Static builds use live `/poll-api` endpoints as well. Configure `VITE_POLL_API_BASE_URL` and the server's comma-separated `POLL_ALLOWED_ORIGINS` for partner domains. Deploy both Nginx route changes, preserve client-IP forwarding at the trusted edge, and never share-cache personal summaries. Real host WebView persistence/connectivity still requires host-level acceptance testing.
