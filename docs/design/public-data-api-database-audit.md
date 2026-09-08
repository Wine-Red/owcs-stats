# 对外赛事 API：数据库审计与内部映射

日期：2026-09-09。**内部实现材料，不属于合作方交付包。** 对外规范位于 [`../public-data-api/`](../public-data-api/README.md)。

本报告记录最初的设计阶段审计；当时未新增运行时 API、未运行数据库迁移、未修改生产数据、未重启或部署服务。后续实现进展见 [实现与运行](public-data-api-implementation.md)，历史审计数字不代表持续刷新状态。

## 1. 本次核验范围

检查了所有 21 张生产基础表、10 个视图的实际字段，Sequelize 模型和关联、数据初始化/迁移代码、比赛增量导入、名单证据合并、阶段范围、英雄时间线汇总、赛程来源、现有公开序列化和网关配置。

数据库查询使用独立连接，不导入应用启动入口，不触发 `initDatabase()` 或自动同步。读取业务数据使用只读一致性事务。没有读取 `configs.value`、访客 token 或投票者内容，仅统计这些表行数及查看结构。

### 实际环境身份

| 核验对象 | `VERSION()` | `DATABASE()` | `CURRENT_USER()` |
|---|---|---|---|
| 本地配置连接 | 8.0.44 | localstats | owapp@127.0.0.1 |
| 腾讯生产 backend 容器连接 | 8.0.46 | owcs_stats | owcs_stats_user@% |

本地与生产的表/字段名称集合一致，数据内容有差异。本报告的业务覆盖计数以生产为准，不沿用历史 MySQL 5.7 审计结论。审计记录是当次快照，未来可能变化。

### 生产数据概况

| 数据 | 数量 / 结论 |
|---|---|
| 赛事 / 阶段 | 12 / 20 |
| 队伍 / 选手 | 59 / 283 |
| 地图 / 英雄 | 30 / 55 |
| 比赛 / 地图局 | 324 / 1,159 |
| 选手地图统计 | 11,587 |
| 英雄统计 / 原始时间线 | 0 / 0 |
| 赛事队伍 / 赛事队伍选手关系 | 106 / 624 |
| 已确认队伍别名 | 11 |
| 已收录比赛日期范围 | 2026-03-20 至 2026-08-23 |

赛事 25“2026 守望先锋世界杯 季后赛”为 `in_progress`，当次没有比赛或地图统计；不能把目录状态当成收录完整证明。

## 2. 所有基础表的对外边界

| 内部表 | 业务粒度 | 新 API 用途 | 排除内容 |
|---|---|---|---|
| `seasons` | 独立赛事条目 | Competition：`id/name/status` | `stage` 总标签、外部事件名、图标 |
| `season_stages` | 赛事内部阶段边界 | Stage：`id/competition_id/name/sequence`；计算 Match.stage | 原始边界配置、创建/修改时间 |
| `teams` | 队伍目录 | Team：`id/name` | 默认区域、Logo |
| `team_aliases` | 已确认队伍别名 | Team.aliases、名称检索 | 别名行 ID、normalizedAlias |
| `players` | 选手目录 | Player：`id/name/role` | externalId、identityOrigin、orphanedAt |
| `season_teams` | 赛事参赛队伍 | `/competitions/{id}/teams` | 关系表行 ID |
| `season_team_players` | 赛事队伍名单 | Roster.players | 关系表行 ID、joinDate/leaveDate |
| `season_team_sources` | 队伍参赛关系来源证据 | 仅供内部关系维护 | 全部来源、状态与观察时间 |
| `season_team_player_sources` | 名单来源证据 | 仅供内部关系维护 | 全部来源、状态与观察时间 |
| `matches` | 已收录系列赛结果 | Match | externalId、createdAt、updatedAt |
| `map_games` | 系列赛地图局 | Game | statsVersion、原始外部局索引、createdAt、updatedAt；公开转换后的 number |
| `maps` | 地图目录 | Map：`id/name/mode` | 图片路径 |
| `heroes` | 英雄目录 | Hero：`id/name/role/sub_role` | externalId、图片路径 |
| `player_stats` | 地图局×队伍×选手 | PlayerGameStats | 重建行 ID、单值 heroId |
| `player_hero_stats` | 选手地图统计下英雄明细 | HeroStats.items | 行 ID、playerStatId、heroExternalId |
| `map_game_timelines` | 原始时间线镜像 | 本版不对外；未来单独设计事件契约 | 全部原始 payload、任务、摘要、源修订、同步时间 |
| `external_match_inbox` | 入站同步任务状态 | 无 | 全部 |
| `configs` | 运行配置与游标 | 无 | 全部，包括可能敏感的 JSON 配置 |
| `match_polls` | 投票绑定及比赛身份辅助 | 不是公开赛事/赛程事实源；不能充当完整赛程表 | sourceId/sourcePage/sourceGroup/pairKey/poll ID 等全部投票对象字段 |
| `match_votes` | 用户投票 | 无 | 全部 |
| `vote_visitors` | 访客标识 | 无 | 全部 |

