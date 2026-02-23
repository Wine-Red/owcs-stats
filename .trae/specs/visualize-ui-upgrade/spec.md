# 可视化页面 UI/UX 升级规格说明书

## 为什么 (Why)
为了提升用户体验，使其更符合现代设计趋势，我们需要根据提供的设计稿对现有的可视化页面 (`Visualize.vue` 及其子组件) 进行全面的 UI/UX 美化和升级。

## 变更内容 (What Changes)
- **视觉风格**: 采用全新的配色方案（以橙色为主色调），圆角卡片设计，柔和阴影，以及更清晰的字体排版。
- **布局重构**: 
  - **移除** 全局概览数据卡片。
  - **移除** 横幅（Banner）区域。
  - **保留** 原有底栏 (Footer)。
  - 优化图表组件的容器布局，使其更具呼吸感。
  - 响应式适配 (1920px & 1366px)。
- **组件优化**:
  - `Visualize.vue`: 重构整体网格布局。
  - `HeroBanChart.vue`: 优化水平条形图样式，标题采用斜切角设计。
  - `MapPickChart.vue`: **保留** 原有横向条形图设计，仅优化视觉样式（颜色、字体），标题采用斜切角设计。
  - `TeamStatsChart.vue`: 优化散点图样式及容器，**不增加** 额外数据卡片，标题采用斜切角设计。
  - `PlayerStatsChart.vue`: **保留** 原有列表/表格设计，仅优化视觉样式（颜色、字体、间距），标题采用斜切角设计。
- **交互细节**: 添加悬停效果、过渡动画和加载状态。

## 影响范围 (Impact)
- **受影响文件**:
  - `src/views/visualize/Visualize.vue`
  - `src/views/visualize/components/HeroBanChart.vue`
  - `src/views/visualize/components/MapPickChart.vue`
  - `src/views/visualize/components/TeamStatsChart.vue`
  - `src/views/visualize/components/PlayerStatsChart.vue`
  - 可能涉及全局样式文件 (如 `src/styles/variables.scss` 或类似)

## 新增需求 (ADDED Requirements)
### 需求：斜切角标题 (Slanted Corner Titles)
所有图表卡片的标题区域需采用斜切角设计（参考原 Banner 设计元素），以增强视觉冲击力。
**样式细节**: 
- 橙色或渐变背景。
- **斜切效果**: 位于标题栏右侧，形状为从标题栏底部的某一点向右上方倾斜（或从左下角斜切到右侧中部，具体为右边缘呈现不规则切角）。
- 白色文字。

### 需求：视觉一致性
- 所有卡片统一圆角 (e.g., 12px/16px)。
- 统一阴影效果 (e.g., soft drop shadow)。
- 统一字体 (标题、正文、数字)。

## 修改需求 (MODIFIED Requirements)
### 需求：图表组件样式升级
- **HeroBanChart**: 保持水平条形图逻辑，调整颜色条（橙色渐变），优化标签和百分比显示。
- **MapPickChart**: 保持水平条形图逻辑，调整颜色条（橙色渐变），优化标签和百分比显示。
- **TeamStatsChart**: 保持散点图逻辑，优化图表背景、坐标轴颜色、数据点样式。
- **PlayerStatsChart**: 保持原有列表布局，仅调整配色、字体和间距，使其符合整体 UI 风格。

## 交付标准
- 视觉效果与设计稿高度一致。
- 数据加载正常，无功能退化。
- 响应式布局在不同分辨率下表现良好。
