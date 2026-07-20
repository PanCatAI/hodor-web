# Hodor Web React 迁移状态

更新时间：2026-07-20

## 当前结论

仓库采用同仓库双入口迁移：React 已经成为默认开发和构建入口，Vue 工作台通过 `dev:vue`、`build:vue` 保留为回退。后端接口、Pancat 登录会话和媒体地址合同保持兼容。

已完成 React 工具链、基础样式、API 客户端、会话合同和 Pancat 登录页。项目、原文、剧本、智能体、塑角造景、资产、分镜、生产、任务、设置和 3D 导演台已经接入项目作用域路由。当前成果是一套可运行的 React 生产主干，仍有后文列出的 Vue 增强能力和云端持久化合同待补。

## 启动方式

### 1. 启动后端

Hodor 后端默认监听：

```text
http://127.0.0.1:10588
```

后端启动方式以 `Toonflow-app` 仓库的运行说明为准。React 开发服务器依赖以下同源代理：

| 浏览器路径 | 本地目标 |
| --- | --- |
| `/api` | `http://127.0.0.1:10588` |
| `/assets` | `http://127.0.0.1:10588` |
| `/oss` | `http://127.0.0.1:10588` |
| `/skills` | `http://127.0.0.1:10588` |

### 2. 启动 React 工作台

```bash
corepack yarn install
corepack yarn dev --host 127.0.0.1
```

访问：

```text
http://127.0.0.1:50288/
```

Vite React 开发端口固定为 `50288`。本地 API 默认地址为 `http://localhost:10588/api`，也可以通过 React 环境配置覆盖。

### 3. 启动旧 Vue 工作台

```bash
corepack yarn dev:vue --host 127.0.0.1
```

Vue 入口用于迁移期间回归现有能力。它不代表新的页面仍应继续使用 Vue 实现。

## 验证命令

| 目的 | 命令 | 通过标准 |
| --- | --- | --- |
| React 单元与合同测试 | `corepack yarn test:react` | 所有 `src-react/**/*.test.ts(x)` 通过 |
| React 类型检查与生产构建 | `corepack yarn build` | TypeScript 通过，生成 `dist-react` |
| React 本地烟雾测试 | `corepack yarn dev --host 127.0.0.1` | 登录页和已完成的保护路由可访问 |
| Vue 基线类型检查 | `corepack yarn type-check` | 当前会暴露迁移前既有错误，仅作基线记录 |

React 验证不依赖 Vue 类型检查。旧 Vue 基线在 `src/views/production/components/workbench/generate copy.vue` 存在既有类型错误，迁移任务不得把它误记为 React 回归。

### 专项验证记录

- 3D vendor TypeScript 检查通过，来源合同 4/4、Hodor 原生嵌入测试 2/2，通过入口 `vendor/storyai-3d-director-desk/src/embed.tsx` 加载。
- 完整 React 生产构建通过，共转换 2377 个模块；主脚本约 451.42 kB，按路由加载的 3D 导演台脚本约 1267.76 kB，GLB 资源约 750.46 kB。当前仍有 3D 大包警告和 3 个上游外部模型库缩略图运行时解析警告，进入云端发布前应继续拆包并检查资源可用性。
- 固定上游版本的隔离构建通过。完整 vendor 测试为 305/313，保留上游已有的 8 个失败，涉及模型库、画幅、操作轴、场景样式、姿势和相机几何；这些失败不得计入 Hodor 新增回归。
- 2026-07-20 在 3D 与塑角造景路由接入后完成最终复跑：30/30 个测试文件、109/109 项通过，React 类型检查和生产构建通过。

## 路由迁移表

