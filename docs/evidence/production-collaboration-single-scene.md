# 零成本单场景协作记录

状态：`READY`

记录时间：2026-08-08

固定上下文：

- `filmId`: `film-zero-cost-001`
- `sceneId`: `scene-kitchen-007`
- 场景：老公寓厨房，23:40，雨夜
- 用户输入数：1
- 内部角色运行数：2
- 付费生成：`USD 0`
- real provider calls：`0`
- Pancat writes：`0`

## 对话回放

### 00:00.000 — 制片人

> 把厨房钥匙动作整理成一场可拍的镜头组，保留已经采用的镜头。

证据：`EV-USER-001`

### 00:00.214 — 编排器

启动两个独立角色，二者共享 `film-zero-cost-001` 和 `scene-kitchen-007`，合同与工作记忆保持私有。

- `shot-planner` / `shot-planner.v2` / `run-shot-planner-007`
- `continuity-supervisor` / `continuity-supervisor.v3` / `run-continuity-007`

证据：`EV-RUN-007`、`EV-MEMORY-002`

### 00:00.421 — 分镜规划师

> 我拆出 001—004。001、002 可沿用，003 需要一个低机位候选；我不写入影片知识或已采用镜头。

产出 `proposal-shot-planner-003`。允许工具为 `shot.list`、`prompt.compose`、`candidate.propose`；禁写 `film-knowledge`、`adopted-shot:shot-001` 和 `provider-secrets`。

证据：`EV-PROPOSAL-003`、`EV-CONTRACT-SHOT-002`

### 00:00.592 — 知识选择器

任务 capability 为 `shot-candidate.video-prompt`，选择 `mock-seedance-2.5/video-prompt.json`。连续性审查只读取本地 `continuity-rules.v1`，没有套用全局供应商提示。

证据：`EV-KNOW-003`、`EV-KNOW-004`

### 00:01.106 — 动态责任图

将“空间验证”从分镜规划师的责任拆出，重排给连续性监修；影片知识图谱只保留阻 blocking、手位和采用镜头等事实。

- operation：`split`
- operation：`reorder`
- responsibility revision：`04`

证据：`EV-GRAPH-004`

### 00:01.438 — 连续性监修

> 我复核了台面方位和手位。003 的空间风险是 0.92，调用白模；001 风险 0.18，理由充分，跳过。

合同为 `continuity-supervisor.v3`，私有记忆为 `private://film-zero-cost-001/continuity-supervisor`。高风险阈值为 `0.70`。

证据：`EV-CONTINUITY-003`

### 00:01.804 — 空间策略

`shot-003` 执行本地白模调用：

- tool call：`mock-blender://blockout/shot-003`
- result：`artifact://blockout/shot-003-v1`
- risk：`0.92`
- action：`invoke`

`shot-001` 保持 `skip`：风险 `0.18`，单人近景、已有 adopted 参考且无空间变化；工具调用和结果引用均为空。

证据：`EV-SPACE-003`、`EV-SPACE-001`

### 00:02.311 — 裁决器

两个候选 `proposal-shot-planner-003` 与 `proposal-continuity-003` 进入 `arbitration.v1 / evidence-first`。裁决结论为 `adopt-continuity`，理由是连续性方案拥有白模结果引用，且 patch 的 expectedVersion 与当前 003 版本一致。

证据链：`EV-SPACE-003` → `EV-PATCH-003` → `EV-CONTEXT-002`

### 00:02.478 — 局部镜头修复

只写入 `shot-003`：

- `candidate://shot-003-continuity-fix`
- 手从画面右侧入场
- 钥匙落点锁定在台面前沿
- 保留 35mm 低机位

`shot-001`、`shot-002`、`shot-004` 的 adopted 版本保持原样，没有跨镜头覆盖。

证据：`EV-PATCH-003`

### 00:02.644 — 同角色返场

连续性监修使用原 `film-zero-cost-001` 返回，继续读取自己的 private memory，不新建影片上下文。

证据：`EV-CONTEXT-002`

## 证据矩阵

| 目标 | 证据 | 结果 |
| --- | --- | --- |
| 双角色同场景并行 | `EV-RUN-007` | 通过 |
| 合同、知识、记忆、工具和质量隔离 | `EV-CONTRACT-SHOT-002`、`EV-MEMORY-002` | 通过 |
| filmId 返场 | `EV-CONTEXT-002` | 通过 |
| 责任图拆分与重排 | `EV-GRAPH-004` | 通过 |
| 供应商专属知识动态选择 | `EV-KNOW-003` | 通过 |
| 高风险启用白模 | `EV-SPACE-003` | 通过 |
| 低风险有理由跳过白模 | `EV-SPACE-001` | 通过 |
| 局部修复不覆盖其他镜头 | `EV-PATCH-003` | 通过 |
| 分歧裁决可追溯 | `EV-ARB-001` | 通过 |
| 一次对话驱动完整协作 | `EV-USER-001`、`EV-ARB-001` | 通过 |
| readiness 不依赖阶段名 | `EV-READINESS-001` | 通过 |
| 零成本与只读保护 | `EV-COST-000`、`EV-READONLY-001` | 通过 |

## 复现命令

在 `hodor-web` 隔离工作树执行：

```bash
bunx vitest run --config vite.react.config.ts src-react/features/collaboration/production-collaboration-dashboard.test.tsx
bun run type-check
bun run build
```

仪表盘的固定数据位于 `src-react/features/collaboration/collaboration-fixture.ts`。它与 Hodor 后端的 `tests/fixtures/production-collaboration/single-scene.json` 和 `expected-evidence.json` 使用相同的 filmId、sceneId、镜头边界和证据编号。
