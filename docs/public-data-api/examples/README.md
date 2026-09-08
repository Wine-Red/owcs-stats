# 响应示例

这些文件是新契约的响应样例，不是对已部署新 API 的调用结果。

| 文件 | 来源 |
|---|---|
| [match.json](match.json) | 2026-09-09 生产库只读审计中的比赛 5445（AUS 对 MEX），投影成新字段 |
| [game.json](game.json) | 该比赛地图局 27301（尼泊尔）；时长从分钟换算为 599 秒 |
| [player-stats.json](player-stats.json) | 地图局 27301 的全部十条记分板记录；可选指标按新缺失规则投影 |
| [match-data.json](match-data.json) | 比赛 5445 的全部五张地图、五十条选手统计；补充查询与原样本在独立只读事务中取得，经一致性核对 |
| [empty-matches.json](empty-matches.json) | 合成边界样例：合法筛选下没有比赛 |
| [unknown-statistics.json](unknown-statistics.json) | 合成边界样例：指标未知；不是对示例选手真实表现的描述 |
| [error.json](error.json) | 合成错误响应 |

生产审计时没有英雄统计记录或时间线记录，因此不制作看似真实的英雄统计示例。`final_blows` 与 `ultimates_used` 的默认零没有可用采集证据，样例使用 `null`。

比赛 5445 的大场记录为 AUS 3:2 MEX，但五张地图记录的胜方合计为 AUS 4:1 MEX。样例保留两层数据，`match-data.json` 使用 `result_consistency=conflicting`，不把它伪装成一致的标准比赛。地图局 27303 的双方整数成绩均为 81，也不能据此抹去单独记录的地图胜方。

样例只保留公开赛事字段。内部表名、来源 ID、任务信息、数据库账号、抓取配置和投票内容不在样例中。[manifest.json](manifest.json) 记录每个样例应匹配的 Schema，供校验脚本使用。
