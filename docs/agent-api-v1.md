# OWCS Stats Agent API v1

`/agent/v1` 是供问答机器人使用的只读赛事接口，与网站后台的 `/api` 管理接口隔离。

## 访问方式

接口无需鉴权，问答机器人可以直接发起请求。

接口只允许 `GET` 和 `HEAD`。其他方法返回 `405 METHOD_NOT_ALLOWED`。

## 通用响应

```json
{
  "api_version": "v1",
  "schema_version": "1.0.0",
  "request_id": "1bd33fb3-f639-4ca2-9a16-6363e43acdce",
  "data": {}
}
```

列表接口附带游标分页：

```json
{
  "pagination": {
    "count": 50,
    "limit": 50,
    "next_cursor": "NTA"
  }
}
```

- 默认 `limit=50`，最大 `200`。
- 下一页原样传入 `cursor=<next_cursor>`。
- `request_id` 同时写入响应头 `x-request-id`；调用方可以用 `x-request-id` 传入自己的追踪 ID。
- 同一 `v1` 允许新增可选字段；字段删除、重命名或含义变化需要升级 API 版本。

错误格式：

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "season_id must be a positive integer",
    "field": "season_id"
  }
}
```

## 数据边界

- 赛季只公开 `id`、`name`、`status`，不公开 `Season.stage`。
- 队伍只公开 `id`、`name`，不公开地区和 Logo。
- 阵容表示选手与“赛季 + 队伍”的关联，不表达加入、离开、首发或实际登场时间。
- 比赛不公开内部更新时间。
- 地图局只能通过所属比赛访问。
- `kills`、`deaths`、`assists`、`damage`、`healing`、`mitigation` 在所有赛季可靠存在；其中 `0` 是真实零值。
- `ults_used`、`final_blows` 和全部英雄统计属于可选数据。不可用时返回 `null` 或空数组，并附带可用性状态。
- Ban 为空、地图时长为空或为 `0` 都可能表示未采集，不能解释成“没有 Ban”或“地图持续 0 秒”。

可用性状态：

| 状态 | 含义 |
|---|---|
| `available` | 数据能力存在，零值可以解释为真实零 |
| `partial` | 查询范围内只有部分记录支持 |
| `unavailable` | 当前数据版本不提供 |
| `unknown` | 无法确认是否采集 |

地图事实使用 `recorded` 和 `unknown`：

```json
{
  "bans": {
    "team1": { "status": "unknown", "hero": null },
    "team2": {
      "status": "recorded",
      "hero": { "id": 7, "name": "温斯顿" }
    }
  },
  "duration": { "status": "unknown", "seconds": null }
}
```

## 接口清单

### 元数据

```http
GET /agent/v1/meta
```

返回版本以及核心、可选数据边界。

### 赛季与阶段

```http
GET /agent/v1/seasons
GET /agent/v1/seasons?status=completed
GET /agent/v1/seasons/{season_id}/stages
```

阶段按开始比赛顺序返回：

```json
{
  "id": 31,
  "season_id": 13,
  "name": "常规赛",
  "sequence": 1,
  "start_match_id": 201,
  "end_match_id": 245,
  "match_count": 45
}
```

`start_match_id` 属于当前阶段；阶段结束于下一阶段开始比赛之前。

### 队伍、选手与阵容

```http
GET /agent/v1/teams?q=WBG
GET /agent/v1/teams?season_id=13
GET /agent/v1/players?q=Leave
GET /agent/v1/players?season_id=13&team_id=8&role=damage
GET /agent/v1/rosters?season_id=13&team_id=8
GET /agent/v1/rosters?season_id=13&player_id=21
```

`rosters` 要求 `season_id`，并且 `team_id`、`player_id` 至少提供一个。

阵容记录：

```json
{
  "season": { "id": 13, "name": "OWCS 2026 China Stage 1" },
  "team": { "id": 8, "name": "Weibo Gaming" },
  "player": { "id": 21, "name": "Leave", "role": "damage" }
}
```

### 地图与英雄字典

```http
GET /agent/v1/catalog/maps
GET /agent/v1/catalog/heroes
GET /agent/v1/catalog/heroes?role=support
```

### 已结束比赛

```http
GET /agent/v1/matches?season_id=13
GET /agent/v1/matches?season_id=13&stage_id=31
GET /agent/v1/matches?team_id=8
GET /agent/v1/matches?date_from=2026-08-01&date_to=2026-08-31
GET /agent/v1/matches/{match_id}
```

列表查询至少提供一个赛季、队伍或日期过滤条件。使用 `stage_id` 时必须同时提供 `season_id`。

单场比赛详情一次返回比赛、地图局和数据覆盖计数：

```json
{
  "match": {
    "id": 271,
    "season": { "id": 13, "name": "OWCS 2026 China Stage 1" },
    "stage": { "id": 31, "name": "季后赛" },
    "match_date": "2026-08-12",
    "bo_format": "BO5",
    "team1": { "id": 8, "name": "Weibo Gaming", "score": 3 },
    "team2": { "id": 15, "name": "Team CC", "score": 1 },
    "winner": { "id": 8, "name": "Weibo Gaming" }
  },
  "map_games": [],
  "coverage": {}
}
```

### Upcoming 比赛

```http
GET /agent/v1/upcoming-matches
```

Upcoming 来自 Liquipedia，内部 ID 仅做严格、唯一匹配；无法可靠匹配时返回 `null`，不会猜测：

```json
{
  "scheduled_at": "2026-08-15T10:00:00.000Z",
  "tournament_name": "OWCS 2026 China Stage 2",
  "season": null,
  "stage": null,
  "team1": { "id": 8, "name": "Weibo Gaming" },
  "team2": { "id": null, "name": "TBD" },
  "source": {
    "provider": "liquipedia",
    "url": "https://liquipedia.net/overwatch/..."
  }
}
```

响应包含 `source_status.cached`、`source_status.stale`。当上游刷新失败但服务中还有缓存时，会返回旧缓存并标记 `stale=true`。

### 地图局

```http
GET /agent/v1/matches/{match_id}/map-games
GET /agent/v1/matches/{match_id}/map-games/{map_game_id}
```

服务端验证地图局确实属于路径中的比赛，不能通过一场比赛的路径读取另一场比赛的数据。

```json
{
  "id": 994,
  "match_id": 271,
  "map": { "id": 5, "name": "国王大道", "mode": "攻击/护送" },
  "team1": { "id": 8, "name": "Weibo Gaming", "score": 3 },
  "team2": { "id": 15, "name": "Team CC", "score": 2 },
  "winner": { "id": 8, "name": "Weibo Gaming" },
  "bans": {
    "team1": { "status": "unknown", "hero": null },
    "team2": { "status": "unknown", "hero": null }
  },
  "duration": { "status": "recorded", "seconds": 842 },
  "availability": {
    "player_stats": "available",
    "ults_used": "unavailable",
    "final_blows": "unavailable",
    "player_hero_stats": "unavailable"
  }
}
```

### 选手单图数据

```http
GET /agent/v1/matches/{match_id}/map-games/{map_game_id}/player-stats
```

```json
{
  "availability": {
    "player_stats": "available",
    "ults_used": "unavailable",
    "final_blows": "unavailable",
    "player_hero_stats": "unavailable"
  },
  "data": [
    {
      "id": 9938,
      "player": { "id": 21, "name": "Leave", "role": "damage" },
      "team": { "id": 8, "name": "Weibo Gaming" },
      "metrics": {
        "kills": 25,
        "deaths": 6,
        "assists": 9,
        "damage": 18240,
        "healing": 0,
        "mitigation": 0,
        "ults_used": null,
        "final_blows": null
      }
    }
  ]
}
```

### 选手英雄数据

```http
GET /agent/v1/matches/{match_id}/map-games/{map_game_id}/player-stats/{player_stat_id}/hero-stats
```

无英雄数据时仍返回 `200`：

```json
{
  "availability": "unavailable",
  "data": []
}
```

`404` 只表示比赛、地图局或选手统计记录本身不存在，或者不属于路径中的父资源。

### 数据覆盖

```http
GET /agent/v1/matches/{match_id}/coverage
GET /agent/v1/coverage/seasons/{season_id}
```

比赛覆盖接口返回客观计数，不擅自判定是否“完整”：

```json
{
  "match_id": 271,
  "map_count": 5,
  "maps_with_player_stats": 5,
  "player_stat_rows": 50,
  "maps_with_hero_stats": 0,
  "player_hero_stat_rows": 0
}
```

赛季覆盖接口汇总可选能力为 `available`、`partial`、`unavailable` 或 `unknown`。
