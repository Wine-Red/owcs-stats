# OWCS Stats 赛事助手

项目内的独立 Node 服务，通过公开赛事 API 取数，嵌入可视化页面进行问答。支持本地测试和生产模式；普通 production 构建启用助手入口，API 静态包按 interactions 配置启用，纯快照包不启用。服务状态不可达时隐藏入口。

## 本地启动

需要 Node.js 22 或以上。第一次在仓库根目录执行：

```powershell
npm ci
npm run assistant:install
```

在两个终端中分别启动：

```powershell
# 终端一：独立问答服务，127.0.0.1:4330
npm run assistant:start
```

```powershell
# 终端二：可视化页面，127.0.0.1:8080
npm run dev:assistant
```

访问 <http://127.0.0.1:8080/visualize>，点击右下角小星标。测试模式的页面读取现有线上展示数据，助手通过服务器读取公开的 `/data/v1`，时间线通过同源的 `/public-api/map-games/{id}` 读取；不需要数据库账号。关闭对应终端即可停止进程。

## 模型配置

管理页顶部的「在可视化页面显示助手」开关控制所有可视化页面的助手入口，默认显示，点击后立即保存。该设置单独写入 `.local/assistant/display.json`，不修改模型或密钥，未配置模型时也能调整。浏览器在进入可视化页面、切换页面或重新聚焦标签页时通过 `/assistant/v1/status` 读取；没有定时轮询。关闭时隐藏入口及已展开的面板。它是显示开关，不是停止独立服务或禁用聊天 API 的开关。

显示开关通过 `PUT /assistant/v1/settings/display` 保存，只接受 `{ "showInVisualize": true/false }`，沿用后台统一登录保护，不能作为公开接口放行。

打开管理后台的「助手管理 → 赛事助手」：<http://127.0.0.1:8080/data-manage/assistant>。页面自动读取配置，直接填写模型协议、地址、模型名称和 API Key，不再需要独立的管理验证令牌。支持 OpenAI Chat Completions 兼容协议及 Anthropic Messages 协议，需要模型支持流式输出和工具调用。

管理请求通过同源 Cookie 沿用站点的后台登录。登录失效时提示刷新登录，不自动把配置请求重定向到登录地址。新配置用于下一次提问，不需要重启服务。有未保存修改时，先保存再测试连接，避免测试旧模型。页面显示助手服务状态，并提供「去页面试聊」入口；这里管理模型设置，不收集或保存访客会话。该入口在 assistant 和 production 模式显示，不加载业务数据管理接口；原 `/assistant/v1/admin` 保留为独立服务的简易配置页，也不要求单独令牌。

本机测试仍只监听 `127.0.0.1`，校验 Host 和请求来源，管理写入必须使用 JSON。线上登录由现有 Tinyauth/OpenResty 网关负责；仓库 `deploy/server/stats-openresty-root.conf` 的受保护根路径涵盖 `/data-manage/assistant`、`/assistant/v1/settings`、`/assistant/v1/test`、`/assistant/v1/admin` 和 `/assistant/v1/admin.js`。部署助手时须保留这些路径的登录保护及服务内网边界，不能把整个 `/assistant/v1/` 加入公开白名单。生产部署方式见下方 Docker 部署说明。

可以填写 `/v1` 等基础地址，也可以粘贴完整 `/chat/completions` 或 `/messages` 地址，保存时自动规范化。修改其他配置时 API Key 留空表示保留原值。“测试连接”只验证简单文本调用，不证明工具调用、统计正确性或响应速度达标。

OpenAI 兼容协议的 `dots3-note-prev` 可在管理页设置“Dots 深度思考”：默认、关闭或开启，分别对应省略参数或发送官方 `chat_template_kwargs.enable_thinking`。此选项只作用于该模型，聊天、空回答恢复和连接测试使用同一配置。当前本地配置为关闭，输出额度保留 4096；关闭思考不保证回答事实正确，赛事结论仍需查询证据。重新打开管理页并“读取配置”可查看已保存值。参数说明见 https://dots.ai/platform/docs 。

