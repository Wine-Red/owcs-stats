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
