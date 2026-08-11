# Hodor Web

Hodor Web 是面向 Studio OS 的生产控制室前端。它围绕一个生产项目组组织工作：用户进入项目组后，在同一条生产脉络里查看故事、做决定、采用资产、追踪递归生产图，并把需要机器处理的工作交给工作节点和 GPU 队列。只有真正阻塞生产的验证失败或需要裁决的事项才升级为人工提醒。

这里的“项目组”是控制室的产品边界：故事室负责叙事与决策，导演室负责镜头与视觉意图，生产图负责把上游变化传到下游，任务和验证负责说明系统是否可以继续推进。当前仓库仍处于从项目工作台走向 Studio OS 控制面的过程中，下面将两者明确分开。

## 当前实现：按项目编号组织的工作台

当前 React 路由和 [系统状态](./docs/system-status.md) 描述的是一个以 `projectId` 为边界的项目工作台，而不是完整的项目组控制室：

- `/projects` 读取项目列表，支持新建、编辑、删除、模型检查和手册管理。打开项目会保存 `hodorSelectedProjectId`，再进入带项目编号的工作区；旧路径只负责跳转。
- `/projects/$projectId/novels` 和 `/scripts` 分别处理原文、剧本、导入导出、资产选择与提取；`/script-agent` 提供剧本智能体和决策工作数据回写。
- `/projects/$projectId/interactive` 当前是互动剧情图。画布展示剧情节点和选择边，并为每个节点展开剧本、剧本规划、资产、分镜表、分镜图、产线和监督阶段；点击阶段后在检查器中编辑或触发生产，图的位置更新带有服务端 revision 保护。
- `/projects/$projectId/casting`、`/assets` 和 `/storyboards` 负责角色/场景/道具、资产、分镜及图片工作流。当前资产页面支持增改删、音频样本、视频片段和失败恢复，但还没有项目组级的资产采用谱系或失效传播视图。
- `/projects/$projectId/production` 提供产线图、图片和视频任务、轨道、结果选择及 WebAV 时间线。后端保存长任务状态，页面轮询、断线恢复，并保留供应商错误和可读失败原因。
- `/projects/$projectId/director-desk` 是按 `projectId + storyboardId` 作用域保存的 3D 导演台。工程使用 revision 处理并发冲突；截图先上传并注册为素材，再用稳定地址和素材回执回写分镜，不把 Base64 写入云端工程。
- `/tasks` 是独立的任务中心，可按项目、任务类型和状态筛选，显示模型、相关对象、进行中/已完成/生成失败状态以及完整失败原因。它是状态查询页，不是 GPU 资源调度台。

因此，当前实现可以作为一个项目的生产入口，但 README 中的“工作节点”“GPU 队列”“采用资产后的失效传播”和“最少人工提醒”仍属于目标控制面的概念，不能当作现有页面已经提供的功能。

## 目标 Studio OS 控制面

目标体验是用户只需打开一个生产项目组，就能从全局状态进入两个相互关联的房间，并沿着同一张递归生产图完成推进：

### 故事室：决定生产什么

故事室汇总原文、剧本、分支剧情和决策。每个决策应记录上下文、理由、采用的版本和影响范围；决策确定后，递归生产图从该节点向下展开脚本规划、角色/场景/道具、分镜表、分镜图、视频和监督验证。选择边连接故事分支，后续节点不应脱离上游真相单独漂移。

### 导演室：决定如何呈现

导演室把镜头意图、构图、机位、时间线和 3D 导演工程放在同一上下文里。它应能打开故事室选中的镜头，查看采用的角色、场景和道具资产，提交截图或镜头结果，并让工程版本、素材回执和验证结果可追溯。

### 递归生产图：让变化沿依赖传播

生产图不是一次性流水线，而是按依赖递归展开的真相图：上游故事或决策变化时，系统识别受影响的下游节点，重新验证仍可复用的结果，并将必须重做的结果标为失效。图中应同时看见依赖、当前采用版本、运行状态、失败原因和下一步动作。

### 采用资产与失效传播

