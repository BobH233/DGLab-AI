# Stream Display Design

## Goal

为当前项目设计一套可落地的“LLM 流式推演展示”方案，使前端能够在一轮推演尚未结束时，实时看到模型正在生成的动作和对白，同时保留当前正式回合所依赖的结构化 `ActionBatch` 作为最终真相来源。

本设计文档的目标不是立即替换现有正式回合链路，而是在现有架构之上增加一条“预览流”。

## Current State

当前正式推演链路的特点：

- 后端要求模型返回一个完整 JSON，对应 `ActionBatch`
- `OrchestratorService.runTick()` 会先等待 `provider.completeJson()` 完整结束，然后才逐条执行 action
- 当前前端 `SessionConsolePage` 的 SSE 只消费正式事件，如 `session.updated` 和 `event.appended`
- 当前的 SSE 流展示的是“工具执行后的事件”，不是“LLM 正在输出的 token”
- 记忆系统、时间线、回放都依赖正式 `SessionEvent`

因此，现状无法做到：

- 模型写到一半时前端就先显示正文
- 工具参数未完整闭合时先实时展示文本型内容
- 在一轮推演结束前先看到“正在生成中的 action 卡片”

## Non-Goals

本方案暂时不做这些事：

- 不把预览流写入 Mongo 正式事件表
- 不让记忆系统读取预览内容
- 不提前执行有副作用的工具
- 不直接把模型原始 token 原样暴露给前端
- 不要求所有 openai-compatible 后端都必须支持同一套原生 structured streaming

## Core Decision

最终采用“双通道”设计：

1. 正式通道
   仍然生成并校验完整 `ActionBatch`，再执行工具、写正式事件、更新场景状态。

2. 预览通道
   后端将 LLM 的流式输出解析为内部预览事件，通过 SSE 立即广播给前端，仅用于实时展示，不持久化。

这样做的核心原则是：

- 正式状态必须稳定、可校验、可回放
- 预览状态允许短暂不完整，只服务于实时 UI

## Why Not XML

最初讨论过直接让模型输出类似 XML 的结构，例如：

```xml
<agent_action>
  <actor_agent_id>director_1</actor_agent_id>
  <tool>speak_to_player</tool>
  <args>
    <message>站直。<delay>800</delay>肩放平。</message>
  </args>
</agent_action>
```

XML 的优点确实存在：

- 线性输出，适合流式解析
- 可以在标签闭合前就知道当前字段的语义
- 正文部分不需要反复重复协议头，token 成本低

但本项目不建议真的采用 XML，主要原因如下：

- 当前正文中已经约定使用 `<delay>...</delay>` 作为内嵌展示控制标记，外层再引入 XML 会出现内外层标签混合的问题
- `args` 本质上仍是对象结构，尤其对 `control_e_stim_toy` 一类嵌套参数来说，JSON 语义更自然
- XML 解析器虽然能做，但对提示词约束、模型稳定性、错误恢复都不会天然比轻量文本协议更简单
- 当前项目最终仍然要回到 `ActionBatch`，因此不值得把整个正式协议改成 XML

结论：

- 借鉴 XML “块状、线性、低开销”的优点
- 但不用 XML 标签本身

## Chosen Protocol

采用“控制行 + 原文块”的行协议。

模型不需要反复输出完整 JSON 帧，也不需要每个文本 delta 都带一大段 `{"type":...}` 包装，而是只在边界处输出轻量控制行，正文部分直接连续输出。

推荐协议示例：

```text
@action {"actorAgentId":"director_1","tool":"perform_stage_direction","targetScope":"scene"}
@field args.direction
你看见珊瑚宫心海从矮榻边缓缓起身，白纱般的衣摆擦过薄毯，手中的遥控器在她指间轻轻一转。
她没有立刻靠得太近，只是一步、再一步，停在恰好能让你听清她呼吸的位置。
@endfield
@endaction

@action {"actorAgentId":"director_1","tool":"speak_to_player","targetScope":"scene"}
@field args.message
站直。<delay>800</delay>肩放平，尾巴别缩。先看着我，只用最简短的话告诉我。
@endfield
@endaction

@action {"actorAgentId":"support_1","tool":"speak_to_player","targetScope":"scene"}
@field args.message
请抬头，五郎大人。心海大人问话时，不可以一边想借口，一边躲开视线。
@endfield
@endaction

@turnControl {"continue":true,"endStory":false,"needsHandoff":false}
@playerBodyItemState ["你现在体内已经佩戴着一枚可被远程控制的电刺激肛塞。","你现在的大腿内侧已经贴附并连接好电刺激贴片。"]
@done
```

