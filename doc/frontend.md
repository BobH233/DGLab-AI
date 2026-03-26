# 前端说明

## 1. 前端职责

当前前端已经从“几个基础页面”扩展成完整工作台，负责：

- 登录并保存访问密码
- 新建和恢复 Session
- 人工审阅与编辑草案
- 正式会话时间线播放、输入、自动推进
- 显示 LLM 流式预览卡片
- 单条 TTS 朗读
- 全文演出模式
- PDF 打印导出
- 记忆调试
- 模型调用历史
- 多模型后端与 TTS 配置
- 本地 e-stim 设备配置
- 查看内部构建信息

前端不直接请求模型，也不自己生成正式事件；它消费后端 API、SSE 和本地设备状态。

## 2. 路由结构

`apps/web/src/router.ts` 当前定义了 11 个页面：

- `/login`：`LoginPage.vue`
- `/`：`HomePage.vue`
- `/sessions/:id/draft`：`DraftReviewPage.vue`
- `/sessions/:id`：`SessionConsolePage.vue`
- `/sessions/:id/performance`：`PerformanceModePage.vue`
- `/sessions/:id/print`：`SessionPrintPage.vue`
- `/sessions/:id/debug`：`SessionMemoryDebugPage.vue`
- `/settings`：`SettingsPage.vue`
- `/llm-calls`：`LlmCallHistoryPage.vue`
- `/internal/build-info`：`InternalBuildInfoPage.vue`
- `/devices/e-stim`：`ElectroStimSettingsPage.vue`

其中：

- `/login` 是公开页
- `/sessions/:id/print` 是独立打印视图
- 其他页面默认都需要先通过密码门禁

## 3. 全局外壳

前端基于 Vue 3 + Vue Router + Vite。

当前几项全局基础设施：

- `App.vue`：导航、全局壳层、登录状态联动
- `style.css`：绝大部分页面布局、时间线、演出模式、打印样式
- `auth.ts`：访问密码的本地持久化和 401 跳转处理
- `configStore.ts`：缓存全局 `AppConfig`
- `api.ts`：封装全部 HTTP 请求和 TTS Blob 请求

## 4. 登录与鉴权联动

### 4.1 登录页

`LoginPage.vue` 提供一个很直接的密码入口：

- 调用 `POST /api/auth/login`
- 成功后把密码存进浏览器本地存储
- 跳回原始目标路由

### 4.2 鉴权状态

`auth.ts` 当前会：

- 从 `localStorage` 读取保存的密码
- 在后续 API 请求里自动加上 `x-auth-password`
- 遇到 401 时清理本地密码并触发重新登录

### 4.3 路由守卫

`router.beforeEach()` 会在进入页面前检查：

- 当前页面是否 `meta.public === true`
- 本地是否已有保存密码

没有密码时会跳转到 `/login?redirect=...`。

## 5. API 封装

`apps/web/src/api.ts` 现在已经覆盖以下类别：

- 鉴权：`login`
- 配置：`getAppConfig`、`saveAppConfig`、`setActiveBackend`
- LLM 调用记录：`listLlmCalls`
- TTS：健康检查、reference 列表、单条音频、全文状态、批量生成
- Session：草案、确认、消息、重试、自动推进、计时器、事件、记忆调试
- SSE：`streamUrl`

几个重要事实：

- 默认 `API_BASE` 是 `/api`
- Blob 请求也会自动带密码头
- SSE 连接会把密码放到查询参数里

## 6. 首页 HomePage

首页仍然是两个入口，但现在还会考虑本地设备上下文。

### 6.1 新建推演

左侧输入 `playerBrief` 后：

- 读取当前激活后端
- 如果该后端启用了 `control_e_stim_toy`
- 就把浏览器本地的 e-stim 配置转换为 `toolContext`
- 调用 `api.createDraft(playerBrief, toolContext)`

也就是说，草案生成阶段就可能带入本地设备能力。

### 6.2 恢复历史 Session