“生成过”不等于“正在采用”。项目组应明确每个角色、场景、道具、图片、视频和截图的采用版本、来源、验证状态与消费者。采用新资产后，系统沿生产图标出受影响的分镜、镜头和视频；失效只传播到确实依赖旧版本的分支，并保留可回退的历史结果。当前实现只在各项目页面和生产合同中保存资产/结果状态，尚未提供这套跨节点采用与失效界面。

### 工作节点与 GPU 队列

目标控制面将生成、转码、分析和验证交给可观测的工作节点。GPU 队列应显示等待、运行、完成、重试和失败，以及任务绑定的模型、优先级、资源、耗时和工作节点；调度状态必须和任务结果、资产回执及验证状态关联。当前 `/tasks` 能显示任务状态、模型和失败原因，代码中没有项目组级工作节点注册表或 GPU 队列面板，不能据此推断已有 GPU 调度能力。

### 验证失败与最少人工提醒

验证失败要停在产生问题的节点，保留 HTTP 状态、请求编号、供应商原因或验证详情，并给出重试、换版本、重新采用或回到上游决策的动作。只有自动重试、依赖失效或机器无法判定时才提醒人；提醒应按项目组聚合，说明阻塞范围、证据和需要的唯一裁决，避免把每个任务的普通状态变化都变成通知。当前生产页和任务中心已经展示生成失败及其原因，导演台也保留云端冲突、保存和截图上传错误；“按阻塞范围聚合的最少提醒”仍是目标交互。

## 运行

需要 Node.js 22 或更高版本、Corepack，以及正在 `http://127.0.0.1:10588` 监听的 Hodor 后端。

```bash
corepack yarn install
corepack yarn dev --host 127.0.0.1
```

访问 [http://127.0.0.1:50288/](http://127.0.0.1:50288/)。开发服务器会把 `/api`、`/assets`、`/oss` 和 `/skills` 转发到本地后端。

React 是唯一运行入口。浏览器和 Electron 共用同一套页面；Electron 使用 `hodor://` 读取本地后端地址并控制无边框窗口。

## 验证与发布

```bash
# 单元测试和合同测试
corepack yarn test

# 类型检查和生产构建，产物位于 dist-react
corepack yarn build

# Electron 和静态发布合同
corepack yarn test:release

# 构建并同步到 Hodor 后端 data/web
HODOR_APP_DIR=/absolute/path/to/hodor corepack yarn publish:hodor
```

后端验证需在 Hodor 仓库执行：

```bash
corepack yarn lint
corepack yarn test:cloud
corepack yarn build
```

## 业务边界与数据真相

- Hodor API 是项目、合同和任务状态的唯一业务入口；React 不建立第二份数据库真相。
- 登录使用 Pancat 账号，会话令牌仅用于后端请求和 Socket.IO 鉴权；HTTP 401 会清理本地会话并返回登录页。
- 图片和视频模型沿用 `vendor:model`，当前生产模型为 `pancat:pancat-image` 与 `pancat:pancat-video`。
- 图片、视频、截图和剪辑产物只保存稳定素材地址或回执；供应商密钥不会写入前端、仓库和日志。
- 智能体通过 Socket.IO 传递消息和工具调用；断线后页面会重连，并从服务端恢复未完成资产和分镜轮询。
- WebAV 时间线按 `projectId + scriptId` 隔离并在页面会话内保活。当前后端没有剪辑工程保存接口，长期产物以导出的 MP4 为准。

接口、路由和数据职责见 [系统状态](./docs/system-status.md)。

## 来源与许可证

Hodor Web 基于 [HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) 修改，仅供内部使用。使用和修改须遵守仓库根目录 [LICENSE](./LICENSE) 的完整条款，并保留 Toonflow 的版权、标识、NOTICE 和来源声明。

3D 导演台来自 [jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)，固定来源提交为 `8c8bd361790be4d37158a7430365e65546e358fe`。其 [MIT 许可证](./vendor/storyai-3d-director-desk/LICENSE)、[模型素材许可](./vendor/storyai-3d-director-desk/assets/ue-mannequin-retopology.license.txt) 和 [来源记录](./vendor/storyai-3d-director-desk/VENDOR_SOURCE.json) 均保留在仓库中。

直接依赖声明见 [NOTICES.txt](./NOTICES.txt)，原 Toonflow Web 说明存档见 `docs/upstream/`。
