# API 参考

本文档基于当前代码实现整理，所有路径默认以前缀 `/api` 暴露。

## 1. 健康检查

### `GET /health`

返回：

```json
{
  "ok": true
}
```

## 2. 配置接口

### `GET /config`

读取全局 LLM 配置。

### `PUT /config`

保存全局 LLM 配置。

请求体示例：

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-xxx",
  "model": "gpt-4.1-mini",
  "temperature": 0.9,
  "maxTokens": 1200,
  "topP": 1,
  "requestTimeoutMs": 120000,
  "toolStates": {
    "control_vibe_toy": true,
    "speak_to_player": true,
    "speak_to_agent": true,
    "emit_reasoning_summary": true,
    "perform_stage_direction": true,
    "wait": true,
    "apply_story_effect": true,
    "update_scene_state": true,
    "end_story": true
  }
}
```

## 3. Session 接口

### `GET /sessions`

返回 Session 列表，字段包括：

- `id`
- `title`
- `status`
- `updatedAt`
- `createdAt`

### `POST /sessions/draft`

根据玩家简介生成草案。

请求体：

```json
{
  "playerBrief": "请输入故事背景与角色设定"
}
```

返回完整 Session，状态为 `draft`。

### `PATCH /sessions/:id/draft`

修改草案内容。

请求体字段可选，包括：

- `title`
- `worldSummary`
- `openingSituation`
- `playerState`
- `suggestedPace`
- `safetyFrame`
- `sceneGoals`
- `contentNotes`
- `agents`

### `POST /sessions/:id/confirm`

确认草案并进入正式推演，返回最新 Session。

### `GET /sessions/:id`

获取单个 Session 快照。

### `POST /sessions/:id/messages`

发送玩家消息。

请求体：

```json
{
  "text": "你想对角色说的话"
}
```

### `POST /sessions/:id/retry`

手动重试当前会话的下一轮推进。

### `POST /sessions/:id/timer`

更新自动推进配置。

请求体：

```json
{
  "enabled": true,
  "intervalMs": 10000
}
```

### `GET /sessions/:id/events`

读取事件流。

查询参数：

- `cursor`：只返回序号大于该值的事件
- `limit`：最大返回数量

### `GET /sessions/:id/stream`

建立 SSE 长连接。

连接成功后会先收到：

```text
event: ready
data: {"sessionId":"session_xxx"}
```

## 4. 核心数据结构

## 4.1 `LlmConfig`

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "string",
  "model": "string",
  "temperature": 0.9,
  "maxTokens": 1200,
  "topP": 1,
  "requestTimeoutMs": 120000,
  "toolStates": {}
}
```

## 4.2 `SessionDraft`

```json
{
  "title": "剧情标题",
  "playerBrief": "玩家原始输入",
  "worldSummary": "世界背景",
  "openingSituation": "开场局势",
  "playerState": "玩家处境",
  "suggestedPace": "节奏建议",
  "safetyFrame": "安全框架",
  "agents": [],
  "sceneGoals": [],
  "contentNotes": []
}
```

## 4.3 `Session`

重要字段：

- `id`
- `status`: `draft | active | ended`
- `title`
- `initialPrompt`
- `draft`
- `confirmedSetup`
- `storyState`
- `agentStates`
- `timerState`
- `usageTotals`
- `llmConfigSnapshot`
- `promptVersions`
- `createdAt`
- `updatedAt`
- `lastSeq`

## 4.4 `SessionEvent`

```json
{
  "sessionId": "session_xxx",
  "seq": 1,
  "type": "player.message",
  "source": "player",
  "agentId": "optional",
  "createdAt": "2026-03-16T00:00:00.000Z",
  "payload": {}
}
```

## 5. 事件类型

当前已定义事件类型如下：

- `session.created`
- `draft.generated`
- `draft.updated`
- `session.confirmed`
- `player.message`
- `agent.device_control`
- `agent.speak_player`
- `agent.speak_agent`
- `agent.reasoning`
- `agent.stage_direction`
- `agent.story_effect`
- `scene.updated`
- `system.tick_started`
- `system.tick_failed`
- `system.tick_completed`
- `system.timer_updated`
- `system.wait_scheduled`
- `system.story_ended`
- `system.usage_recorded`

## 6. SSE 消息

SSE 通道当前实际会发送以下类型：

### `session.updated`

数据格式：

```json
{
  "session": {}
}
```

### `event.appended`

数据格式：

```json
{
  "event": {}
}
```

### `usage.updated`

数据格式：

```json
{
  "usageTotals": {},
  "recentCalls": []
}
```

### `timer.updated`

数据格式：

```json
{
  "timerState": {}
}
```

## 7. 错误语义

统一错误处理中间件会返回：

```json
{
  "message": "错误说明"
}
```

常见情况：

- 404：Session 不存在
- 400：状态不允许当前操作，例如试图在非 `draft` Session 修改草案
- 500：未处理异常，例如模型调用失败或内部逻辑错误

## 8. 状态变化约定

### 新建草案

- 先返回完整 `draft` Session
- 同时事件流中会追加 `session.created` 和 `draft.generated`

### 发送消息

- 接口本身只表示“消息已入队”
- 真正的剧情推进结果要等待后续 Tick 和 SSE 事件流

### 自动推进

- 开关变化会立即写入 Session
- 后续是否继续推进由调度器负责

## 9. 当前 API 边界

- 没有鉴权
- 没有分页元数据封装
- 没有幂等键
- 没有 WebSocket，只使用 SSE
- 没有按 Agent 独立读取上下文的接口

这些限制与项目当前“本地原型 / 控制台应用”定位一致。
