# 后端说明

## 1. 入口与装配

后端启动入口是 `apps/server/src/index.ts`，真正的依赖装配在 `apps/server/src/app.ts`。

当前装配顺序大致如下：

1. 初始化 `MongoSessionStore`
2. 定位前端构建产物目录和提示词目录
3. 初始化 `FilePromptTemplateService`
4. 初始化 `OpenAICompatibleProvider`
5. 初始化 `WebChannelAdapter`
6. 创建默认工具注册表 `createDefaultToolRegistry()`
7. 创建 `DefaultOrchestratorService`
8. 创建 `MemoryService`
9. 创建 `MemoryContextAssembler`
10. 创建 `ConfigService`
11. 创建 `SessionService`
12. 创建 `SchedulerService`
13. 创建 `LlmCallService`
14. 创建 `TtsService`
15. 注册鉴权中间件、REST 路由和错误处理中间件
16. 若存在 `apps/web/dist`，则同时托管前端静态资源

也就是说，生产环境下当前是“一个 Node 进程同时提供 API 与前端页面”。

## 2. 路由层

### 2.1 鉴权路由

`authRoutes.ts` 暴露：

- `POST /api/auth/login`

这里只负责校验访问密码是否正确。真正的 API 鉴权由 `apiAuthMiddleware` 统一负责。

### 2.2 配置路由

`configRoutes.ts` 暴露：

- `GET /api/config`
- `PUT /api/config`
- `PATCH /api/config/active-backend`

当前保存的是完整 `AppConfig`，其中除了多模型后端，还包括全局 `tts` 配置。

### 2.3 Session 路由

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

其中 `draft`、`confirm`、`messages`、`retry`、`auto-tick` 都支持携带 `toolContext`。

### 2.4 LLM 调用记录路由

`llmCallRoutes.ts` 暴露：

- `GET /api/llm-calls`

用于按页查看全部模型调用记录，而不是只看某个 Session 的统计。

### 2.5 TTS 路由

`ttsRoutes.ts` 暴露：

- `GET /api/tts/health`
- `GET /api/tts/references`
- `GET /api/tts/sessions/:sessionId/events/:seq`
- `GET /api/tts/sessions/:sessionId/performance`
- `POST /api/tts/sessions/:sessionId/performance/batch`
- `DELETE /api/tts/sessions/:sessionId/performance/batch`
- `GET /api/tts/sessions/:sessionId/readables/:readableId`

这部分已经是一个独立子系统：既支持单条点击朗读，也支持“全文演出模式”的批量补齐。

## 3. 鉴权实现

`apps/server/src/lib/auth.ts` 当前实现的是统一密码门禁：

- 支持 `x-auth-password` 请求头
- 支持 `Authorization: Bearer <password>`
- SSE 场景还支持 `?authPassword=...` 查询参数

注意：

- 默认密码是硬编码回退值 `bobh888888`
- 生产环境应显式设置 `AUTH_PASSWORD`

路由层只有 `/api/auth/login` 在鉴权中间件之前；其余 `/api/*` 都必须先通过密码校验。

## 4. ConfigService

`ConfigService` 的职责现在包括两大块：

- 多模型后端配置
- 全局 TTS 配置

### 4.1 模型后端

每个后端包含：

- `id`
- `name`
- `provider`
- `baseUrl`
- `apiKey`
- `model`
- `temperature`
- `reasoningEffort`
- `maxTokens`
- `topP`
- `requestTimeoutMs`
- `toolStates`

### 4.2 TTS 配置

`appConfig.tts` 包含：

- `baseUrl`
- `roleMappings`

其中 `roleMappings` 把剧情中的角色名映射到外部 TTS 服务的 `reference_id`。

## 5. SessionService

`SessionService` 依然是后端的业务中枢，但现在承担的职责比旧文档更多。

### 5.1 主要职责

- 创建、读取、列出 Session
- 更新草案与确认草案
- 接收玩家消息
- 合并和保存 `toolContext`
- 处理自动推进定时器
- 启动正式 Tick
- 维护 SSE 预览快照
- 生成 `player.message_interpreted`
- 维护 `playerBodyItemState`
- 异步刷新记忆

### 5.2 并发控制

`SessionService` 用两层机制控制并发：

- `LockManager`：按 `sessionId` 串行化关键写操作
- `activeTicks`：标记当前正在运行的 Tick，辅助恢复异常中断状态

这样可以避免：

- 多个消息同时推进同一 Session
- 重试与自动推进互相踩踏
- 事件序号冲突

### 5.3 createDraft

创建草案时：

