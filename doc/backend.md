# 后端说明

## 1. 入口与装配

后端启动入口是 `apps/server/src/index.ts`，真正的依赖装配在 `apps/server/src/app.ts`。

当前装配顺序如下：

1. 初始化 `MongoSessionStore`
2. 初始化 `FilePromptTemplateService`
3. 初始化 `OpenAICompatibleProvider`
4. 初始化 `WebChannelAdapter`
5. 创建默认工具注册表 `createDefaultToolRegistry()`
6. 创建 `DefaultOrchestratorService`
7. 创建 `MemoryService`
8. 创建 `MemoryContextAssembler`
9. 创建 `ConfigService`
10. 创建 `SessionService`
11. 创建 `SchedulerService`
12. 注册 `/api/config` 与 `/api/sessions` 路由
13. 注册统一错误处理中间件

## 2. 路由层

### 2.1 配置路由

`configRoutes.ts` 暴露：

- `GET /api/config`
- `PUT /api/config`
- `PATCH /api/config/active-backend`

这里返回和保存的是 `AppConfig`，不是早期单一 `LlmConfig` 结构。

### 2.2 Session 路由

`sessionRoutes.ts` 暴露：

- `GET /api/sessions`
- `POST /api/sessions/draft`
- `PATCH /api/sessions/:id/draft`
- `POST /api/sessions/:id/confirm`
- `GET /api/sessions/:id`
- `POST /api/sessions/:id/messages`
- `POST /api/sessions/:id/retry`
- `POST /api/sessions/:id/auto-tick`
- `POST /api/sessions/:id/timer`
- `GET /api/sessions/:id/events`
- `GET /api/sessions/:id/memory-debug`
- `GET /api/sessions/:id/stream`

路由层只做轻量请求解析和 Zod 校验，主要业务都在服务层。

## 3. ConfigService

`ConfigService` 负责多模型后端配置管理。

当前职责包括：

- 读取 `AppConfig`
- 保存完整 `AppConfig`
- 切换当前激活后端

注意点：

- 当前配置存储支持多个后端
- 每个后端都有独立参数和工具默认开关
- 新建 Session 时使用当前激活后端

## 4. SessionService

`SessionService` 是后端最重要的业务入口，承担 Session 生命周期与运行时编排责任。

### 4.1 主要职责

- 列出 Session
- 获取 Session 与事件
- 生成草案
- 更新草案
- 确认 Session
- 接收玩家消息
- 更新自动推进配置
- 处理前端自动推进请求
- 手动重试
- 执行 Tick
- 发布 SSE 更新
- 触发记忆刷新
- 提供记忆调试数据

### 4.2 并发控制

`SessionService` 使用 `LockManager` 按 `sessionId` 串行化关键操作，避免：

- 多个写请求同时修改同一 Session
- 玩家消息与重试同时推进
- 事件序号竞争

此外，`activeTicks` 用于标记当前正在运行的 Tick，配合异常恢复逻辑判断“陈旧 inFlight 状态”。

### 4.3 createDraft

创建草案时的步骤：

1. 读取当前激活后端配置
2. 调用 `orchestrator.generateDraft`
3. 初始化 `storyState`、`agentStates`、`memoryState`、`timerState`、`usageTotals`
4. 保存 draft Session
5. 追加 `session.created` 与 `draft.generated`
6. 广播最新 Session 和事件

此时 Session 状态为 `draft`。

### 4.4 confirmSession

确认草案时会：

- 将 `status` 从 `draft` 改为 `active`
- 将当前草案冻结为 `confirmedSetup`
- 保存 `llmConfigSnapshot`
- 保存提示词版本快照 `promptVersions`
- 更新初始 `storyState.phase`
- 追加 `session.confirmed`
- 请求一次 `session_confirmed` Tick

这一步保证正式推演时拥有稳定的配置和提示词上下文。

### 4.5 postPlayerMessage

玩家消息不会立即调用模型，而是：

- 记录 `player.message` 事件
- 将文本放入 `timerState.queuedPlayerMessages`
- 将原因写入 `timerState.queuedReasons`
- 请求调度器处理新的 Tick

这样可以把多条触发合并进同一轮推进。

### 4.6 updateTimer

保存自动推进设置时会更新：

- `timerState.enabled`
- `timerState.intervalMs`
- `timerState.nextTickAt`

同时写入 `system.timer_updated` 事件，并通过 SSE 单独发送一次 `timer.updated`。

### 4.7 requestAutoTick

这是当前自动推进的关键接口。其行为是：

- 只在 `active` 且 `timerState.enabled` 时考虑推进
- 如果当前已 `inFlight`，直接返回
- 如果 `nextTickAt` 还没到，也直接返回
- 到点后把 `nextTickAt` 顺延一轮
- 请求调度器执行 `timer_interval:frontend`

也就是说，后端不主动轮询时间，而是等前端会话页到点后请求它。

### 4.8 processTick

正式推进剧情的流程：

1. 加锁读取最新 Session
2. 跳过非 `active` 会话
3. 读取配置快照或当前配置
4. 复制排队中的玩家消息和触发原因
5. 置 `timerState.inFlight = true`
6. 拉取全部事件并交给 `MemoryContextAssembler`
7. 先写入 `system.tick_started`
8. 调用 `orchestrator.runTick`
9. 清空消息队列
10. 写入工具执行产生的事件与 `system.tick_completed`
11. 更新 `nextTickAt`
12. 异步刷新记忆
13. 如有用量记录，则广播 `usage.updated`