审计时的 10 个 `ai_v_*` 视图属于旧设计派生入口，后续已移除创建代码并清理本地实例，生产执行状态见实现文档。新 API 直接查询基础表并使用显式公开 DTO，不对 ORM/SQL 结果或上游对象做展开透传。

## 3. 核心关系与生命周期

```text
seasons.id -> season_stages.seasonId
seasons.id + teams.id -> season_teams
season_teams.id + players.id -> season_team_players
seasons.id -> matches.seasonId
matches.id -> map_games.matchId
maps.id -> map_games.mapId
map_games.id + players.id + teams.id -> player_stats
player_stats.id -> player_hero_stats.playerStatId
heroes.id -> player_hero_stats.heroId（可空，保留 heroName）
map_games.id -> map_game_timelines.mapGameId（唯一）
```

`IncrementalMatchSyncService.replacePlayerStats` 先删除旧英雄与选手统计，再重新插入。因此统计行 ID 不是稳定公共身份。新响应不返回 `player_stat_id` 或英雄统计行 ID，而使用 `(game_id, team_id, player_id)` 定位，英雄子集合整体替换。

MapGame 通过比赛与外部 roundIndex 更新已有行，兼容旧记录的地图匹配。相同地图可重复出现，不能以 `(match_id,map_id)` 作为唯一键。显式撤回或身份纠正仍可能改变资源集合；未来可靠镜像需要删除记录和更正协议。

阶段由 `SeasonStageService.buildStageRanges` 对 `(matchDate,id)` 排序后的比赛序列和 `startMatchId` 边界计算。新 API 直接输出派生的 Match.stage，客户端不重算边界。空阶段列表合法；新增历史比赛或修改边界可能改变已存在比赛的阶段，因此 ETag 必须覆盖派生阶段。

名单关系由多种来源共同维护。对外读取当前有效 `season_teams/season_team_players` 结果，来源表不是新的名单资源，也不能推断入队时间、离队时间或比赛首发。

## 4. 字段转换白名单

### 比赛

| 内部字段 | 公开字段 | 规则 |
|---|---|---|
| `Match.id` | `id` | 保留当前数据集资源 ID |
| `Match.seasonId` | `competition` | 关联完整存在的赛事简要引用 |
| 阶段范围计算 | `stage` | ID/name 或 null；不使用 Season.stage 总标签 |
| `matchDate` | `date` | DATEONLY，不补造开赛时刻 |
| `boFormat` | `format` | 正规化为 BO 正整数形式；未知/无效 null |
| `team1Id/team2Id` | `team1.team/team2.team` | 明确队伍引用 |
| `team1Score/team2Score` | `team1.score/team2.score` | 保留有效整数，不从地图数反推 |
| `winnerId` | `winner_team_id` | 必须属于双方，与可判定比分一致；不能照搬导入端的兜底 winner |

当前生产 324 场中未发现大场比分平局、胜方不属于双方或与比分冲突。导入代码在比分相等时仍会选 team2，故模型非空和既有代码默认值本身不能替代新序列化校验。

### 地图局

| 内部字段 | 公开字段 | 规则 |
|---|---|---|
| `id/matchId` | `id/match_id` | 校验父子关系 |
| `externalRoundIndex` | `number` | 有可靠非负索引时 +1；无证据则 null，不能回退为 ID 排序序号 |
| `mapId` | `map` | 转换为公开模式英文枚举 |
| 队伍、比分、胜方 | 对应公开字段 | 与父比赛双方一致；不根据当前名单猜测 |
| `team1BanHeroId/team2BanHeroId` | `team1.banned_hero/team2.banned_hero` | 有效英雄引用或 null，不猜测 none |
| `duration` | `duration_seconds` | **内部为分钟**，有效正数乘 60 后四舍五入；无效/0 为 null |
| `replayId` | `replay_code` | 有效非空字符串，否则 null |
| 选手统计关系 | `player_stats_coverage` | 按有效唯一记录及双方各五人校验，不按简单 count>0 判断完整 |

分钟证据来自 `parseDuration()` 的 `minutes + seconds / 60`，以及 `SeasonStatsCalculator` 直接把 duration 作为分钟。真实地图 27301：9.98333 分钟应投影成 599 秒。

