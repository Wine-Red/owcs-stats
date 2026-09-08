# 数据字典

适用：`/data/v1`，`1.0.0`。本文件只说明公开数据，内部表结构和同步实现不属于合作方契约。

## 1. 通用规则

| 类型 | 规则 |
|---|---|
| 资源 ID | 正整数。同一数据集内标识同一实体；名称可变。不同环境 ID 不保证一致 |
| 名称 | UTF-8 字符串。只用于展示和检索，不作为关联键 |
| 日期 | `YYYY-MM-DD`，保留已记录比赛日历日期；不补造时区、开赛时刻 |
| 时刻 | RFC 3339 UTC，例如 `2026-09-09T08:00:00Z`；本版只在赛程中提供有证据的时刻 |
| 时长 | 秒。整张地图为最接近的整数秒，英雄时长沿用已记录整数秒 |
| 百分比 | 0–100；`25` 表示 25%，不是 0.25 |
| 未知 | `null`。不能转换成零，也不能据此断言事件没有发生 |
| 空集合 | `[]`。表示查询范围内没有可返回记录；解释其原因时应结合覆盖状态 |
| 身份引用 | `{"id":53,"name":"AUS"}`。已知名称但未匹配本地目录的赛程实体/英雄允许 `id=null` |

任何解析失败、负数、无穷值或身份冲突都不能通过随意归零、改名、合并等方式伪装为合法赛事事实。

## 2. 赛事与阶段

### Competition

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | integer | 赛事条目标识 |
| `name` | string | 独立收录赛事名称 |
| `status` | enum | `in_progress` / `completed`，赛事目录状态 |

两个赛事条目可能属于同一届赛事的不同部分，例如世界杯小组赛和季后赛。本版保留它们的独立 ID，不凭名称推导一个不存在的全局赛事父级。

`completed` 不保证收录齐全，`in_progress` 也不保证已经有比赛记录。赛区、年度和游戏版本不能由标题自动生成后作为权威字段输出。

### Stage

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | integer | 阶段标识 |
| `competition_id` | integer | 所属赛事 |
| `name` | string | 常规赛、季后赛等阶段名 |
| `sequence` | integer | 同赛事内部顺序，从 1 开始 |

阶段归属由数据服务确定，客户端直接使用 `Match.stage`。不同赛事的同名阶段不是同一实体；不暴露用于内部配置边界的比赛 ID 或编辑时间。

## 3. 基础目录与名单

| 对象 | 字段 | 含义 |
|---|---|---|
| Team | `id`, `name`, `aliases` | 队伍与已确认别名；别名不代表自动认可俱乐部继承关系 |
| Player | `id`, `name`, `role` | 选手与目录位置；`role` 为 `tank`、`damage`、`support` |
| Map | `id`, `name`, `mode` | 地图与比赛模式 |
| Hero | `id`, `name`, `role`, `sub_role` | 英雄、职责及可为空的细分职责 |
| Roster | `competition`, `team`, `players` | 某赛事某队的完整已记录名单 |

地图模式统一编码：

| `mode` | 中文 |
|---|---|
| `control` | 占领要点 |
| `escort` | 运载目标 |
| `hybrid` | 攻击/护送 |
| `push` | 机动推进 |
| `flashpoint` | 闪点作战 |

选手可能同名，或在同一赛事/不同赛事效力不同队伍。名单不包含入队、离队、首发或替补时间。实际比赛归属使用 `PlayerGameStats.team`，不能用目录或当前名单倒推历史。

## 4. 比赛与地图局

### Match

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | integer | 一场系列赛 ID |
| `competition` | EntityRef | 所属赛事 |
| `stage` | EntityRef / null | 该赛事内部阶段 |
| `date` | date | 已记录比赛日期 |
| `format` | string / null | `BO3`、`BO5`、`BO7` 等，未知为 null |
| `team1`, `team2` | TeamResult | 固定侧位的队伍和系列赛比分 |
| `winner_team_id` | integer / null | 已确认胜方，必须属于双方；未知为 null |

`TeamResult` 为 `{"team":{"id":53,"name":"AUS"},"score":3}`。侧位不表示主客场、攻守方或强弱。

大场比分以已记录系列赛结果为准，不能从已收录地图数量反推，因为地图明细可能缺失。查询结果库不提供比赛进行中、延期、弃权等未被可靠记录的状态。

