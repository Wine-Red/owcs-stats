# OWCS Stats · Visualize 视觉焕新设计方向（design-refresh）

> 本文档是 `DESIGN.md` 的增量补充，定义本轮“全面美化”的视觉语言。所有约束以 `DESIGN.md` 为基线，本文只规定“新增/强化”的 OWCS 赛事美学。**不改变任何功能、数据口径与交互逻辑。**

## 0. 一句话方向

**「浅色基底上的 OWCS 演播室」**：白/浅灰承载数据，黑色承载权重，橙色渐变承载能量；用斜切几何、深色赛事横幅与 HUD 技术细节，营造守望先锋冠军系列赛（OWCS）的电竞转播质感。移动端优先。

## 1. 品牌基因（取自 OWCS 官方视觉）

来源：OWCS 徽章（`public/icons/OWCS.png`）与赛事转播包装：

- **六边形徽章 + 斜切翼形**：OWCS 标志是六边形 + 两侧斜切翼，几何语言是“硬切角、平行四边形、斜线”。
- **金橙渐变**：`#FF6A00 → #FF9E0F`（与项目现有 token 完全一致），辅以暖金高光 `#FFB84D`。
- **深岩黑**：徽章核心为深岩板色 `#1B2430` 系，用于横幅/深色数据面（不是纯黑）。
- **HUD 战术感**：守望先锋 UI 的细线框、角标、刻度、六边形网格纹理。
- **斜体速度感**：转播标题/比分大量使用斜体粗字重与斜切块面。

## 2. 强化后的 Token（在 `visualize-theme.css` 中扩展）

```css
:root {
  /* 现有保留 */
  --vis-primary: #ff9e0f;
  --vis-accent: #ff6a00;
  --vis-primary-gradient: linear-gradient(90deg, #ff6a00 0%, #ff9e0f 100%);

  /* 新增：OWCS 深色赛事面 */
  --vis-ink: #10151c;            /* 深岩黑底 */
  --vis-ink-2: #1b2430;          /* 深岩板 */
  --vis-ink-3: #26313f;          /* 深岩板亮面 */
  --vis-gold: #ffb84d;           /* 暖金高光（仅点缀） */
  --vis-on-ink: #f5f7fa;         /* 深底上的主文字 */
  --vis-on-ink-dim: rgba(245,247,250,.62);

  /* 斜切角 */
  --vis-slant: -8deg;            /* 标准斜切角（skew） */
  --vis-clip-notch: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px)); /* 对角切角卡 */
}
```

语义不变：胜方/主队 `#111`，次队/客队 `#ff6a00`；success `#28a745`、error `#dc3545`、live `#f56c6c`。**清除遗留蓝色 `#409EFF`。**

## 3. 五个核心视觉母题（全站统一，克制使用）

### M1 · 斜切标题条（Slant Bar）
- 章节标题左侧用 4px 宽、14~18px 高的渐变斜块（`transform: skewX(-8deg)` + `--vis-primary-gradient`）作为“赛事起跑灯”式锚点。
- 标题文字用 Orbitron/Oxanium + `font-style: italic` 或轻微 `skew`，字距略收。
- 已有 `SlantedTitle.vue` 统一收敛为该规范的唯一实现。

### M2 · 浅色赛事横幅（Arena Banner，2026-07 起替代深色版）
> 用户验收决定：全站保持浅色系，不使用深色头图。原深岩黑方案（`--vis-ink` 系 token）保留定义但不再被横幅消费。

- 页面级 hero（赛季横幅、比赛详情对阵头图）使用极浅暖橙渐变底：`linear-gradient(135deg, #ffffff 0%, #fffaf3 55%, #fff4e6 100%)`。
- 叠加 ≤0.04 透明度的深色斜线纹理，右下 6%~10% 透明度的橙色 radial 微光；水印装饰用浅橙/浅灰，opacity ≤ 0.06。
- 底部 2px `--vis-primary-gradient` 渐变线作为与内容的分界；横幅全宽贴边、无圆角、无 clip-path 斜切、与 tab 栏无缝（margin-bottom 0）。
- 横幅内文字：`#111` 主标题（Orbitron/Oxanium italic）、`#606266`/`#909399` 副信息、渐变橙强调数字；队名左黑右橙。
- 徽章/chip 浅底版：OWCS 徽章保留渐变橙底白字；tier/赛区用 `#f4f4f5` 底；ONGOING 浅绿底深绿字；控件用浅色 pill（轨道 `rgba(17,17,17,.05)`、激活白底橙字）。

### M3 · HUD 角标与细线
- 重点数据卡（雷达图、核心对位卡）允许加“战术角标”：两个对角 8~10px 的 L 形细线（border 或伪元素），颜色 `rgba(17,17,17,.18)` 或橙色。
- 分隔用 1px 细线 + 局部 24~40px 的渐变短线（渐变橙）代替整行实线。
- LIVE 状态：6px 圆点 + 2s 呼吸脉冲（opacity/scale），颜色 `--vis-live`，不动画位移。

