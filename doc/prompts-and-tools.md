# 提示词与工具

## 1. 设计目标

DGLabAI 的提示词系统不是让模型自由写剧情，而是让模型在不同阶段承担不同职责：

- 阶段一：世界构建，生成结构化草案
- 阶段二：共享回合编排，生成结构化 action batch
- 辅助链路：长程记忆摘要与压缩

对应地，工具系统负责把模型决策转换成可持久化、可解释、可回放的事件。

## 2. 当前提示词文件

目录：`apps/server/src/prompts/`

### 2.1 `shared_safety_preamble.md`

公共安全前言，负责约束：

- 虚构、封闭、自包含的故事场景
- 玩家可见输出统一使用简体中文
- 玩家可见叙事默认使用第二人称
- 非现实伤害、非露骨表达、成年人角色设定

### 2.2 `world_builder.md`

草案生成模板，负责：

- 根据玩家简介扩展结构化 SessionDraft
- 生成世界背景、开场状态、玩家处境、节奏建议和安全框架
- 生成角色档案
- 将启用中的工具钩子织入世界设定

### 2.3 `tool_contract.md`

正式推演阶段的输出合同，负责：

- 强制模型只返回 JSON
- 约束 `actions` 与 `turnControl` 的结构
- 规定每个工具的精确参数名
- 强调玩家可见文本必须使用第二人称
- 约束对白和动作分离
- 允许在玩家可见字符串中嵌入 `<delay>1000</delay>`

### 2.4 `ensemble_turn.md`

正式推演的主模板，负责：

- 把整组角色、当前场景和记忆上下文一起送入模型
- 要求模型只返回一份共享动作批次
- 强调“这是整组角色共享的一次决策”
- 注入压缩记忆和近期原始回合

### 2.5 `r18_guidance.md`

这是 `ensemble_turn` 的附加指导块，主要强化：

- 身体动作、接触、道具处理等节奏必须按过程展开
- 不允许从意图直接跳到结果
- 需要兼顾对话与实时动作进程

它会被正式推演链路加载。

### 2.6 `director_agent.md` / `support_agent.md`

这两个模板仍然保留在仓库里，但当前正式链路并不使用。它们更像后续扩展“逐角色独立推理”方案时的预留参考。

## 3. 提示词渲染机制

`FilePromptTemplateService` 负责：

- 从磁盘读取 Markdown 模板
- 使用 `{{ variable }}` 做字符串替换
- 缓存模板内容
- 暴露固定提示词版本号

当前版本号包括：

- `shared_safety_preamble`
- `r18_guidance`
- `tool_contract`
- `world_builder`
- `director_agent`
- `support_agent`
- `ensemble_turn`

这些版本号会在 Session 确认时写入 `promptVersions`。

## 4. 世界构建阶段

### 4.1 输入

- `playerBrief`
- `sharedSafety`
- `toolWorldHooks`

### 4.2 输出目标

- `title`
- `worldSummary`
- `openingSituation`
- `playerState`
- `suggestedPace`
- `safetyFrame`
- `sceneGoals`
- `contentNotes`
- `agents`

### 4.3 关键约束

- 玩家可见字段使用第二人称
- 第一个 Agent 应当是 `director`
- `suggestedPace` 必须是前瞻性阶段规划
- 工具启用时，应提前在世界观中埋设对应装置或情境

### 4.4 工具世界观钩子

工具可以通过 `buildWorldPrompt()` 向世界构建阶段贡献额外提示。

当前显式使用此能力的是：

- `control_vibe_toy`

如果该工具启用，草案生成会要求模型在世界背景中自然纳入其存在。

## 5. 正式推演阶段

### 5.1 输入上下文

- 角色名单与角色职责
- 各角色运行态
- 草案内容
- 当前场景状态
- 压缩后的 archive / episode / turn 记忆
- 最近原始回合
- 玩家历史消息账本
- 当前 Tick 的排队消息与触发原因

### 5.2 输出结构