1. 读取当前激活后端配置
2. 调用 `orchestrator.generateDraft(playerBrief, config, toolContext)`
3. 初始化 `storyState`、`agentStates`、`memoryState`、`timerState`
4. 初始化 `playerBodyItemState`
5. 保存 Session 快照
6. 追加 `session.created` 与 `draft.generated`
7. 广播 `session.updated` 与 `event.appended`

当前草案阶段已经会记住本次传入的 `toolContext`。

### 5.4 confirmSession

确认草案时：

- `status` 从 `draft` 切到 `active`
- 把草案冻结到 `confirmedSetup`
- 保存 `llmConfigSnapshot`
- 保存提示词版本
- 合并本次传入的 `toolContext`
- 切换 `storyState.phase = opening`
- 追加 `session.confirmed`
- 如果已有初始身体道具状态，再追加 `player.body_item_state_updated`
- 请求一次 `session_confirmed` Tick

### 5.5 postPlayerMessageWithContext

玩家消息不会直接触发模型调用，而是：

- 先写入 `player.message`
- 把消息文本放进 `timerState.queuedPlayerMessages`
- 把原因写进 `queuedReasons`
- 合并最新 `toolContext`
- 请求调度器安排 Tick

这样同一轮里可以合并多条消息和多个触发原因。

### 5.6 updateTimer / requestAutoTick

这两段逻辑一起组成当前自动推进实现：

- `updateTimer()` 保存 `enabled`、`intervalMs`、`nextTickAt`
- `requestAutoTick()` 只在真正到点且未 in-flight 时才允许推进

`requestAutoTick()` 不做后台轮询；它只是响应前端会话页在合适时机发来的请求。

### 5.7 processTick

正式推进流程如下：

1. 标记 `activeTicks`
2. 加锁读取最新 Session
3. 读取配置快照或当前全局配置
4. 复制当前排队消息和触发原因
5. 将 `timerState.inFlight` 设为 `true`
6. 拉取全部事件并装配记忆上下文
7. 写入 `system.tick_started`
8. 调用 `orchestrator.runTick(...)`
9. 清空排队消息和原因
10. 根据编排结果写入正式事件
11. 追加 `player.message_interpreted`
12. 追加 `system.tick_completed`
13. 重置 `nextTickAt`
14. 异步刷新记忆
15. 如有用量记录，再额外广播 `usage.updated`

### 5.8 失败恢复

如果 Tick 失败：

- 不会终止 Session
- 会写入 `system.tick_failed`
- 会恢复 `inFlight = false`
- 会把 `nextTickAt` 顺延一轮

另外，`reconcileStaleTick()` 会在读取 Session / Events 前检查：

- 如果 Session 被标记为 `inFlight`
- 但实际上没有活跃 Tick
- 且事件流中存在未闭合的 `system.tick_started`

那么系统会补一条 `system.tick_failed`，把这次中断标记为可重试失败。

### 5.9 SSE 与预览快照

`SessionService` 现在除了广播正式事件，还维护一份 `previewSnapshots`：

- 推理开始时广播 `llm.turn.started`
- 解析 line protocol 过程中持续广播 `llm.action.*`
- 推理失败广播 `llm.turn.failed`
- 推理完成广播 `llm.turn.completed`

当新的 SSE 连接建立时，如果当前回合仍在流式中，会先推送：

- `ready`
- `llm.preview.snapshot`

这样前端刷新页面后还能恢复当前预览卡片，而不会完全丢失“模型正在输出什么”。

## 6. SchedulerService

`SchedulerService` 仍然是一个“轻调度器”，不是常驻后台任务系统。

当前职责：

- 记录同一 Session 的待处理原因集合
- 使用 `queueMicrotask` 合并同一批次重复请求
- 防止同一 Session 并发 flush
- flush 时把多个原因合并成一个字符串传给 `processTick`

可以把它理解为“Session 级去抖 + 合并器”。

## 7. DefaultOrchestratorService

这是模型编排核心，当前包含两条链路。

### 7.1 generateDraft

草案生成时会：

- 渲染 `world_builder`
- 注入 `shared_safety_preamble`
- 注入工具世界观钩子
- 调用 Provider 的 `completeJson`
- 对宽松字段做归一化

归一化内容包括：

- `role` 到 `director/support`
- `personality` 到 `persona`
- 字符串/数组的统一处理
- `initialPlayerBodyItemState` 的清洗去重

### 7.2 runTick

正式推演时会：

