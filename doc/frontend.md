# 前端说明

## 1. 前端职责

前端是当前系统唯一的用户操作界面，负责：

- 新建剧情草案
- 恢复历史 Session
- 编辑和确认草案
- 在正式会话中发送消息
- 查看事件时间线
- 配置自动推进
- 触发前端自动推进
- 查看模型用量
- 管理多模型后端配置
- 查看记忆调试信息

前端不直接调用模型，也不解释提示词细节，只消费后端的结构化数据。

## 2. 路由结构

`apps/web/src/router.ts` 当前定义了 5 个页面：

- `/`：`HomePage.vue`
- `/sessions/:id/draft`：`DraftReviewPage.vue`
- `/sessions/:id`：`SessionConsolePage.vue`
- `/sessions/:id/debug`：`SessionMemoryDebugPage.vue`
- `/settings`：`SettingsPage.vue`

## 3. 全局外壳

前端使用 Vue 3 + Vue Router + Vite。

关键点：

- `App.vue` 提供统一导航
- `style.css` 负责整体页面风格与时间线、表单、卡片布局
- `configStore.ts` 负责缓存 `AppConfig`，避免页面重复读取配置

## 4. API 封装

`apps/web/src/api.ts` 封装了所有请求。

当前主要能力：

- 读取和保存 `AppConfig`
- 切换激活后端
- 列出 Session
- 生成草案
- 更新草案
- 确认 Session
- 获取 Session
- 获取事件
- 发送消息
- 手动重试
- 请求自动推进
- 更新自动推进设置
- 获取记忆调试数据
- 构造 SSE 地址

默认 API 地址来自：

- `import.meta.env.VITE_API_BASE`
- 默认值 `http://localhost:3001/api`

## 5. 首页 HomePage

首页承担两个入口。

### 5.1 新建推演

左侧区域允许输入 `playerBrief`：

- 调用 `api.createDraft()`
- 创建成功后跳转到草案页
- 顶部同时显示当前激活后端名称

### 5.2 恢复历史 Session

右侧区域读取 `api.listSessions()`：

- `draft` 状态跳转草案页
- `active/ended` 状态跳转正式会话页

## 6. 草案确认页 DraftReviewPage

这是人审环节的核心页面。

### 6.1 可编辑字段

- 标题
- 世界背景
- 开场局势
- 玩家处境
- 节奏建议
- 安全框架
- Agent 名字
- Agent 角色
- Agent 摘要
- Agent persona
- Agent goals
- Agent style

### 6.2 数据处理

页面会先拉取 `Session`，再把 `session.draft` 转成可编辑对象。

其中 `toDisplayText()` 会把：

- 字符串
- 数组
- 宽松对象

统一转为适合输入框展示的文本。这是为了兼容草案生成阶段的宽松归一化输出。

### 6.3 页面行为

- “保存修改”调用 `PATCH /sessions/:id/draft`
- “确认并进入推演”会先保存，再调用 `POST /sessions/:id/confirm`

## 7. 会话控制台 SessionConsolePage

这是前端最复杂的页面。

### 7.1 页面布局

- 顶部 Hero：标题、当前摘要、阶段、地点、张力、状态
- 左侧主区域：剧情时间线
- 右侧侧栏：
  - 输入区
  - 自动推进
  - 用量统计
  - 参与角色

### 7.2 初始化流程

加载页面时会：

1. 调用 `api.getSession()`
2. 调用 `api.getEvents()`
3. 规范化已有 `system.wait_scheduled`
4. 根据事件判断是否存在未结束的 Tick
5. 建立 `EventSource`

### 7.3 SSE 联动

当前主要监听：

- `session.updated`
- `event.appended`

同时后端还会发送：

- `usage.updated`
- `timer.updated`

但页面核心状态仍主要依赖 `session.updated` 和 `event.appended`。

### 7.4 本地播放队列

时间线不是“事件到了就直接 append”，而是通过本地播放队列串行播放：

- `liveQueue`
- `queueRunning`
- `playbackGeneration`
- `activePause`