右侧读取 Session 列表：

- `draft` 跳草案页
- `active` / `ended` 跳正式会话页

## 7. 草案页 DraftReviewPage

这是人审流程的核心页面。

### 7.1 可编辑内容

当前支持编辑：

- 标题
- 世界背景
- 开场局势
- 玩家处境
- 初始玩家身体道具状态
- 节奏建议
- 安全框架
- 场景目标
- 内容备注
- Agent 档案

### 7.2 页面行为

- “保存修改”调用 `PATCH /sessions/:id/draft`
- “确认并进入推演”会先保存，再调用确认接口
- 确认时如当前后端启用了 e-stim 工具，也会重新同步本地 `toolContext`

## 8. 会话控制台 SessionConsolePage

这是当前最复杂的页面，承担“正式运行时控制台”的角色。

### 8.1 页面职责

- 加载 Session 与历史事件
- 建立 SSE
- 展示正式时间线
- 展示流式预览卡片
- 播放本地节奏停顿
- 发消息、重试、自动推进
- 单条 TTS 播放
- 展示参与角色、用量和状态

### 8.2 初始化流程

页面加载时会：

1. `getSession()`
2. `getEvents()`
3. 规范化已有 pause / delay
4. 判断当前是否有未结束 Tick
5. 建立 `EventSource`
6. 如有需要读取 TTS 可播放状态

### 8.3 SSE 联动

除了正式事件，这个页面现在还会处理预览流：

- `session.updated`
- `event.appended`
- `usage.updated`
- `timer.updated`
- `llm.turn.started`
- `llm.action.*`
- `llm.reasoning_summary.delta`
- `llm.turn.control`
- `llm.turn.player_body_item_state`
- `llm.turn.completed`
- `llm.turn.failed`
- `llm.preview.snapshot`

也就是说，它维护的是“正式时间线 + 预览时间线”两套状态。

### 8.4 本地播放队列

正式事件不会直接 append 到界面，而是先经过本地播放队列，核心原因有两个：

- 要把 `system.wait_scheduled` 变成可感知停顿
- 要把文本中的 `<delay>...</delay>` 拆成局部暂停

因此页面内部维护了：

- `liveQueue`
- `queueRunning`
- `playbackGeneration`
- `activePause`

### 8.5 惊喜模式 / 预览遮罩

近期提交引入了“惊喜模式”，流式预览阶段可以在前端做遮罩/打码处理，避免玩家过早看到完整推理内容或完整文字呈现。

这部分是纯前端展示层策略，不影响后端正式事件。

### 8.6 自动推进

自动推进依旧是前端主导：

- 页面定时刷新当前时间
- 页面可见
- 没有 active pause
- 没有 in-flight Tick
- 播放队列已空
- `nextTickAt` 已到

满足这些条件才会调用 `POST /sessions/:id/auto-tick`。

### 8.7 单条 TTS 播放

会话页现在支持对可朗读事件触发单条播放：

- 玩家消息
- 角色对白
- 舞台动作
- 剧情变化

前端会根据事件类型判断是否显示“朗读”按钮，并维护每条的播放状态：

- `idle`
- `loading`
- `playing`
- `error`

### 8.8 e-stim 上下文同步

在以下动作前，页面都会视情况把本地 e-stim 配置同步给后端：

- 确认 Session
- 发送消息
- 手动重试
- 自动推进

这样模型每一轮都能基于最新本地设备能力做决策。

## 9. EventTimeline 组件

`EventTimeline.vue` 是正式事件和预览事件的统一显示层。

### 9.1 正式事件映射

它把底层 `SessionEvent` 映射为用户更容易理解的卡片，例如：

- `player.message` -> 玩家输入
- `player.message_interpreted` -> 通常不直接独立展示
- `agent.speak_player` -> 角色对白
- `agent.reasoning` -> 可见意图摘要
- `agent.stage_direction` -> 动作/舞台描述
- `agent.story_effect` -> 剧情变化
- `agent.device_control` -> 设备控制
- `scene.updated` -> 场景更新
- `system.tick_failed` -> 错误提示