审计时旧序列化及视图使用 seconds 命名但未转换分钟。新接口纠正单位；后续按用户要求删除旧接口和建视图代码。这里保留问题发现过程，不是当前实现入口。

### 选手与英雄统计

| 内部字段 | 公开字段 | 规则 |
|---|---|---|
| `mapGameId/playerId/teamId` | `game_id/player/team` | 组合唯一键；队伍必须属于本地图 |
| `kills` | `metrics.eliminations` | 明确淘汰口径 |
| `assists/deaths/damage/healing` | 同名 metrics 字段 | 有效来源整数，未知 null |
| `mitigation` | `metrics.damage_mitigated` | 伤害减免 |
| `finalBlows` | `metrics.final_blows` | 需要独立完整的字段采集证据，默认零不能证明已采集 |
| `ultsUsed` | `metrics.ultimates_used` | 需要整局完整证据；短时英雄过滤后的求和不满足此要求 |
| `heroId`（PlayerStat） | 不暴露 | 单值无法表达换英雄，不作为整局英雄 |
| `heroId/heroName`（明细） | `hero.id/hero.name` | 未映射 ID 可为 null，保留有证据的名称 |
| `usageSeconds/usagePercentage` | `usage_seconds/usage_percentage` | 秒与 0–100；不重新归一化已过滤明细 |
| `finalBlows`（明细） | `final_blows` | 已归属英雄的计数 |
| `deathsByFinalBlow` | `death_events` | 当前汇总同时处理 kill/victim 和独立 death，不声称全部由 final blow 证明 |
| `ultReady/ultUsed` | `ultimate_ready_events/ultimates_used` | 英雄事件计数 |
| `avgUltChargeSeconds` | `average_ultimate_charge_seconds` | 保留可空均值，明确边界定义及推断限制 |

`TimelineHeroAggregationService` 过滤 `status=rejected` 的事件，并在回合时钟范围内处理选角/换英雄；它不是经过“所有事件均确认”的质量证明。当前英雄使用时长阈值严格为 `>30_000 ms`，整局最后一击汇总发生在过滤前，英雄明细过滤后才持久化；这些总数不能互相替代。

新发布器需明确字段采集证据。仅检查 `statsVersion>=2`、英雄表非空或某人有一条英雄记录，都不能统一判定所有可选整局指标可用。对现有不能证明的可选值输出 null；若未来希望稳定公开，需在导入或规范化层保留字段级采集/覆盖信息，相关内部证据不直接公开。

## 5. 实际覆盖与异常

| 检查 | 当前结果 | 新契约处理 |
|---|---|---|
| 地图没有父比赛 | 0 | 强制父子一致；不公开游离内部记录 |
| 地图与父比赛赛事/队伍冲突 | 0 / 0 | 公共投影前校验，异常不得猜测归属 |
| 选手统计不存在地图/选手 | 0 / 0 | 保持引用完整 |
| 选手统计队伍不属于地图 | 0 | 不把另一队记录混入响应 |
| 重复 `(mapGameId,playerId,teamId)` | 0 | 不能依赖未存在的唯一约束，发布前验证 |
| 无有效地图时长 | 27 | duration_seconds=null，计入缺失覆盖 |
| 只有 9 条选手统计的地图 | 1477、1648、27163 | partial，不补造第十人，不把整局统计包称为完整采集 |
| 缺少可靠外部局序号 | 1,012 | number=null |
| 有队伍 1 / 队伍 2 Ban 记录 | 162 / 163 | 分队伍槽位计数，不能用任一队有记录当双方完整 |
| statsVersion=1 / =2 | 1,014 / 145 | 内部格式编号不对外，也不代表实际英雄明细存在 |
| 英雄明细和时间线 | 均为 0 | 设计支持英雄明细容器，当前只返回缺失状态；不虚构现有覆盖 |
| finalBlows / ultsUsed 非零行 | 均为 0 | 结合缺少采集证据，不能说所有人真实零次 |
| 同名选手 | MCD、DIYA、YATE、SOAE 各 2；ACE 为 3 | 保留独立 ID，不自动合并 |

完整比赛样例交叉校验另发现：比赛 5445 的系列赛比分为 AUS 3:2 MEX，五张地图 winnerId 的计数为 AUS 4:1 MEX。新数据包保留两层记录并返回 `result_consistency=conflicting`，不能从一层自动覆盖另一层。

随后按新契约的同一判定规则对全部 324 场做了只读聚合核验：314 场 `consistent`，6 场 `conflicting`，4 场 `insufficient_data`。冲突场次为 81、225、487、855、5396、5445。这只确认库内记录之间的关系，没有判定哪一层对应真实赛果，也没有修改任何记录。