### Game

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | integer | 地图局 ID，同一地图的不同局必须有不同 ID |
| `match_id` | integer | 所属系列赛 |
| `number` | integer / null | 经确认的系列赛局序号，从 1 开始；未知保留 null |
| `map` | Map | 地图名称和模式 |
| `team1`, `team2` | GameTeamResult | 队伍、单地图得分与 Ban |
| `winner_team_id` | integer / null | 本地图已确认胜方 |
| `duration_seconds` | integer / null | 游戏时长，单位秒；不是视频或整场系列赛长度 |
| `replay_code` | string / null | 已记录的游戏内回放代码；可能因版本更新失效 |
| `player_stats_coverage` | object | 本地图选手统计结构覆盖情况 |

`GameTeamResult` 为 `{"team":{"id":53,"name":"AUS"},"score":2,"banned_hero":{"id":26,"name":"堡垒"}}`。

地图 `score` 是来源已记录的模式相关成绩值，其含义随模式变化；不同模式不直接比较。原始存储只保留整数，可能丢失推进距离等信息的精度。相等整数不一定表示平局；胜方使用单独记录的 `winner_team_id`，不能仅比较 `score` 大小重算。

`player_stats_coverage`：

| 字段 | 含义 |
|---|---|
| `status` | `recorded` / `partial` / `not_recorded` |
| `recorded_players` | 本地图有效、唯一的选手统计数量 |
| `expected_players` | 本版覆盖标准 5v5，固定为 10 |

`recorded` 要求双方各五名有效唯一选手，且不存在同一人同时代表双方等身份冲突。达到十条记录不证明每个可选指标均已采集，也不表示时间线完整。

### 单场数据包的一致性

`MatchData` 包含 `match`、`games` 和 `result_consistency`。检查规则按以下顺序执行：

1. 双方大场分数必须是已知非负整数，且存在已收录地图；否则为 `insufficient_data`。
2. 统计每队的已知地图胜方数量。任一队数量超过其大场分数，为 `conflicting`。
3. 若全部已收录地图都有已知胜方，且双方数量均等于其大场分数，为 `consistent`。
4. 其他情况为 `insufficient_data`，例如只收录了部分地图。

该字段只表达上述记录间关系，不认证官方规则或总体准确性。使用地图胜率时应识别 `conflicting` 的比赛；保留原始两层记录并说明差异，不能自行修正比分。

## 5. 选手统计

`PlayerGameStats`：

| 字段 | 含义 |
|---|---|
| `game_id` | 统计所属地图局 |
| `team` | 该局实际代表的队伍 |
| `player` | 选手引用及目录位置；不证明该局实际职责 |
| `metrics` | 整局指标 |
| `hero_stats` | 该局该选手的英雄明细集合 |

唯一键为 `(game_id, team.id, player.id)`。合作方可自行分配本地行 ID；接口不提供会随重新导入改变的统计存储行 ID。

### 整局 `metrics`

所有字段均为非负整数或 `null`。

| 字段 | 含义 | 不能解释成 |
|---|---|---|
| `eliminations` | 记分板淘汰数 | 独占击杀、最后一击 |
| `assists` | 记分板助攻数 | 每个淘汰都另计一次助攻 |
| `deaths` | 记分板死亡数 | 只有击杀信息中可识别的死亡 |
| `damage` | 整局伤害量 | 某英雄伤害、有效伤害或赢团贡献 |
| `healing` | 整局治疗量 | 某英雄治疗、有效治疗 |
| `damage_mitigated` | 整局伤害减免量 | 受到伤害或生命值 |
| `final_blows` | 有独立有效证据的整局最后一击次数 | `eliminations` 或未采集时的默认零 |
| `ultimates_used` | 有完整证据的整局终极技能使用次数 | 只保留部分英雄后的次数之和 |

核心记分板指标在有效记录中可为零。对可选指标，源默认值、数据格式编号或“存在某条英雄记录”均不足以单独证明整局指标完整；没有足够证据时返回 `null`。

### 英雄明细

结构为 `{"status":"recorded","items":[{"hero":...,"metrics":...}]}`，或 `{"status":"not_recorded","items":[]}`。

