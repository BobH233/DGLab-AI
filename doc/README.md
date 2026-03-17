# DGLabAI 中文文档

本目录基于当前仓库代码整理，描述的是已经落地的实现，而不是早期设想。

## 文档目录

- [架构设计](./architecture.md)：系统分层、关键数据流、记忆链路与设计取舍
- [后端说明](./backend.md)：Express、Mongo、编排器、配置服务、记忆服务与工具执行
- [前端说明](./frontend.md)：页面结构、SSE 联动、时间线播放与自动推进交互
- [API 参考](./api.md)：HTTP 路由、SSE 事件与主要数据结构
- [提示词与工具](./prompts-and-tools.md)：提示词模板、运行时工具与扩展方式
- [开发与部署](./development.md)：本地开发、调试方式、测试覆盖与已知限制

## 阅读建议

- 想快速了解项目是什么：先读 [README](../README.md)
- 想把握系统全貌：先读 [架构设计](./architecture.md)
- 想改后端链路：读 [后端说明](./backend.md) 和 [提示词与工具](./prompts-and-tools.md)
- 想改前端交互：读 [前端说明](./frontend.md)
- 想对接接口：读 [API 参考](./api.md)
- 想跑本地环境：读 [开发与部署](./development.md)