DeepSeek 官方 `api.deepseek.com` 的 Flash/Pro（含 v4 名称）在本助手中显式使用 `thinking: {type: "disabled"}`：实测默认思考模式与 `tool_choice: required` 冲突，返回 400 `Thinking mode does not support this tool_choice`。聊天、续查、空回答恢复和连接测试共用这一适配，不向其他供应商域名发送该参数。

配置和加密密钥写入状态目录（本地 `.local/assistant/`，生产 `ASSISTANT_STATE_DIR`），已被 Git 忽略。旧版本留下的 `admin-token.txt` 不再读取或使用。密钥与密文位于同一用户目录，加密不能防护已取得整个目录权限的程序。访客无需登录；浏览器对话刷新清空，但服务端会保留用于改进回答的记录。发问时的最近对话、当前问题和页面范围会发送给模型供应商，供应商自己的保留策略不由本服务控制。

助手管理页的「对话记录」支持分页查看、导出本页 JSON 和删除单条记录。服务端保存问题、历史上下文、流式回答（最多 100000 字符）、页面、来源 Origin、模型、状态和可用的 Token/耗时指标；不采集 IP、Cookie、模型密钥或内部推理。来源和会话编号是客户端提供的分析线索，不是可信用户身份；旧包没有会话编号时仍可按每条记录携带的历史还原上下文。失败或中断保留已产生正文；未开始运行的非法请求、未配置和限流拒绝不记录。只记录启用后收到的请求，不能恢复之前的对话。

记录存于状态目录 `conversations/*.enc`，使用独立 `conversations.key` 做 AES-256-GCM 加密；默认保留 90 天、最多 2000 条，超过上限删除较早记录，每小时及读写时清理过期记录。备份/迁移需同时保存目录和密钥，备份的保留周期需单独管理。删除单条不删除其他记录内携带的历史上下文。写入失败只输出不含正文的 `assistant_record_failed` 运维事件，不中断聊天。`GET /assistant/v1/conversations`（offset 分页）、`GET/DELETE /assistant/v1/conversations/:id` 受现有管理网关及来源校验保护，不加入跨域公开路由。

如需要沿用旧独立原型的模型配置，可在配置尚未建立时执行一次：

```powershell
node services/assistant/scripts/import-settings.js E:/Program/owcs-assistant/.data
```

该命令只读取、迁移模型配置，不迁移用户或历史对话，也不修改旧项目。

## 结构和调用流程

```text
Vue 可视化页面 + 内存对话
  -> /assistant/v1/chat（Vite 代理至本机 4330）
  -> AI SDK 的流式工具调用循环
     -> /data/v1：固定契约的只读赛事 API
     -> /public-api/map-games/{id}：现有页面时间线，经固定路径适配和字段校验
     -> analysis.js：确定性筛选、分组、统计
     -> Liquipedia MediaWiki API：当前赛事配置的页面与章节
  -> NDJSON：正文、简短状态、数据来源、完成或错误
```

| 位置 | 职责 |
| --- | --- |
| `server/app.js` | 本机 HTTP、请求来源校验、流、并发限制、取消 |
| `server/agent.js` | 模型协议、工具循环、参数形式修复、计时 |
| `server/context.js` | 页面/消息契约和简短行为提示 |
| `server/tools.js` | 七个工具及页内范围、短期数据集缓存 |
| `server/data.js` | 只读请求、限流重试、ETag、OpenAPI 响应校验 |
| `server/analysis.js` | 统计口径与缺失、冲突处理 |
| `server/timeline.js` | 时间线字段适配、回合时间、事件筛选、计数及分页快照 |
| `server/wiki.js` | Liquipedia 页面白名单、章节提取及缓存 |
| `src/services/assistantContext.js`（仓库根） | 页面与当前可见图表的选择状态 |
| `src/components/assistant/StatsAssistant.vue`（仓库根） | 桌面侧栏、移动端面板、Markdown 与来源 |
| `src/views/data-manage/AssistantAdmin.vue`（仓库根） | 管理后台内的模型配置、服务状态和连接测试 |

