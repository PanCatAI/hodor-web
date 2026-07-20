# Hodor Web

Hodor 的云端制作工作台。默认入口已经从原 Toonflow Vue 前端切换到 React、TanStack Router 和 shadcn/ui 风格组件；迁移期间保留 Vue 回退入口，React 使用同一套 Hodor 后端接口和 Pancat 登录会话。

当前迁移进度、可用路由和已知问题见 [React 迁移状态](./docs/react-migration-status.md)。设计边界见 [迁移设计](./docs/plans/2026-07-20-hodor-react-migration-design.md)，任务拆分见 [实施计划](./docs/plans/2026-07-20-hodor-react-migration.md)。

## 本地运行

前置条件：

- Node.js 23.11.1 或更高版本（本次验证使用 v25.8.1）
- Yarn 1.22（仓库通过 Corepack 固定包管理器版本）
- Hodor 后端运行在 `http://127.0.0.1:10588`

安装依赖并启动 React 工作台：

```bash
corepack yarn install
corepack yarn dev --host 127.0.0.1
```

访问 [http://127.0.0.1:50288/](http://127.0.0.1:50288/)。开发服务器会把 `/api`、`/assets`、`/oss` 和 `/skills` 转发到本地 Hodor 后端。`dev:react` 是同一入口的显式别名。

React 入口仍处于迁移期。旧 Vue 工作台可使用：

```bash
corepack yarn dev:vue --host 127.0.0.1
```

## 验证

```bash
# React 测试
corepack yarn test:react

# 默认生产构建即 React，产物输出到 dist-react
corepack yarn build

# Vue 基线检查；当前存在一处迁移前的既有类型错误
corepack yarn type-check
```

React 测试和构建与 Vue 类型检查相互独立。Vue 已知错误位于 `src/views/production/components/workbench/generate copy.vue`，不应阻塞 React 迁移验证。

## 迁移约束

- 登录使用 Pancat 账号，浏览器继续保存兼容的 `token`、`userId` 和 `pancatAccount` 会话键。
- 项目、资产、分镜和生成任务通过后端合同保存；3D 工程当前仍是按项目和分镜隔离的本地草稿，待后端补齐工程保存和截图素材回执后迁到云端。
- 生成供应商密钥不得进入前端代码、浏览器存储、构建产物或日志。
- React 已成为默认入口；Vue 页面暂时保留为回退和功能对照，待真实环境回归完成后再归档。

## 来源与许可证

Hodor Web 基于 [HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) 修改，当前上游只读地址记录为 `upstream`。仓库根目录的 [LICENSE](./LICENSE) 为 Apache License 2.0，原有版权、许可证和来源声明必须保留。

3D 导演台来源为 [jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk)，固定上游提交为 `8c8bd361790be4d37158a7430365e65546e358fe`。仓库已保留其 [MIT 许可证](./vendor/storyai-3d-director-desk/LICENSE)、[模型素材许可](./vendor/storyai-3d-director-desk/assets/ue-mannequin-retopology.license.txt) 和来源记录。第三方依赖声明见 [NOTICES.txt](./NOTICES.txt)。

原项目版权归北京爱阿科技有限公司所有；Hodor 的修改内容和新增来源记录随仓库保留。
