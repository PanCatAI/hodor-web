# Hodor Web

Hodor Web 是 Studio OS 的 React 生产控制室。它把故事决定、导演上下文、递归生产、采用资产、工作租约、验证结果和演化证据放进同一个项目组视图。

仓库只消费 Hodor 的 HTTP 权威接口。浏览器直接读取 Hodor 的数据库真相，不建立第二份生产状态，也不提供生产发布入口。

## 已实现

原有项目工作台仍使用 `/projects/$projectId`。Studio OS 控制室位于 `/projects/$projectId/studio-os`；Hodor 使用独立项目组编号时，可通过 `groupId` 查询参数传入。省略时使用 `project-${projectId}`。

控制室读取 `/api/studio-os-vnext/groups/:groupId/snapshot`，展示：

- 项目组总览、故事室上下文和导演室上下文；
- 基于父子关系和资产依赖的递归生产图；
- 资产来源、采用状态和下游失效影响；
- 活跃工作租约与 EPYC 证据入口；
- 候选验证失败、任务失败或失效，并按节点聚合证据引用；
- 从 Hodor 有序事件推导的 replay、shadow、canary、rollback 回读状态；
- 通过 Hodor 命令完成独立验证候选的采用和任务级精确回滚。

缺少演化事件或证据引用时，页面显示“未报告”，不会根据阶段名称推断可晋级状态。

## Fixture 验证

控制室测试使用内存中的权威接口响应夹具，验证项目隔离、递归影响计算、失败聚合、有序演化回读、采用与回滚的确定性幂等键、数据库下载鉴权、错误呈现，以及页面没有生产发布入口。测试期间不调用供应商、不发布生产、不删除真实资产，也不读取或写入其他项目。

## 本地运行

使用 Bun 1.3.5 或更高版本，并让 Hodor 运行在 `http://127.0.0.1:10588`。

```bash
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

打开 [http://127.0.0.1:50288/](http://127.0.0.1:50288/)。Vite 会把 `/api`、`/assets`、`/oss` 和 `/skills` 转发到本地 Hodor。

## 验证与发布

```bash
bun run test
bun run type-check
bun run build
bun run test:release
```

同步构建产物到 Hodor 的 `data/web` 目录：

```bash
HODOR_APP_DIR=/absolute/path/to/hodor bun run publish:hodor
```

React 是唯一应用入口。浏览器和 Electron 共用页面；Electron 通过 `hodor://` 解析后端地址并控制无边框窗口。

## 边界

- Pancat 会话令牌只发送给 Hodor 的 HTTP 和 Socket.IO 请求。数据库下载现在复用统一的鉴权下载路径，HTTP 401 会清理会话。
- 项目、合同、任务、资产、验证、租约、采用、回滚和证据的真相由 Hodor 保存。
- 媒体页面只保存稳定素材引用和回执；供应商密钥不会进入前端、仓库或日志。
- 长任务由服务端负责。采用或回滚命令完成后，页面重新读取权威快照。
- 控制室用于观测和受边界约束的决定，生产发布仍在控制室范围之外。

完整工作台边界见[系统状态](./docs/system-status.md)，英文说明见 [README.md](./README.md)。

## 许可证与上游来源

Hodor Web 基于 [HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) 修改，仅供内部使用。使用和修改须遵守 [LICENSE](./LICENSE)，并保留 Toonflow 的来源与 NOTICE 文件。

3D 导演台来自 [jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)，固定来源提交为 `8c8bd361790be4d37158a7430365e65546e358fe`。相关许可证、模型素材声明和来源记录保存在 `vendor/storyai-3d-director-desk/`。
