# Liquipedia 赛季阵容自动配置

入口位于赛季可视化配置、赛季-队伍关联和赛季-队伍-选手关联页面。先保存赛季可视化配置中的 Liquipedia 赛事 URL，然后点击「从 Liquipedia 配置阵容」，检查预览并应用已匹配关联。

## 手动补充与新建

预览窗口仅保留一个「手动补充关联」入口，无需等待 Liquipedia 读取成功，可统一选择队伍和选手。

展开队伍后可点击「添加选手」，自动带入匹配成功的队伍；选手旁的 × 可从本次匹配移除该选手，「恢复移除」可撤销。移除不删除已保存关系。应用请求的 `excludedPlayers` 使用队伍链接、选手链接与显示名称组成的 JSON 字符串，由服务端对照原始快照验证，不能传入任意数据库身份。

- 可以选择任意已有队伍、批量选择已有选手，或新建队伍/选手；也可以只添加队伍关联，稍后再补充选手。
- 新队伍填写名称（简称）与地区；新选手填写游戏 ID 与位置。新建内容在点击「保存手工关联」前仅为草稿，取消不写入。
- 同名选手通过位置、数据库编号及本赛季所属队伍区分。明确选择的 ID 可用于手动处理自动匹配的歧义；跨队选择会显示提示，保存时保留原队关联。
- 新建时检查已有名称，避免误建重复记录；队伍还会检查已登记的别名。同名选手应改为选择已有记录。
- 队伍/选手新建与所有关联在一个事务内保存，失败一并回滚。新选手标记为手工身份，关系记为 `manual` 来源。对已有记录重复保存不会重复创建关联，也不会覆盖其他来源。
- 保存后刷新基础数据、关联列表与自动匹配预览。手工保存独立生效；自动匹配仍保持保守规则，因此选择某个重名选手后，源页面对应行仍可能显示「自动跳过」，不影响已经保存的手工关系。

接口：`POST /api/seasons/:id/manual-roster`，示例请求：

```json
{
  "team": { "id": 1 },
  "players": [
    { "id": 12 },
    { "new": { "name": "NewPlayer", "role": "tank" } }
  ]
}
```

新建队伍时使用 `"team": { "new": { "name": "NEW", "region": "欧洲" } }`。每次最多添加 100 位选手。

## 匹配与写入规则

队伍卡片默认收起，桌面每行四个。「排除匹配」会将整队及全部选手移出本次应用范围，数量同步更新；「恢复全部」可撤销排除。排除不会删除数据库已有关系。重新预览保留仍属于同一来源页的排除项，关闭后重新打开则重置。应用请求的 `excludedTeamLinks` 由服务端校验并用于过滤整队写入。

- 仅读取指定赛事页面 `Participants` 下的参赛阵容卡片。支持已验证的 `team-participant-card` 格式；无法识别的页面会报错，不会退回抓取队伍主页的当前阵容。
- 通过同一队伍的 Liquipedia 链接，将卡片全称与页面的 `data-team-shortname` 或移动端简称关联。存在多个不同简称时跳过；没有简称时仅尝试卡片显示名称的精确匹配。不会猜测简称、使用模糊搜索或自动添加队伍别名。
- 选手使用阵容内显示的 ID，例如 Leave，而非链接页面名 Huang Xin。仅忽略大小写、首尾空白和连续空白；保留标点和其他字符。数据库的 `externalId` 来自 MatchWeb，不能当作 Liquipedia ID。
- 教练、经理、分析师等工作人员被排除。页面明确列出的替补、DNP 和赛事阵容中的其他选手可参与匹配；缺少可识别身份或角色的成员会提示并跳过。
- 缺失、同名多记录、明确的位置不一致、同赛季其他队伍关联，以及源页面的跨队或多身份冲突都会跳过并给出原因。Flex 不用于位置冲突判断。自动匹配不会选择重名候选，也不会自行创建 Team 或 Player；新建必须通过上方独立的手工表单明确保存。
- 应用操作只添加 `SeasonTeam` / `SeasonTeamPlayer` 及 `liquipedia` 来源；保留手工、比赛与已有阵容证据，不修改选手角色、加入/退出日期，不删除页面本次未出现的关系。现有「移除手工来源」仍仅移除手工/旧数据来源。
- 写入使用单个事务，重复应用不重复创建。客户端只能提交预览令牌；服务端在事务中重新检查赛事 URL、数据库身份和关联冲突。变化后返回 409，要求重新预览。