- 排序角色，保证 `director` 优先
- 渲染工具参考与 line protocol 示例
- 渲染 `tool_contract`
- 渲染 `ensemble_turn`
- 把记忆块和运行态上下文注入提示词
- 调用 Provider 的流式 `streamText`
- 用 `LineProtocolTurnParser` 解析 action batch
- 通过工具注册表逐条执行动作
- 更新 `usageTotals`
- 产出 `playerMessageInterpretations`
- 更新 `playerBodyItemState`

如果 line protocol 缺失 `turnControl`、`playerMessageInterpretations` 或 `playerBodyItemState`，系统会使用默认值并在 `llm_calls` 中记录 `protocolFallback`。

## 8. OpenAICompatibleProvider

当前 Provider 已经不是“只打一条 `/chat/completions`”的简单封装。

### 8.1 文本流式策略

`streamText()` 会优先尝试：

1. OpenAI-compatible `/responses` 流式接口
2. 如不支持，再回退到 `/chat/completions` 流式接口

### 8.2 参数兼容策略

当前后端会尝试传递：

- `reasoning_effort`
- `response_format=json_schema`

如果目标后端不支持：

- 会自动去掉不兼容字段重试
- 并在部分情况下记录协议降级信息

### 8.3 调试能力

启用 `DEBUG_LLM=1` 后，会输出：

- 请求目标地址
- 发送的 messages
- 原始响应
- 解析后的文本 / JSON
- reasoning summary

## 9. LineProtocolTurnParser

这是当前正式推演和预览系统之间的关键粘合层。

它负责解析类似下面的结构：

```text
@action {"actorAgentId":"director","tool":"speak_to_player","targetScope":"player"}
@field args.message
把视线抬起来，看着我。
@endfield
@endaction
@turnControl {"continue":true,"endStory":false,"needsHandoff":false}
@playerMessageInterpretations []
@playerBodyItemState ["你现在戴着一副遮光眼罩"]
@done
```

解析过程中会：

- 维护草稿版 `DraftBatch`
- 把可预览文本字段持续作为 `llm.action.text.delta` 广播出去
- 在字段完成时广播 `llm.action.field.completed`
- 在 action 完成时广播 `llm.action.completed`
- 最终产出合法 `ActionBatch`

这也是前端能“边看模型输出边看到卡片逐渐成型”的原因。

## 10. TtsService

`TtsService` 是本轮文档更新里最重要的新部分之一。

### 10.1 主要职责

- 检查 TTS 服务健康状态
- 读取 reference 列表
- 把 Session / Event 转成可朗读内容
- 合成单条音频
- 维护本地缓存
- 计算音频时长
- 启动、取消、恢复全文批量合成任务

### 10.2 可朗读内容来源

系统会把以下内容转成 `SessionReadableContent`：

- `worldSummary`
- `openingSituation`
- `playerState`
- `player.message`
- `agent.speak_player`
- `agent.stage_direction`
- `agent.story_effect`

其中玩家消息会优先使用 `player.message_interpreted.ttsText` 作为朗读版本。

### 10.3 文本预处理

TTS 预处理当前会做：

- 去掉 `<delay>`
- 把 `<emo_inst>...</emo_inst>` 转为 `[tag]`
- 合并相邻情绪标签
- 统一引号与标点
- 适配问号后的停顿
- 在过长文本时按边界分段

### 10.4 缓存机制

缓存键会基于这些内容构造：

- `sessionId`
- `readableId`
- `eventSeq`
- `referenceId`
- `normalizedText`

当前缓存不再把后端 `baseUrl` 直接放进内容键里，从而避免切换 TTS 地址时误伤同内容缓存复用。

### 10.5 演出模式批量任务

全文模式会把缺失条目作为批量任务执行，状态包括：

- `running`
- `completed`
- `cancelled`
- `failed`
- `interrupted`

状态持久化到 `session_tts_batch_jobs`，因此页面刷新后仍然能恢复任务进度。

## 11. LlmCallService 与可观测性

`LlmCallService` 本身很薄，只做查询与分页参数解析；真正有价值的是持久化内容。

当前 `llm_calls` 可用于排查：

- 失败或超时调用
- 模型、schema、耗时和 token 消耗
- 某次调用属于 world builder 还是 ensemble turn
- 是否发生了 protocol fallback

前端的“模型调用记录”页面就是这个存储的直接可视化。

## 12. Mongo 持久化结构

`MongoSessionStore` 现在承担的存储范围已经扩展到：

- `app_configs`
- `sessions`
- `session_events`
- `llm_calls`
- `tts_audio_cache`
- `session_tts_batch_jobs`

因此后端不只是“会话存储层”，而是整个运行时状态中心。
