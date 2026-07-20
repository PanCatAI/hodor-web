# Hodor Web React Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Hodor Web 渐进迁移到 React、TanStack Router 和 shadcn/ui，并首先交付 Pancat 登录、工作台主壳和原生 3D 导演台页面。

**Architecture:** 在同一仓库建立独立 React 入口和构建配置，迁移期间保留 Vue 入口。React 复用现有 Hodor API 和浏览器会话键；3D 导演台作为仓库内 React 包直接挂到路由，工程快照和截图通过合同写回后端。

**Tech Stack:** React 18、TypeScript、Vite 5、TanStack Router、TanStack Query、Tailwind CSS、shadcn/ui、Vitest、Testing Library、Three.js、React Three Fiber。

---

### Task 1: 建立 React 独立工具链

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Create: `index.react.html`
- Create: `vite.react.config.ts`
- Create: `tsconfig.react.json`
- Create: `tailwind.react.config.ts`
- Create: `postcss.react.config.cjs`
- Create: `src-react/vite-env.d.ts`
- Create: `src-react/test/setup.ts`
- Test: `src-react/app/smoke.test.tsx`

**Step 1: Write the failing test**

添加烟雾测试，渲染 React 根组件并断言页面出现 `Hodor`。

**Step 2: Run test to verify it fails**

Run: `corepack yarn test:react src-react/app/smoke.test.tsx`
Expected: FAIL，React 测试命令或根组件尚不存在。

**Step 3: Write minimal implementation**

增加 React、TanStack、Tailwind、Radix 和测试依赖；建立独立 HTML、Vite 与 TypeScript 配置；加入 `dev:react`、`test:react`、`build:react` 命令。

**Step 4: Run test to verify it passes**

Run: `corepack yarn test:react src-react/app/smoke.test.tsx && corepack yarn build:react`
Expected: PASS，React 产物输出到 `dist-react`。

**Step 5: Commit**

```bash
git add package.json yarn.lock index.react.html vite.react.config.ts tsconfig.react.json tailwind.react.config.ts postcss.react.config.cjs src-react
git commit -m "feat: bootstrap Hodor React app"
```

### Task 2: 建立 API 与会话合同

**Files:**
- Create: `src-react/lib/api/client.ts`
- Create: `src-react/lib/auth/session.ts`
- Create: `src-react/lib/auth/types.ts`
- Test: `src-react/lib/api/client.test.ts`
- Test: `src-react/lib/auth/session.test.ts`

**Step 1: Write the failing tests**

覆盖默认 API 地址、`Authorization` 请求头、登录响应解包、401 清理，以及 `token`、`userId`、`pancatAccount` 三个兼容存储键。

**Step 2: Run tests to verify they fail**

Run: `corepack yarn test:react src-react/lib`
Expected: FAIL，合同模块尚不存在。

**Step 3: Write minimal implementation**

实现基于 `fetch` 的 API 客户端和会话仓库。登录请求使用 `POST /login/login`；API 地址按环境变量、浏览器存储、默认地址的顺序解析。

**Step 4: Run tests to verify they pass**

Run: `corepack yarn test:react src-react/lib`
Expected: PASS。

**Step 5: Commit**

```bash
git add src-react/lib
git commit -m "feat: add Hodor React auth contracts"
```

### Task 3: 移植 Pancat 登录

**Files:**
- Create: `src-react/features/auth/login-page.tsx`
- Create: `src-react/features/auth/login-form.tsx`
- Create: `src-react/features/auth/use-login.ts`
- Create: `src-react/components/ui/button.tsx`
- Create: `src-react/components/ui/input.tsx`
- Create: `src-react/components/ui/label.tsx`
- Test: `src-react/features/auth/login-page.test.tsx`

**Step 1: Write the failing test**

模拟登录接口，断言空表单提示、提交态、服务端错误、成功保存会话和跳转 `/projects`。

**Step 2: Run test to verify it fails**

Run: `corepack yarn test:react src-react/features/auth/login-page.test.tsx`
Expected: FAIL，登录页面尚不存在。

**Step 3: Write minimal implementation**

使用 shadcn/ui 风格基础组件实现登录表单，保留后端地址设置；错误信息直接展示在表单内。

**Step 4: Run test to verify it passes**

Run: `corepack yarn test:react src-react/features/auth/login-page.test.tsx`
Expected: PASS。

**Step 5: Commit**

```bash
git add src-react/features/auth src-react/components/ui
git commit -m "feat: port Pancat login to React"
```

### Task 4: 建立 TanStack 路由与工作台主壳

**Files:**
- Create: `src-react/main.tsx`
- Create: `src-react/app/router.tsx`
- Create: `src-react/app/root-layout.tsx`
- Create: `src-react/app/protected-layout.tsx`
- Create: `src-react/app/navigation.ts`
- Create: `src-react/features/projects/projects-page.tsx`
- Create: `src-react/styles/index.css`
- Test: `src-react/app/router.test.tsx`

**Step 1: Write the failing test**

覆盖 `/login`、未登录保护、`/projects` 和 `/director-desk` 导航。

**Step 2: Run test to verify it fails**

