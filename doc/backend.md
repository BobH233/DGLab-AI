# 后端说明

## 1. 入口与装配

后端启动入口是 `apps/server/src/index.ts`。它从环境变量读取端口后调用 `createServerApp()`，再启动 Express 监听。

`createServerApp()` 在 `apps/server/src/app.ts` 中完成全部依赖装配：

- 初始化 `MongoSessionStore`
- 加载文件提示词服务 `FilePromptTemplateService`
- 创建模型提供者 `OpenAICompatibleProvider`
- 创建通道适配器 `WebChannelAdapter`
- 创建工具注册表 `createDefaultToolRegistry()`
- 组装 `DefaultOrchestratorService`
- 组装 `ConfigService` 与 `SessionService`
- 组装 `SchedulerService`
- 注册 `/api/*` 路由和统一错误处理中间件

## 2. 路由层

### 配置路由

`configRoutes.ts` 提供：

- `GET /api/config`
- `PUT /api/config`

用途是读取和保存全局 LLM 配置。

### Session 路由

`sessionRoutes.ts` 提供：

- Session 列表
- 草案生成
- 草案修改
- 草案确认
- 获取单个 Session
- 发送玩家消息
- 手动重试 Tick
- 更新自动推进定时器
- 获取历史事件
- 建立 SSE 长连接

路由层职责很轻，核心校验依赖 `packages/shared` 中的 Zod schema，核心业务逻辑全部下沉到 `SessionService`。

## 3. SessionService

`SessionService` 是后端最关键的业务入口，负责：

- 查询 Session 与事件
- 创建草案
- 修改草案
- 确认 Session
- 接收玩家消息
- 保存定时器配置
- 处理手动重试
- 执行真实 Tick
- 向通道层发布更新

### 3.1 并发控制

`SessionService` 使用 `LockManager` 按 `sessionId` 串行化关键操作，避免同一会话同时发生：

- 多个玩家请求并发写入
- 定时器与手动操作同时推进
- 事件序号竞争

### 3.2 创建草案

处理步骤：

1. 读取全局模型配置
2. 调用 `orchestrator.generateDraft`
3. 将草案组装为 `draft` 状态 Session
4. 初始化 `storyState`、`agentStates`、`timerState`、`usageTotals`
5. 保存 Session
6. 追加 `session.created` 与 `draft.generated`
7. 通过通道广播更新

### 3.3 确认草案

确认时会做三件重要事情：

- 把 `status` 从 `draft` 切换为 `active`
- 保存 `confirmedSetup`
- 把当前全局模型配置和提示词版本快照写入 Session

这样可以保证一个会话开始后，即使全局配置之后被改掉，历史 Session 仍保留启动时的上下文信息。

### 3.4 玩家消息

玩家消息不会直接调用模型，而是先进入队列：

- `timerState.queuedPlayerMessages.push(text)`
- `timerState.queuedReasons.push("player_message")`

之后由调度器统一请求一次 Tick。

### 3.5 自动推进

保存定时器配置时会更新：

- `timerState.enabled`
- `timerState.intervalMs`
- `timerState.nextTickAt`

同时写入 `system.timer_updated` 事件，并让 `SchedulerService` 重新同步定时器。

### 3.6 处理 Tick

`processTick()` 是正式推进剧情的核心逻辑：

1. 加锁并读取最新 Session
2. 跳过非 `active` Session
3. 收集当前排队消息与触发原因
4. 拉取最近事件作为模型上下文
5. 调用 `orchestrator.runTick`
6. 将返回事件与 `system.tick_started/system.tick_completed` 一并落库
7. 更新 Session 快照和使用量
8. 失败时记录 `system.tick_failed`
9. 通知调度器重新同步定时状态

失败不会终止 Session，只会记录一条可重试的失败事件。

## 4. SchedulerService

调度器的职责是“把多个零散触发合并成合理的 Tick 请求”，而不是直接操作模型。

### 4.1 已实现行为

- 启动时恢复所有 `active` Session 的自动推进定时器
- 使用 `setInterval` 定期触发
- 合并同一 Session 上多个待处理原因
- 防止同一 Session 重复并发执行 Tick

