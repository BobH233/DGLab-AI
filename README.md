# DGLabAI

DGLabAI 是一个基于大语言模型驱动的多智能体剧情推演系统。项目采用前后端分离架构，支持由玩家输入故事背景、自动生成剧情草案、确认设定后进入持续推进的单人互动叙事会话，并通过事件流展示各个智能体的对白、动作、剧情效果与系统状态。

当前实现的核心目标是把“世界观补全 + 多角色协同推进 + 工具化输出 + 会话持久化 + 实时前端展示”串成一条完整链路。

## 项目特性

- 多智能体叙事编排：服务端使用一次世界构建调用生成草案，再用一次共享编排调用驱动整组角色推进当前回合。
- 工具化输出：模型不直接输出自由文本，而是输出结构化工具调用，后端再把工具调用落成事件。
- 草案确认流程：玩家先生成草案，再人工修改并确认，避免模型直接把未审阅设定带入正式会话。
- 会话持久化：会话、配置、事件均保存到 MongoDB，可恢复历史 Session。
- 实时事件流：前端通过 SSE 接收会话更新和新增事件，实时渲染剧情时间线。
- 自动推进：支持开启定时触发，让故事按固定间隔继续推进。
- 配置可视化：前端可配置 OpenAI 兼容接口地址、模型、密钥、温度、Token 上限与工具开关。
- 可扩展设计：通道适配器、工具注册表、提示词模板和共享类型已经抽象出来，便于后续增加接入端或工具。

## 技术栈

- 前端：Vue 3、Vue Router、Vite、Vitest
- 后端：Node.js、Express、MongoDB、Zod、Vitest
- 共享包：TypeScript + Zod，用于沉淀前后端共用的数据模型与校验逻辑
- 模型接入：OpenAI Compatible Chat Completions 接口

## 仓库结构

```text
.
├── apps
│   ├── server              # Express 服务、编排器、Mongo 存储、提示词、工具
│   └── web                 # Vue 前端，包含首页、草案确认、会话控制台、配置页
├── packages
│   └── shared              # 共享 schema、类型、工具目录与请求/响应定义
├── doc                     # 中文项目文档
├── package.json            # 工作区脚本
└── prompt.txt              # 项目原始需求说明
```

## 运行流程

1. 玩家在首页输入故事背景，前端调用 `POST /api/sessions/draft`。
2. 服务端读取全局模型配置，调用 `world_builder` 提示词生成结构化草案。
3. 草案保存为 `draft` 状态 Session，并记录创建事件与草案生成事件。
4. 玩家在草案页修改世界背景、角色设定和节奏说明后点击确认。
5. Session 进入 `active` 状态，服务端保存模型配置快照和提示词版本。
6. 玩家发送消息或定时器触发时，调度器请求一次新的 Tick。
7. 编排器使用 `ensemble_turn` 提示词让模型输出一个共享动作批次。
8. 后端逐条执行工具调用，把对白、动作、剧情效果、场景更新等写入事件流。
9. 前端通过 SSE 订阅会话更新，实时渲染剧情时间线、模型消耗和自动推进状态。

## 快速开始

### 1. 准备环境

- Node.js 20 或更高版本
- MongoDB（默认连接 `mongodb://127.0.0.1:27017`）

### 2. 安装依赖

```bash
npm install
```

### 3. 启动后端

```bash
npm run dev:server
```

默认端口为 `3001`。

### 4. 启动前端

```bash
npm run dev:web
```

默认前端地址为 `http://localhost:5173`。

### 5. 配置模型

打开前端配置页，填写：

- `API Base URL`
- `API Key`
- `Model`
- `Temperature`
- `Top P`
- `Max Tokens`
- `Request Timeout`
- 各工具开关

默认后端会使用 OpenAI 兼容接口 `/chat/completions`，并优先尝试 `response_format=json_schema`，如果目标兼容服务不支持，会自动回退到“纯提示词 JSON 输出”模式。

## 环境变量

服务端：

- `PORT`：服务监听端口，默认 `3001`
- `MONGODB_URI`：MongoDB 连接串，默认 `mongodb://127.0.0.1:27017`
- `MONGODB_DB`：数据库名，默认 `dglab_ai`
- `DEBUG_LLM=1`：开启后打印模型请求、原始响应和解析结果

前端：

- `VITE_API_BASE`：后端 API 基础地址，默认 `http://localhost:3001/api`

## 常用脚本

```bash
npm run build
npm run dev:server
npm run dev:web
npm test
```

## 当前实现重点

- 世界草案生成与确认流程已经完成
- 多角色共享回合编排已经完成
- 事件持久化、SSE 推送、时间线渲染已经完成
- 配置管理、模型消耗统计、自动推进已经完成
- 工具注册与可选工具开关已经完成

## 当前边界与注意事项

- 当前只实现了 Web 通道，`WebChannelAdapter` 为后续接入 QQ 机器人等渠道预留了抽象接口。
- `control_vibe_toy` 目前只会生成“模拟执行”的叙事事件，不会连接真实硬件。
- `wait` 当前是“同一轮展示中的停顿效果”，不会在未来重新调度一个独立 Tick。
- 仓库里保留了 `director_agent.md` 和 `support_agent.md` 模板，但当前正式流程使用的是单次 `ensemble_turn` 共享编排。
- 事件与配置没有接入权限控制，适合本地开发和原型验证，不适合直接暴露到公网。

## 文档导航

- [文档总览](./doc/README.md)
- [架构设计](./doc/architecture.md)
- [后端说明](./doc/backend.md)
- [前端说明](./doc/frontend.md)
- [API 参考](./doc/api.md)
- [提示词与工具](./doc/prompts-and-tools.md)
- [开发与部署](./doc/development.md)

## 适合继续扩展的方向

- 增加新的通道适配器，例如 QQ 机器人、Discord、Telegram
- 增加更多工具，例如真实设备控制、外部知识检索、记忆系统
- 为不同类型题材拆分提示词模板
- 加入鉴权、审计、速率限制和生产部署配置
- 将当前事件模型进一步抽象为可复用的“叙事引擎”
