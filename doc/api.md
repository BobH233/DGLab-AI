# API 参考

所有接口都以前缀 `/api` 暴露。本文档描述当前代码中的实际实现。

## 1. 健康检查

### `GET /api/health`

返回：

```json
{
  "ok": true
}
```

## 2. 配置接口

当前配置接口围绕 `AppConfig` 工作，支持多个模型后端。

### 2.1 `GET /api/config`

读取完整 `AppConfig`。

### 2.2 `PUT /api/config`

保存完整 `AppConfig`。

示例：

```json
{
  "activeBackendId": "default-openai",
  "backends": [
    {
      "id": "default-openai",
      "name": "默认后端",
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
        "apply_story_effect": true,
        "update_scene_state": true,
        "end_story": true
      }
    }
  ]
}
```

### 2.3 `PATCH /api/config/active-backend`

切换当前激活后端。

请求体：

```json
{
  "backendId": "default-openai"
}
```

## 3. Session 接口

### 3.1 `GET /api/sessions`

返回 Session 列表：

```json
[
  {
    "id": "session_xxx",
    "title": "剧情标题",
    "status": "draft",
    "updatedAt": "2026-03-17T00:00:00.000Z",
    "createdAt": "2026-03-17T00:00:00.000Z"
  }
]
```

### 3.2 `POST /api/sessions/draft`

根据玩家简介生成草案。

请求体：

```json
{
  "playerBrief": "请输入你的故事背景与角色设定"
}
```

返回完整 `Session`，状态为 `draft`。

### 3.3 `PATCH /api/sessions/:id/draft`

更新草案内容。

请求体字段均为可选：

- `title`
- `worldSummary`
- `openingSituation`
- `playerState`
- `suggestedPace`
- `safetyFrame`
- `sceneGoals`
- `contentNotes`
- `agents`

### 3.4 `POST /api/sessions/:id/confirm`

确认草案并进入正式推演。

返回最新 `Session`。

### 3.5 `GET /api/sessions/:id`

读取单个 Session 快照。

### 3.6 `POST /api/sessions/:id/messages`

发送玩家消息。

请求体：

```json
{
  "text": "你想对角色说的话"
}
```

### 3.7 `POST /api/sessions/:id/retry`

对最近一次失败推进进行手动重试。

### 3.8 `POST /api/sessions/:id/auto-tick`

请求后端检查该 Session 是否到达自动推进时间。

说明：

- 该接口没有请求体
- 即使前端调用了，也不代表一定会真正触发 Tick
- 后端会检查 `enabled`、`inFlight` 和 `nextTickAt`

### 3.9 `POST /api/sessions/:id/timer`

更新自动推进设置。

请求体：

```json
{
  "enabled": true,
  "intervalMs": 10000
}
```

### 3.10 `GET /api/sessions/:id/events`

读取事件流。

查询参数：

- `cursor`：只返回 `seq > cursor` 的事件
- `limit`：限制返回数量

### 3.11 `GET /api/sessions/:id/memory-debug`

读取记忆调试数据。

返回：

- 当前 `memoryState`
- 最近原始回合
- 下一轮真正使用的 assembled context
- 当前 `storyState` 快照
- 当前消息队列快照

### 3.12 `GET /api/sessions/:id/stream`

建立 SSE 长连接。

连接成功后先收到：

```text
event: ready
data: {"sessionId":"session_xxx"}
```

## 4. SSE 事件

当前定义的 SSE 事件类型为：

- `session.updated`
- `event.appended`
- `tick.started`
- `tick.completed`
- `usage.updated`
- `timer.updated`
- `error`

实际代码里后端常发的是：

- `session.updated`
- `event.appended`
- `usage.updated`
- `timer.updated`

## 5. 关键数据结构

## 5.1 AppConfig

```json
{
  "activeBackendId": "default-openai",
  "backends": [
    {
      "id": "default-openai",
      "name": "默认后端",
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
  ]
}
```

## 5.2 SessionDraft

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

## 5.3 Session

主要字段：

- `id`
- `status`: `draft | active | ended`
- `title`
- `initialPrompt`
- `draft`
- `confirmedSetup`
- `storyState`
- `agentStates`
- `memoryState`
- `timerState`
- `usageTotals`
- `llmConfigSnapshot`
- `promptVersions`
- `createdAt`
- `updatedAt`
- `lastSeq`

## 5.4 StoryState

```json
{
  "location": "会客室",
  "phase": "teasing",
  "tension": 6,
  "summary": "当前场景概要",
  "activeObjectives": ["让你继续回应"],
  "lastPlayerMessageAt": "2026-03-17T00:00:00.000Z"
}
```

## 5.5 TimerState

```json
{
  "enabled": true,
  "intervalMs": 10000,
  "inFlight": false,
  "nextTickAt": "2026-03-17T00:00:10.000Z",
  "queuedReasons": [],
  "queuedPlayerMessages": [],
  "pendingWaits": []
}
```

## 5.6 SessionEvent

```json
{
  "sessionId": "session_xxx",
  "seq": 1,
  "type": "player.message",
  "source": "player",
  "agentId": "optional",
  "createdAt": "2026-03-17T00:00:00.000Z",
  "payload": {}
}
```

## 5.7 MemoryState

```json
{
  "version": 1,
  "lastProcessedSeq": 42,
  "policy": {
    "rawTurnsToKeep": 2,
    "turnsPerEpisode": 4,
    "maxTurnSummariesBeforeMerge": 6,
    "maxEpisodeSummaries": 6,
    "archiveCharBudget": 1200,
    "episodeCharBudget": 1800,
    "turnCharBudget": 1800,
    "rawEventCharBudget": 3500
  },
  "archiveSummary": null,
  "episodeSummaries": [],
  "turnSummaries": [],
  "debug": {
    "lastRefreshStatus": "idle",
    "lastRefreshError": null,
    "lastCompactionAt": null,
    "lastCompactionMode": null,
    "recentRuns": []
  }
}
```

## 5.8 MemoryDebugResponse

主要字段：

- `sessionId`
- `memoryState`
- `recentRawTurns`
- `assembledContext`
- `storyStateSnapshot`
- `queueSnapshot`

## 6. 事件类型

当前 `SessionEvent.type` 包括：

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

## 7. 注意事项

- 自动推进接口是“请求检查是否可推进”，不是“强制立刻推进”
- 当前没有独立后台定时守护进程
- 已确认 Session 会保存模型配置快照，不跟随后续全局切换自动变化