### Why This Protocol

相比“每段文本都输出一个 JSON delta 对象”，它的优点是：

- 协议头很少重复，token 成本明显更低
- 模型更容易持续写正文，不必高频切换到协议模式
- 后端仍然可以明确知道当前正在写哪个 action、哪个字段
- 文本可以原样流式展示
- `<delay>` 标签可以直接保留在正文里，不会和外层协议打架

相比 XML，它的优点是：

- 不引入额外标签体系
- 更容易做错误恢复
- 更贴近当前项目仍以 JSON `ActionBatch` 为正式结果的现实

## Formal Grammar

建议约定的最小语法如下：

### Control Lines

- `@action {json}`
- `@field path`
- `@endfield`
- `@endaction`
- `@turnControl {json}`
- `@playerBodyItemState [json array]`
- `@done`

### Rules

- `@action` 后必须跟一个单行 JSON 对象，至少包含 `actorAgentId` 和 `tool`
- `@field` 后是当前字段路径，例如 `args.message`、`args.direction`
- 在 `@field` 和 `@endfield` 之间的全部原文，都属于该字段正文
- 一个 `@action` 可以有多个 `@field`
- 只有在 `@endaction` 之后，该 action 才视为完整
- `@turnControl` 和 `@playerBodyItemState` 建议放在所有 action 之后
- `@done` 表示本轮协议输出结束

### Text Handling

- `@field` 正文可以跨多行
- `@field` 正文中允许出现 `<delay>1000</delay>`
- 正文里不应该再出现新的控制行；若确有需要，后端应只在“控制行单独占一整行”时才识别它为协议指令

## How Final JSON Is Reconstructed

最终完整的大 JSON 不依赖前端回传，也不是在流结束后重新从纯文本暴力抽取，而是后端在解析流的同时就持续构建。

后端在内存中维护：

```ts
type DraftAction = {
  actorAgentId: string;
  tool: string;
  whyVisible?: string;
  targetScope?: string;
  args: Record<string, unknown>;
};

type DraftActionBatch = {
  actions: DraftAction[];
  turnControl?: {
    continue: boolean;
    endStory: boolean;
    needsHandoff: boolean;
  };
  playerBodyItemState?: string[];
};
```

当解析过程推进时：

- 读到 `@action` 时创建 `currentAction`
- 读到 `@field args.message` 时开始收集该字段正文
- 在正文流入期间，一边向前端广播预览 delta，一边累积到 `fieldBuffer`
- 读到 `@endfield` 时，把 `fieldBuffer` 写入 `currentAction.args.message`
- 读到 `@endaction` 时，把 `currentAction` push 到 `draftBatch.actions`
- 读到 `@turnControl` 时保存 `draftBatch.turnControl`
- 读到 `@playerBodyItemState` 时保存 `draftBatch.playerBodyItemState`
- 读到 `@done` 或上游结束时，组装：

```ts
const finalBatch = {
  actions: draftBatch.actions,
  turnControl: draftBatch.turnControl ?? {
    continue: true,
    endStory: false,
    needsHandoff: false
  },
  playerBodyItemState: draftBatch.playerBodyItemState ?? []
};
```

之后仍然执行现有的：

```ts
actionBatchSchema.parse(finalBatch)
```

也就是说：

- 流式预览是一条“提前可见”的 UI 通道
- `ActionBatch` 仍然是正式执行和持久化的唯一真相

## Preview SSE Events

建议扩展现有 `/sessions/:id/stream`，增加一组仅用于预览的 SSE 事件。

推荐事件名：

- `llm.turn.started`
- `llm.action.started`
- `llm.action.meta`
- `llm.action.text.delta`
- `llm.action.field.completed`
- `llm.action.completed`
- `llm.turn.control`
- `llm.turn.player_body_item_state`
- `llm.turn.completed`
- `llm.turn.failed`