### 9.2 预览事件映射

组件还会把 `PreviewTurnState` 显示成“尚未正式提交”的预览卡片：

- 正在输出的文本字段会逐步增长
- 完成字段会展示结构化值
- `reasoningSummaryText` 也会在页面上实时增加

### 9.3 TTS 入口

时间线里的可朗读卡片会附带播放按钮，由父页面提供：

- 当前 seq 是否可播放
- 当前 seq 的播放状态
- 点击后的回调

## 10. 演出模式 PerformanceModePage

这是 TTS 新能力落地后的核心页面。

### 10.1 页面目标

把整个会话当成“可连续收听的小说”来播放，而不是只点单条朗读。

### 10.2 核心流程

页面会先读取 `GET /api/tts/sessions/:id/performance`，拿到：

- 总可朗读条目数
- 已缓存数
- 已具备时长的可播放数
- 缺失数
- 缺失音色映射的角色
- 当前批量任务状态

### 10.3 批量生成

如果还没准备好全文播放，就可以：

- `POST /performance/batch` 启动缺失条目合成
- `DELETE /performance/batch` 取消当前批量任务

### 10.4 播放控制

演出模式支持：

- 调整卡片间隔
- 是否朗读舞台动作
- 是否朗读剧情变化
- 统一时间轴播放
- 拖动播放进度
- 双击卡片做局部预览

这和普通会话页的“单条点播”是两种不同交互。

## 11. 打印页 SessionPrintPage

打印页用于导出当前 Session 的静态文档视图，支持：

- 横版 / 竖版
- 自动触发浏览器打印
- 场景概览、角色表、模型信息、时间线导出

它不是简单截屏，而是重组后的打印友好版布局。

## 12. 记忆调试页 SessionMemoryDebugPage

这个页面直接面向开发和排障，主要展示：

- 当前 `memoryState`
- `assembledContext`
- `recentRawTurns`
- 当前 `storyState`
- 当前消息队列快照

它是理解“下一轮到底把什么上下文送给模型”的最直观入口。

## 13. 配置页 SettingsPage

配置页现在管理两大块内容。

### 13.1 多模型后端

每个后端都可以单独配置：

- 名称
- Base URL
- API Key
- Model
- Temperature
- `reasoningEffort`
- Top P
- Max Tokens
- Timeout
- 工具默认开关

### 13.2 TTS 配置

页面还支持：

- 配置 TTS Base URL
- 通过后端检查 TTS 健康状态
- 通过后端获取可用 `reference_id`
- 配置角色名到 `reference_id` 的映射

这部分会保存在后端数据库，而不是浏览器本地。

## 14. e-stim 设置页 ElectroStimSettingsPage

这是一个“纯本地配置页”，不会把设备配置直接存到后端数据库。

### 14.1 本地保存内容

- 游戏连接码
- 是否启用 B 通道
- 电极位置
- 强度映射曲线
- 可用波形列表
- 允许模型使用的波形

### 14.2 页面能力

- 测试和 localhost bridge 的连接
- 获取本地波形列表
- 调整剧情强度到真实输出强度的映射曲线
- 管理允许 agent 使用的 pulse

这些配置会在真正发起 Session 相关操作时被转成 `toolContext.eStim` 发给后端。

## 15. 模型调用记录页 LlmCallHistoryPage

这个页面提供一个项目级视角，而不是单 Session 视角。

支持查看：

- 调用时间
- 模型名
- 耗时
- token 用量
- 成功 / 失败状态
- schema 名称
- protocol fallback 说明

## 16. 内部构建信息页 InternalBuildInfoPage

这个页面主要用于部署排查，展示构建时注入的：

- commit SHA
- commit message
- branch
- workflow run 信息
- build duration

适合在“页面看起来不是我刚发的版本”时确认当前前端 bundle 的真实来源。
