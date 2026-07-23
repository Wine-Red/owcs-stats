# 纯前端静态展示版

静态展示版会在导出时读取当前后端 API，将可视化首页、Upcoming、战队详情、选手详情和比赛详情所需的数据写入只读快照，并把队伍外链图标下载到本地。部署后的浏览器不连接数据库或 OWCS Stats 后端。

## 导出

1. 确保本地后端和数据库可用，默认 API 地址为 `http://localhost:3000/api`。
2. 在项目根目录执行：

   ```powershell
   npm run export:static
   ```

3. 将生成的 `dist/` 目录完整上传到纯静态网站平台。

如果 API 地址不同：

```powershell
$env:OWCS_EXPORT_API_BASE='http://127.0.0.1:3000/api'
npm run export:static
```

### 从生产环境导出

生产站地址保存在项目根目录的 `static-export.config.json`。日常重复导出只需执行：

```powershell
npm run export:static:production
```

如需临时从另一套生产环境导出，可使用 `OWCS_PRODUCTION_API_BASE` 覆盖配置文件；生产模式始终拒绝 localhost、127.0.0.1 和 ::1：

```powershell
$env:OWCS_PRODUCTION_API_BASE='https://another-production-site.example/api'
npm run export:static:production
```

完成后可检查 `dist/static-data/manifest.json`：`exportMode` 必须为 `production`，`sourceApi` 必须是预期的生产 API 地址，再上传 `dist/`。

## GitHub Actions 自动 Release

`.github/workflows/static-production-release.yml` 会在以下情况运行：

- `master` 分支收到新提交；
- 每天北京时间 00:00（GitHub cron 为 UTC 16:00）；
- 在 Actions 页面手动触发。

工作流会从生产 API 导出、验证五类展示页、生成 `owcs-stats-static-production.zip` 和 SHA-256 文件、发布 `static-production-*` Release。发布成功后只保留最近三次同前缀 Release；仓库中的其他 Release 不受影响。

导出数据生成在 `public/static-data/`，构建时复制到 `dist/static-data/`。该目录包含真实业务数据，已被 Git 忽略。`manifest.json` 记录数据量、生成时间、图片本地化结果和非致命警告。

## 行为说明

- 静态站使用 Hash 路由，上传到任意子目录后刷新详情页不会依赖服务器回退规则。
- 非 `/visualize` 路由会返回可视化首页，写接口会明确返回只读错误。
- Upcoming 是导出时快照；已开赛超过 8 小时的项目会在浏览器端自动隐藏，新赛程需要重新导出。
- 数据库或外部赛程更新后，需要重新执行导出并部署。
