# 开发与部署

## 1. 本地开发环境

推荐环境：

- Node.js 20+
- npm 10+
- MongoDB 6+ 或 7+

原因：

- 后端依赖原生 `fetch`
- 项目使用 ESM + TypeScript
- MongoDB 是当前唯一持久化数据库

## 2. 安装依赖

在仓库根目录执行：

```bash
npm install
```

项目使用 npm workspaces，统一管理：

- `apps/server`
- `apps/web`
- `packages/shared`

## 3. 启动 MongoDB

默认值：

- `MONGODB_URI=mongodb://127.0.0.1:27017`
- `MONGODB_DB=dglab_ai`

如果本地已有 Mongo 实例，通常不需要额外改动。

## 4. 启动项目

### 4.1 启动后端

```bash
npm run dev:server
```

默认监听端口：

- `3001`

### 4.2 启动前端

```bash
npm run dev:web
```

默认访问地址：

- `http://localhost:5173`

### 4.3 首次访问

当前项目默认启用了统一密码门禁，因此第一次进入页面时通常会先看到登录页。

如果没有显式设置环境变量，当前默认密码回退值是：

```text
bobh888888
```

本地调试可以先用这个值；正式环境请务必覆盖。

## 5. 环境变量

## 5.1 服务端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | Express 监听端口 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Mongo 连接串 |
| `MONGODB_DB` | `dglab_ai` | 数据库名 |
| `AUTH_PASSWORD` | `bobh888888` | 统一访问密码 |
| `DEBUG_LLM` | 未开启 | 为 `1` 时打印模型请求与响应调试信息 |
| `TTS_CACHE_DIR` | `.data/tts-cache` | TTS 音频缓存目录 |
| `TTS_MAX_SEGMENT_CHARS` | `180` | TTS 文本分段首选长度 |
| `TTS_SEGMENT_OVERFLOW_CHARS` | `30` | TTS 分段向后容忍长度 |
| `TTS_MIN_SEGMENT_CHARS` | `32` | TTS 最小分段长度 |
| `TTS_CHUNK_LENGTH` | `200` | 发给 TTS 服务的 `chunk_length` |
| `TTS_MAX_NEW_TOKENS` | `1024` | 发给 TTS 服务的 `max_new_tokens` |
| `TTS_TOP_P` | `0.9` | 发给 TTS 服务的 `top_p` |
| `TTS_REPETITION_PENALTY` | `1.05` | 发给 TTS 服务的 `repetition_penalty` |
| `TTS_TEMPERATURE` | `0.9` | 发给 TTS 服务的 `temperature` |

## 5.2 前端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `/api` | 后端 API 基础地址 |

当前 `apps/web/vite.config.ts` 已经把 `/api` 代理到 `http://localhost:3001`，所以默认本地开发通常不需要改这个值；如果你的前后端不按这个端口组合运行，再显式覆盖成自定义地址即可。

## 6. 常用脚本

仓库根目录：

```bash
npm run build
npm run dev:server
npm run dev:web
npm test
```

服务端子包额外脚本：

```bash
npm run migrate:tts-cache-content-keys -w @dglab-ai/server
```

这个迁移脚本用于修复旧版 TTS 缓存键结构。

## 7. 构建说明

### 7.1 工作区构建顺序

`npm run build` 会按顺序构建：

1. `@dglab-ai/shared`
2. `@dglab-ai/server`
3. `@dglab-ai/web`

### 7.2 服务端构建补充

服务端构建过程中还会：

- 复制提示词文件到 `dist`

### 7.3 前端构建补充

镜像构建流程里还会执行：

- `node scripts/write-build-info.mjs`

用于生成前端可查看的构建信息。

## 8. 本地开发推荐顺序

如果是第一次接手当前项目，建议按这个顺序验证：

1. 启动 Mongo
2. `npm install`
3. `npm run dev:server`
4. `npm run dev:web`
5. 登录进入首页
6. 在“设置”页补一个可用模型后端
7. 生成草案并确认一次
8. 打开会话页确认 SSE、自动推进和预览流正常
9. 如需 TTS，再到设置页补 TTS 地址和角色映射
10. 如需本地设备联动，再配置 `/devices/e-stim`