## 接口与运行条件

- `POST /api/seasons/:id/liquipedia-roster/preview`：读取已保存的 `visualize_season_<id>.liquipediaTournamentUrl`，返回匹配详情、未匹配原因、页面版本、获取时间和预览令牌，不写入数据库。
- `POST /api/seasons/:id/liquipedia-roster/apply`：请求体 `{ "previewToken": "..." }`，返回新增关联及来源数量。
- 两个接口通过现有受保护管理 API 使用；公共只读 API 不允许 POST。静态导出站点没有管理入口。
- 复用 `LiquipediaClient` 固定 Overwatch MediaWiki API 地址、User-Agent、gzip、超时和共享请求间隔。页面缓存 5 分钟，预览有效期 15 分钟，应用的是预览中的赛事快照。缓存和预览存于当前服务进程；重启或请求落到另一进程后须重新预览。
- 沿用现有成员来源表，需要部署包含 `membershipEvidenceMigration` 的正常数据库初始化版本；本功能没有新增迁移。

## 验证资料

`backend/tests/fixtures/liquipedia-roster/` 包含两个真实赛事页面的精简 HTML 结构，保留来源、版本和许可说明。解析/匹配测试覆盖阵容、简称、同名冲突、缺失记录及未知格式；服务测试使用事务感知的 ORM 替身验证写入、回滚、重试、过期及数据变化，不连接业务数据库。

运行：

```sh
node --test backend/tests/liquipedia-roster.test.js backend/tests/liquipedia-roster-service.test.js
node --test backend/tests/manual-season-roster.test.js
```

## English

Team cards start collapsed, with four columns on desktop and a single manual-entry button. Excluding a team omits it and all its players from this import; restore all undoes exclusions. Existing database relations are retained. The backend validates excluded team links against the saved preview before writing.

Expanded cards also offer an Add player shortcut with the matched team preselected, individual player exclusion buttons and a restore action. Individual exclusions affect only this import and are validated against the original server snapshot before applying; saved memberships are retained.

Save the season's Liquipedia tournament URL, open **Import roster from Liquipedia**, review the matches, then apply. Only existing database teams and players can be linked. Team short names are joined through identical wiki links; player matching uses the displayed roster ID, with case and whitespace normalization only. Missing identities, duplicate names, explicit position mismatches and same-season team conflicts are skipped with explicit reasons. Flex does not enforce a position. Staff are excluded; recognized tournament roster players, including substitutes and DNP entries, are considered.

Imports add `liquipedia` evidence without replacing manual or match evidence or deleting old memberships. Apply is transactional and idempotent, accepts only a server-issued preview token, and revalidates database decisions. Page snapshots are cached for five minutes and previews expire after fifteen minutes. Unsupported markup fails closed. Existing membership-evidence migrations must already be installed. In-memory previews are process-local and must be regenerated after a restart or when routed to another process.

**Manual additions:** The preview also offers an independent manual roster editor, available even when Liquipedia fails. Select existing teams/players by database ID or draft new records (team name/region, player name/position). Saving creates all new identities and memberships in one transaction; cancelling writes nothing. Existing-name and team-alias checks prevent accidental duplicates. Relations receive `manual` evidence and new players receive manual identity origin. Cross-team selections display existing team context and preserve previous relations. After saving, catalogs, membership lists and the automatic preview refresh. Conservative automatic matching can still skip an ambiguous source name even though its manually selected membership is already saved.