### Example Payloads

```json
{
  "turnId": "tick_123",
  "index": 0
}
```

```json
{
  "turnId": "tick_123",
  "index": 0,
  "actorAgentId": "director_1",
  "tool": "perform_stage_direction",
  "targetScope": "scene"
}
```

```json
{
  "turnId": "tick_123",
  "index": 0,
  "path": "args.direction",
  "delta": "你看见珊瑚宫心海从矮榻边缓缓起身，"
}
```

```json
{
  "turnId": "tick_123",
  "value": {
    "continue": true,
    "endStory": false,
    "needsHandoff": false
  }
}
```

### Important Boundary

这些 SSE 预览事件：

- 不进入 `session_events`
- 不参与 memory 组装
- 不用于正式回放
- 前端刷新后可以丢失

## Which Tools Can Be Previewed Live

适合流式展示正文的工具：

- `speak_to_player.args.message`
- `perform_stage_direction.args.direction`
- `apply_story_effect.args.description`
- `emit_reasoning_summary.args.summary`
- 可选：`speak_to_agent.args.message`

只显示“正在编写”或元信息，不提前执行的工具：

- `control_e_stim_toy`
- `update_scene_state`
- `end_story`

原因：

- 有副作用的工具不能在参数未完整前执行
- `update_scene_state` 和 `playerBodyItemState` 虽然可提前预览，但不应在正式 JSON 校验通过前修改真实状态

## Backend Design

### 1. Provider Layer

当前 `OpenAICompatibleProvider.completeJson()` 是整体读取 `response.text()` 后再解析。

需要新增一条流式能力，例如：

```ts
completeJsonStream<T>(...)
```

或者更合适地新增：

```ts
streamStructuredTurn(...)
```

其职责：

- 向上游 LLM 发起流式请求
- 逐块读取上游 SSE
- 提取 `delta.content`
- 将增量文本喂给行协议解析器
- 在解析到预览事件时，调用回调立即广播
- 在解析结束后返回完整 `ActionBatch`

建议接口形状：

```ts
type StreamPreviewCallback = (event: PreviewSseEvent) => void;

type StreamedStructuredResult<T> = {
  data: T;
  rawText: string;
  usage: ProviderUsage;
};
```

### 2. Line Protocol Parser

后端新增一个单独的解析器模块，建议类似：

- `apps/server/src/infra/LineProtocolTurnParser.ts`

建议由它负责：

- 维护解析状态机
- 识别控制行
- 累积当前字段文本
- 生成预览事件
- 组装 `DraftActionBatch`

建议解析器状态：

```ts
type ParserState =
  | { mode: "idle" }
  | { mode: "in_action"; currentAction: DraftAction | null }
  | {
      mode: "in_field";
      currentAction: DraftAction;
      fieldPath: string;
      fieldBuffer: string;
    };
```

### 3. Orchestrator Integration

在正式推演时，编排器流程改为：

1. 发布 `llm.turn.started`
2. 调用 provider 的流式接口
3. provider 在解析过程中不断回调预览事件
4. channel 立即广播这些预览事件
5. provider 返回完整 `ActionBatch`
6. `actionBatchSchema.parse(...)`
7. 继续沿用现有工具执行链路
8. 按现有方式写正式 `event.appended`

关键点：

- 正式事件链路尽量少动
- 预览流只是加法，不应破坏现在的时间线逻辑

### 4. Channel Layer

当前 `WebChannelAdapter` 已支持按 session 广播 SSE。

可以直接扩展：

- 共享现有 `/sessions/:id/stream`
- 增加新的 `event:` 名称即可

不建议单独再开第二条 preview SSE 路由，除非后续需要更严格的隔离。

## Frontend Design

前端需要维护两套状态：

1. committed events
   现有 `SessionEvent[]`

2. preview turn state
   仅用于展示本轮模型正在生成的临时 action 卡片

建议新增的数据结构：

