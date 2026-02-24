# 赛季选手数据总览表上传及可视化系统改造计划

## 1. 需求分析
用户希望改变主要数据来源，不再依赖地图局统计，而是通过每赛季上传一张“赛季选手数据总览表”来更新数据。
- **新数据源**: 赛季选手数据总览表 (Excel/CSV)。
- **更新机制**: 按赛季上传，覆盖更新。
- **数据管理**: 在数据管理首页增加上传入口。
- **可视化**: “队伍/选手散点图”的数据源改为这张新表。
- **旧数据**: 原有的选手数据表暂时封存。

## 2. 数据库设计
新建模型 `SeasonPlayerStat` (season_player_stats 表)，用于存储赛季总览数据。

### 字段设计
| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| id | Integer | 主键 |
| seasonId | Integer | 关联赛季ID |
| playerId | Integer | 关联选手ID (尝试匹配) |
| teamId | Integer | 关联队伍ID (尝试匹配) |
| playerName | String | 选手名称 (快照) |
| teamName | String | 队伍名称 (快照) |
| role | String | 职责 (Tank, DPS, Support) |
| elims | Integer | 消灭数 |
| assists | Integer | 助攻数 |
| deaths | Integer | 死亡数 |
| damage | Integer | 伤害量 |
| healing | Integer | 治疗量 |
| mitigation | Integer | 抵挡量 |
| gameTime | Float | 游戏时长 (分钟) |
| kd | Float | K/D |
| kad | Float | KA/D |
| elimsPerMin | Float | 分均消灭 |
| assistsPerMin | Float | 分均助攻 |
| deathsPerMin | Float | 分均死亡 |
| damagePerMin | Float | 分均伤害 |
| mitigationPerMin | Float | 分均抵挡 |
| healingPerMin | Float | 分均治疗 |

## 3. 后端开发
### 3.1 依赖安装
- 安装 `multer` (文件上传) 和 `xlsx` (Excel解析)。

### 3.2 Model & Controller
- 创建 `backend/models/SeasonPlayerStat.js`。
- 更新 `backend/database/index.js` 注册模型关联。
- 创建 `backend/controllers/SeasonStatController.js`:
    - `uploadSeasonStats`: 处理文件上传，解析Excel，覆盖更新指定赛季数据。
    - `getSeasonStats`: 获取指定赛季的数据。

### 3.3 API 路由
- 创建 `backend/routes/season-stats.js`。
- 在 `backend/routes/api.js` 中注册 `/season-stats` 路由。

## 4. 前端开发
### 4.1 数据管理页面 (DataManage)
- 新增组件 `src/views/data-manage/components/SeasonStatsUpload.vue`:
    - 包含赛季选择器和文件上传控件。
    - 调用上传API。
- 在 `DataManage.vue` 中集成该组件，新增“赛季数据导入”标签页。

### 4.2 可视化图表 (Visualize)
- 修改 `PlayerStatsChart.vue`:
    - 数据源改为调用 `getSeasonPlayerStats`。
    - 适配新数据结构 (使用 `xxxPerMin` 字段)。
- 修改 `TeamStatsChart.vue`:
    - 数据源改为调用 `getSeasonPlayerStats`。
    - 前端聚合选手数据计算队伍总数据 (总伤害、总时长、KD等)。

## 5. 验证计划
- 上传测试 Excel 文件，检查数据库是否正确写入。
- 检查数据管理页面是否显示上传成功。
- 检查可视化页面的散点图是否正确显示新数据。
