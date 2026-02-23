# 可视化页面样式规范文档 (Style Guide)

## 1. 配色系统 (Color Palette)

### 主色调 (Primary)
- **Primary Orange**: `#FF9E0F` (主要品牌色，用于高亮、按钮、图标)
- **Primary Gradient**: `linear-gradient(135deg, #FF9E0F 0%, #FF6A00 100%)` (用于标题背景、强调元素)

### 辅助色 (Secondary)
- **Blue**: `#409EFF` (信息、链接)
- **Green**: `#67C23A` (成功、正向指标)
- **Red**: `#F56C6C` (警告、负向指标)

### 中性色 (Neutrals)
- **Background**: `#F5F7FA` (页面背景)
- **Card Background**: `#FFFFFF` (卡片背景)
- **Text Primary**: `#303133` (主要文字)
- **Text Secondary**: `#606266` (次要文字)
- **Text Placeholder**: `#909399` (占位符、辅助信息)
- **Border**: `#EBEEF5` (边框、分割线)

## 2. 字体排版 (Typography)

- **Font Family**: `'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif`
- **Page Title**: 20px, ExtraBold (800)
- **Card Title**: 18px, Bold (700), White (on gradient)
- **Body Text**: 14px, Regular (400)
- **Small Text**: 12px, Regular (400)

## 3. 布局与间距 (Layout & Spacing)

### 网格系统 (Grid)
- **Container Max Width**: 1920px
- **Columns**: 12
- **Gutter**: 24px

### 间距 (Spacing)
- **Page Padding**: 32px (Desktop), 16px (Mobile)
- **Card Padding**: 24px
- **Section Gap**: 24px

## 4. 组件样式 (Component Styles)

### 卡片 (Card)
- **Border Radius**: 16px
- **Shadow**: `0 4px 20px rgba(0, 0, 0, 0.05)`
- **Hover Shadow**: `0 8px 30px rgba(255, 158, 15, 0.15)`
- **Transition**: `all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)`

### 斜切角标题 (Slanted Title)
- **Height**: 56px
- **Background**: Primary Gradient
- **Shape**: Right side slanted cut (Polygon)
- **Text**: White, 18px Bold

### 图表 (Charts)
- **Tooltip**: White background, Soft shadow, Orange highlight for values.
- **Axis Labels**: Inter font, Grey (#909399).
- **Grid Lines**: Dashed, Light Grey (#EBEEF5).