工具为 `lookup`、`list_matches`、`read_match`、`competition_info`、`analyze_stats`、`read_timeline`、`read_liquipedia`。统计工具一次完成取数和多个指定指标的计算，无需模型分步创建数据集。模型选择问题范围、指标和解释方式；数值由代码计算。常见的 camelCase、数字字符串、单值/数组格式错误自动规范化，其余错误返回模型修正，不猜测缺失 ID。

`read_timeline` 默认使用当前比赛和地图，或显式指定其他比赛、地图局；调用前先用赛事契约校验地图归属，再从现有公开展示接口提取回合、比赛阶段、英雄选择/切换、最终一击、死亡标记、大招就绪和使用事件。它不修改对外 `/data/v1` 契约，也不透传来源任务、截图、视频路径、审核文本或数据库审计字段。可以按 `round_number`、`player`、`event_types`、`start_seconds`、`end_seconds` 筛选；默认已确认事件，允许显式包含待确认事件，始终排除已否决记录。

摘要计数覆盖筛选后的全部记录；事件默认每页 100 条，最多 200 条。继续读取时必须带回 `pagination.snapshot` 和 `next_offset`，数据变化会要求重新开始。v2 的时间每回合归零，剔除非比赛片段并拼接，不等于录像时间；多回合按时间筛选必须指定回合。v1 保留媒体时间。最终一击与死亡标记可能描述同一次死亡，不能相加；大招就绪不等于使用；未记录、零条匹配记录、待确认、低置信度和读取失败分别保留。时间线展示事件顺序，不提供可靠的团战划分、占点进度或战术因果。

比赛页面发问时先读取一次当前比赛概要作为证据，简单比分问题可直接回答，避免一次模型往返。页内模式携带赛事、比赛、地图局、选手/队伍选择、英雄页和当前图表指标；明确扩大范围时工具使用 `custom` 范围。页面状态是定位线索，不能作为事实或指令。切页保留对话，但每条问题记录其当时范围。点范围条可切换自由问答。

当前没有 SQL 执行器、向量库、聊天数据库、用户体系或通用网页浏览器。Liquipedia 仅通过 MediaWiki API 读取允许的 Overwatch 页面；默认赛事页面来自展示配置中的 `liquipediaTournamentUrl`，不向模型暴露其他配置字段。

如果模型以 stop 结束但最后一段仍是“我先查/接下来查询”等计划，服务会携带全部工具结果，在原有七步和总超时额度内续跑一次。仍只有计划则报未完成，不发送成功 done。这是对常见未收尾表述的有限检查，不是完整语义判定。MVP 投票、获奖记录和评选标准不在赛事 API 契约中；本站缺少数据不能等同于全网没有记录。

赛事问答默认要求至少一个成功的工具查询，使用协议的 `tool_choice: required`，而非仅依靠提示词。完整寒暄和少量明确的指标定义问句可以直接回答，其余问题保守地进入查询；不增加额外模型分类请求。自由问答同样可以查询。查询前的正文不显示，失败工具不能解除要求；当前比赛预读仅用于回答明确的本场比分/结果问题。模型自行选择后续工具，目录查询不能证明表现，仍需统计证据；当前保障的是“先查询”，不等于已对每个结论完成自动证据核验。

## 数据口径和运行限制

