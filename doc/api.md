# API 参考

所有接口都以前缀 `/api` 暴露。本文档描述的是当前仓库里的真实实现，而不是早期设想。

## 1. 鉴权约定

除 `POST /api/auth/login` 外，其余 `/api/*` 默认都需要访问密码。

可接受的传递方式：

- 请求头 `x-auth-password`
- 请求头 `Authorization: Bearer <password>`
- SSE 场景的查询参数 `authPassword`

失败时返回：

```json
{
  "message": "密码错误或尚未登录"
}
```

HTTP 状态码为 `401`。

## 2. 健康检查

### `GET /api/health`

返回：

```json
{
  "ok": true
}
```

## 3. 鉴权接口

### `POST /api/auth/login`

请求体：

```json
{
  "password": "your-password"
}
```

成功返回：

```json
{
  "ok": true
}
```

## 4. 配置接口

配置现在围绕完整 `AppConfig` 展开，不再只是单一 `LlmConfig`。

### 4.1 `GET /api/config`

读取完整 `AppConfig`。

### 4.2 `PUT /api/config`

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
      "reasoningEffort": "medium",
      "maxTokens": 1200,
      "topP": 1,
      "requestTimeoutMs": 120000,
      "toolStates": {
        "control_vibe_toy": true,
        "control_e_stim_toy": false,
        "speak_to_player": true,
        "speak_to_agent": true,
        "emit_reasoning_summary": true,
        "perform_stage_direction": true,
        "apply_story_effect": true,
        "update_scene_state": true,
        "end_story": true
      }
    }
  ],
  "tts": {
    "baseUrl": "http://127.0.0.1:8080",
    "roleMappings": [
      {
        "id": "narrator",
        "characterName": "旁白",
        "referenceId": "wendi"
      }
    ]
  }
}
```

### 4.3 `PATCH /api/config/active-backend`

请求体：

```json
{
  "backendId": "default-openai"
}
```

返回更新后的完整 `AppConfig`。

## 5. LLM 调用记录接口

### `GET /api/llm-calls`

查询参数：

- `page`
- `pageSize`

返回：

```json
{
  "items": [
    {
      "id": "llm_call_xxx",
      "kind": "ensemble-turn",
      "sessionId": "session_xxx",
      "model": "gpt-4.1-mini",
      "schemaName": "stream_text",
      "status": "success",
      "promptTokens": 1000,
      "completionTokens": 300,
      "totalTokens": 1300,
      "durationMs": 2840,
      "startedAt": "2026-03-26T10:00:00.000Z",
      "completedAt": "2026-03-26T10:00:02.840Z",
      "context": {
        "protocolFallback": true,
        "missingProtocolBlocks": ["playerMessageInterpretations"]
      }
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 1,
  "totalPages": 1
}
```

## 6. Session 接口

### 6.1 `GET /api/sessions`

返回 Session 列表：

```json
[
  {
    "id": "session_xxx",
    "title": "剧情标题",
    "status": "active",
    "updatedAt": "2026-03-26T10:00:00.000Z",
    "createdAt": "2026-03-26T09:00:00.000Z"
  }
]
```

### 6.2 `POST /api/sessions/draft`

根据玩家简介生成草案。

请求体：

```json
{
  "playerBrief": "请输入你的故事背景与角色设定",
  "toolContext": {
    "eStim": {
      "bChannelEnabled": false,
      "channelPlacements": {
        "a": "臀部"
      },
      "allowedPulses": [
        {
          "id": "pulse_1",
          "name": "呼吸"
        }
      ]
    }
  }
}
```

`toolContext` 可省略。

### 6.3 `PATCH /api/sessions/:id/draft`

更新草案内容。请求体字段全部可选：

- `title`
- `worldSummary`
- `openingSituation`
- `playerState`
- `initialPlayerBodyItemState`
- `suggestedPace`
- `safetyFrame`
- `sceneGoals`
- `contentNotes`
- `agents`

### 6.4 `POST /api/sessions/:id/confirm`

确认草案并进入正式推演。

请求体可选：

```json
{
  "toolContext": {
    "eStim": {
      "bChannelEnabled": true
    }
  }
}
```

### 6.5 `GET /api/sessions/:id`

读取单个 Session 最新快照。

### 6.6 `POST /api/sessions/:id/messages`

发送玩家消息。

请求体：

```json
{
  "text": "你想对角色说的话",
  "toolContext": {
    "eStim": {
      "bChannelEnabled": false
    }
  }
}
```

### 6.7 `POST /api/sessions/:id/retry`

重试最近一次失败推进。

请求体可为空，也可携带：

```json
{
  "toolContext": {
    "eStim": {
      "bChannelEnabled": false
    }
  }
}
```

### 6.8 `POST /api/sessions/:id/auto-tick`

请求后端检查是否到达自动推进时间。

请求体可为空，也可携带 `toolContext`。

说明：

- 调用成功不代表一定真的触发了 Tick
- 后端会检查 `enabled`
- 会检查 `inFlight`
- 会检查 `nextTickAt`

### 6.9 `POST /api/sessions/:id/timer`

更新自动推进配置。

请求体：

```json
{
  "enabled": true,
  "intervalMs": 10000
}
```

### 6.10 `GET /api/sessions/:id/events`

读取事件流。

查询参数：

- `cursor`：只返回 `seq > cursor` 的事件
- `limit`：限制返回数量

### 6.11 `GET /api/sessions/:id/memory-debug`

读取记忆调试数据，包含：

- `memoryState`
- `recentRawTurns`
- `assembledContext`
- `storyStateSnapshot`
- `queueSnapshot`

### 6.12 `GET /api/sessions/:id/stream`

建立 SSE 长连接。

连接成功后至少先收到：

```text
event: ready
data: {"sessionId":"session_xxx"}
```

如果当前回合正在流式推理，还可能立刻收到：

```text
event: llm.preview.snapshot
data: {"previewTurn":{...}}
```

## 7. TTS 接口

### 7.1 `GET /api/tts/health`

可选查询参数：

- `baseUrl`

返回：

```json
{
  "status": "ok"
}
```

### 7.2 `GET /api/tts/references`

可选查询参数：

- `baseUrl`

返回：

```json
{
  "success": true,
  "reference_ids": ["wendi", "lisha"]
}
```

### 7.3 `GET /api/tts/sessions/:sessionId/events/:seq`

根据事件序号合成或读取缓存音频。

返回：

- 二进制音频
- `Content-Type: audio/mpeg`
- 响应头 `x-tts-cache: HIT|MISS`

### 7.4 `GET /api/tts/sessions/:sessionId/readables/:readableId`

按可朗读内容 `readableId` 获取音频。

适用于演出模式或 setup 内容朗读，不局限于事件序号。

### 7.5 `GET /api/tts/sessions/:sessionId/performance`

获取全文演出模式状态。

示例返回：

```json
{
  "sessionId": "session_xxx",
  "items": [
    {
      "readable": {
        "id": "event:12",
        "source": "event",
        "kind": "character_speech",
        "seq": 12,
        "title": "丽莎",
        "kicker": "角色发言",
        "displaySpeaker": "丽莎",
        "ttsSpeaker": "丽莎",
        "text": "把视线抬起来，看着我。",
        "createdAt": "2026-03-26T10:00:00.000Z"
      },
      "cacheKey": "sha256...",
      "hasVoiceMapping": true,
      "referenceId": "lisha",
      "isCached": true,
      "durationMs": 2400,
      "readyForPlayback": true
    }
  ],
  "ttsBaseUrlConfigured": true,
  "totalReadableCount": 12,
  "cachedReadableCount": 8,
  "readyReadableCount": 8,
  "missingReadableCount": 4,
  "missingVoiceSpeakers": [],
  "readyForFullPlayback": false,
  "batchJob": null
}
```

### 7.6 `POST /api/tts/sessions/:sessionId/performance/batch`

启动全文缺失音频批量合成。

返回最新演出状态。

### 7.7 `DELETE /api/tts/sessions/:sessionId/performance/batch`

取消当前批量合成任务。

返回最新演出状态。

## 8. SSE 事件

当前共享的 SSE 事件类型包括：

- `session.updated`
- `event.appended`
- `tick.started`
- `tick.completed`
- `usage.updated`
- `timer.updated`
- `llm.turn.started`
- `llm.action.started`
- `llm.action.meta`
- `llm.action.text.delta`
- `llm.action.field.completed`
- `llm.action.completed`
- `llm.reasoning_summary.delta`
- `llm.preview.snapshot`
- `llm.turn.control`
- `llm.turn.player_message_interpretations`
- `llm.turn.player_body_item_state`
- `llm.turn.completed`
- `llm.turn.failed`
- `error`

实际正式事件广播最常见的是：

- `session.updated`
- `event.appended`
- `usage.updated`
- `timer.updated`

而 `llm.*` 系列主要服务于前端实时预览。

## 9. 关键数据结构

## 9.1 AppConfig

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
      "reasoningEffort": "medium",
      "maxTokens": 1200,
      "topP": 1,
      "requestTimeoutMs": 120000,
      "toolStates": {}
    }
  ],
  "tts": {
    "baseUrl": "http://127.0.0.1:8080",
    "roleMappings": []
  }
}
```

## 9.2 ToolContext

```json
{
  "eStim": {
    "gameConnectionCodeLabel": "client@http://127.0.0.1:8920",
    "bChannelEnabled": true,
    "channelPlacements": {
      "a": "臀部",
      "b": "大腿两侧"
    },
    "allowedPulses": [
      {
        "id": "pulse_1",
        "name": "呼吸"
      }
    ],
    "lastSyncedAt": "2026-03-26T10:00:00.000Z"
  }
}
```

## 9.3 SessionDraft

```json
{
  "title": "剧情标题",
  "playerBrief": "玩家原始输入",
  "worldSummary": "世界背景",
  "openingSituation": "开场局势",
  "playerState": "玩家处境",
  "initialPlayerBodyItemState": ["你现在戴着一副遮光眼罩"],
  "suggestedPace": "节奏建议",
  "safetyFrame": "安全框架",
  "agents": [],
  "sceneGoals": [],
  "contentNotes": []
}
```

## 9.4 Session 运行时相关字段

`Session` 当前除草案信息外，还会包含：

- `playerBodyItemState`
- `storyState`
- `agentStates`
- `memoryState`
- `timerState`
- `usageTotals`
- `toolContext`
- `llmConfigSnapshot`
- `promptVersions`

## 9.5 SessionReadableContent

```json
{
  "id": "event:12",
  "source": "event",
  "kind": "character_speech",
  "seq": 12,
  "eventType": "agent.speak_player",
  "title": "丽莎",
  "kicker": "角色发言",
  "displaySpeaker": "丽莎",
  "ttsSpeaker": "丽莎",
  "text": "把视线抬起来，看着我。",
  "createdAt": "2026-03-26T10:00:00.000Z"
}
```

## 9.6 SessionTtsPerformanceState

这是演出模式页面的主数据结构，包含：

- 全部可朗读条目
- 缓存命中情况
- 是否已具备时长
- 缺失音色映射的角色
- 批量任务状态

## 9.7 SessionEvent

事件类型当前至少包含：

- `session.created`
- `draft.generated`
- `draft.updated`
- `session.confirmed`
- `player.body_item_state_updated`
- `player.message`
- `player.message_interpreted`
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
