**比赛同步失败隔离 / Independent match sync retries**

启动时现有 `sequelize.sync()` 会增加 `external_match_inbox`，不清空比赛数据。
每个 Matchweb ID 保存最新期望状态、来源时间、处理状态、尝试次数、错误和下次尝试时间。
同一比赛较新版本会替代过期的待处理操作；已应用记录保留版本水位。

抓取整页和保存抓取游标在同一事务内完成。单场业务数据与处理确认也在同一事务内完成。
HTTP 详情请求在事务外执行；单场失败回滚后，用独立事务记录重试。
退避从 30 秒开始，最多一小时，由现有五分钟调度触发到期检查。
每轮默认最多抓取 100 页、应用 200 场；剩余记录留待后续轮次，其他正常记录可继续处理。

- `external_match_capture_cursor_v3`：已经持久化收到的变更位置，首次从旧游标初始化。
- `external_match_sync_cursor_v2`：已完整应用的位置，只有无待处理记录时才推进，供回滚版本安全重读。
- `latest_match_sync_updates`：包含 `capturedThrough`、`appliedThrough`、`pendingCount`、`failedCount`、`failures`、`captureError`、`fullyApplied`。

概览页面显示等待数、失败原因和下次重试时间。存在失败或抓取未完成时不会提示全部完成。
仅来源 GET 明确返回 404 才应用删除；其他错误继续重试。如果详情已比队列版本更新，则转为应用新状态。
抓取失败仍可处理之前保存的工作。有待处理记录时暂停全局孤立选手清理。
原有 `backend/scripts/resync-external-match.js <id>` 会通过队列执行定向重同步，不能越过较新版本。

回滚时保留新增表和两个游标；旧程序使用的游标不会越过待处理数据。不要手工把抓取游标复制到旧游标。
单元测试采用事务感知的 ORM 替身，覆盖回滚、进程重启后继续、删除重建、来源失联和升级游标。
`backend/scripts/verify-external-match-inbox-mysql.js` 提供显式启用的集成验证，要求独立的 `owcs_sync_verification` 数据库与 `OWCS_ISOLATED_MYSQL=1`，不可连接生产库。2026-09-08 已在与线上同版本的 MySQL 8.0.46 临时容器中验证启动建表、并发应用、确认失败回滚、重试及一场真实三局比赛入库。来源 API 和地图目录只读，业务写入均在临时库内完成。

**English**

The existing startup schema sync creates the additive `external_match_inbox` table. One row per external match stores the latest desired source version, pending/applied state, retry count, error and next attempt. Applied rows retain their version watermark. Capturing a page and advancing the capture cursor is atomic. Each match mutation and its acknowledgment is atomic; HTTP reads happen outside the transaction. Failures roll back and record exponential backoff separately (30 seconds to one hour, checked by the existing five-minute scheduler).

The capture cursor `external_match_capture_cursor_v3` starts from the legacy applied cursor `external_match_sync_cursor_v2`. Only a fully drained inbox advances the latter, so rolling back the application cannot skip unfinished work. Keep both cursors and the additive table during rollback. Never copy the capture cursor into the applied cursor manually.

Runs capture up to 100 pages and apply up to 200 due matches. Remaining work persists. Only a source 404 confirms deletion; newer live detail supersedes older queued state. Pending work can continue through a feed outage. Global orphan cleanup waits until the feed is caught up and the inbox is drained. The dashboard exposes pending failures and retry times. The targeted resync CLI also uses the inbox.

The opt-in `backend/scripts/verify-external-match-inbox-mysql.js` requires a disposable `owcs_sync_verification` database and `OWCS_ISOLATED_MYSQL=1`. On 2026-09-08 it passed startup schema creation, concurrent application, acknowledgment rollback, retry and a real three-map match import against disposable MySQL 8.0.46, matching production's server version. Source APIs were read-only; all writes were isolated from production data.