- 赛事契约复用仓库 `docs/public-data-api/openapi.yaml`，不复制第二套字段定义。不导入业务数据库模块，不执行写入。
- 统计自动遍历分页，最多 300 场；多选选手或队伍时分别请求其比赛列表，合并去重后读取明细，不扫描全站再筛选。超出或任意一场读取失败均不把部分结果伪装成完整统计。列表与明细发生变化则要求重试。
- API 响应缓存 30 秒、统计数据集缓存 60 秒、Liquipedia 内容缓存 15 分钟。来源带读取时间；这是短期缓存与逐条读取，不是数据库原子快照或实时直播承诺。上游采集更新延迟仍然存在。
- 未知值保留为 `null`，不转换为零。默认排除结果冲突；保留覆盖不足和有效样本信息。每十分钟使用指标已知且时长有效的地图样本，分母不是精确的个人上场时间。
- 英雄级仅使用接口已有的使用时长、死亡事件、最终一击、终极技能等字段；不将整局伤害/治疗分摊给英雄。需要事件先后时读取时间线，不以记分板推断团战或战术因果。
- 常规查询最多 7 次模型步骤，其中最后一步关闭工具、保留已有证据并要求回答或明确说明不足，避免全部轮数用于查询后没有正文。如果供应商以 stop/length 结束却未输出正文，另允许一次保留完整工具证据、关闭工具的回答恢复；总计最多 8 步，仍共用 180 秒期限，最多 3 个并发对话。客户端停止会向模型和取数任务传递取消。正文流式显示，内部推理不发送到页面。模型本身返回空正文时，记录结束原因、恢复次数、推理字符数和计时，不记录问题或工具参数。供应商报告的 reasoning_tokens 可能为零，不能据此判断是否存在推理内容。
- 服务只监听 `127.0.0.1`，并校验 Host 和请求来源；不能直接视作已具备生产发布条件的公共 AI 服务。
- 空正文恢复最多额外等待 20 秒，同时受整轮 180 秒期限约束；恢复失败会明确返回失败，不能保证供应商一定生成正文。

可选服务环境变量：`ASSISTANT_PORT`（默认 4330）、`ASSISTANT_DATA_URL`（默认 `https://stats.owmini.xyz/data/v1`）、`ASSISTANT_DISPLAY_URL`（默认取赛事 API 同源的 `/public-api`，仅用于固定地图时间线读取）、`ASSISTANT_ORIGINS`（逗号分隔的本机来源）。这些地址由服务配置控制，模型不能指定任意 URL。如果更换服务端口，需同步调整 Vite 中 `/assistant/v1` 的代理端口。通常无需修改。

## 验证

在仓库根目录执行：

```powershell
npm run test:assistant
npm run test:assistant-browser
node scripts/verify-assistant-admin.mjs
npx vite build --mode assistant --outDir .local/assistant-build
```

浏览器测试需要两个本地服务已启动和可用的浏览器；使用真实展示页面与公开赛事数据，只替换聊天输出，验证页面范围、跟进消息、切页、清空、刷新、表格、安全渲染和桌面/移动端布局。协议测试通过真实 AI SDK 对接本地模拟 OpenAI/Anthropic 服务，不等于真实模型验收。

管理页浏览器验证用模拟接口检查自动读取、现有登录 Cookie、登录失效和重定向拦截、首次配置、密钥留空保留、地址规范化、先保存再测试、显示开关及错误恢复与桌面/移动端布局；随后只读核对本机真实模型配置，并短暂切换显示开关、刷新验证持久化后恢复原值，不修改实际模型设置，也不调用真实模型。

真实模型测试会消耗已配置模型的额度：

```powershell
npm run test:live --prefix services/assistant
# 或只测一个用例：greeting / page / analysis / followup / boundary
$env:ASSISTANT_TEST_CASE = 'page'
npm run test:live --prefix services/assistant
Remove-Item Env:ASSISTANT_TEST_CASE
```

全套按顺序测试，追问依赖前面成功的回答；单独运行 followup/boundary 不能替代连续对话测试。脚本记录耗时、工具事件、正文至 `.local/assistant/live-results.json`，这些是显式运行测试的诊断文件，不是运行时用户留档。脚本失败退出表示调用错误，成功退出仅表示完成回答，语义与引用仍需人工复核。

本轮已通过 14 项服务测试及 6 轮浏览器流程。真实配置 `dots3-note-prev` 的单场胜负问题在加入页面预读后，一次样本为首字约 7.3 秒、总计 7.6 秒；通过 Vite 代理与本机 HTTP 服务复测时，总计约 60 秒，均正确回答但速度波动很大。最新伤害排名测试中，统计工具约 0.13 秒完成并返回正确前三名，模型却继续重复查目录与覆盖信息，180 秒仍未完成。已补充避免重复查询的提示，但尚未以真实模型重新验证其效果。统计问答与响应速度尚未验收通过，需在本地结合实际问题继续评价模型的工具能力。

