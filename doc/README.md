# DGLabAI 中文文档

本目录整理了项目当前实现对应的中文技术文档，内容基于仓库内现有代码整理，不包含未落地的设想性功能。

## 文档目录

- [架构设计](./architecture.md)：整体架构、核心流程、数据流和关键设计取舍
- [后端说明](./backend.md)：Express 服务、Mongo 存储、调度、编排器与服务职责
- [前端说明](./frontend.md)：页面结构、时间线渲染、SSE 联动与交互方式
- [API 参考](./api.md)：HTTP 接口、SSE 事件和关键数据结构
- [提示词与工具](./prompts-and-tools.md)：提示词模板、工具注册表和扩展方式
- [开发与部署](./development.md)：环境准备、启动方式、测试构建和后续部署建议

## 阅读建议

- 想先理解项目怎么跑起来：先读 [README](../README.md) 和 [开发与部署](./development.md)
- 想快速把握系统全貌：先读 [架构设计](./architecture.md)
- 想改后端逻辑：重点看 [后端说明](./backend.md) 与 [提示词与工具](./prompts-and-tools.md)
- 想改前端交互：重点看 [前端说明](./frontend.md)
- 想对接别的客户端或外部系统：重点看 [API 参考](./api.md) 与 [架构设计](./architecture.md)
