# 零成本单场景协作记录

状态：`READY`

记录时间：2026-08-08

这份记录是 Hodor 后端 `runSingleScene` 内存模拟的前端只读回放。前端夹具只展示固定结果，不发起供应商调用，也不写入 Hodor 或 Pancat。

固定上下文：

- `filmId`: `film-zero-cost-001`
- `sceneId`: `scene-kitchen-007`
- 场景：老公寓厨房，23:40，雨夜
- 用户输入数：1
- 内部角色运行数：2
- 付费生成：`USD 0`

## 角色与上下文

两个角色共享影片和场景上下文，但合同、知识范围、工具白名单、质量规则和工作记忆保持隔离：

- `shot-planner` / `shot-planner.v1` / `role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1`
- `continuity-supervisor` / `continuity-supervisor.v1` / `role-run:film-zero-cost-001:scene-kitchen-007:continuity-supervisor:2`

分镜规划师读取 `film.characters`、`film.locations`、`scene.shot-intent`，并产生 `proposal:planner:shot-003`；连续性监修读取 `film.locations`、`scene.spatial-facts`、`scene.continuity`，并产生 `proposal:continuity:shot-003`。返场验证使用 `memory:film-zero-cost-001:shot-planner`，保持原 `filmId`，不新建影片上下文。

## 知识选择与责任图

分镜规划任务显式匹配本地供应商知识包：

- `mock-seedance-2.5/video.prompt/v1`
- capability：`video.prompt`
- 合同：`shot-planner.v1`
- 证据：`evidence:role-run:film-zero-cost-001:scene-kitchen-007:shot-planner:1:provider-knowledge`

连续性分析的 `providerId` 为空，选择器返回空知识包，证据为 `evidence:role-run:film-zero-cost-001:scene-kitchen-007:continuity-supervisor:2:provider-knowledge`。

责任图 revision `1` 保持影片知识与责任分离：白模 assignment 归 `continuity-supervisor`，局部 patch assignment 归 `shot-planner`，依赖关系为白模完成后才能处理 patch。拆分、重排和重分配均引用 `evidence:*` 形式的事实源引用。

## 空间决策与局部修复

空间策略阈值为 `0.70`：

- `shot-003`：风险 `0.85`，原因是轴线变化、人物三维路径、遮挡和道具交接；执行本地白模。
  - tool call：`blockout:film-zero-cost-001:scene-kitchen-007:shot-003:1:call`
  - result：`blockout:film-zero-cost-001:scene-kitchen-007:shot-003:1:result`
  - 证据：`evidence:shot-003:spatial-risk`
- `shot-001`：风险 `0`，原因是固定机位；审计记录为 `skip`，没有工具调用或结果引用。
  - 证据：`evidence:shot-001:spatial-risk`

两个候选进入 `spatial-consistency.v1` 裁决。结论为 `invoke-blockout`，裁决 ID 为 `arbitration:shot-003:1`，引用 `evidence:shot-003:spatial-risk` 和 `evidence:continuity:shot-003`。

随后只对 `shot-003` 应用 patch：

- `expectedVersion`: `1`
- candidate：`candidate:shot-003:v2`
- 变更：`修正越轴`、`保留道具交接`
- patch 证据：`evidence:shot-003:patch:2`

`shot-001`、`shot-002`、`shot-004` 的镜头状态保持不变。

## 证据矩阵

| 目标 | 后端事实源 | 结果 |
| --- | --- | --- |
| 双角色同场景并行 | 两条 `role-run:film-zero-cost-001:scene-kitchen-007:*` 运行记录 | 通过 |
| 合同、知识、记忆、工具和质量隔离 | 两个 `*.v1` 合同与各自 run record | 通过 |
| `filmId` 返场 | `memory:film-zero-cost-001:shot-planner` | 通过 |
| 责任图拆分、重排和重分配 | `evidence:assignment:create`、`evidence:arbitration:shot-003`、`evidence:continuity:shot-003`、`evidence:shot-003:spatial-risk` | 通过 |
| 供应商专属知识动态选择 | `mock-seedance-2.5/video.prompt/v1` | 通过 |
| 高风险启用白模 | `evidence:shot-003:spatial-risk` | 通过 |
| 低风险有理由跳过白模 | `evidence:shot-001:static` → `evidence:shot-001:spatial-risk` | 通过 |
| 局部修复不覆盖其他镜头 | `evidence:shot-003:patch`、镜头哈希对比 | 通过 |
| 分歧裁决可追溯 | `arbitration:shot-003:1` | 通过 |
| 一次对话驱动完整协作 | `userMessageCount=1`、`internalRunCount=2` | 通过 |
| readiness 不依赖阶段名 | `isReady` 只检查依赖状态和 capability | 通过 |
| 零成本 | recording provider、recording white-blockout、`paidGenerationUsd=0` | 通过 |

## 复现命令

前端：

```bash
bunx vitest run --config vite.react.config.ts src-react/features/collaboration/production-collaboration-dashboard.test.tsx
bun run type-check
bun run build
```

后端内存模拟：

```bash
node --import tsx --test tests/production-collaboration-simulation.test.mjs
```

SQLite 合同测试需要与仓库中 `better-sqlite3` 原生模块匹配的 Node ABI；当前工作站默认 Node 25 与现存 Node 22 模块不匹配，因此这部分不能在当前 Node 进程中宣称通过。
