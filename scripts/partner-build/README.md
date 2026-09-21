# OWCS Stats 接口包：自动构建平台版

上传本 ZIP 的全部文件，项目根目录就是 package.json 所在目录（无额外顶层文件夹）。

| 平台设置 | 填写内容 |
| --- | --- |
| 框架 | Vite / 静态站点 |
| Node.js | 22.12+（建议 Node 22 LTS） |
| 安装命令 | npm ci |
| 构建命令 | npm run build（直接 vite build 也支持） |
| 输出目录 | dist |

平台构建后必须发布整个 dist 目录。不要只上传源码 index.html，也不要将 public/app.html 再设为 Vite 入口。

入口 index.html 很小，构建后自动进入同目录 app.html，并保留查询参数和 Hash 路由。
public/app.html 是完整预构建应用，Vite 会原样复制。它内置代码、样式、字体、图片、接口配置和 CSP 哈希；不需要再编译、拆分或改写。投票与助手沿用随包配置。

支持根目录和子目录 HTTP(S) 托管，无需 SPA 回退。服务器需允许访问 app.html，并保留其内联脚本、样式与 CSP；不要把 HTML 重定向到其他域名。该方案不适用于只接受一个 HTML 或强制重新处理全部 HTML 的平台。

运行时不需要 Node、数据库、代理或密钥；浏览器直接读取本站公开接口，比赛数据在打开、导航或刷新时更新。前端更新需重新上传新版包。
对 index.html 和 app.html 使用 Cache-Control: no-cache，并开启 gzip/Brotli。不要双击 file:// 预览。

site-config.json 和 package-manifest.json 是核对材料；修改它们不会改变内嵌配置。
如平台无需构建，请使用另行提供的 owcs-stats-api-production.zip 直接托管版。
