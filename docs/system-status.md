# Hodor Web 系统状态

更新时间：2026-08-08

## 运行结构

Hodor Web 使用 React 单入口。浏览器直接连接云端 Hodor API；Electron 先通过 `hodor://getAppUrl` 取得本地后端地址。所有受保护请求携带 Pancat 会话，HTTP 401 会清理本地会话并返回登录页。

| 层 | 职责 |
| --- | --- |
| React 工作台 | 编辑、提交标准输入、展示后端状态和稳定素材结果 |
| Hodor API | 业务合同、SQLite 持久化、智能体协调、文件和素材回写 |
| Pancat | 账号、供应商路由、生成任务、素材注册和状态真相 |
| Socket.IO | 智能体消息、反向工具调用、断线恢复 |
| WebAV | 浏览器内视频时间线、预览和合成导出 |

## 页面与合同

| 路由 | 能力 | 主要后端合同 |
| --- | --- | --- |
| `/login` | Pancat 账号登录 | `/login/login` |
| `/projects` | 项目增改删、模型检查、视觉与导演手册 | `/project/*`、`/modelSelect/*` |
| `/projects/$projectId/novels` | 原文编辑、TXT/DOCX 批量导入、事件分析 | `/novel/*` |
| `/projects/$projectId/scripts` | 剧本编辑、导入导出、资产选择和提取 | `/script/*` |
| `/projects/$projectId/script-agent` | 决策和剧本智能体、工作数据回写 | `/agents/*`、`/api/socket/scriptAgent` |
| `/projects/$projectId/casting` | 人物、场景、道具生成和历史选择 | `/cornerScape/*`、`/assetsGenerate/*` |
| `/projects/$projectId/assets` | 资产增改删、音频样本、视频片段、失败恢复 | `/assets/*` |
| `/projects/$projectId/storyboards` | 分镜合同、生图、网格预览、图片工作流 | `/production/getFlowData`、`/production/storyboard/*` |
| `/projects/$projectId/production` | 产线图、图片和视频任务、轨道、结果选择、WebAV | `/production/*` |
| `/projects/$projectId/director-desk` | 3D 导演工程保存、冲突处理、截图素材回写 | `/directorDesk/*` |
| `/tasks` | 生成任务筛选、状态和完整失败原因 | `/task/*` |
| `/collaboration` | 只读单场景协作证据、角色合同、责任图和空间决策 | 本地固定夹具；不写业务状态 |
| `/settings` | 供应商、模型、智能体、提示词、数据库、文件和会话 | `/setting/*` |

旧路径只负责把已有书签跳转到带项目作用域的新路径，不承载独立业务状态。

## 数据和恢复

- Hodor API 是项目、合同和任务状态的唯一业务入口；React 不建立第二份数据库真相。
- 3D 导演工程按 `projectId + storyboardId` 保存，使用 revision 处理并发冲突。
- 截图先上传并注册为素材，再用稳定地址回写分镜；工程 JSON 不保存 Base64。
- 智能体断线后重连 Socket.IO，并从服务端恢复未完成资产和分镜轮询。
- WebAV 时间线按 `projectId + scriptId` 隔离并在页面会话内保活；当前后端没有剪辑工程保存接口，因此长期产物以导出的 MP4 为准，不会把浏览器草稿伪装成数据库合同。
- 图片与视频错误保留 HTTP 状态、请求编号和供应商原因，页面不会把业务错误显示成成功。

## 电影级多角色协作状态视图

协作仪表盘位于 `/collaboration`，它是受保护布局下的只读状态视图。当前验证使用 `film-zero-cost-001` 的 `scene-kitchen-007` 本地夹具，前端不建立第二份生产真相，也不向供应商发起调用。

数据分成四个互相独立的边界：

| 边界 | 当前证据 | 保护条件 |
| --- | --- | --- |
| 角色合同 | `shot-planner.v1`、`continuity-supervisor.v1`，分别列出职责、知识、私有记忆、工具、质量规则和禁写项 | 角色只能读取自己的合同与工作记忆摘要 |
| 影片知识图谱 | `blocking.geometry`、`character.hands`、已采用镜头等事实节点 | 知识节点不携带 `roleId`、`assignee` 或责任状态 |
| 动态责任图 | revision 1，白模责任归连续性监修，局部 patch 责任归分镜规划师 | 图变更带 `evidence:*` 引用，可以独立演化 |
| 镜头证据 | `evidence:shot-003:spatial-risk`、`evidence:shot-003:patch:2`、`evidence:arbitration:shot-003:1` | patch 只作用于 `shot-003`，保留其他已采用镜头 |

单场景记录的时间线从一条用户消息开始，先并行启动两个角色，再按 capability 选择供应商知识，依据空间风险决定白模调用，最后由证据裁决并局部采用。`shot-003` 风险为 `0.85`，调用本地 recording white-blockout；`shot-001` 风险为 `0`，保留固定机位的跳过理由。分镜规划师返场时继续使用 `film-zero-cost-001` 和自己的 `memory:film-zero-cost-001:shot-planner`。

页面底部 readiness 使用证据集合计算展示状态：证据齐全、上下文连续、边界安全、零成本四项均满足才显示 `READY`。页面本身不包含写入按钮，也不改变 ProductionGraph 的业务代码。

## 验证

```bash
bun run test
bun run build
bun run test:release
```

后端验证在 Hodor 仓库执行：

```bash
bun run lint
bun run test:cloud
bun run build
```

## 法定来源

Hodor Web 仅供内部使用，仍须遵守根 `LICENSE` 的完整条款，保留 Toonflow 来源、NOTICE 和版权声明。3D 导演台的 MIT 许可证、模型素材许可和固定上游来源记录均位于 `vendor/storyai-3d-director-desk/`。