### M4 · 斜切数据块（Slanted Stat）
- 大比分、排名、关键 KPI 数字：Oxanium、斜体、`font-weight 800~900`；数字后可跟 2~4px 的斜切渐变下划线。
- 比分胶囊/VS 徽章允许做成平行四边形（`skewX(-8deg)`，内部文字反向 skew 回正），白底黑边或深底橙边。
- 排名前三：渐变橙数字；其余 `#909399`。

### M5 · 轻量赛事纹理
- 页面底色 `#FAFAFA` 保持干净；仅 hero/横幅/footer 过渡区允许纹理。
- 卡片 hover：`translateY(-2px)` + 顶部出现 2px 渐变线（伪元素过渡），阴影保持 Level 2 以内。
- 不用厚阴影、不用重玻璃、不用彩色渐变铺满大卡片。

## 4. 组件应用规范

| 组件/页面 | 应用要点 |
| --- | --- |
| `TournamentBanner` | M2 全套：深岩底 + 纹理 + 光晕 + 斜切边缘；赛季 select/segment 用玻璃控件；标题 h1 38px italic |
| `SlantedTitle` | M1 唯一实现；提供 size/tone 变体，其他组件复用，不另造标题样式 |
| `Visualize` 总览 | tab 用标签型按钮（激活 = 深字 + 渐变下划线）；区块间距 24/32；移动端横向 scroll-snap |
| `RegularSeasonBoard` 积分榜 | 表头小字 11px/700/#909399 大写字距；前三名 M4 渐变数字；胜/负用 success/error 小点或窄条，不整行染色 |
| `RecentMatches` / `UpcomingMatches` | 比赛卡白底轻边框；左队黑右队橙镜像；比分 M4 斜体数字；hover 顶部渐变线 + 上浮；LIVE 用 M3 脉冲点；时间/阶段用斜切 chip（浅灰底，激活橙字） |
| `MatchDetail` | 对阵头图 M2 深色横幅（队标悬浮不加圆底）；地图 tab 横向 scroll-snap；分析区无缝白卡；对位结构严格镜像 |
| `UpcomingMatchDetail` | 同 MatchDetail；**必须清除 `#409EFF` 蓝色残留**（spinner、hover、winner 分）改橙/黑体系 |
| `TeamDetail` | 队名 h3 24px/900；战绩数字 M4；队员/赛程列表行高紧凑、细线分隔 |
| 图表组件（雷达/柱状/地图池等） | 图表配色收敛黑(#111)橙(#FF6A00)双轴 + 中性灰；tooltip 白底细边框轻阴影；卡片标题 M1；雷达移动端 radius 缩小、420px 下继续压；HeroBan/MapPool 用统一白卡 + 细边框 |
| `ChartExportPreview` | 白底 + 细边框 + Level 2 阴影 |

## 5. 移动端优先规则（本站主要面向手机用户）

1. 断点沿用 `768px / 420px`；所有新样式先在 ≤768px 验证可读性。
2. 触控目标：可点击元素高 ≥ 36px（chip 可 28~32px，但水平留白补足）。
3. 页面横向留白移动端 10~12px；卡片 padding 14~16px。
4. 长 tab / 地图条 / 榜单：`overflow-x:auto` + `scroll-snap-type: x proximity`，隐藏滚动条但保留滑动；不强行折行。
5. 队名/比分不换行抖动：比分数字固定宽度（`min-width` + 居中），队名 `ellipsis`。
6. 深色横幅在移动端降低高度（padding 20~24px），标题 26~30px。
7. 图表：雷达图 mobile radius ≤ 62%、中心下移；坐标轴字号 ≥ 10px。

## 6. 动效

- 统一 `cubic-bezier(.25,.8,.25,1)`，时长 0.2~0.3s。
- 允许的动画：hover 上浮、顶部渐变线淡入、LIVE 呼吸点、tab 下划线滑动。
- 禁止：弹跳动效、大面积闪烁、滚动视差。

## 7. 硬性约束（不可违反）

- ❌ 不改任何 `script` 逻辑、props、emit、API 调用、数据口径（真实总量 vs `/10m` 的区分保持原样）。
- ❌ 不引入新依赖、不新增图片资源文件（纹理一律 CSS 实现）。
- ❌ 不引入蓝色主视觉、不重排页面信息架构（增删 DOM 仅限纯装饰容器，且不得影响现有类名上的 JS 查询）。
- ✅ 模板可为了视觉分组增加装饰性 wrapper/伪元素类，但保留所有现有绑定、事件、`v-if/v-for` 结构与 ref。
- ✅ 样式集中在各组件 `<style scoped>` 与 `src/styles/visualize-theme.css`；Element Plus 覆写继续走 theme css。