```json
{
  "actions": [
    {
      "actorAgentId": "director",
      "tool": "speak_to_player",
      "args": {
        "message": "..."
      }
    }
  ],
  "turnControl": {
    "continue": true,
    "endStory": false,
    "needsHandoff": false
  }
}
```

### 5.3 关键约束

- 整组角色只能共享一次 LLM 调用
- 所有输出必须通过工具表达
- 参数名必须精确命中 schema
- 对话和动作必须分离
- 最近原始回合比压缩记忆优先级更高

## 6. 工具系统概览

当前需要区分“运行时工具注册表”和“前端配置页工具目录”。

### 6.1 运行时工具注册表

后端 `apps/server/src/tools/defaultTools.ts` 注册了 9 个工具：

- `control_vibe_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `wait`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

### 6.2 前端配置页工具目录

`packages/shared/src/index.ts` 的 `toolCatalog` 当前包含：

- `control_vibe_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

也就是说：

- `wait` 存在于后端运行时
- 但不作为配置页独立可切换工具暴露

## 7. 各工具作用

### `control_vibe_toy`

- 可选工具
- 当前只产出 `agent.device_control`
- 执行状态为 `simulated`
- 会更新执行 Agent 的 runtime intent

### `speak_to_player`

- 角色对玩家说话
- 产出 `agent.speak_player`

### `speak_to_agent`

- 角色之间说话
- 产出 `agent.speak_agent`

### `emit_reasoning_summary`

- 输出可见意图摘要
- 产出 `agent.reasoning`

### `perform_stage_direction`

- 输出面向玩家的可见动作或舞台描述
- 产出 `agent.stage_direction`

### `wait`

- 产出 `system.wait_scheduled`
- 当前是同一轮展示中的节奏停顿
- 不会安排未来新的独立 Tick

### `apply_story_effect`

- 输出剧情效果
- 产出 `agent.story_effect`
- 会更新场景张力

### `update_scene_state`

- 更新共享场景状态
- 产出 `scene.updated`
- 支持隐藏记忆字段：
  - `memorySummary`
  - `memoryKeyDevelopments`
  - `memoryCharacterStates`

### `end_story`

- 把 Session 状态改为 `ended`
- 产出 `system.story_ended`
- 会中断后续工具执行

## 8. 工具执行机制

工具注册表执行时会：

1. 判断工具是否存在
2. 判断工具是否启用
3. 用 Zod 严格校验参数
4. 执行工具逻辑
5. 生成事件并按需更新 Session 状态

项目对参数校验做得很严格，专门拒绝：

- 历史别名字段
- 多余字段
- 错误命名风格

这样可以避免事件结构漂移。

## 9. `wait` 与 `<delay>` 的现状

当前代码中存在两种节奏表达方式：

### 9.1 显式 `wait`

- 后端工具注册表支持
- 产生 `system.wait_scheduled`
- 前端会把它显示为节奏卡片

### 9.2 内联 `<delay>`

- 正式提示词明确鼓励使用
- 可以嵌入对白、动作、剧情效果等字符串里
- 前端会把它拆成多个文本片段和本地 pause 事件

当前正式提示词和示例更偏向第二种方式，因此实际运行中内联 `<delay>` 会比显式 `wait` 更常见。

## 10. 工具扩展方式

若要新增工具，建议按以下顺序扩展：

1. 如需在设置页显示，先扩展 `packages/shared/src/index.ts` 的 `toolCatalog`
2. 在 `apps/server/src/tools/defaultTools.ts` 注册新工具
3. 定义 `inputSchema`
4. 定义 `promptContract`
5. 实现 `execute()`
6. 如有必要，补充 `buildWorldPrompt()`
7. 如需前端展示新事件，修改 `EventTimeline.vue`
8. 为新工具补测试

## 11. 当前边界

- 工具主要是叙事工具，不是外部事务引擎
- `control_vibe_toy` 不连接真实设备
- `wait` 不是未来任务系统
- 当前没有私有隐藏链式思维工具，只有可见的 reasoning summary