这样做的目的，是把后端的节奏事件和内联 delay 转成用户可感知的停顿。

### 7.5 两种停顿来源

前端会处理两类停顿：

1. 显式 `system.wait_scheduled`
2. 嵌入在字符串中的 `<delay>1000</delay>`

对于第二类，页面会：

- 把文本拆成多个片段
- 中间插入临时 pause 事件
- 在时间线中显示倒计时提示

### 7.6 自动推进的前端实现

当前自动推进是前端主导的：

- 页面每 250ms 刷新一次当前时间
- 如果会话启用了自动推进
- 如果页面可见
- 如果当前没有 Tick 在执行
- 如果演出队列和停顿都已结束
- 且 `nextTickAt` 已到

那么前端会调用 `POST /sessions/:id/auto-tick`。

这意味着自动推进依赖打开中的会话页，而不是浏览器外的后台任务。

### 7.7 失败重试

页面会从尾部逆向扫描事件：

- 如果最近一次是 `system.tick_failed`
- 且之后没有 `system.tick_completed` 或 `system.story_ended`

就展示错误提示和“重试推进”按钮。

### 7.8 输入区

输入区调用 `api.postMessage()`：

- 不在前端本地拼玩家消息
- 等待后端写入 `player.message`
- 再通过 SSE 回流到时间线

这保证前端时间线只显示后端确认后的事实事件。

### 7.9 角色卡片

角色信息来源优先级：

- `session.confirmedSetup.agents`
- 如果还未确认，则回退到 `session.draft.agents`

显示时把 `director/support` 转成中文标签。

## 8. EventTimeline 组件

`EventTimeline.vue` 是显示语义转换层。

它把底层 `SessionEvent` 转成更接近用户理解的展示卡片。

### 8.1 映射示例

- `player.message` -> 玩家输入卡片
- `agent.speak_player` -> 角色对白卡片
- `agent.reasoning` -> 可见意图摘要卡片
- `agent.stage_direction` -> 动作卡片
- `agent.story_effect` -> 剧情效果卡片
- `scene.updated` -> 场景更新卡片
- `system.tick_started` -> 紧凑系统卡片
- `system.tick_failed` -> 异常卡片
- `system.wait_scheduled` -> 紧凑节奏卡片
- `system.story_ended` -> 结局卡片
- `system.usage_recorded` -> 紧凑用量卡片

### 8.2 特殊显示

- 最新事件在顶部
- `control_vibe_toy` 事件会标记为“可选工具”
- `<delay>` 标签在展示前会被剥离
- 正在进行的 pause 会显示倒计时与动态状态
- 自动推进状态也会插入时间线顶部

## 9. 配置页 SettingsPage

配置页现在管理的是“多后端模型配置”，不是单一模型配置。

### 9.1 页面功能

- 展示全部后端卡片
- 切换当前编辑后端
- 新增后端
- 删除后端
- 设置当前激活后端
- 编辑模型参数
- 保存工具默认开关

### 9.2 工具开关说明

设置页展示的工具目录来自 `packages/shared/src/index.ts` 的 `toolCatalog`。

当前特点：

- `control_vibe_toy` 是可选工具
- 其余显示在配置页中的工具都是 required 工具
- required 工具在界面上不可关闭
- `wait` 虽然存在于后端运行时工具注册表中，但不在设置页中单独暴露

## 10. 记忆调试页 SessionMemoryDebugPage

这个页面用于观察后端实际组装出的记忆上下文。

### 10.1 展示内容

- `lastProcessedSeq`
- archive / episode / turn 摘要树
- assembled context 预览
- 被丢弃的上下文块
- 最近原始回合窗口
- 最近记忆运行记录

### 10.2 数据来源

页面会同时请求：

- `GET /sessions/:id`
- `GET /sessions/:id/memory-debug`

并在收到 `session.updated` 后重新拉取两者，确保调试视图跟当前会话同步。

## 11. 当前前端边界

- 只有打开中的会话页才会继续前端自动推进
- 前端没有本地离线缓存
- 没有登录态和权限控制
- 时间线完全依赖后端事件语义，前端不自行推断剧情事实
