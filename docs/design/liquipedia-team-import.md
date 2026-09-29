# 根据 Liquipedia 页面配置赛季队伍

2026-09-29 只读核查：生产库 60 支队伍中 54 支设置了主要 Liquipedia 页面，另有 6 支尚未设置；导入不可假设全覆盖。为让本地预览可真实试用，在确认队伍 ID 和名称同时相同后，把其中 52 条公开页面链接复制到本机 `localstats`，并先保存原值到 `.local/liquipedia-team-local-pages-backup-20260929.json`。生产库独有的 ZSG、SEJ 未在本地新建。实测 MediaWiki `action=parse` 的 Participants 卡片数：世界杯 2026 为 16，OWCS 第三阶段中国 8、韩国 9、EMEA 6、北美 5（仅代表核查时页面上已列出的队伍）。例如世界杯来源 `Saudi_Arabia` 经 MediaWiki 重定向到 `Team_Saudi_Arabia`，对应生产库已绑定该页的 `SAU`。显示名相同不构成身份依据。

入口设在「赛季-队伍关联」及「赛季可视化配置」。选择赛季后预览赛事页中的参赛队伍；按已绑定页面和 MediaWiki 重定向做唯一匹配，显示已有关联、待新增、未绑定及重复绑定的原因。管理员可排除本次不应用的队伍。赛事 URL 优先使用保存的赛季配置，已覆盖的规范赛季名可使用现有页面推导；表单有未保存 URL 时阻止应用。

应用使用现有身份写入锁和数据库事务，只调用 `ensureSeasonTeam`，为关系添加 `liquipedia` 来源与赛事页面键。不创建或改名队伍，不写 `season_team_players`，不删除手工、比赛或旧的来源。相同预览重试不会新增重复关系。赛季来源 URL、队伍页面绑定或匹配结果改变后，要求重新预览；应用使用本次预览保存的赛事页面快照。没有 Participants 队伍卡片时直接报错，不从不完整的赛程对阵中猜测完整参赛名单。

读取只走项目现有的 Liquipedia Overwatch MediaWiki API 客户端；解析结果缓存 5 分钟，预览 15 分钟有效。该客户端限速并设置项目 User-Agent，符合 [Liquipedia API 使用条款](https://liquipedia.net/api-terms-of-use)对 MediaWiki API 请求、缓存及归属的要求。展示来源标记为 Liquipedia（CC BY-SA）。

生产未执行批量配置。本地真实 MySQL 集成测试验证了页面重定向、同名不误配、排除、幂等、绑定变化拒绝以及选手阵容不变；静态测试使用仓库中的真实世界赛和地区赛 HTML 样本。本地预览接口对世界杯赛季识别 16 支、页面匹配 16 支，均为已有队伍关联。正式发布后需对目标赛季逐个预览，再应用匹配的队伍；未绑定页面的 6 支队伍需另行维护页面或手工关联。
