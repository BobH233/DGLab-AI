# DGLabAI 中文文档

本目录基于当前仓库代码整理，描述的是已经落地的实现，而不是早期设想或已过时的原型状态。

如果你是第一次进入这个项目，可以把这里理解成 `doc/` 的总入口：先看“当前版本现状”，再按你的关注点跳到对应专题文档。

## 当前版本现状

和更早阶段相比，当前项目已经明显扩展成一套更完整的互动叙事运行时，而不只是“生成草案 + 进入会话页”的最小原型。当前这版仓库已经包含：

- 世界草案生成、人工编辑与确认开局
- 正式推演阶段的单次共享编排
- 基于工具调用的事件流落库
- Session 快照、事件日志与分层记忆
- 前端 SSE 实时更新与 LLM 流式预览
- 统一密码门禁与登录页
- TTS 单条朗读、全文演出模式与音频缓存
- 打印导出、记忆调试、模型调用记录与构建信息页
- 前端本地 e-stim 能力同步与设备上下文注入
- 单容器 Docker 构建与 `docker-compose` 示例

如果你之前看过旧版文档，需要特别留意：当前实现已经补上了不少“当时还没有”的能力，比如 TTS、演出模式、鉴权、e-stim、本地预览流和部署方式。

## 文档地图

- [架构设计](./architecture.md)
  说明系统分层、核心运行链路、记忆系统、预览流、TTS 与 e-stim 的整体位置，适合先建立全局模型。
- [后端说明](./backend.md)
  聚焦 Express 服务、SessionService、Orchestrator、Provider、TtsService、鉴权和 Mongo 持久化，适合改服务端逻辑时阅读。
- [前端说明](./frontend.md)
  聚焦页面结构、SSE 联动、预览流、时间线播放、演出模式、打印导出和本地 e-stim 配置，适合改交互或 UI 时阅读。
- [API 参考](./api.md)
  汇总当前 HTTP 路由、TTS 接口、SSE 事件和主要数据结构，适合对接接口或核对请求格式。
- [提示词与工具](./prompts-and-tools.md)
  说明提示词模板、line protocol、工具注册表、TTS 改写、`playerBodyItemState` 和工具扩展方式，适合改编排或协议时阅读。
- [开发与部署](./development.md)
  说明本地开发、环境变量、调试方式、Docker/compose 和当前已知限制，适合启动环境和排障时阅读。

## 按角色阅读

- 想快速知道“这个项目现在到底能做什么”
  先读 [README](../README.md)，再读 [架构设计](./architecture.md)。
- 想接手后端
  先读 [架构设计](./architecture.md)，再读 [后端说明](./backend.md) 和 [提示词与工具](./prompts-and-tools.md)。
- 想接手前端
  先读 [架构设计](./architecture.md)，再读 [前端说明](./frontend.md)。
- 想联调接口
  读 [API 参考](./api.md)。
- 想跑本地环境或准备部署
  读 [开发与部署](./development.md)。
- 想理解 TTS、演出模式或玩家消息 TTS 改写
  先读 [前端说明](./frontend.md)，再读 [后端说明](./backend.md) 和 [提示词与工具](./prompts-and-tools.md)。
- 想理解 e-stim 是怎么接进来的
  先读 [架构设计](./architecture.md)，再读 [前端说明](./frontend.md)、[后端说明](./backend.md) 和 [提示词与工具](./prompts-and-tools.md)。

## 按任务阅读

- 想确认“自动推进为什么不是后台任务”
  读 [架构设计](./architecture.md)、[后端说明](./backend.md) 和 [前端说明](./frontend.md)。
- 想看“流式预览”是怎么实现的
  读 [架构设计](./architecture.md)、[后端说明](./backend.md) 和 [前端说明](./frontend.md)。
- 想看 TTS 音频是如何生成、缓存和批量补齐的
  读 [后端说明](./backend.md)、[前端说明](./frontend.md) 和 [API 参考](./api.md)。
- 想看玩家原始消息为什么还能有另一份朗读文本
  读 [提示词与工具](./prompts-and-tools.md) 和 [后端说明](./backend.md)。
- 想看 line protocol 和工具执行是怎么配合的
  读 [提示词与工具](./prompts-and-tools.md) 和 [后端说明](./backend.md)。
- 想看现在有哪些页面和它们各自负责什么
  读 [前端说明](./frontend.md)。
- 想看当前有哪些接口、请求体和 SSE 事件
  读 [API 参考](./api.md)。

## 推荐阅读路径

### 路径 1：快速建立全局认知

1. [README](../README.md)
2. [架构设计](./architecture.md)
3. [开发与部署](./development.md)

适合第一次接手项目、要在短时间内知道“它现在大概是怎么工作的”。

### 路径 2：后端实现链路

1. [架构设计](./architecture.md)
2. [后端说明](./backend.md)
3. [提示词与工具](./prompts-and-tools.md)
4. [API 参考](./api.md)

适合要改 Session 生命周期、编排器、Provider、工具执行、TTS 服务或 Mongo 数据结构的人。

### 路径 3：前端交互链路

1. [架构设计](./architecture.md)
2. [前端说明](./frontend.md)
3. [API 参考](./api.md)

适合要改会话页、时间线、演出模式、打印页、登录页或配置页的人。

### 路径 4：部署与排障

1. [开发与部署](./development.md)
2. [后端说明](./backend.md)
3. [API 参考](./api.md)

适合要启动环境、核对环境变量、看 Docker/compose、排查鉴权或检查 TTS / SSE / 自动推进问题的人。

## 这套文档不打算覆盖什么

为了避免再回到“文档很多但不对应代码”的状态，这批文档刻意只描述当前仓库里已经能看到的事实。因此这里不会重点展开：

- 早期未落地的设计草案
- 已经删除的旧功能路线
- 未来可能做但当前仓库还没有的系统

如果后续实现继续变化，建议优先更新这里和对应专题页，而不是另外再开一份平行说明，避免 `doc/` 再次分叉。