| React 路由 | 目标能力 | 当前状态 | 数据边界 |
| --- | --- | --- | --- |
| `/login` | Pancat 账号登录、后端地址、错误反馈 | 已完成 | `POST /login/login`；兼容 `token`、`userId`、`pancatAccount` |
| `/projects` | 项目列表和进入项目 | 已完成 | 复用 Hodor 项目接口，不在浏览器建立项目真相 |
| `/projects/$projectId/novels` | 原文列表、编辑和分页 | 已完成并接入根路由 | 复用 `/novel/*` 接口 |
| `/projects/$projectId/scripts` | 剧本列表和结构化编辑 | 已完成并接入根路由 | 复用 `/script/*` 接口 |
| `/projects/$projectId/script-agent` | 阶段智能体控制台和消息流 | 已完成并接入根路由 | 使用 `/api/socket/scriptAgent` 和 `/agents/*` 合同 |
| `/projects/$projectId/casting` | 角色识别、批量出图和音频绑定 | 已完成并接入根路由 | 复用 `/cornerScape/*`、`/assetsGenerate/*` 与资产轮询合同 |
| `/projects/$projectId/assets` | 人物、场景、道具、服装资产工作台 | 已完成并接入根路由 | 通过 `/assets/*` 合同读取、创建并轮询生成状态 |
| `/projects/$projectId/storyboards?scriptId=…` | 原文、剧本片段、分镜合同和分镜图 | 已完成并接入根路由 | 分镜编号由查询参数提供；绑定只保存素材 URL、素材标识或任务回执 |
| `/projects/$projectId/production?episodeId=…` | 图片、视频、生产智能体和生成状态 | 已完成并接入根路由 | 复用 `/production/*` 接口，统一旧状态字符串供页面展示 |
| `/projects/$projectId/director-desk?storyboardId=…` | 原生 React 3D 导演台、工程草稿和截图上传 | 已完成并接入根路由，云端保存合同待补 | 工程 JSON 暂存本地；截图通过 `/assets/uploadClip` 注册，但接口没有返回素材回执 |
| `/tasks` | 任务筛选、状态和完整失败原因 | 已完成并接入根路由 | 通过 `/task/*` 读取后端任务状态，不在前端推演状态 |
| `/settings` | 15 个设置分区、Pancat 会话和退出登录 | 已完成并接入根路由 | 供应商等配置通过 `/setting/*` 后端合同管理，密钥不得写入源码或前端构建 |

兼容入口 `/project`、`/novel`、`/script`、`/scriptAgent`、`/cornerScape`、`/production`、`/assets` 和 `/director-desk` 会读取最近项目编号并跳转到新的项目作用域路由；没有项目编号时回到 `/projects`。

## 已完成的合同

- React 默认入口：`index.html`、`vite.react.config.ts`、`src-react`；Vue 回退入口为 `index.vue.html`。
- 登录请求：`POST /login/login`。
- 会话兼容：沿用 `token`、`userId` 和 `pancatAccount`。
- API 客户端：统一处理基础地址、认证请求头、响应解包和 401 会话清理。
- 平台适配：普通浏览器不会调用 Electron 自定义协议；API 地址按环境变量、`hodorApiBaseUrl`、Electron 桌面地址和本地默认地址依次解析；主题支持自动、浅色、深色，语言支持中文和英文。
- 独立验证：`test:react` 和 `build:react` 不执行 Vue 类型检查。
- 资产中心：列表、筛选、父子资产、创建、预览、分页、失败重试，以及图片和提示词状态轮询；素材和音频上传表单尚未迁移。
- 塑角造景：资产加载与类型筛选、批量提示词润色、批量出图、单项和批量取消、图片状态轮询、批量音频绑定及音频状态轮询。
- 原文与剧本：读取、创建、更新和删除；沿用 `/novel/*` 与 `/script/*` 合同。
- 分镜工作台：读取生产流、编辑提示词和视频描述、移除单帧及批量删除；沿用 `/production/getFlowData` 和 `/production/storyboard/*` 合同。
- 生产工作台：加载剧本与生成数据、批量生成分镜图、轮询分镜图、提交视频、轮询视频和展示失败原文。
- 智能体控制台：剧本与生产智能体通过 `/api/socket/scriptAgent`、`/api/socket/productionAgent` 通信；连接认证携带会话、隔离键和项目编号，生产智能体额外携带剧本编号；记忆读取与清理沿用 `/agents/getMemory` 和 `/agents/clearMemory`。客户端已经支持 `getPlanData`、`getFlowData`、衍生资产操作和分镜操作的服务端反向回调。
- 任务中心：通过 HTTP 读取项目、任务分类和任务列表，支持筛选、刷新及完整失败原因；当前未连接 Socket.IO。
- 设置中心：界面、语言、供应商、模型映射、智能体、提示词、技能、记忆、数据库、文件、其他、请求、开发、关于和会话共 15 个分区；远端配置沿用 `/setting/*` 与版本接口，本地偏好和 Pancat 会话分别管理。
- 3D 导演台：按项目与分镜隔离本地草稿，截图转 Blob 后通过 `/assets/uploadClip` 上传，失败时保留可重试草稿。当前后端没有返回素材编号、文件路径或 URL，适配层只能临时保留 data URL；这不是最终云端素材合同。