### 4.2 触发源

当前触发源包括：

- `session_confirmed`
- `player_message`
- `manual_retry`
- `timer_interval:*`

这些原因会被拼接成一个字符串传给 `processTick()`，最终进入提示词中的 `tickContext`。

## 5. DefaultOrchestratorService

这是后端的“模型编排器”，包含两类能力。

### 5.1 `generateDraft()`

职责：

- 渲染 `world_builder` 提示词
- 注入共享安全前言
- 注入工具对世界观的额外约束
- 调用模型生成草案 JSON
- 把模型返回的宽松字段归一化成合法 `SessionDraft`

归一化逻辑会处理：

- `Director` / `Support` 等大小写角色名
- `personality` 到 `persona` 的兼容
- 字符串列表自动拆分为数组
- 缺失字段使用默认兜底文案

### 5.2 `runTick()`

职责：

- 排序角色，确保 `director` 优先
- 组装工具说明与示例
- 渲染 `ensemble_turn` 提示词
- 调用模型生成一个共享动作批次
- 记录本次调用 Token 使用量
- 逐条执行工具
- 根据工具结果更新 Session 和事件列表

当前每个 Tick 只会有一次模型调用。

## 6. 工具执行

工具注册表位于 `apps/server/src/tools/defaultTools.ts`，当前内置工具有：

- `control_vibe_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `wait`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

每个工具都包含：

- `id`
- `description`
- `visibility`
- `inputSchema`
- `promptContract`
- `buildWorldPrompt`（可选）
- `execute`

### 6.1 执行机制

工具执行时会：

1. 校验工具是否存在
2. 判断工具是否启用
3. 使用 Zod 严格校验参数
4. 执行工具逻辑
5. 产出事件，必要时直接修改 Session 状态

### 6.2 当前特殊点

- `control_vibe_toy` 只产出 `agent.device_control` 事件，状态为 `simulated`
- `wait` 只会记录 `system.wait_scheduled`，供前端在同一轮内做停顿表现
- `end_story` 会把 Session 状态改为 `ended` 并中断后续工具执行

## 7. 提示词系统

文件位于 `apps/server/src/prompts/`：

- `shared_safety_preamble.md`
- `tool_contract.md`
- `world_builder.md`
- `ensemble_turn.md`
- `director_agent.md`
- `support_agent.md`

当前正式链路只使用：

- `shared_safety_preamble`
- `tool_contract`
- `world_builder`
- `ensemble_turn`

`director_agent` 和 `support_agent` 目前处于保留状态。

## 8. 模型接入层

`OpenAICompatibleProvider` 的职责是把“结构化 JSON 输出”变成一个稳定能力。

### 8.1 首选策略

优先请求：

- `POST {baseUrl}/chat/completions`
- `response_format.type = json_schema`

### 8.2 回退策略

如果服务端返回 400 且提示不支持 `json_schema`，会自动退回到：

- 普通 Chat Completions
- 额外追加一段“只返回一个合法 JSON 对象”的系统提示词

### 8.3 解析策略

支持：

- 原生 JSON 文本
- Markdown ```json 代码块
- 自由文本中包裹的 JSON 对象

然后会再次使用 Zod 校验解析结果，避免结构漂移。

## 9. MongoSessionStore

存储层实现位于 `apps/server/src/infra/mongo.ts`。

### 9.1 默认配置

- 默认数据库名：`dglab_ai`
- 默认配置文档 `_id`：`default`
- 默认模型：`gpt-4.1-mini`

### 9.2 索引

- `sessions.id` 唯一索引
- `sessions.updatedAt` 普通索引
- `session_events(sessionId, seq)` 唯一索引

### 9.3 存储策略

- Session 使用整文档替换
- 事件使用顺序追加
- 列表查询只返回 Session 摘要，避免传输完整正文

## 10. WebChannelAdapter

当前唯一通道适配器负责：

- 维护 `sessionId -> Response 集合`
- 向对应 SSE 连接广播事件
- 在连接关闭时自动解绑

它的存在说明项目已经把“展示渠道”抽象成了可替换模块，未来可以新增其它实现而不改动核心业务服务。
