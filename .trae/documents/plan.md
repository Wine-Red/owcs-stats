# 地图局时长精度优化计划

本计划旨在将地图局（MapGame）的时长字段从整数（分钟）修改为浮点数（分钟，保留两位小数），以支持更精确的数据记录、管理和可视化统计。

## 1. 后端修改

### 1.1 数据库模型更新
- **文件**: `backend/models/MapGame.js`
- **变更**: 将 `duration` 字段的类型从 `DataTypes.INTEGER` 修改为 `DataTypes.FLOAT`。
- **目的**: 允许数据库存储小数形式的时长（如 10.5 分钟）。

### 1.2 控制器逻辑更新
- **文件**: `backend/controllers/MapGameController.js`
- **变更**: 在 `resolveImportData` 函数中，移除对 `duration` 的 `Math.round()` 取整操作。
- **目的**: 确保从 Excel 导入的精确时长数据能原样保存到数据库。

## 2. 前端修改

### 2.1 数据管理页面更新
- **文件**: `src/views/data-manage/DataManage.vue`
- **变更 1 (列表展示)**: 在地图局列表中，将时长列的显示格式化为保留两位小数（例如 `10.50 分钟`）。
- **变更 2 (编辑表单)**: 在编辑地图局的对话框中，将时长的 `<el-input-number>` 组件的 `step` 属性设置为 `0.01`（或 `0.1`），并设置 `precision` 为 2，以允许用户输入小数。

## 3. 验证与确认
- **Excel 导入**: 确认导入时，"X分Y秒" 能正确解析为浮点数（例如 "10分30秒" -> 10.5），且预览和提交时均保留该精度。
- **数据存储**: 确认存入数据库的 `duration` 字段为浮点数。
- **数据展示**: 确认管理列表显示精确时长。
- **可视化**: 确认图表统计（如每10分钟伤害）使用精确时长进行计算。

## 4. 执行步骤
1. 修改 `backend/models/MapGame.js`。
2. 修改 `backend/controllers/MapGameController.js`。
3. 修改 `src/views/data-manage/DataManage.vue`。