## 尚未完成

- 项目新建、编辑、删除、模型有效性检查、视觉手册和导演手册。
- 原文批量导入、批量删除、事件分析及轮询。
- 剧本批量导入、导出、资产选择、资产提取及轮询。
- 塑角造景的历史图替换、单项音频更新和完整生成失败恢复。
- 资产编辑、删除、批量操作、音频资产、视频片段上传、生成历史和失败恢复。
- 完整生产流图、布局保存、衍生资产、图片编辑、视频轨道管理、结果选择、预览下载和 WebAV 视频编辑器。
- 生产智能体反向工具事件与真实业务 REST 的路由接线；Socket 客户端已经提供成功和失败回执能力。
- 3D 工程 JSON 的云端保存接口，以及截图上传后返回 `assetId`、`imageId`、文件路径或 URL 的素材回执；取得稳定地址后再回写指定分镜。当前兼容适配会把 data URL 留在本地草稿，不能用于云端长期保存或视频请求。
- Socket.IO 断线重连、反向工具调用、任务状态恢复和云端长期任务恢复。
- Electron 的 React 开发端口、`dist-react` 发布目录和后端静态目录统一；自定义地址读取已经使用 Hodor 注册的 `hodor://getAppUrl`。
- Vue 代码归档和云端部署收口。

React API 客户端目前只处理 JSON 或文本响应。剧本导出和数据库导出需要单独增加 Blob 下载合同。

## 许可证与来源

- Hodor Web 来源：[HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web)。仓库保留 `upstream` 只读远端用于追踪来源。
- 当前根许可证：Apache License 2.0，见 `LICENSE`。
- 第三方依赖声明：见 `NOTICES.txt`，新增或升级依赖后应重新核对。
- 3D 导演台来源：[jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)，固定提交 `8c8bd361790be4d37158a7430365e65546e358fe`。MIT 许可证位于 `vendor/storyai-3d-director-desk/LICENSE`，模型许可位于 `vendor/storyai-3d-director-desk/assets/ue-mannequin-retopology.license.txt`，来源和修改记录位于 `vendor/storyai-3d-director-desk/VENDOR_SOURCE.json`。
- Hodor 当前仅供内部使用，但内部使用不取消保留版权、许可证、NOTICE 和素材来源记录的要求。

## 发布就绪条件

React 已成为仓库默认入口。云端替换现有 Vue 生产工作台前，仍需同时满足：

1. 登录、项目、原文、剧本、资产、分镜、生成任务和视频工作台达到功能对等。
2. 3D 导演台能够按项目加载与保存，并把截图上传后回写指定分镜。
3. React 测试、类型检查和生产构建全部通过。
4. Pancat 登录、素材地址、任务状态和 Socket.IO 重连完成真实环境回归。
5. `LICENSE`、`NOTICES.txt`、3D 导演台及模型素材来源声明完整。