```ts
type PreviewAction = {
  index: number;
  actorAgentId?: string;
  tool?: string;
  targetScope?: string;
  textByPath: Record<string, string>;
  completed: boolean;
};

type PreviewTurnState = {
  turnId: string;
  actions: PreviewAction[];
  turnControl?: {
    continue: boolean;
    endStory: boolean;
    needsHandoff: boolean;
  };
  playerBodyItemState?: string[];
  status: "streaming" | "completed" | "failed";
};
```

### Frontend Rendering Rules

- 收到 `llm.action.meta` 时，创建预览卡片
- 收到 `llm.action.text.delta` 时，向对应字段追加正文
- 若 `tool` 是 `speak_to_player`，则渲染为对白卡
- 若 `tool` 是 `perform_stage_direction`，则渲染为动作卡
- 若 `tool` 是 `control_e_stim_toy`，先只显示“正在编写控制参数”
- 收到正式 `event.appended` 后，再由正式时间线接管显示
- 本轮正式完成后，清空或折叠该轮 preview state

## Streaming Text UX And Incremental Delay Parsing

这一节是前端体验的关键约束，后续实现同事应优先按这里的规则完成，而不是只追求“技术上能把流接起来”。

### 1. Preview Card Creation Timing

前端不应等正文开始后才创建卡片。

一旦后端已经解析出完整的 `@action {...}` 头，并通过 SSE 推送了类似：

```json
{
  "turnId": "tick_123",
  "index": 0,
  "actorAgentId": "director_1",
  "tool": "speak_to_player",
  "targetScope": "scene"
}
```

前端就应该立刻创建对应的 preview 卡片。

例如：

- `speak_to_player`：创建“角色发言”卡片
- `perform_stage_direction`：创建“舞台动作”卡片
- `control_e_stim_toy`：创建“设备控制”卡片

此时正文可以为空，也可以显示一个轻量占位状态，例如：

- `思考中...`
- `正在生成...`
- 空白正文 + loading 动画

重点是：

- 用户要尽早感知“模型已经决定要做什么类型的 action”
- 不要等正文完全出来后才突然插入整张卡片

### 2. Text Fields Must Render Incrementally

对于文本型字段，后端一旦进入 `@field args.xxx` 状态，就应该把后续正文增量实时转发给前端。

前端不应等待：

- 一整行正文结束
- `@endfield` 到来
- 整个 action 完成

才开始显示文本。

例如模型正在输出：

```text
站直。<delay>800</delay>肩放平，尾巴别缩。
```

那么在正文增量到达时，前端应逐步形成体验，而不是最后一次性显示整段。

### 3. Non-Text Tools Must Not Execute Early

对于非文本工具，尤其是会触发前端真实行为的工具，例如：

- `control_e_stim_toy`

前端必须区分：

1. preview card 的出现
2. 真正工具执行的触发

规则必须写死为：

- 预览阶段可以展示“设备控制卡片”
- 预览阶段可以展示“正在编写参数”或参数摘要
- 预览阶段绝不能真实调用设备

真实执行时机必须仍然依赖正式提交成功后的正式事件，例如当前正式时间线里的设备控制事件，而不是 preview 事件。

也就是说：

- preview SSE 只负责“让用户看到模型在想做什么”
- 正式 `event.appended` 才代表“这件事真的发生了”

### 4. Delay Tags Require Incremental Safe Parsing

这是前端流式文本实现里最容易出错的部分。

正文字段里允许出现：

```text
<delay>800</delay>
```

但在流式场景下，标签可能被拆成多个 delta，例如：

- `<d`
- `elay>8`
- `00</de`
- `lay>`

在标签尚未完整闭合前，前端不能把这些半截内容直接显示到正文里。

例如当只收到：

```text
<del
```

此时前端只能判断：

- 它“可能”是在开始一个 delay 标签
- 但还不能确认

因此此时不能直接把 `<del` 渲染到气泡里。

### 5. Required Frontend State For Streaming Text

对于每个正在流式生成的文本字段，建议维护至少这几部分状态：

```ts
type StreamingTextState = {
  visibleSegments: Array<
    | { type: "text"; text: string }
    | { type: "delay"; ms: number }
  >;
  pendingBuffer: string;
};
```

其中：

- `visibleSegments`
  已确认可以安全展示的片段

- `pendingBuffer`
  当前还不能确定该如何解释的尾部缓冲

### 6. Incremental Parsing Rules

