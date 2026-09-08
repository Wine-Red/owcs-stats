# 合作方接入说明

适用版本：`1.0.0`。生产基础地址：`https://stats.owmini.xyz/data/v1`，公开读取无需登录或 API Key。

## 1. 最小接入流程

1. 阅读 [接口目录](README.md) 和 [数据字典](data-dictionary.md)，导入 [OpenAPI](openapi.yaml)。
2. 读取赛事、队伍、选手、地图、英雄目录，用 ID 建立关联。
3. 按赛事读取阶段、参赛队伍和名单。
4. 按条件读取比赛列表，逐页遍历到 `next_cursor=null`。
5. 需要详细统计时读取 `/matches/{match_id}/data`，获得一场内部一致的完整已收录数据包。
6. 用覆盖信息解释缺失，并保存响应 ETag 进行后续验证。

公开读取无需登录或 API Key。合作方接入不依赖指定 AI 平台、MCP 或模型供应商。

## 2. 典型请求

以下 ID 来自 2026-09-09 审计时的数据投影，仅用于示例；联调应从目录解析 ID。

```http
GET /data/v1/competitions?q=世界杯
GET /data/v1/competitions/24
GET /data/v1/competitions/24/stages
GET /data/v1/competitions/24/teams?limit=50
GET /data/v1/competitions/24/teams/53/players
GET /data/v1/competitions/24/coverage
GET /data/v1/matches?competition_id=24&team_id=53&opponent_id=65
GET /data/v1/matches/5445
GET /data/v1/matches/5445/games
GET /data/v1/matches/5445/games/27301/player-stats
GET /data/v1/matches/5445/data
```

完整响应可查看 [examples](examples/README.md)。赛事 24 当时没有内部阶段配置，因此阶段列表为空是合法情况。

## 3. 分页

基础目录、参赛队伍和比赛列表支持 `limit` / `cursor`。第一页不提供 `cursor`，后续保持原参数，把响应中的 `next_cursor` 原样传回。

```python
import requests

def read_all(origin, path, filters=None):
    # origin 使用 https://stats.owmini.xyz，不包含 /data/v1。
    params = {**(filters or {}), "limit": 100}
    with requests.Session() as session:
        while True:
            response = session.get(
                origin.rstrip("/") + "/data/v1" + path,
                params=params,
                timeout=30,
            )
            # 生产调用应按下节为 429/503 增加有上限的退避。
            response.raise_for_status()
            payload = response.json()
            yield from payload["data"]
            cursor = payload["pagination"]["next_cursor"]
            if cursor is None:
                return
            params["cursor"] = cursor
```

不能把第一页当作完整赛事数据集。名单、阶段、单场地图、地图统计及完整数据包不使用此分页函数。

分页使用确定排序与键集游标，但不冻结全库。如果记录在遍历期间被更正、删除或调整日期，跨页结果可能变化。需要准确镜像时周期性重新遍历，或等待未来专门的快照/变更交付协议。

## 4. 缓存与数据更正

保存 **完整请求键**（路径和参数）、JSON 正文及 `ETag`。再次请求同一资源时附 `If-None-Match`：

```http
GET /data/v1/matches/5445/data
If-None-Match: "<上一次返回的验证器>"
```

- 304：复用原正文；304 没有 JSON 正文。
- 200：以新正文整体替换对应缓存。
- 404：该资源可能已撤销或 ID 有误；在重新核对列表后清理镜像中的失效关系。
- 410：仅表示游标失效，重新遍历；不能据此删除赛事。
- 429：读取 `Retry-After`；503/网络异常采用有上限的指数退避，保留旧数据并标明未成功更新。

原样反复请求已失败的参数不是修复办法。不要把 HTML 登录页、上游报错或空响应当成合法空赛事列表。

本版普通接口要求缓存复用前重新验证。接口的 HTTP 响应时间不证明比赛数据刚更新；比赛采集和数据发布频率以正式运行说明为准。

## 5. 落库建议

| 对方本地对象 | 建议键 |
|---|---|
| 赛事、阶段、队伍、选手、地图、英雄、比赛、地图局 | 各自的公开 `id`，再加 API 数据集/环境命名空间 |
| 赛事参赛队伍 | `(competition_id, team_id)` |
| 赛事队伍名单 | `(competition_id, team_id, player_id)` |
| 选手地图统计 | `(game_id, team.id, player.id)` |
| 英雄明细 | 作为选手地图统计的子集合整体替换，避免为未映射英雄强造 ID |

保存原始整数与 `null`，不要入库时统一 `COALESCE(...,0)`。名称用于展示，ID 用于关联；同名选手必须保留独立记录。

处理 `/matches/{id}/data` 时，建议在对方本地事务中整体替换该场相关地图和统计。数据补录、更正或撤回后，旧地图/旧选手/旧英雄项应能被删除，不能只做永远追加的 upsert。

`/schedule` 不提供稳定单条 ID，整体替换这一集合即可；不能用“队伍名+时间”作为赛事结果库的永久主键。

## 6. 与可靠增量同步的区别

本版按需查询、条件读取与周期性核对适合初期合作。它**不保证**仅凭分页游标或 ETag 就能获得数据库的全部历史变更。

若合作方需要自动维护严格一致的长期镜像，后续交付协议必须单独包含：

1. 全量快照与同版本起始检查点。
2. 按已提交发布顺序排列的持久变更流，覆盖目录、名单、比赛及全部子数据。
3. 新增、修改、删除与身份纠正的明确语义。
4. 重复投递的幂等处理、断线重放、游标过期后的全量恢复。
5. 更新通知可选；通知失败仍能通过变更流补齐。

这些能力未出现在本版 OpenAPI 中，不能提前承诺已支持，也不能把内部同步队列当作合作方变更日志。

## 7. 用于分析或 Agent 的最小数据规则

合作方自行建设分析或问答能力。建议将以下规则放入其数据适配层或说明中：

- 先解析赛事和实体 ID，歧义时保留候选，不合并同名选手。
- 实际出场查统计；赛事名单只能证明名单归属。
- 读取完分页后再声称“该范围内全部”。
- 明确系列赛/地图局粒度，区分淘汰与最后一击。
- 引用结果时保留比赛和地图 ID、筛选范围、样本量及缺失情况。
- 不用空英雄明细、未知 Ban、缺失时长生成“没有使用”“没有禁用”等结论。
- 自由 SQL 分析整局记分板时，先处理一对多英雄关联的重复累计问题。
- 无法从数据得到的字段或结论明确说明缺失，不按名称、角色、比分或模型记忆填补。

## 8. 联调验收

上线前至少共同验证：

- 正式 URL 返回 JSON，HEAD 无正文，非读取方法返回 405。
- 一条真实比赛可完整走通赛事 → 比赛 → 地图局 → 选手 → 英雄明细。
- 父子不匹配返回 404；有效但没有数据的赛事返回合法空集合。
- 真实样例中的地图 27301 时长应为 599 秒，不是约 9.98 秒。
- 翻页不重复返回同一比赛，筛选条件变化不能复用旧游标。
- 一次数据包内部引用、比分侧位和统计唯一键一致。
- 比赛 5445 的大场 3:2 与已记录地图胜方合计 4:1 均保留，`result_consistency=conflicting`；不能为通过校验而篡改样例。
- 未记录英雄/最后一击/终极技能返回约定缺失值，不能返回伪造的真实零。
- 补录、撤销或英雄明细变化会改变相关数据包的 ETag。
- 来源异常时不把错误当空数据，旧赛程明确标为 stale。
- 响应只出现公开白名单字段，不含系统配置、源标识、日志、投票、访客或内部时间戳。
