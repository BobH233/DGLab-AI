# DGLabAI

DGLabAI 是一个基于大语言模型的单玩家、多智能体互动叙事原型系统。项目并不把模型当作“直接聊天回复器”，而是把世界构建、人工审阅、共享回合编排、工具执行、事件持久化、长程记忆压缩与前端实时呈现串成一条完整链路。

当前代码已经实现：

- 世界草案生成与人工确认流程
- 单次共享编排的多角色回合推进
- 工具化输出与事件流持久化
- MongoDB 会话快照与事件日志
- 多后端模型配置管理
- 分层记忆摘要与上下文装配
- SSE 实时更新与前端时间线播放
- 记忆调试页与用量统计

## 项目特性

- 两阶段叙事生成：先生成结构化草案，再进入正式剧情推演。
- Human-in-the-loop：草案进入正式会话前可人工修改并确认。
- 单次共享编排：每个 Tick 只做一次 LLM 调用，由模型统一规划整组角色的动作批次。
- 工具化执行：模型输出结构化 action batch，后端将其执行为事件和状态变更。
- 事件驱动呈现：前端消费 `SessionEvent`，而不是直接渲染模型原文。
- 分层记忆：按 turn、episode、archive 三层压缩历史上下文，并保留最近原始回合窗口。
- 多后端配置：支持维护多个 OpenAI-compatible 后端，并切换当前默认后端。
- 实时界面：前端通过 SSE 接收增量更新，并带有内联停顿与播放队列。
- 可观测性：提供记忆调试页、Token 用量记录与失败重试入口。

## 技术栈

- 前端：Vue 3、Vue Router、Vite、Vitest
- 后端：Node.js、Express、MongoDB、Zod、Vitest
- 共享包：TypeScript + Zod
- 模型接入：OpenAI-compatible `/chat/completions`
- 实时通信：Server-Sent Events

## 仓库结构

```text
.
├── apps
│   ├── server              # Express 服务、编排器、Mongo 存储、提示词、工具、记忆系统
│   └── web                 # Vue 前端，包含首页、草案页、会话页、调试页、配置页
├── packages
│   └── shared              # 共享 schema、类型、事件、工具目录与请求/响应结构
├── doc                     # 中文技术文档
├── package.json            # workspace 脚本
└── prompt.txt              # 原始需求说明
```

## 核心流程

### 1. 草案生成

1. 玩家在首页输入 `playerBrief`
2. 前端调用 `POST /api/sessions/draft`
3. 后端读取当前激活模型后端配置
4. 编排器渲染 `world_builder` 提示词并调用模型
5. 服务端将宽松 JSON 归一化为合法 `SessionDraft`
6. 会话以 `draft` 状态持久化，并写入 `session.created` 与 `draft.generated`

### 2. 草案确认

1. 玩家在草案页编辑世界设定与 Agent 档案
2. 前端调用 `PATCH /api/sessions/:id/draft`
3. 点击确认后调用 `POST /api/sessions/:id/confirm`
4. 后端将草案冻结为 `confirmedSetup`
5. 同时保存当时的 LLM 配置快照与提示词版本快照

### 3. 正式推演

1. 玩家发送消息，或前端自动推进倒计时到点后调用 `/auto-tick`
2. `SessionService` 汇总排队消息、触发原因和最近事件
3. `MemoryContextAssembler` 组装当前场景、压缩记忆、近期原始回合与玩家消息账本
4. `DefaultOrchestratorService` 渲染 `ensemble_turn` 提示词
5. 模型返回一个结构化 action batch
6. 工具注册表逐条校验并执行工具调用
7. 结果被落成事件流，同时更新 `storyState`、`agentStates` 与用量统计
8. 前端通过 SSE 收到 `session.updated` 与 `event.appended`，实时刷新时间线

## 记忆系统

项目已经实现分层记忆压缩链路：

- 最近原始回合：保留最近若干个完整成功回合
- Turn Summary：对每个完成回合生成摘要
- Episode Summary：当 turn 摘要过多时向上压缩
- Archive Summary：当 episode 摘要过多时继续归档压缩

这些摘要不会替代当前场景状态，而是与：

- `storyState`
- `agentStates`
- 玩家历史消息
- 当前排队消息与触发原因

一起被装配进正式推演的上下文中。前端还提供独立的“记忆调试”页面查看这一过程。

## 自动推进的当前实现

当前“自动推进”不是后端常驻定时任务服务，而是：

- 后端维护 `timerState`、会话级去重与 Tick 合并
- 前端在会话页面可见时轮询当前倒计时
- 到点后前端调用 `POST /api/sessions/:id/auto-tick`
- 后端判断是否真的到点、是否已在推演中，再决定是否触发新 Tick

这意味着自动推进依赖打开中的 Web 会话页，不是脱离前端独立运行的后台调度器。

## 模型配置

配置页支持维护多个模型后端。每个后端独立保存：

- 后端名称
- API Base URL
- API Key
- Model
- Temperature
- Top P
- Max Tokens
- Request Timeout
- 工具默认开关

