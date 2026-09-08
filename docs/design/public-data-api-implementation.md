# 对外数据 API 实现与运行

内部维护文档。合作方只需要 [公开契约](../public-data-api/README.md)，无需数据库字段、凭据或本文件。

## 实现范围

`/data/v1` 的 21 个资源已实现，公开只读且无需 API Key。直接查询 13 张赛事基础表。旧 `/agent/v1` 的路由、控制器、序列化、中间件、专属测试与文档已删除；旧视图创建路径也已移除。启动迁移只清理明确列出的 10 个旧视图，不修改赛事基础表和数据。

| 层 | 入口 | 责任 |
|---|---|---|
| HTTP | `backend/routes/data-v1.js` | GET/HEAD、参数、ETag、统一错误与限流 |
| 应用服务 | `backend/services/publicData/service.js` | 一次请求的查询与投影编排 |
| 查询 | `backend/services/publicData/repository.js` | 明确字段的参数化 SELECT、关联、阶段与键集分页 |
| 投影 | `backend/services/publicData/contract.js` | 对外白名单、单位、缺失值、身份校验与覆盖 |
| 数据库 | `backend/services/publicData/database.js` | 独立连接池和只读 REPEATABLE READ 事务 |
| 游标 | `backend/services/publicData/cursor.js` | 签名、防篡改、查询绑定与固定到期时间 |

单场数据包以及其余数据库资源都在一个只读一致性快照内生成。开始事务时同时指定 `WITH CONSISTENT SNAPSHOT, READ ONLY`。独立池最多 3 个连接、24 个等待位置；单次 SQL 最多 10 秒，一个事务最多 15 秒。HTTP 层每个实例最多 24 个活动请求、每 IP 每分钟 240 次，过载返回带 `Retry-After` 的 JSON 429。

当前查询会隔离关键身份不一致的结果并返回 503，不能将重复统计行相加。系列赛大比分与地图胜场数量的跨层差异使用公开 `result_consistency` 表达，保留各自已记录事实。整局可选最后一击/终极技能使用次数尚无可靠字段级完整性证据，保持 null；英雄明细中的独立计数可照实返回。

赛程使用独立的 5 分钟缓存，直接抓取赛程提示，不运行投票身份补全。`observed_at` 来自缓存最后成功抓取时间；缓存命中和失败后使用旧值不会更新该时间。每次调用最多等待来源 60 秒，超时后有缓存则明确返回旧值，无缓存则返回 503；未结束的后台抓取继续合并，不重复排队。请求期间的外部抓取不占用数据库连接。来源空白响应不能当成空赛程。

## 配置与本地启动

默认沿用 backend 的 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`。可独立提供以下变量，优先级高于对应 `DB_*`：

```text
DATA_API_DB_HOST
DATA_API_DB_PORT
DATA_API_DB_USER
DATA_API_DB_PASSWORD
DATA_API_DB_NAME
DATA_API_CURSOR_SECRET
DATA_API_PORT
```

部署时建议为 `DATA_API_DB_USER` 设置独立 SELECT 账号，仅授权 seasons、season_stages、teams、team_aliases、players、maps、heroes、season_teams、season_team_players、matches、map_games、player_stats、player_hero_stats。本次不自动创建数据库账号或写入凭据。

`DATA_API_CURSOR_SECRET` 应为至少 32 字节的随机秘密，保存在后端运行环境。多实例必须使用同一值；轮换后旧游标返回 400，客户端从第一页重读。未配置时使用进程内随机密钥，因此重启后旧游标失效。首次游标到期点为当前 UTC 日期后第二个零点，即剩余 24–48 小时；后续页继承同一到期点，不滑动续期。

只运行新只读接口、避免应用启动初始化和定时同步：

```sh
npm --prefix backend run serve:data-api
```

独立入口加载 `backend/.env`，默认绑定 `127.0.0.1:3100`。示例读取 `http://127.0.0.1:3100/data/v1/competitions`。它不会运行 `initDatabase()`、迁移或同步任务。正常应用也已在 `backend/app.js` 挂载同一 Router。

真实库只读回放（同样不启动应用初始化）：

```sh
node backend/scripts/verify-public-data-api.js --all-matches
```

该脚本打印实际数据库身份、遍历比赛包并与独立 SQL 总数/伤害总和核对，再读取赛事覆盖。可选 `--schedule` 会访问真实外部赛程来源；可选 `--capture <文件>` 保存公开 HTTP 响应。核对期间应避免同时修改该数据集，因为分页不是全库一致性快照。不要将响应捕获文件或运行凭据提交。

## 测试与 CI

基础测试：在 `backend` 执行 `npm test`。MySQL 集成测试只在同时设置 `OWCS_ISOLATED_MYSQL=1` 和 `DATA_API_TEST_DB_PORT` 时执行；它不使用应用的 `DB_*` 连接。

为测试准备独立、可丢弃的 MySQL 8.0 实例，设置 `DATA_API_TEST_DB_HOST/PORT/USER/PASSWORD`。测试创建唯一 `owcs_data_api_test_<进程>_<时间>` 库，并在结束时删除这个测试库。请勿指向生产实例。

```sh
node --test backend/tests/public-data-mysql.test.js
python docs/public-data-api/validate.py --responses <DATA_API_HTTP_CAPTURE 指定的文件>
```

