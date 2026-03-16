# 前端说明

## 1. 前端职责

前端是这个项目的操作台，主要负责：

- 创建新的剧情草案
- 恢复历史 Session
- 审核并修改草案
- 在正式会话中发送消息
- 查看事件时间线
- 管理自动推进
- 查看模型用量
- 修改全局模型配置

前端并不直接理解提示词和工具细节，它只消费后端返回的 Session 快照和事件流。

## 2. 页面结构

路由定义位于 `apps/web/src/router.ts`：

- `/`：首页 `HomePage.vue`
- `/sessions/:id/draft`：草案确认页 `DraftReviewPage.vue`
- `/sessions/:id`：会话控制台 `SessionConsolePage.vue`
- `/settings`：配置页 `SettingsPage.vue`

## 3. App 外壳

`App.vue` 提供统一顶部导航：

- 会话
- 配置

`style.css` 定义了整个应用的视觉样式，包括：

- 顶部栏
- 玻璃拟态面板
- 时间线卡片
- 表单输入
- 用量卡片
- 自动推进与角色信息区

## 4. API 封装

`apps/web/src/api.ts` 封装了全部前端请求：

- 配置读取与保存
- Session 列表
- 草案生成、读取、修改、确认
- 发消息
- 手动重试
- 定时器更新
- 历史事件读取
- SSE 地址构造

默认 API 基础地址来自：

- `import.meta.env.VITE_API_BASE`
- 默认值 `http://localhost:3001/api`

## 5. 首页 HomePage

首页分成左右两块：

### 左侧：新建推演

- 输入玩家故事简介
- 调用 `api.createDraft()`
- 成功后跳转到草案确认页

### 右侧：恢复已有 Session

- 调用 `api.listSessions()`
- 按 Session 状态决定跳转到草案页还是正式会话页

这个页面很轻，主要承担入口导航角色。

## 6. 草案确认页 DraftReviewPage

这是前端最重要的“人工校对”页面。

### 6.1 可编辑内容

- 标题
- 世界背景
- 开场局势
- 玩家处境
- 节奏建议
- 安全框架
- Agent 名称
- Agent 角色
- Agent 摘要
- Agent persona
- Agent goals
- Agent style

### 6.2 页面行为

- 首次进入时调用 `api.getSession()`
- 把 `session.draft` 同步到本地可编辑对象
- 点击“保存修改”时调用 `api.updateDraft()`
- 点击“确认并进入推演”时先保存，再调用 `api.confirmSession()`

### 6.3 数据处理细节

页面包含一个 `toDisplayText()` 辅助函数，用于把后端可能返回的对象、数组或其它宽松结构转成适合编辑框展示的字符串。这是为了配合草案生成阶段的“宽松归一化”设计。

## 7. 会话控制台 SessionConsolePage

这是正式推演界面，功能最集中。

### 7.1 页面布局

- 顶部 Hero：显示标题、当前摘要、阶段、地点、张力、状态
- 左侧主区域：剧情动态时间线
- 右侧侧栏：
  - 输入区
  - 自动推进
  - 模型用量
  - 参与角色

### 7.2 初始化逻辑

加载页面时会：

1. 调用 `api.getSession()`
2. 调用 `api.getEvents()`
3. 过滤掉持久化的 `system.wait_scheduled`
4. 建立 `EventSource` 连接

### 7.3 SSE 联动

当前前端监听两个关键事件：

- `session.updated`：更新整个 Session 快照
- `event.appended`：把新增事件放入实时播放队列

另外，后端还会发送：

- `usage.updated`
- `timer.updated`

但当前页面主要依赖 `session.updated` 获取最新快照。

### 7.4 实时播放队列

时间线不是“收到就直接 append”，而是维护了一套本地播放队列：

- `liveQueue`
- `queueRunning`
- `playbackGeneration`
- `pendingPauseMs`

原因是前端需要把 `wait` 工具转成用户可感知的节奏停顿。

### 7.5 `wait` 的前端表现

后端记录 `system.wait_scheduled` 事件后，前端不会把它当普通持久化卡片渲染，而是：

- 生成一个临时“节奏控制”展示卡
- 显示“约 X 秒后继续”的倒计时
- 等待设定时间后继续展示后续事件

这使得“同一轮动作内的停顿”能表现出更像真人互动的节奏感。

### 7.6 输入区

输入区会把消息发送到 `api.postMessage()`，发送成功后清空输入框。

页面本身不负责本地拼接玩家消息，而是等后端写入 `player.message` 事件后，再通过 SSE 回流到时间线。

### 7.7 自动推进区

页面维护：

- `timerEnabled`
- `intervalMs`

点击保存时调用 `api.updateTimer()`，后端返回最新 Session 后再同步到页面。

### 7.8 失败重试

页面会从时间线尾部逆向查找最近一条 `system.tick_failed`。如果最近一次推进失败而且之后没有成功事件，就显示顶部错误提示条，并提供“重试推进”按钮。

### 7.9 角色面板

角色信息来源于：

- `session.confirmedSetup.agents`
- 如果还没有确认，则回退到 `session.draft.agents`

显示时把角色类型转换为中文：

- `director -> 主导者`
- `support -> 辅助者`

## 8. 时间线组件 EventTimeline

`EventTimeline.vue` 是前端显示层的核心转换器。它把底层 `SessionEvent[]` 映射为 UI 语义更明确的展示卡片。

### 8.1 映射策略

示例：

- `player.message` -> 玩家输入卡片
- `agent.speak_player` -> 角色对白卡片
- `agent.stage_direction` -> 动作卡片
- `agent.story_effect` -> 剧情变化卡片
- `scene.updated` -> 场景状态卡片
- `system.tick_failed` -> 系统异常卡片
- `system.story_ended` -> 结局卡片

### 8.2 特殊处理

- `system.wait_scheduled` 不进入普通持久化时间线
- `agent.device_control` 会根据工具是否必选，给卡片打上“可选工具”标记
- `system.usage_recorded` 会显示本次模型消耗

### 8.3 测试覆盖

时间线组件已有针对以下行为的单元测试：

- 玩家消息渲染
- 实时停顿卡渲染
- 角色对白样式
- 设备控制事件显示
- Tick 失败事件显示

## 9. 配置页 SettingsPage

配置页负责编辑全局 LLM 配置。

### 9.1 可配置项

- API Base URL
- API Key
- Model
- Temperature
- Top P
- Max Tokens
- Request Timeout
- 工具开关

### 9.2 工具开关逻辑

工具目录来自 `@dglab-ai/shared` 中的 `toolCatalog`。

- 必选工具不能关闭
- 可选工具的状态会写入 `config.toolStates`
- 新建 Session 时会把当前全局工具状态作为默认值带入

注意：这不是“正在运行的 Session 动态变更开关”，而是“新会话默认配置”的来源。已经确认的 Session 会保留自己的模型配置快照。

## 10. 当前前端实现特点

- 数据获取简单直接，没有引入复杂状态管理库
- 依赖后端快照保持一致性，而不是在前端重复实现业务状态机
- 对“停顿”“错误重试”“可选工具”做了比较明确的界面语义映射
- 适合原型和控制台场景，后续如果功能继续增加，再考虑拆分 composable 或状态层会更稳妥