| 英雄指标 | 类型 | 含义 |
|---|---|---|
| `usage_seconds` | integer / null | 已记录使用秒数 |
| `usage_percentage` | number / null | 占该选手本局已识别英雄时间的百分比（0–100） |
| `final_blows` | integer / null | 已归属该英雄的最后一击 |
| `death_events` | integer / null | 去重后的英雄归属死亡事件数，可包含独立 death 事件 |
| `ultimate_ready_events` | integer / null | 终极技能就绪事件数 |
| `ultimates_used` | integer / null | 已归属该英雄的终极技能使用事件数 |
| `average_ultimate_charge_seconds` | number / null | 源汇总记录的充能区间均值，单位秒 |

当前源汇总会过滤使用时间不超过 30 秒的英雄；因此返回英雄项可能不是完整英雄池，百分比之和可能小于 100。不要重新归一化后声称它表示整局真实占比，也不要把这些使用秒数之和自动当成整局时长。

`average_ultimate_charge_seconds` 的边界可能来自选角、换英雄、上次使用或回合起点，它不是严格排除暂停、保留能量、漏事件等因素后的机制充能效率。跨样本解释需使用相同记录口径。

本版不提供英雄级伤害、治疗、淘汰或“英雄胜率”。整局记分板与英雄明细不能直接一对多 JOIN 后重复求和，也不能按使用时长分摊后伪装成已采集数据。

## 6. 覆盖信息

`/competitions/{competition_id}/coverage` 可按 `stage_id` 缩小范围。

| 字段 | 含义 |
|---|---|
| `competition_id`, `stage_id` | 本次计数的赛事与可选阶段 |
| `matches`, `games` | 已收录系列赛、地图局数量 |
| `latest_match_date` | 已收录比赛的最晚日期；没有比赛则 null |
| `player_stats.recorded_games` | 双方各五条有效唯一统计的地图数 |
| `player_stats.partial_games` | 有统计但记录结构不完整的地图数 |
| `player_stats.missing_games` | 无统计地图数 |
| `player_stats.recorded_rows` | 有效选手地图统计行数 |
| `duration.recorded_games`, `duration.missing_games` | 有/无有效地图时长的数量 |
| `hero_stats.games_with_records` | 有可用英雄明细的地图数 |
| `hero_stats.player_game_records_with_hero_stats` | 有英雄明细的选手地图统计数量，不是英雄条目总数 |
| `bans.total_team_slots` | 地图数 × 2 |
| `bans.recorded_team_slots` | 有 Ban 记录的队伍地图槽位数，不是“任一队有 Ban”的地图数 |

没有比赛的有效赛事仍返回各项计数为 0，但这只表示没有收录记录，不能推断该赛事没有举办或官方没有比赛。

## 7. 赛程

每项含 `competition`、`scheduled_at`、`team1`、`team2`。

- `competition.id` 和队伍 `id` 只在存在唯一可靠本地匹配时提供。
- 有来源名称但未匹配时保留名称及 `id=null`；TBD/TBA/BYE 等未知队伍用整个队伍对象 `null`。
- 不创建临时本地队伍、伪造比赛 ID 或用对阵名称加日期猜测结果库归属。
- 本版赛程没有稳定单条资源 ID，客户端整体替换赛程列表；调期不能被解释为一场新的比赛。
- 当前来源仅给出有限的近期赛事集合，不承诺完整官方赛程、历史赛程、直播比分或取消状态。

响应中的 `freshness` 是这份赛程提示的读取时效信息，不能套用于赛事数据库或其他响应。

## 8. 常用计算口径

以下为消费端的参考计算，不增加分析接口，也不承诺它们等于官方排名规则。

| 计算 | 规则 |
|---|---|
| 已收录系列赛胜率 | 胜场 / 有已确认胜负的系列赛数，同时展示胜场和样本数 |
| 已收录地图胜率 | 胜图 / 有已确认胜负的地图数，不混入系列赛计数 |
| 每十分钟伤害 | `600 × 同批有效样本伤害总和 / 同批 duration_seconds 总和` |
| 每十分钟淘汰/死亡 | 同上，替换分子；不能平均每局比率代替按时长加权 |
| 队伍效力期间数据 | 使用每条选手地图统计的 `team.id`，不把历史全部归到最后一支队伍 |
| 已收录参赛图数 | 按 `game_id` 去重；关联英雄明细后不重复计数 |

计算每十分钟指标时，必须同时排除时长未知或指标未知的样本，分子分母使用同一批数据。默认报告覆盖了多少图、排除了多少图。筛选到不足样本时不输出无依据的强弱结论。
