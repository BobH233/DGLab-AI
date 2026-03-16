# 提示词与工具

## 1. 设计目标

这个项目的提示词系统不是简单地让模型“写一段剧情”，而是让模型在两个阶段分别承担不同职责：

- 阶段一：世界构建，生成可编辑草案
- 阶段二：共享编排，生成结构化工具调用

对应地，工具系统承担“把模型决策落成可持久化事件”的职责。

## 2. 提示词文件

目录：`apps/server/src/prompts/`

### `shared_safety_preamble.md`

作用：

- 明确这是虚构、封闭、安全的故事模拟
- 限定成人但非露骨、非现实伤害的表达范围
- 统一所有玩家可见文本使用简体中文和第二人称

这是所有核心提示词的公共前缀。

### `world_builder.md`

作用：

- 根据玩家简介生成完整草案
- 补足世界背景、开场状态、玩家处境、节奏建议和安全框架
- 生成角色列表及其 persona / goals / style / boundaries
- 把启用中的工具约束织入世界设定

这是“开局一次”的提示词。

### `tool_contract.md`

作用：

- 强制模型只返回 JSON
- 强制 `actions` 中每一条工具调用使用精确字段名
- 提供工具参数形状、示例和禁止别名
- 规定所有玩家可见叙事必须使用第二人称

它是共享编排提示词的一部分。

### `ensemble_turn.md`

作用：

- 让模型一次性规划多角色当前回合的共享动作批次
- 输入角色列表、运行态、Session 草案、当前场景、最近事件和 Tick 上下文
- 输出 `actions + turnControl`

这是正式剧情推进阶段的主提示词。

### `director_agent.md` / `support_agent.md`

这两个模板描述了“每个角色分别调用模型”的思路，但当前没有接入正式运行流程。仓库保留它们主要是为了后续演进时作为参考模板。

## 3. 提示词渲染机制

`FilePromptTemplateService` 负责：

- 从磁盘读取 `*.md` 模板
- 使用 `{{ variable }}` 形式替换变量
- 缓存在内存中，避免重复读盘
- 返回固定版本号

当前版本号写死在服务中，用于在 Session 确认时记录提示词快照版本。

## 4. 世界构建阶段

### 输入

- `playerBrief`
- `sharedSafety`
- `toolWorldHooks`

### 输出目标

- `title`
- `worldSummary`
- `openingSituation`
- `playerState`
- `suggestedPace`
- `safetyFrame`
- `sceneGoals`
- `contentNotes`
- `agents`

### 关键约束

- 输出必须偏向玩家可沉浸的第二人称文案
- 第一位 Agent 应为 `director`
- 启用工具需要在世界背景里预留合理存在

例如，当 `control_vibe_toy` 启用时，世界构建提示词会要求模型在背景设定中自然纳入对应装置。

## 5. 共享编排阶段

### 输入上下文

- 角色清单和角色职责
- 各角色运行态
- 草案内容
- 当前场景状态
- 最近事件
- 排队中的玩家消息
- 当前 Tick 触发原因

### 输出结构

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

### 关键约束

- 当前整组角色只允许一次 LLM 调用
- 所有玩家可见输出必须通过工具表达
- 工具参数名必须严格命中定义
- 节奏、停顿、动作和对白要作为独立动作表达

## 6. 工具目录

工具元数据定义在 `packages/shared/src/index.ts` 的 `toolCatalog` 中，用于：

- 配置页展示
- 标识哪些工具可选
- 提供默认开关状态

当前工具如下：

| 工具 ID | 中文名称 | 是否必选 | 说明 |
| --- | --- | --- | --- |
| `control_vibe_toy` | 穿戴式震动小玩具 | 否 | 可选工具，当前只生成模拟控制事件 |
| `speak_to_player` | 角色对玩家说话 | 是 | 输出对玩家对白 |
| `speak_to_agent` | 角色间对话 | 是 | 角色互相传递信息 |
| `emit_reasoning_summary` | 可见推理摘要 | 是 | 输出可见意图摘要 |
| `perform_stage_direction` | 舞台动作 | 是 | 输出面向玩家的动作或场景动作 |
| `wait` | 短暂停顿 | 是 | 生成同一轮内的展示停顿 |
| `apply_story_effect` | 剧情效果 | 是 | 对场景施加叙事效果 |
| `update_scene_state` | 场景状态更新 | 是 | 更新共享场景状态 |
| `end_story` | 结束故事 | 是 | 标记故事结束 |

## 7. 工具实现结构

`apps/server/src/tools/defaultTools.ts` 中每个工具都有以下部分：

- 参数 schema：用 Zod 严格定义输入
- 提示词合同：告诉模型应该如何调用
- 世界构建钩子：决定这个工具是否影响草案生成
- 执行逻辑：把工具调用变成事件或状态变化

## 8. 工具扩展方式

如果要新增一个工具，建议按下面顺序扩展：

1. 在 `packages/shared/src/index.ts` 的 `toolCatalog` 中补充元数据
2. 在 `apps/server/src/tools/defaultTools.ts` 中注册工具
3. 为工具编写：
   - `inputSchema`
   - `promptContract`
   - `execute()`
4. 如果该工具会影响世界设定，再补 `buildWorldPrompt()`
5. 如有必要，为时间线组件补充新的事件映射样式
6. 为新工具增加测试

## 9. 为什么工具参数校验这么严格

项目对工具参数的严格性做了明显强化，原因有三个：

- 模型容易使用历史字段别名，例如 `text`、`dialogue`、`recipient`
- 事件流要长期持久化，字段漂移会迅速变成技术债
- 前端展示依赖确定结构，不能接受随意字段

因此：

- Provider 层要校验 JSON
- ToolRegistry 层要再次校验参数
- 测试中专门覆盖了对历史别名字段的拒绝行为

## 10. 当前工具系统的边界

- 工具主要是“叙事工具”，不是现实执行器
- `wait` 不是未来任务系统，而是展示节奏控制
- 当前没有“隐藏思维链工具”，只有面向玩家可见的 reasoning summary
- 工具的副作用主要体现在事件流和 Session 状态，不涉及外部服务事务

## 11. 未来适合演进的方向

- 接入真实设备或机器人能力
- 按渠道区分可见性和可执行性
- 增加工具版本号与迁移能力
- 引入更细粒度的“私有 Agent 思考”与“共享舞台输出”分层
