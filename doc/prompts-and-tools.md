# 提示词与工具

## 1. 设计目标

DGLabAI 的提示词系统不是让模型自由续写剧情，而是把模型限制在几个明确阶段里：

- 世界构建：生成结构化草案
- 正式推演：生成一份共享的 action batch
- 记忆压缩：把长期上下文整理为可控摘要

工具系统则负责把“模型的结构化决定”真正执行为：

- 事件
- 场景状态
- 玩家身体道具状态
- 设备动作意图
- 结束态

## 2. 当前提示词文件

目录位于 `apps/server/src/prompts/`。

### 2.1 `shared_safety_preamble.md`

公共安全前言，主要约束：

- 纯虚构、自包含的叙事空间
- 玩家可见内容统一使用简体中文
- 玩家可见叙事默认使用第二人称
- 避免现实伤害映射和过度露骨表达

### 2.2 `world_builder.md`

草案生成模板，负责：

- 基于 `playerBrief` 生成 `SessionDraft`
- 输出世界背景、开场局势、玩家处境、节奏建议
- 输出 `initialPlayerBodyItemState`
- 输出 Agent 列表
- 吸收工具世界观钩子

### 2.3 `tool_contract.md`

正式推演阶段的输出合同，负责约束：

- 必须用 line protocol 输出
- 每个工具的精确参数形状
- `@action` / `@field` / `@endfield` / `@endaction` 的使用方式
- `@turnControl`
- `@playerMessageInterpretations`
- `@playerBodyItemState`
- `@done`

### 2.4 `ensemble_turn.md`

正式推演主模板，会一起注入：

- 角色名单
- 角色运行态
- 会话草案
- 场景状态
- 玩家身体道具状态
- 工具运行态上下文
- archive / episode / turn / recent raw turns 记忆
- 玩家历史消息账本
- 当前 Tick 上下文

### 2.5 `r18_guidance.md`

这是 `ensemble_turn` 的附加指导块，主要强化：

- 过程化展开
- 节奏分段
- 动作与对白配合
- 不从意图直接跳到结果

## 3. 提示词渲染机制

`FilePromptTemplateService` 负责：

- 从磁盘读取 Markdown 模板
- 用 `{{ variable }}` 做替换
- 缓存模板内容
- 暴露模板版本号

在 Session 确认时，后端会把当前提示词版本写入 `promptVersions`，供后续调试与回放使用。

## 4. 世界构建阶段

### 4.1 输入

当前世界构建阶段会接收：

- `playerBrief`
- `sharedSafety`
- `toolWorldHooks`

### 4.2 输出目标

目标结构现在包含：

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

### 4.3 工具世界观钩子

工具可以通过 `buildWorldPrompt()` 影响草案生成。

当前显式使用这条机制的有：

- `control_vibe_toy`
- `control_e_stim_toy`

两者都会要求模型在世界设定里提前埋入“设备已经存在、可以被合理感知或操控”的前提。

## 5. 正式推演阶段

### 5.1 输入上下文

正式推演阶段不是只看最近几句对话，而是同时输入：

- 角色 roster
- 角色运行态
- 草案内容
- 当前场景状态
- 当前玩家身体道具状态
- 工具运行态信息
- 记忆摘要块
- 最近原始回合
- 玩家历史消息账本
- 本轮触发原因与排队消息

### 5.2 输出结构

逻辑上的目标结构仍然是：

```json
{
  "actions": [],
  "turnControl": {
    "continue": true,
    "endStory": false,
    "needsHandoff": false
  },
  "playerMessageInterpretations": [],
  "playerBodyItemState": []
}
```

但运行时实际要求模型输出的是 line protocol，而不是直接 JSON。

### 5.3 line protocol

一个典型示例如下：

```text
@action {"actorAgentId":"director","tool":"speak_to_player","targetScope":"player"}
@field args.message
别急着躲开。<delay>900</delay>先看着我。
@endfield
@endaction

@turnControl {"continue":true,"endStory":false,"needsHandoff":false}
@playerMessageInterpretations []
@playerBodyItemState ["你现在戴着一副遮光眼罩"]
@done
```

这样设计的原因是：

- 可以边流式生成边做预览
- 每个字段都能单独完成和校验
- 比让模型一次性输出大 JSON 更稳

### 5.4 预览事件

`LineProtocolTurnParser` 在解析过程中会持续向前端发出：

- `llm.action.meta`
- `llm.action.text.delta`
- `llm.action.field.completed`
- `llm.action.completed`

所以当前提示词系统不仅服务于“最终结果”，也服务于“流式演出过程”。

## 6. 玩家消息 TTS 改写

近期实现新增了 `playerMessageInterpretations`：

- 模型可以为本轮排队的玩家消息返回更适合朗读的 `ttsText`
- 后端在 Tick 结束后把它们落成 `player.message_interpreted`
- TTS 朗读玩家消息时优先读解释后的版本，而不是原始输入

