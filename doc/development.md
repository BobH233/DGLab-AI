# 开发与部署

## 1. 本地开发准备

推荐环境：

- Node.js 20+
- npm 10+
- MongoDB 6+

原因：

- 后端直接使用 Node 原生 `fetch`
- 工程使用 ES Module、TypeScript、顶层 `await`

## 2. 安装依赖

在仓库根目录执行：

```bash
npm install
```

项目采用 npm workspaces，根目录会统一安装和管理子包依赖。

## 3. 启动 MongoDB

默认配置：

- URI：`mongodb://127.0.0.1:27017`
- DB：`dglab_ai`

如果需要自定义，可通过环境变量修改：

```bash
export MONGODB_URI="mongodb://127.0.0.1:27017"
export MONGODB_DB="dglab_ai"
```

## 4. 启动服务

### 后端

```bash
npm run dev:server
```

默认监听 `3001` 端口。

### 前端

```bash
npm run dev:web
```

默认监听 `5173` 端口。

## 5. 环境变量

### 服务端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | Express 监听端口 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Mongo 连接串 |
| `MONGODB_DB` | `dglab_ai` | 数据库名 |
| `DEBUG_LLM` | 未开启 | 为 `1` 时打印模型调试日志 |

### 前端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:3001/api` | 后端 API 地址 |

## 6. 构建与测试

### 构建

```bash
npm run build
```

顺序为：

1. 构建共享包
2. 构建服务端
3. 构建前端

### 测试

```bash
npm test
```

当前测试覆盖的重点包括：

- 提示词模板内容约束
- 世界草案归一化
- 工具参数校验与执行
- 编排器共享动作批次
- 调度器 Tick 合并
- Session 失败重试逻辑
- Provider 对 JSON Schema 和回退逻辑的处理
- 前端时间线组件显示

## 7. 调试建议

### 调试模型请求

设置：

```bash
DEBUG_LLM=1 npm run dev:server
```

会输出：

- 请求目标地址
- 使用的模型
- schema 名称
- 发送给模型的消息
- 原始响应
- JSON 提取与校验结果

### 调试前端事件流

可以在浏览器开发者工具中查看：

- `EventSource` 是否建立成功
- `event.appended` 是否持续到达
- 时间线是否收到 `system.wait_scheduled`

## 8. 代码阅读建议

如果要快速理解项目，推荐按下面顺序阅读：

1. `packages/shared/src/index.ts`
2. `apps/server/src/app.ts`
3. `apps/server/src/services/SessionService.ts`
4. `apps/server/src/services/OrchestratorService.ts`
5. `apps/server/src/tools/defaultTools.ts`
6. `apps/web/src/pages/SessionConsolePage.vue`
7. `apps/web/src/components/EventTimeline.vue`

## 9. 部署建议

当前仓库偏向本地开发和原型验证。若要部署到生产环境，至少还需要补：

- 鉴权与权限控制
- 敏感配置保护
- MongoDB 备份策略
- HTTPS 与反向代理
- 请求限流
- 日志与告警
- LLM 调用失败重试策略
- 前后端环境变量管理

## 10. 当前已知限制

- 没有 Dockerfile、docker-compose 或 CI 配置
- 没有数据库 migration 机制
- 没有用户体系和多租户隔离
- 没有消息渠道抽象的完整实现，只有 Web SSE
- 自动推进只传递“触发原因”，没有显式传递真实经过时长
- `UsageStats.byAgent` 虽然定义了，但目前没有实际统计来源

## 11. 适合继续补强的工程项

- 增加 `.env.example`
- 增加 Docker 与部署脚本
- 增加端到端测试
- 增加提示词版本演进策略
- 增加通道适配器接口文档
- 将编译产物与源代码文件的组织方式进一步收敛