新建 Session 时使用当前激活后端。已确认的 Session 会把配置快照写入自身，不会随着全局切换而被追改。

## 当前工具与输出方式

后端注册了以下运行时工具：

- `control_vibe_toy`
- `speak_to_player`
- `speak_to_agent`
- `emit_reasoning_summary`
- `perform_stage_direction`
- `wait`
- `apply_story_effect`
- `update_scene_state`
- `end_story`

其中：

- `wait` 是内部节奏工具，当前不会在设置页中作为可切换项展示
- 正式提示词主要鼓励使用字符串内联 `<delay>1000</delay>` 来表达同一轮中的停顿
- 前端会把显式 `system.wait_scheduled` 事件和内联 delay 都渲染为可见节奏停顿
- `control_vibe_toy` 当前只产生 `simulated` 设备控制事件，不连接真实硬件

## 关键设计取舍

- 用“共享回合编排”替代“每个角色各调用一次模型”
- 用“工具调用 + 事件流”替代“直接自由文本输出”
- 用“人工确认草案”隔离世界构建阶段和正式运行阶段
- 用“分层摘要 + 最近原文窗口”控制长上下文成本
- 用“快照 + 事件日志”兼顾快速恢复与完整回放

## 快速开始

### 1. 环境准备

- Node.js 20+
- npm 10+
- MongoDB 6+

### 2. 安装依赖

```bash
npm install
```

### 3. 启动后端

```bash
npm run dev:server
```

默认端口：`3001`

### 4. 启动前端

```bash
npm run dev:web
```

默认地址：`http://localhost:5173`

### 5. 配置模型后端

进入前端“配置”页，至少填写一个可用后端的：

- `API Base URL`
- `API Key`
- `Model`
- `Temperature`
- `Top P`
- `Max Tokens`
- `Request Timeout`

默认接入方式为 OpenAI-compatible `/chat/completions`。后端会优先尝试 `response_format=json_schema`；如果兼容服务不支持，再自动回退到“纯提示词要求 JSON 输出”的模式。

## 环境变量

### 服务端

- `PORT`：默认 `3001`
- `MONGODB_URI`：默认 `mongodb://127.0.0.1:27017`
- `MONGODB_DB`：默认 `dglab_ai`
- `DEBUG_LLM=1`：打印模型请求、原始响应、JSON 提取与校验过程

### 前端

- `VITE_API_BASE`：默认 `/api`

## 常用脚本

```bash
npm run build
npm run dev:server
npm run dev:web
npm test
```

## Docker 部署

项目现在支持单容器部署：

- 前端会先构建成静态资源
- 后端在生产环境中同时托管 `/api/*` 和前端页面
- 最终镜像只需要启动一个 Node 进程

本地构建镜像：

```bash
docker build -t dglab-ai:latest .
```

本地运行镜像：

```bash
docker run --rm -p 3001:3001 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e MONGODB_DB=dglab_ai \
  dglab-ai:latest
```

启动后可直接访问：

- `http://localhost:3001`

如果部署到 Linux 服务器且 MongoDB 不在宿主机同网络，需要把 `MONGODB_URI` 改成实际可访问地址。

如果希望把应用和 MongoDB 一起启动，可以直接使用 [docker-compose.yml](/Users/bobh/Documents/Coding/DGLabAI/docker-compose.yml)：

```bash
docker compose up -d --build
```

这会同时启动：

- `app`：DGLabAI 单容器前后端服务
- `mongodb`：项目依赖的 MongoDB 7

默认访问地址：

- Web / API：`http://localhost:3001`
- MongoDB：`mongodb://localhost:27017`

停止并清理容器：

```bash
docker compose down
```

## GitHub Actions 自动构建镜像

仓库新增了 [`.github/workflows/docker-image.yml`](/Users/bobh/Documents/Coding/DGLabAI/.github/workflows/docker-image.yml)，当 `main` 分支发生 push 时会自动：

- 构建最新 Docker 镜像
- 推送到 GitHub Container Registry
- 产出 `latest` 和提交 SHA 两类 tag

默认镜像地址格式为：

```text
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

启用时请确认：

- GitHub Actions 已开启
- 仓库允许发布 GitHub Packages
- 如果仓库或包是私有的，部署机器拉取镜像时需要具备对应的 GHCR 访问权限

## 当前实现边界

- 当前只有 Web 前端和 SSE 通道，没有脱离前端的后台自动调度守护进程
- 当前没有用户体系、权限控制或公网安全加固
- `UsageStats.byAgent` 结构已定义，但实际只记录会话总量和每次调用记录
- `wait` 更多是界面节奏控制，不是未来任务系统
- 渠道抽象已预留，但真正实现的只有 `WebChannelAdapter`
- 正式运行链路使用统一的 `ensemble_turn` 提示词

## 文档导航

- [文档总览](./doc/README.md)
- [架构设计](./doc/architecture.md)
- [后端说明](./doc/backend.md)
- [前端说明](./doc/frontend.md)
- [API 参考](./doc/api.md)
- [提示词与工具](./doc/prompts-and-tools.md)
- [开发与部署](./doc/development.md)