这允许：

- 保留玩家原始文本作为事实事件
- 同时给 TTS 一个更符合剧情语气、停顿和情绪标签的朗读版本

## 7. 玩家身体道具状态

正式推演阶段现在要求模型显式维护 `playerBodyItemState`：

- 草案阶段也可生成初始值
- 正式回合结束后会和旧状态做对比
- 有变化时写入 `player.body_item_state_updated`

这部分不是普通剧情描述，而是“后续回合共享的可追踪状态”。

## 8. 文本内联标签

当前提示词与前端/后端共同支持两类内联标签。

### 8.1 `<delay>`

示例：

```text
别急。<delay>900</delay>先看着我。
```

作用：

- 前端展示时转成局部停顿
- TTS 预处理时会移除

### 8.2 `<emo_inst>`

示例：

```text
<emo_inst>low voice</emo_inst>你终于肯开口了。
```

作用：

- 作为 TTS 语气 / 情绪提示
- 前端展示层可以做标签化处理
- TTS 预处理时会转为方括号标签，并会合并相邻标签

## 9. 工具系统总览

当前需要区分三个概念：

- 运行时工具注册表
- 配置页可切换工具目录
- 前端本地能力同步出来的 `toolContext`

### 9.1 运行时工具注册表

后端 `createDefaultToolRegistry()` 当前注册了 10 个工具：

- `control_vibe_toy`
- `control_e_stim_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `wait`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

### 9.2 配置页工具目录

`packages/shared/src/index.ts` 中的 `toolCatalog` 当前暴露了 9 个工具：

- `control_vibe_toy`
- `control_e_stim_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

也就是说：

- `wait` 是运行时内部工具
- 但不作为设置页独立开关

## 10. 各工具作用

### `control_vibe_toy`

- 控制穿戴式震动小玩具
- 产出 `agent.device_control`
- 当前状态一般为 `simulated`
- 会更新执行 Agent 的运行时 intent

### `control_e_stim_toy`

- 控制本地 e-stim 设备
- 支持 `set` 与 `fire` 两种命令
- 可独立控制 A/B 通道
- 只输出 pulse 名称，不输出真实 `pulseId`
- 产出 `agent.device_control`
- 当前事件状态通常为 `frontend_pending`

这个工具不会让后端直接连用户设备，而是把意图交给前端本地桥接层。

### `speak_to_player`

- 角色对玩家说话
- 产出 `agent.speak_player`

### `speak_to_agent`

- 角色之间说话
- 产出 `agent.speak_agent`

### `emit_reasoning_summary`

- 输出面向玩家可见的意图摘要
- 产出 `agent.reasoning`

### `perform_stage_direction`

- 输出动作或舞台描述
- 产出 `agent.stage_direction`

### `wait`

- 输出 `system.wait_scheduled`
- 用于同一轮展示中的显式节奏停顿
- 不会创建未来独立 Tick

### `apply_story_effect`

- 输出剧情效果
- 产出 `agent.story_effect`
- 会推动张力和氛围变化

### `update_scene_state`

- 更新共享场景状态
- 产出 `scene.updated`
- 支持把一些隐藏记忆信息写入状态

### `end_story`

- 结束本次 Session
- 产出 `system.story_ended`
- 会停止后续工具继续执行

## 11. 工具执行机制

工具注册表执行单条动作时会：

1. 判断工具是否存在
2. 判断当前后端是否启用了该工具
3. 用对应 `inputSchema` 校验参数
4. 调用工具执行函数
5. 将结果写成事件和状态变化

对外层来说，模型永远不是直接“输出给前端文本”，而是：

- 先输出结构化动作
- 再由工具执行决定最终事件

## 12. e-stim 的提示词注入方式

`control_e_stim_toy` 之所以能工作，不只是靠一个工具名，还依赖大量 runtime prompt 注入：

- 是否启用 B 通道
- A/B 通道放置位置
- 当前强度和 limit
- 当前 pulse 名称
- 允许使用的波形名称
- `fire` 强度上限

这些都来自前端本地配置同步过来的 `toolContext.eStim`。

## 13. 当前设计取舍

### 13.1 用 line protocol 替代一次性 JSON

优点：

- 更适合流式预览
- 每个字段可单独完成
- 出错位置更清晰

代价：

- 解析器复杂度更高
- 提示词必须更细致地约束字段顺序和闭合符

### 13.2 让模型显式返回 `playerMessageInterpretations`

优点：

- 玩家原始消息与 TTS 朗读文本分离
- 朗读效果更贴近剧情表达

代价：

- 协议更复杂
- 需要额外的事件类型和后处理逻辑

### 13.3 工具负责“事实落库”，提示词只负责“动作规划”

优点：

- 状态变化更可解释
- 前端展示更稳定
- 调试和回放更容易

代价：

- 工具 schema 和提示词合同必须长期一起维护
