# OWCS Stats

OWCS 赛事数据管理与可视化平台。

## ✨ 核心功能

- **可视化**：战队数据对比、选手排行、雷达图分析、图表导出。
- **数据管理**：赛季/比赛管理、Excel 批量导入、AI 智能数据归一化。

## 🛠 技术栈

- **前端**：Vue 3, Vite, Element Plus, ECharts, Vuex
- **后端**：Node.js, Express, MySQL (Sequelize)

## 🚀 快速开始

### 后端
```bash
cd backend
npm install
# 配置 .env (参考: PORT=3000, DB_HOST=localhost, DB_USER=root, DB_NAME=owcs_stats)
node app.js
```

### 前端
```bash
npm install
npm run dev
```
访问：`http://localhost:5173`

## MatchWeb 时间线同步

MatchWeb schema v3 是比赛与地图局的权威来源。每张地图的
`rounds[].timeline` 会原样镜像到 `map_game_timelines.payload`，同时保存摘要、
修订号、Studio 任务 ID 和源更新时间，便于从任何聚合数字回溯原始事件。

同步聚合层以 MatchWeb `playerId` 作为选手身份，以分析器稳定英雄 ID 作为英雄
身份，从时间线生成地图局选手的英雄使用时长/占比、大招就绪与释放、平均充能
时间、最后一击和死亡明细。旧数据已有的伤害、治疗、承伤等非时间线指标继续
保留。相同地图名可以在一场比赛中重复出现，地图局通过 MatchWeb 的零基
`roundIndex` 对齐，不再用地图名当唯一键。

后端同步客户端同时兼容 schema v2/v3；v2 比赛继续使用旧英雄统计，v3 有时间线
的地图局优先由原始时间线聚合。前端地图局列表只返回时间线元数据，单局详情才
返回完整 JSON，避免列表接口携带大对象。

## Umami 配置

项目已支持接入自建 Umami，用于公共可视化页面的访问统计和关键行为分析。

默认优先读取可提交配置文件：

- `src/config/analytics.js`

当前仓库内的配置项为：

```js
export const analyticsConfig = {
  umamiScriptUrl: 'https://umami.example.com/script.js',
  umamiWebsiteId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  umamiShareUrl: 'https://umami.example.com/share/xxxxxxxx',
};
```

- `umamiScriptUrl`：Umami tracker 的完整脚本地址。
- `umamiWebsiteId`：Umami 后台对应网站的 Website ID。
- `umamiShareUrl`：项目内 `访问统计` 页面使用的共享看板链接。
- 如果你仍然想走环境变量，也可以继续使用 `VITE_UMAMI_SCRIPT_URL`、`VITE_UMAMI_WEBSITE_ID`、`VITE_UMAMI_SHARE_URL`，但优先级低于配置文件。
- 本项目当前保留百度统计并行，不影响 Umami 接入。