后续空回答排查：比较 leave 与 Proper 时，旧逻辑错误地扫描全站比赛并触发 300 场限制；即使后面取得数据，第 7 步仍可停在工具调用，导致没有正文。已改为选手/队伍比赛列表并集、最后一步保留回答，以及空正文结束原因诊断；服务回归增加到 17 项且全部通过。同题真实复测读取 66 场相关比赛，约 54 秒首字、62 秒完成。此样本证明空回答路径改善，但回答仍有将统计差异解释为整体实力、将助攻解释为团队协作等过度推断，不能据此称为语义验收通过。

进一步复测“你觉得proper和leave谁更厉害”：已确认供应商可返回 HTTP 200、仅 reasoning_content 而无正文，并以 length 结束，4096 输出额度均被消耗；此前服务也记录过 stop 结束但无正文。新增 list_matches 扁平筛选参数的形式修复，以及最多一次携带完整工具结果的无工具回答恢复。真实模型恢复仍曾达到总超时，因此加上恢复独立 20 秒期限；该供应商配置的可靠性仍未验收通过。当前 20 项服务测试通过，包括空 stop、仅推理 length、证据保留和恢复超时；这些协议回归不代表真实模型已恢复稳定。

## 生产模式与 Docker 部署

主站 `npm run build` 启用助手和管理页；本地仍使用 `npm run dev:assistant`。快照包和 API 静态包均不包含助手。入口仍受服务端显示开关控制，状态读取失败时隐藏。

独立服务设置 `ASSISTANT_MODE=production`，默认公开源为 `https://stats.owmini.xyz`，可通过 `ASSISTANT_PUBLIC_ORIGIN` 指定 HTTPS 源。服务始终监听 `127.0.0.1:4330`，禁止向公网直接暴露。`ASSISTANT_STATE_DIR` 指向持久化目录（配置、加密密钥、显示设置需一起备份）；未设置时继续使用仓库 `.local/assistant`。生产默认只接受公开源；不要设置本地开发来源列表覆盖生产默认值。

助手通过 `deploy/docker/Dockerfile.assistant` 构建，在现有 Compose 中作为 `assistant` 服务运行，和网站/API 使用同一提交标签，参与 CI 测试、健康检查与回滚。容器采用 host 网络以保留本机代理信任边界，但 Node 仅监听 `127.0.0.1:4330`，不监听公网地址。以非 root 用户运行、只读文件系统、禁用额外 capabilities，限额 512 MiB 内存和 1 CPU。持久化目录为 `/opt/compose/owcs-stats/data/assistant`，权限 0700、UID/GID 1000，挂载到 `/app/state`；配置与加密密钥一起备份。不要将开发机 `.local`、聊天诊断文件或密钥打进镜像。

`deploy/server/stats-openresty-root.conf` 已准备同源路由：仅精确 `/assistant/v1/status` 和 `/assistant/v1/chat` 匿名访问，其余助手路径执行 Tinyauth 认证。管理请求未登录返回 401/403，不重定向 POST/PUT。网关覆盖 Host、X-Forwarded-Host、X-Forwarded-For 和 Remote-User，公共路由清空 Remote-User；服务只信任本机代理，管理操作还要求网关提供登录用户。限流按代理转交的真实访客 IP 计算，每 IP 每分钟 40 次，全服务最多 3 个并发回答；聊天关闭代理缓冲，代理超时 190 秒。

以后实际发布时，应先启动独立服务并确认健康，再验证并应用 OpenResty include，最后发布主站前端。通过现有登录进入 `/data-manage/assistant` 配置模型。需实际验收未登录无法读写管理设置、公开聊天流式返回、客户端断开取消，以及页面显示开关。首次接入需先备份并应用网关配置；后续常规发布由现有 GitHub Actions 自动更新三个容器。

API 静态包启用助手时，Compose 默认使用 `OWCS_PARTNER_ORIGINS=*`，同时允许任意 HTTP(S) 网页调用公开投票和助手。独立助手通过 `ASSISTANT_PARTNER_ORIGINS=*` 开启这一行为；也可填写逗号分隔的来源白名单。只对精确的公开 status/chat 路径返回 CORS，管理接口继续只允许主站来源与认证网关。详见 `docs/api-static-package.md`。