Run: `corepack yarn test:react src-react/app/router.test.tsx`
Expected: FAIL，路由尚不存在。

**Step 3: Write minimal implementation**

建立代码式 TanStack Router。工作台布局提供项目、资产、分镜、生产和 3D 导演台入口；尚未迁移页面显示明确占位状态。

**Step 4: Run test to verify it passes**

Run: `corepack yarn test:react src-react/app/router.test.tsx`
Expected: PASS。

**Step 5: Commit**

```bash
git add src-react/main.tsx src-react/app src-react/features/projects src-react/styles
git commit -m "feat: add Hodor React workspace shell"
```

### Task 5: 引入 3D 导演台源码

**Files:**
- Create: `vendor/storyai-3d-director-desk/**`
- Create: `vendor/storyai-3d-director-desk/SOURCE.md`
- Modify: `NOTICES.txt`
- Modify: `vite.react.config.ts`
- Test: `src-react/features/director-desk/director-page.test.tsx`

**Step 1: Write the failing test**

渲染导演台页面，断言导演视角、机位视角和截图操作可见。

**Step 2: Run test to verify it fails**

Run: `corepack yarn test:react src-react/features/director-desk/director-page.test.tsx`
Expected: FAIL，导演台模块尚未引入。

**Step 3: Write minimal implementation**

按固定上游提交引入源码，保留 MIT 许可证和模型来源说明；移除独立应用外壳，只导出可被 Hodor 路由渲染的 `DirectorDesk` 组件。

**Step 4: Run test to verify it passes**

Run: `corepack yarn test:react src-react/features/director-desk/director-page.test.tsx && corepack yarn build:react`
Expected: PASS。

**Step 5: Commit**

```bash
git add vendor NOTICES.txt vite.react.config.ts src-react/features/director-desk
git commit -m "feat: embed 3D director desk in Hodor"
```

### Task 6: 连接 3D 工程和分镜合同

**Files:**
- Create: `src-react/features/director-desk/director-contract.ts`
- Create: `src-react/features/director-desk/use-director-project.ts`
- Create: `src-react/features/director-desk/use-capture-upload.ts`
- Modify: `vendor/storyai-3d-director-desk/src/editor/io/hostBridge.ts`
- Test: `src-react/features/director-desk/director-contract.test.ts`

**Step 1: Write the failing tests**

覆盖按 `projectId/storyboardId` 加载与保存工程 JSON，截图上传后只保存素材 URL 或任务回执，失败时保留本地草稿。

**Step 2: Run tests to verify they fail**

Run: `corepack yarn test:react src-react/features/director-desk/director-contract.test.ts`
Expected: FAIL，合同适配尚不存在。

**Step 3: Write minimal implementation**

增加 React 适配层，将导演台状态转换为 Hodor 分镜合同。服务端接口未完成时使用明确的本地草稿适配器，调用点保持可替换。

**Step 4: Run tests to verify they pass**

Run: `corepack yarn test:react src-react/features/director-desk/director-contract.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add src-react/features/director-desk vendor/storyai-3d-director-desk/src/editor/io/hostBridge.ts
git commit -m "feat: connect director desk contracts"
```

### Task 7: 验证首批迁移结果

**Files:**
- Modify: `README.md`
- Create: `docs/react-migration-status.md`

**Step 1: Run focused tests**

Run: `corepack yarn test:react`
Expected: PASS。

**Step 2: Run type and production builds**

Run: `corepack yarn build:react`
Expected: PASS，产物位于 `dist-react`。

**Step 3: Run local smoke**

Run: `corepack yarn dev:react --host 127.0.0.1`
Expected: 登录页和 `/director-desk` 可访问，后端请求指向 `10588`。

**Step 4: Document baseline limitation**

记录 Vue 基线当前在 `src/views/production/components/workbench/generate copy.vue` 存在既有类型错误；React 验证不依赖该文件。

**Step 5: Commit**

```bash
git add README.md docs/react-migration-status.md
git commit -m "docs: record Hodor React migration status"
```

### Task 8: 逐页迁移并切换默认入口

**Files:**
- Migrate: `src/views/project/**` to `src-react/features/projects/**`
- Migrate: `src/views/assets/**` to `src-react/features/assets/**`
- Migrate: `src/views/script/**` to `src-react/features/storyboards/**`
- Migrate: `src/views/production/**` to `src-react/features/production/**`
- Migrate: `src/views/scriptAgent/**` to `src-react/features/agents/**`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Migrate one route at a time with contract tests**

每个页面先为请求映射、状态转换和关键操作写失败测试，再实现最小页面。

**Step 2: Verify each route**

Run: `corepack yarn test:react && corepack yarn build:react`
Expected: PASS。

**Step 3: Compare functional parity**

检查登录、项目、原文、剧本、资产、分镜、生成、任务状态和 Socket.IO 重连。

**Step 4: Switch the default build**

将 `dev`、`build` 和默认 `index.html` 指向 React；Vue 文件移动到 `legacy-vue`，保留一个发布周期后删除。

**Step 5: Commit**

```bash
git add package.json vite.config.ts index.html src-react legacy-vue
git commit -m "feat: make React the default Hodor web app"
```