每次收到新的文本 delta 时：

1. 把 delta 追加到 `pendingBuffer`
2. 对 `pendingBuffer` 做增量扫描
3. 能确定是普通文本的部分，写入当前文本 segment
4. 能确定是完整合法 `<delay>数字</delay>` 的部分，转成 delay segment
5. 仍然不能确定语义的尾部，继续保留在 `pendingBuffer`

例如：

- 收到 `站直。<del`
  - `站直。` 可确认是普通文本，立即显示
  - `<del` 暂时保留在 `pendingBuffer`

- 后续收到 `ay>800</delay>肩`
  - 与之前的 `pendingBuffer` 合并后，识别出完整 `<delay>800</delay>`
  - 将其转为 `{ type: "delay", ms: 800 }`
  - `肩` 继续作为普通文本显示

### 7. Invalid Delay-Like Content

需要特别处理“看起来像 delay，但最后发现并不合法”的情况。

例如：

```text
<del test>
```

或者：

```text
<delay>abc</delay>
```

处理原则：

- 只有完整匹配合法格式 `<delay>正整数</delay>` 时，才把它解释为 delay
- 否则一律视为普通文本

也就是说：

- `<del test>` 最终应被正常渲染到刚才的文本气泡中
- 不能吞掉
- 也不能误触发 pause 演出

### 8. Segment-Based Rendering

前端不应把一个正在流式生成的字段只存成单一大字符串。

更推荐按 segment 渲染：

- 文本片段
- delay 片段
- 文本片段

例如：

```text
站直。<delay>800</delay>肩放平，尾巴别缩。
```

可以形成：

```ts
[
  { type: "text", text: "站直。" },
  { type: "delay", ms: 800 },
  { type: "text", text: "肩放平，尾巴别缩。" }
]
```

其展示效果应接近：

1. 先显示 `站直。`
2. 识别到 delay 后插入一个 pause 节点
3. 延迟结束后继续显示后续文本

如有必要，delay 后的文本可以开新的气泡或新的正文片段，以强化“演出式停顿”的视觉效果。

### 9. Responsibility Split

这一块的职责边界需要明确：

- 后端负责：
  - 识别当前 action
  - 识别当前 field
  - 将 field 正文 delta 实时推给前端

- 前端负责：
  - 对字段正文做增量安全解析
  - 处理 `<delay>` 的半截输入
  - 决定何时展示 pause 节点与后续文本片段

不建议让后端去提前解析正文里的 `<delay>`，因为这是展示层语义，且前端已经有相关展示逻辑基础。

### 10. UX Requirement Summary

后续实现至少应满足：

- action 头一到，preview 卡片立刻出现
- 文本字段正文按 delta 实时追加
- 半截 `<delay>` 绝不直接显示给用户
- 只有完整合法 `<delay>数字</delay>` 才触发 pause 语义
- 非文本工具只预览，不提前执行
- 正式事件一旦到达，正式时间线接管展示

## Prompting Strategy

正式提示词需要新增一段明确协议约束。

这不是只改一句“请流式输出”就能解决的事情，而是需要调整当前提示词架构，使模型知道：

- 最终目标仍然是在语义上产出一轮完整的 `ActionBatch`
- 但表面输出格式不再是单个大 JSON
- 而是改为“控制行 + 原文块”的线性协议

### Prompt Architecture Changes

后续实现同事需要明确检查并调整这些位置：

- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/prompts/tool_contract.md`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/prompts/ensemble_turn.md`
- 必要时新增单独的流式协议模板，例如 `stream_tool_contract.md`

建议不要粗暴地直接替换掉当前 JSON 版约束，而是采用“两层约束”：

1. 语义层
   模型仍然是在决定一轮完整的 action batch，仍要遵守现有 tool contract、字段命名、角色 id、参数结构要求。

2. 表达层
   模型对外输出时，必须使用行协议，不再直接输出完整 JSON 对象。

也就是说，提示词要明确告诉模型：

- 你在逻辑上仍然是在生成 `actions`、`turnControl`、`playerBodyItemState`
- 但输出时必须分解成 `@action`、`@field`、`@endfield`、`@endaction`、`@turnControl`、`@playerBodyItemState`、`@done`

