# 赛事数据助手

后台赛事数据助手采用两次 `Qwen/Qwen3.5-4B` 调用：第一次把自然语言转换为受控查询计划，后端按白名单指标读取并聚合数据库，第二次只根据聚合证据组织最终中文回答。模型不能生成或执行 SQL，也不会获得数据库凭据。

## 请求链路

1. `POST /api/agent/chat` 接收最近 8 条消息和当前页面上下文。
2. `QueryPlan` 只允许 player、team、map、hero、match 五类主题及 `MetricRegistry` 注册的指标。
3. `AnalyticsExecutor` 使用固定 Sequelize 查询和服务端聚合；赛季阶段复用 `SeasonStageService` 的比赛范围。
4. 英雄明细、英雄禁用和基础选手数据分别计算覆盖率。覆盖不足不会被当成完整样本。
5. 第二次模型调用接收最多 20 行聚合结果、范围、覆盖率和警告，返回最终回答和后续问题。

## 环境变量

```env
AI_AGENT_PROVIDER=siliconflow
AI_AGENT_API_KEY=
AI_AGENT_BASE_URL=https://api.siliconflow.cn/v1
AI_AGENT_MODEL=Qwen/Qwen3.5-4B
AI_TIMEOUT_MS=20000
AI_RATE_LIMIT_PER_MINUTE=20
AI_DAILY_BUDGET_CNY=20
AI_BUDGET_TIME_ZONE=Asia/Shanghai
AI_CACHE_TTL_MS=300000
```

当前硅基流动请求关闭思考并指定本次必须调用的函数，服务端还会验证模型输出、删除用户未提及的筛选条件，并拒绝白名单之外的指标。缓存仅保存在当前 Node.js 进程内，缓存键由消息和页面上下文的 SHA-256 生成，不持久化用户问题。

## 当前边界

- 后台接口有每 IP 限流、每日预算熔断、输入长度限制、超时和服务端错误隐藏。
- 当前后台本身没有登录鉴权，因此该入口目前属于内部试用功能；公开前必须接入站点账号或签名匿名会话，不能只依赖前端隐藏。
- 每日预算计数保存在单个进程内。多实例部署时应迁移到 Redis 或统一网关计数。
- 英雄使用和大招指标依赖 `player_hero_stats`，旧赛季无明细时会拒绝给出可靠排名。