如果中途失败：

- 不会终止 Session
- 会写入一条可重试的 `system.tick_failed`
- 会恢复 `inFlight` 和 `nextTickAt`

### 4.9 reconcileStaleTick

`getSession()` 和 `getEvents()` 前会调用这段逻辑：

- 如果 Session 被标成 `inFlight`
- 但事件流里存在未完成的 `system.tick_started`
- 且当前实际上没有 active Tick

那么系统会补写一条 `system.tick_failed`，把中断的回合标记为失败。

### 4.10 记忆相关接口

`getMemoryDebug()` 会返回：

- 当前 `memoryState`
- 最近原始回合窗口
- 下一轮真正会送给模型的 assembled context
- 当前 `storyState` 快照
- 当前消息队列快照

这是后端暴露给前端调试页的重要调试接口。

## 5. SchedulerService

当前 `SchedulerService` 的实现很轻：

- 记录同一 Session 的待处理原因集合
- 使用 `queueMicrotask` 合并同一批次内的重复请求
- 防止同一 Session 重复并发 flush
- flush 时把多种原因拼成一个字符串传给 `processTick`

重要说明：

- `syncSession()` 目前是空实现
- 它不是一个常驻定时器服务
- 自动推进的真正“到点判断”发生在前端和 `requestAutoTick()`

因此它更准确的角色是“Session 级 Tick 合并器”。

## 6. DefaultOrchestratorService

这是后端的模型编排核心，包含两个主能力。

### 6.1 generateDraft

职责：

- 渲染 `world_builder`
- 注入 `shared_safety_preamble`
- 注入工具世界观钩子
- 调用 Provider 生成 JSON
- 归一化宽松字段为合法 `SessionDraft`

归一化包括：

- `Director`/`Support` 到标准 role
- `personality` 到 `persona`
- 字符串到数组的拆分
- 缺失字段的兜底文案

### 6.2 runTick

职责：

- 对角色排序，确保 `director` 优先
- 组装工具说明与例子
- 渲染 `tool_contract`
- 渲染 `ensemble_turn`
- 注入记忆上下文
- 调用 Provider 生成 `actionBatch`
- 记录本次调用用量
- 逐条执行工具调用

关键点：

- 每个 Tick 只有一次模型调用
- 用量会写入 `usageTotals.session` 和 `usageTotals.byCall`
- 如果 `end_story` 被调用，后续工具执行会中断

## 7. MemoryService

`MemoryService` 负责把事件流压缩成分层记忆。

### 7.1 refreshSessionMemory

处理逻辑：

- 解析所有事件为完整回合
- 找出尚未处理过的成功回合
- 逐个生成 turn 摘要
- 超过阈值时向上压缩为 episode
- episode 过多时继续压缩为 archive
- 维护 debug 状态和最近运行记录

### 7.2 摘要生成策略

turn 摘要优先走规则抽取：

- 从 `scene.updated` 中提取 `memorySummary`
- 从剧情效果、动作、对白等事件推断关键发展
- 从 active objectives 推断未完成线索

只有当规则摘要信息不足时，才回退到较低温度的 LLM 压缩。

### 7.3 debug 信息

系统会记录：

- 最近刷新时间与状态
- 最近一次压缩模式
- 最近若干次记忆运行记录
- 是否发生过 fallback

## 8. MemoryContextAssembler

这个服务负责把会话状态转成真正送给 `ensemble_turn` 的上下文块。

组装内容包括：

- `coreState`
- `archiveBlock`
- `episodeBlocks`
- `turnSummaryBlocks`
- `recentRawTurnsBlock`
- `playerMessagesBlock`
- `tickContextBlock`

其核心策略是：

- episode block 全量保留
- turn summary 和 recent raw turn 按字符预算从新到旧选取
- 记录被丢弃的 block，便于调试

## 9. OpenAICompatibleProvider

Provider 负责与模型服务交互，并统一结构化输出逻辑。

已实现能力：

- 调用 `/chat/completions`
- 优先尝试 `response_format=json_schema`
- 目标服务不支持时回退到“纯提示词 JSON 输出”
- 兼容标准 JSON 响应和 SSE chunk 响应
- 剥离 `<think>...</think>` 等推理块
- 从文本中提取第一个平衡 JSON 对象
- 用 Zod 再次严格校验返回结构
- 记录调试日志 `DEBUG_LLM=1`

## 10. MongoSessionStore

`MongoSessionStore` 同时承担：

- 配置存储
- Session 快照存储
- 事件日志存储

值得注意的行为：

- 启动时自动创建索引
- `app_configs` 支持把旧版单配置结构归一化为新版 `AppConfig`
- Session 写入前会通过 `sessionSchema` 重新校验
- 事件通过 `startSeq + index + 1` 追加，保持序号递增

## 11. WebChannelAdapter

`WebChannelAdapter` 是当前唯一落地的通道实现。

职责：

- 按 `sessionId` 维护 SSE 监听集合
- 发布 `session.updated`、`event.appended`、`usage.updated`、`timer.updated`
- 处理连接 attach/detach

目前没有 QQ、Discord、Telegram 等其他渠道实现。

## 12. 当前后端边界

- 没有认证、鉴权、审计和限流
- 没有独立后台自动推进守护进程
- `byAgent` 用量统计尚未真正落地
- 工具副作用主要局限于事件和会话状态，不涉及复杂外部事务