### Prompt Content Requirements

建议强调：

- 你必须使用指定的控制行协议输出
- 正文只能写在 `@field` 与 `@endfield` 之间
- `@action` 的 JSON 头只包含 action 元信息，不要把长文本塞进去
- 所有文本字段必须通过 `@field args.xxx` 输出
- 最终必须输出 `@turnControl`、`@playerBodyItemState` 和 `@done`
- 不要输出 markdown fence
- 不要输出额外解释

同时要保留现有工具约束，例如：

- `speak_to_player.message` 只允许对白
- `perform_stage_direction.direction` 为面向玩家的动作描写
- `update_scene_state.summary` 仍然不允许内嵌延迟标签

### Prompt Examples

强烈建议在提示词中加入至少一段完整、短小、合法的协议示例。

原因：

- 这类格式不是模型最常见的默认输出形态
- 没有示例时，模型更容易在正文中混入解释性文本
- 有示例时，更容易约束 `@field` 和正文边界

建议示例同时覆盖：

- 一个文本型工具，如 `speak_to_player`
- 一个非文本型工具，如 `control_e_stim_toy`
- 结尾的 `@turnControl` 和 `@playerBodyItemState`

### Fallback Prompt Mode

需要考虑保留降级策略。

当某些模型对行协议服从度明显不足时，可以保留一个配置开关：

- `structuredOutputMode = "json"`：沿用当前完整 JSON 模式
- `structuredOutputMode = "line-protocol"`：启用流式协议模式

这样便于：

- 渐进上线
- 对不同后端做兼容性对比
- 在协议不稳定时快速回退

## Failure Handling

需要考虑以下异常：

### 1. 上游流中断

处理建议：

- 发布 `llm.turn.failed`
- 丢弃当前 preview turn
- 本轮不执行正式工具
- 按现有逻辑记录 `system.tick_failed`
- 正式 `storyState`、`agentStates`、`playerBodyItemState`、`session_events` 保持在上一次完整成功回合之后的状态
- 前端收到失败事件后，应立即清除当前未提交 preview，避免用户误以为这些内容已经正式生效

### 2. 协议格式错误

例如：

- `@field` 未闭合
- `@endaction` 前 action 头缺失
- `@turnControl` JSON 非法

处理建议：

- 立即停止本轮流式预览解析
- 记录 provider / parser 错误
- 视情况把整轮标记失败
- 不得提交任何部分 action
- 不得执行任何工具
- 不得把半截 preview 内容转写为正式事件

### 3. 最终 schema 校验失败

即使预览看起来正常，最终 `ActionBatch` 仍可能缺字段或不合法。

处理建议：

- 预览状态只作为临时 UI，不可视为正式提交
- 只有在最终 schema 校验通过后，才执行工具
- 一旦 schema 校验失败，本轮仍按失败回合处理，正式状态回退到上一个成功回合之后的稳定状态

### 4. 模型输出中途偏离协议

例如：

- 在 `@field` 正文里突然输出解释文字
- 漏写 `@endfield`
- 还没 `@endaction` 就直接开始下一条 `@action`

处理建议：

- 解析器应尽量提供“可恢复错误”和“不可恢复错误”的区分
- 可恢复错误：允许在有限范围内容错，例如忽略空行、忽略多余空白
- 不可恢复错误：立即中止本轮，丢弃当前 preview turn

不建议为了“尽量救回来”而做过度宽松的猜测式修复，因为：

- 容易把错误输出误解释为合法 action
- 会增加正式状态被污染的风险

### 5. 预览成功但正式执行失败

例如：

- `ActionBatch` 校验通过
- 但后续工具执行时报错

处理建议：

- 预览层仍然视为“仅展示”，不能代表正式提交成功
- 正式执行失败后，应由现有错误链路记录 `system.tick_failed`
- 前端可额外显示“预览成功，但正式执行失败”的提示
- 后端不得保留半提交的状态变更

## State Recovery And Rollback

后续实现同事必须把“回溯到上一次完整成功状态”作为硬约束写进实现里，而不是只停留在概念上。

### Current Safety Property

当前架构有一个天然优势：