该场机动推进地图 27303 的双方整数成绩均为 81，而胜方记录为 AUS。内部以整数保存模式相关成绩，无法据此确认未取整的推进距离；公开字典不把此字段统一称为目标分/回合分，也不以整数相等判定平局。

## 6. 赛程为何不与比赛表硬合并

`UpcomingMatchesService` 从外部页面解析近期 S/A 级赛程，上限 50，缓存 TTL 为 5 分钟。它并不落入 `matches` 表。`Match.date` 只有日期，`schedule.scheduled_at` 则可能有时刻；两者不能互相补造。

源赛程身份含页面、分组、槽位等内部标识，不直接公开。当前身份确认本身需要队伍和时刻证据，失败会保留空 sourceId。新 API 不生成看似稳定的赛程业务 ID，也不把 `match_polls` 当作完整赛程台账。

当前缓存服务只返回 cached/stale，没有公开可用的“最后成功观察时间”。实现新 schedule freshness 时，需要让缓存层保留可读的成功抓取时间；不能在每次响应中填 now() 伪装新鲜。来源错误文本不得透传。

## 7. 实现分层与发布要求

建议新增独立 `data-v1` 路由、查询服务和纯序列化层：

1. 查询层：校验参数和父子关系，采用参数化查询与显式字段，不加载配置/来源/投票对象；名称子串匹配对 SQL LIKE 的 `%` / `_` 进行字面量转义。
2. 领域投影层：Competition/Stage/Match/Game/Stats 白名单、单位转换、缺失语义与字段证据。
3. HTTP 层：统一错误、键集游标、ETag、GET/HEAD。
4. 单场数据包：同一只读 REPEATABLE READ 快照中构建所有子数据；异常不能静默截断。

地图统计唯一性不足不能用 `SUM` 合并重复行。单对象内部关键身份或胜方与可判定比分矛盾，无法可靠投影时应隔离并返回可公开的 DATA_UNAVAILABLE（503），内部记录原因。跨系列赛比分与地图胜方数量的差异则保留两层事实并用 `result_consistency` 表达；缺失用 null 或 coverage 表达。

列表游标必须不可篡改、绑定排序/筛选/limit/契约版本并有有效期；键集分页避免 offset 位移，但不宣称跨页快照。普通 GET 不触发上游导入、迁移、名单修复或投票绑定。

ETag 根据规范化公开表示产生，涵盖目录名称、阶段、名单、地图、英雄等所有依赖。请求 ID 和响应时间不进入 ETag；不使用 `Match.updatedAt` 冒充子数据完整修订时间。

当前 `backend/app.js` 自动同步间隔为 5 分钟，上游采集耗时另计。新 API 的缓存和响应速度不能消除上游延迟；上线前分别测量采集到发布、发布到合作方读取的延迟。

仓库网关配置中 `/public-api` 被单独放行，其他根路径落入网页登录边界。新 `/data/v1` 必须配置明确的机器读取路由，保留后台访问边界，实际验证 JSON/HEAD/405；不能仅看应用路由存在就宣称可对接。

## 8. 本版不提前承诺的能力

- 全量一致性快照、删除通知、全库发布修订或可靠增量订阅：需要新的对外发布日志，不复用入站 inbox 或分页 cursor。
- 原始事件 API：需先定义公共事件枚举、回合时钟、实体映射、证据与质量口径，不能直接返回时间线 JSON。
- 历史入离队、实际职责、完整官方赛程、排名规则、游戏 patch：现有结构或可靠证据不足。
- 接口实现与部署：本轮产物为规范、样例及验证材料，不是已上线新能力。

审计原始结构/计数和样本留在 git 忽略的 `.local/public-api-design/`；该目录不属于合作方交付，也不应提交凭据或完整配置。

## 9. 验证记录

- OpenAPI 3.1.1 结构校验：21 个路径、42 个 GET/HEAD 操作、46 个 Schema。
- 样例校验：7 个 JSON 文件，以及 OpenAPI 中的内联响应样例。
- 公开字段检查：每个对象使用封闭字段白名单，禁止内部来源、同步、投票、访客等属性。
- 反例校验：10 个非法样例被拒绝，包含无效时长、内部字段泄漏、非法指标、非法模式和英雄状态矛盾。
- 真实样本：五张地图、五十条选手统计的身份、父子关系、唯一键与侧位一致；保留并验证大场/地图胜方差异标记。
- 现有语义测试：`node --test backend/tests/season-stage-ranges.test.js backend/tests/timeline-hero-aggregation.test.js`，8 项通过。

上述是契约、真实样本投影和现有计算语义的验证，不是新 API 的 HTTP 测试、生产上线测试或完整赛事语义准确率证明。
