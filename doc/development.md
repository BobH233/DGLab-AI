# 开发与部署

## 1. 本地开发环境

推荐环境：

- Node.js 20+
- npm 10+
- MongoDB 6+

原因：

- 后端依赖 Node 原生 `fetch`
- 项目使用 ES Module 和 TypeScript
- MongoDB 是当前唯一持久化存储

## 2. 安装依赖

在仓库根目录执行：

```bash
npm install
```

项目采用 npm workspaces，根目录统一管理 `apps/*` 与 `packages/*`。

## 3. 启动 MongoDB

默认参数：

- URI：`mongodb://127.0.0.1:27017`
- DB：`dglab_ai`

如需自定义：

```bash
export MONGODB_URI="mongodb://127.0.0.1:27017"
export MONGODB_DB="dglab_ai"
```

## 4. 启动项目

### 4.1 启动后端

```bash
npm run dev:server
```

默认端口：`3001`

### 4.2 启动前端

```bash
npm run dev:web
```

默认端口：`5173`

### 4.3 访问页面

- 首页：`http://localhost:5173`
- 配置页：`http://localhost:5173/settings`

## 5. 环境变量

### 5.1 服务端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | Express 监听端口 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Mongo 连接串 |
| `MONGODB_DB` | `dglab_ai` | 数据库名 |
| `DEBUG_LLM` | 未开启 | 为 `1` 时打印模型调试日志 |

### 5.2 前端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:3001/api` | 后端 API 基础地址 |

## 6. 构建与测试

### 6.1 构建

```bash
npm run build
```

构建顺序：

1. `@dglab-ai/shared`
2. `@dglab-ai/server`
3. `@dglab-ai/web`

### 6.2 测试

```bash
npm test
```

当前仓库测试通过情况为：

- 服务端：`43` 个测试
- 前端：`17` 个测试
- 合计：`60` 个测试

覆盖重点包括：

- 提示词模板约束
- Provider JSON Schema / fallback / SSE 解析
- 世界草案归一化
- 工具参数校验与执行
- 编排器共享 action batch
- Session Tick 失败与恢复
- 调度器原因合并
- 记忆摘要与上下文装配
- 前端时间线、内联 delay 和自动推进显示

## 7. 配置模型后端

第一次启动后，应先打开前端配置页补充至少一个可用后端。

每个后端可以配置：

- 名称
- API Base URL
- API Key
- Model
- Temperature
- Top P
- Max Tokens
- Request Timeout
- 工具默认开关

项目使用 OpenAI-compatible `/chat/completions`，并优先尝试 `response_format=json_schema`；若目标服务不支持，则自动回退到“提示词要求 JSON 输出”模式。

## 8. 调试建议

### 8.1 调试模型请求

```bash
DEBUG_LLM=1 npm run dev:server
```

会打印：

- 请求目标地址
- 模型名
- schema 名称
- 发送给模型的 messages
- 原始响应
- 提取出的 JSON
- Zod 校验后的结果

### 8.2 调试前端事件流

在浏览器开发者工具中观察：

- `EventSource` 是否正常连接
- `session.updated` 与 `event.appended` 是否持续到达
- 时间线中的 `system.wait_scheduled` 是否符合预期

### 8.3 调试记忆链路

进入某个 Session 的：

```text
/sessions/:id/debug
```

可以直接查看：

- turn / episode / archive 摘要树
- 下一轮真正会送给模型的上下文块
- 被字符预算丢弃的 block
- 最近记忆运行记录

## 9. 建议的阅读顺序

如果要快速理解项目，推荐按下面顺序阅读：

1. `packages/shared/src/index.ts`
2. `apps/server/src/app.ts`
3. `apps/server/src/services/SessionService.ts`
4. `apps/server/src/services/OrchestratorService.ts`
5. `apps/server/src/services/MemoryService.ts`
6. `apps/server/src/services/MemoryContextAssembler.ts`
7. `apps/server/src/tools/defaultTools.ts`
8. `apps/web/src/pages/SessionConsolePage.vue`
9. `apps/web/src/components/EventTimeline.vue`
10. `apps/web/src/pages/SessionMemoryDebugPage.vue`

## 10. 当前已知限制

- 没有 Dockerfile、compose 或 CI 配置
- 没有数据库 migration 机制
- 没有用户体系和权限隔离
- 没有后台守护进程式自动推进服务
- 自动推进依赖打开中的前端会话页
- `UsageStats.byAgent` 结构已定义但尚未真正统计
- 只有 Web SSE 通道，没有其他渠道适配器

## 11. 部署建议

当前仓库更适合本地开发与原型验证。若要投入正式环境，至少需要补：

- 鉴权与权限控制
- API 限流
- HTTPS 与反向代理
- 配置与密钥管理
- MongoDB 备份策略
- 日志、监控与告警
- 后台任务或守护式自动推进
- 更完整的故障恢复和重试机制