- 在 `provider.completeJson()` 成功并且返回完整结果前，工具并不会执行
- 因此只要流式预览阶段不提前执行工具，正式世界状态就不会被提前污染

这意味着在第一阶段实现中，所谓“回滚”本质上是：

- 丢弃内存中的 `preview turn state`
- 不提交任何本轮 action
- 让正式状态继续保持在上一次成功回合之后

### Required Transaction Boundary

实现时必须坚持：

- preview 解析不修改正式 `session`
- preview 解析不修改 `storyState`
- preview 解析不修改 `agentStates`
- preview 解析不修改 `playerBodyItemState`
- preview 解析不写正式 `SessionEvent`

只有在以下条件全部满足时，才允许进入正式提交阶段：

- 上游流完整结束
- 行协议解析成功
- 最终 `ActionBatch` schema 校验成功

### Commit Rule

必须采用“all-or-nothing”提交原则：

- 要么整轮 action batch 作为正式结果被执行
- 要么整轮失败，一个 action 也不正式落地

不允许：

- 前几个 action 已落地，后几个 action 因协议炸掉而失败
- 预览里已经显示出来的正文被当作正式事件保存
- 中间态的 `playerBodyItemState` 或 `sceneState` 被部分写入

### Future Warning

如果未来产品想继续演进到“边生成边真实执行工具”，那就不再能依赖当前这种天然安全性，必须额外设计：

- per-turn transaction snapshot
- 工具副作用补偿逻辑
- 回滚语义

但这不属于当前版本目标。当前版本应明确禁止“预览阶段真实执行工具”。

## Incremental Rollout Plan

建议分阶段实施。

### Phase 1

只做“文本型 action 的预览显示”，不动正式执行链路。

范围：

- `speak_to_player`
- `perform_stage_direction`

目标：

- 验证行协议是否稳定
- 验证前端 preview 卡片体验

### Phase 2

加入更多可预览文本型工具：

- `apply_story_effect`
- `emit_reasoning_summary`
- 可选 `speak_to_agent`

### Phase 3

为非文本工具增加元信息预览：

- `control_e_stim_toy`
- `update_scene_state`
- `end_story`

但仍然不提前执行。

### Phase 4

根据 provider 能力，评估是否适配更原生的 structured streaming。

如果某些后端支持原生 function / arguments delta，可以在 provider 内部统一映射到同一组 preview 事件，而不改前端。

## Acceptance Criteria

后续实现完成后，应至少满足：

- 发起一轮正式推演时，前端能在模型输出过程中先看到“正在生成中的 action 卡片”
- `speak_to_player` 和 `perform_stage_direction` 能边生成边追加正文
- 当前正文中的 `<delay>` 标签仍能保留并继续被前端展示逻辑识别
- 最终正式工具执行与当前逻辑一致
- 正式 `SessionEvent` 仍然是唯一持久化事实来源
- memory 链路不读取 preview 内容
- provider 流式失败时，本轮能安全回退为失败而不是污染状态

## Proposed File Touch Points

后续实现大概率会涉及这些位置：

- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/infra/OpenAICompatibleProvider.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/services/OrchestratorService.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/infra/WebChannelAdapter.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/routes/sessionRoutes.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/types/contracts.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/packages/shared/src/index.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/web/src/pages/SessionConsolePage.vue`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/web/src/components/EventTimeline.vue`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/web/src/lib/timelinePresentation.ts`

建议新增的模块：

- `/Users/bobh/Documents/Coding/DGLabAI/apps/server/src/infra/LineProtocolTurnParser.ts`
- `/Users/bobh/Documents/Coding/DGLabAI/apps/web/src/lib/previewTurnState.ts`

## Final Recommendation

后续实现时请坚持以下原则：

- 不要把预览流和正式事件流混在一起持久化
- 不要让前端直接依赖模型原始 token
- 不要把正式协议整体切换成 XML
- 不要让模型频繁输出冗长的 JSON delta 包装

推荐落地路线是：

- 用轻量“控制行 + 原文块”协议承载流式结构
- 用后端解析器把协议转换为 preview SSE
- 用内存中的 `DraftActionBatch` 重建最终正式 JSON
- 最终仍以现有 `ActionBatch` 和工具执行链路作为权威结果