## 9. 调试建议

### 9.1 调试 LLM 请求

```bash
DEBUG_LLM=1 npm run dev:server
```

会打印：

- 请求目标地址
- messages
- 原始响应
- reasoning summary
- 解析后的文本 / JSON
- schema 校验结果

### 9.2 调试流式预览

当前正式推演是流式 line protocol，所以除了看正式事件，也建议观察：

- SSE 是否持续收到 `llm.action.text.delta`
- 刷新页面后是否能收到 `llm.preview.snapshot`
- 推理结束后预览是否被正式事件替换

### 9.3 调试记忆

直接访问：

```text
/sessions/:id/debug
```

可以确认：

- 下一轮真正送给模型的上下文块
- recent raw turns 的裁剪结果
- 被预算丢弃的 block
- 当前消息队列

### 9.4 调试 TTS

建议依次检查：

1. 设置页的 TTS 健康检查
2. `reference_id` 是否能加载成功
3. 角色映射是否完整
4. 会话页单条朗读是否命中缓存
5. 演出模式是否能计算全部条目时长

如果音频不完整，优先检查：

- `TTS_MAX_NEW_TOKENS`
- 文本是否过长被切段
- 角色映射是否命中正确 `reference_id`

### 9.5 调试 e-stim

本地设备问题通常分三层排查：

1. `/devices/e-stim` 中连接码是否能解析
2. 本地 bridge 是否能返回 pulse 列表
3. Session 操作时是否把 `toolContext.eStim` 正确同步给后端

## 10. Docker 部署

当前仓库已经支持单容器部署。

### 10.1 Dockerfile 特点

- 前端先构建成静态资源
- 后端在生产环境中同时托管 `/api/*` 和前端页面
- 最终镜像只启动一个 Node 进程

本地构建：

```bash
docker build -t dglab-ai:latest .
```

本地运行：

```bash
docker run --rm -p 3001:3001 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e MONGODB_DB=dglab_ai \
  -e AUTH_PASSWORD=replace-me \
  dglab-ai:latest
```

## 10.2 docker-compose

仓库根目录已提供 `docker-compose.yml`，当前会拉起：

- `app`
- `mongodb`
- `coyote-game-hub`

其中 `app` 服务已经预置了一批 TTS 相关环境变量与缓存目录挂载。

## 11. 部署时要特别注意的点

### 11.1 密码门禁只是最小保护

当前鉴权是统一密码，并不是完整用户系统；正式环境至少还应补：

- 更可靠的身份体系
- HTTPS
- 反向代理
- 访问日志和限流

### 11.2 自动推进不是后台守护任务

现在的自动推进仍依赖打开中的会话页，因此：

- 不能把它理解成服务器后台定时器
- 关闭页面后不会自动继续推进

### 11.3 e-stim 是前端本地能力

即使服务端部署到远端，只要浏览器本地能够访问 bridge，依旧可以同步 `toolContext`；但真正的设备执行不在服务端发生。

## 12. 建议阅读顺序

如果要快速理解“当前这版项目”而不是旧版本，推荐按下面顺序阅读：

1. `packages/shared/src/index.ts`
2. `apps/server/src/app.ts`
3. `apps/server/src/services/SessionService.ts`
4. `apps/server/src/services/OrchestratorService.ts`
5. `apps/server/src/infra/OpenAICompatibleProvider.ts`
6. `apps/server/src/services/TtsService.ts`
7. `apps/server/src/tools/defaultTools.ts`
8. `apps/web/src/pages/SessionConsolePage.vue`
9. `apps/web/src/pages/PerformanceModePage.vue`
10. `apps/web/src/pages/SettingsPage.vue`
11. `apps/web/src/pages/ElectroStimSettingsPage.vue`
12. `apps/web/src/pages/SessionPrintPage.vue`

## 13. 当前已知限制

- 没有完整用户体系和权限隔离
- 自动推进依赖打开中的前端会话页
- `usageTotals.byAgent` 仍未做真实分摊
- e-stim 真执行依赖浏览器本地 bridge
- TTS 服务完全依赖外部接口能力和 `reference_id` 配置
- 目前没有看到 CI / CD 规范文档沉淀在 `doc/` 内
