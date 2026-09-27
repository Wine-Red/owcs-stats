# 队伍 Liquipedia 页面

`teams.liquipediaUrl` 保存核实过的 Overwatch 队伍页面，允许为空。队伍管理可编辑并打开链接，公开队伍详情展示同一链接。旧客户端省略该字段时保留原值；明确传空值才清除。启动迁移仅补充缺少的列，不重建表。

## 已有队伍补充

2026-09-27 检查线上 59 支队伍：通过真实赛事参赛卡片、现有别名及同赛季选手阵容核对，再通过 MediaWiki `query` 验证页面存在、Teams 分类及重定向目标。53 支有有效独立页面。TCC 由用户确认对应 2024–2026 OWCS 的 `Team CC (Chinese orgless team)`，不是早期青训 Team CC，也不是名为 TCC 的教练。

其余 6 支的来源赛事虽已记录队伍，但独立页面仍为待创建链接，保留为空：DEG、NP（Naive Piggy）、KK（Kitsune Kage）、RTZ（ReturnZ）、SBAD（SuperBad）、1234。不以相似名称、阵容继承或其他俱乐部页面代替。

重复补充使用 `backend/scripts/backfill-team-liquipedia.js`，从 backend 目录运行：

```sh
node scripts/backfill-team-liquipedia.js --input /path/to/verified.json
node scripts/backfill-team-liquipedia.js --input /path/to/verified.json --apply --backup /path/to/new-backup.json
```

输入为 `{ "entries": [...] }`，每条含 `teamId`、`name`、`liquipediaUrl`、核实过的 `pageId` 及 `evidence`。输入必须先完成来源核验；应用脚本本身不联网重新核验。默认仅预览。应用锁定队伍记录，检查 ID/主名未变，拒绝覆盖冲突链接，在写入前保存备份，并在事务内只更新页面字段。重复运行无修改。

这次不增加定时抓取任务，也不改变队伍名称、同步别名、赛季关联或比赛记录。
