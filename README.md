# Hodor Web

Hodor 的云端内容生产工作台，使用 React、TanStack Router 和 Pancat 账号会话，连接 Hodor 后端完成原文、剧本、资产、分镜、图片、视频和剪辑生产。

## 本地运行

需要 Node.js 22 或更高版本、Corepack 和正在 `http://127.0.0.1:10588` 监听的 Hodor 后端。

```bash
corepack yarn install
corepack yarn dev --host 127.0.0.1
```

访问 [http://127.0.0.1:50288/](http://127.0.0.1:50288/)。开发服务器会把 `/api`、`/assets`、`/oss` 和 `/skills` 转发到本地后端。

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

React 是唯一运行入口。浏览器和 Electron 共用同一套页面；Electron 使用 `hodor://` 读取本地后端地址并控制无边框窗口。

## 业务边界

- 登录使用 Pancat 账号，会话令牌仅用于后端请求和 Socket.IO 鉴权。
- 图片和视频模型沿用 `vendor:model`，当前生产模型为 `pancat:pancat-image` 与 `pancat:pancat-video`。
- 项目、原文、剧本、资产、分镜、智能体工作数据、生成任务和 3D 导演台工程均以 Hodor 后端合同为准。
- 图片、视频、截图和剪辑产物只保存稳定素材地址或回执；供应商密钥不会写入前端、仓库和日志。
- 长任务由后端保存状态，页面支持轮询恢复、Socket.IO 重连和可读失败原因。

接口、路由和数据职责见 [系统状态](./docs/system-status.md)。

## 来源与许可证

Hodor Web 基于 [HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) 修改，仅供内部使用。使用和修改须遵守仓库根目录 [LICENSE](./LICENSE) 的完整条款，并保留 Toonflow 的版权、标识、NOTICE 和来源声明。

3D 导演台来自 [jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)，固定来源提交为 `8c8bd361790be4d37158a7430365e65546e358fe`。其 [MIT 许可证](./vendor/storyai-3d-director-desk/LICENSE)、[模型素材许可](./vendor/storyai-3d-director-desk/assets/ue-mannequin-retopology.license.txt) 和 [来源记录](./vendor/storyai-3d-director-desk/VENDOR_SOURCE.json) 均保留在仓库中。

直接依赖声明见 [NOTICES.txt](./NOTICES.txt)，原 Toonflow Web 说明存档见 `docs/upstream/`。