集成测试创建 13 张基础表、**零个旧视图**，覆盖所有 42 个 HTTP 操作；验证同一条登场记录筛选、重复地图 EXISTS、名单边界、游标、只读事务对存储函数写入的拒绝、并发更新快照、ETag 与异常隔离。生产发布工作流新增独立 MySQL 校验 job，部署同时依赖原有验证和此 job。

## 网关与发布

Vite、本项目 Docker Nginx 和 1Panel/OpenResty 模板均新增精确的 `/data/v1` 与 `/data/v1/` 路径。正常 `/api` 管理边界保持原配置。应用在 JSON 解析与全局 CORS 之前挂载新 Router，因此写方法和 OPTIONS 返回契约 JSON 405。

服务器外层模板 `deploy/server/stats-openresty-root.conf` 是受主机管理的 include，不能仅发布应用镜像就认为此文件已生效。部署时将变更应用至实际站点 include，校验完整 Nginx 配置，再激活。网关最外层必须覆盖来访者伪造的转发 IP 头，才能使限流使用真实连接身份。

发布通过 `master` CI 执行，生产地址为 `https://stats.owmini.xyz/data/v1`。上线验收需要从外网确认 `/data/v1/competitions` 为 JSON 200、对应 HEAD 无正文、ETag 条件读取 304、写方法返回带 Allow 的 JSON 405，并确认后台 `/api` 仍需原有登录。

2026-09-09 发布准备：先核对生产数据库身份并备份完整数据库、视图定义、后端环境与网关配置；在隔离 MySQL 中恢复备份并演练清理。发布前后对基础表行数及内容指纹进行比较。线上备份位于部署状态目录的 `backups/public-data-v1-*` 私有目录；游标签名密钥保存在服务器环境文件中。新接口使用独立数据库账号，仅授予 13 张赛事基础表的 SELECT 权限；实测拒绝配置表读取和写入。具体验收结果以对应 CI 运行与发布记录为准。

## 旧接口与视图退役

当前代码已移除旧接口，后端旧资源返回 404。Docker Nginx 与外层网关模板仅保留对旧 `/agent` 路径的 404 拒绝规则，避免落入 SPA HTML 或登录跳转；没有兼容转发或旧数据处理逻辑。赛程、阶段等仍被网站和新接口使用的共享服务保留。

`backend/database/legacyAgentViewRetirement.js` 是一次性清理逻辑，应用启动时检查并删除明确列出的 10 个旧视图。重复执行为空操作；同名基础表、非名单对象或其他视图依赖会使清理失败并阻止启动。它只执行 `DROP VIEW`，不删除业务表或记录，也不保留任何建视图 SQL。

独立维护脚本默认只预览，不启动应用初始化：

```sh
node backend/scripts/retire-legacy-agent-views.js --database localstats
node backend/scripts/retire-legacy-agent-views.js --database localstats --apply --backup <新的备份文件.json>
```

应用启动会执行退役迁移，因此升级前应先在目标环境使用脚本备份视图定义。脚本校验实际数据库名称；`--apply` 要求成功写出不覆盖既有文件的定义备份。DDL 不属于可回滚的数据事务。业务账号需要相应视图的 DROP 权限；权限不足会让部署失败，不能默认为已完成清理。

2026-09-09 本地清理身份为 MySQL 8.0.44 / `localstats` / `owapp@127.0.0.1`，10 个视图已删除。备份位于 Git 忽略目录 `.local/legacy-agent-retirement/`。生产环境尚未执行退役；发布新代码和外层网关配置后，仍需实际确认旧 URL 为 404、旧视图为 0、新接口可读。

清理后验证：112 项后端测试通过，隔离 MySQL 测试在此轮常规命令中按配置跳过；旧路径的 GET/HEAD/POST 返回 404。真实本地 324 场、1,159 张地图、11,587 条选手统计及伤害总和与清理前一致，428 份新接口响应通过 Schema。赛程不依赖此次删除内容，未在这一轮重复请求外部来源。清理模块、维护脚本和修改的 HTTP 测试通过 ESLint，应用入口与数据库初始化通过语法检查。

## 初次实现验证记录（2026-09-09，旧系统清理前）

- 后端全套：117 项通过；默认跳过的隔离 MySQL 测试已另行启用执行，10 项（含父测试）通过。
- 独立 MySQL 8.0.44 测试实例：真实 GET/HEAD、参数筛选、游标到期、事务只读、并发快照均通过；92 份 HTTP 响应通过 OpenAPI 校验。
- 真实本地只读身份：MySQL 8.0.44，`localstats`，`owapp@127.0.0.1`。11 个赛事、324 场比赛、1,159 张地图、11,587 条选手统计；接口伤害总和 92,802,388，与独立 SQL 一致。6 场跨层结果冲突按契约保留。
- 真实本地回放捕获的 428 份响应通过 Schema；随后包含真实赛程读取的 107 份响应通过完整 42 操作校验。赛程此次返回 31 项，`stale=false`，来源观察时间为 `2026-09-08T22:46:07.642Z`。这是当次观察，不是持续时效承诺。
- 新增/修改实现文件通过 ESLint；前端生产构建通过。工作流 YAML 可解析；新 CI job 尚未在远端执行。Docker Desktop 未运行，因此本轮未启动本地容器验证 Nginx；线上网关同样未修改或宣称已验收。

以上初次实现数据核对仅针对本地库，不混用前一轮生产审计的赛事/英雄目录数量。初次实现阶段的测试写入仅发生在可丢弃实例；之后授权删除的本地视图不涉及赛事表及其记录。
