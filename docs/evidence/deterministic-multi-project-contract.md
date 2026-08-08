# 确定性多项目协作与局部修复合同

该证据与 Hodor 的本地 mock 回放使用同一 `deterministic-multi-project-v1` 合同。网页端继续复用既有 ProductionGraph 动作派发器和事件/动作对等测试；新增夹具只位于协作测试路径，不改变业务实现。

## 结果

- 两个 `filmId`、四个 `scene`、十六个 `shot` 并发回放通过，影片图谱、私有记忆、资产和责任图均无串线。
- 创建命令各重放三次，账本每个影片只保留一个 `taskId`、`roleRunId`、`assetId` 和 `referenceId`。
- 使用真实 `Promise.all` 启动两个影片的交错回放；隔离断言由图谱节点、私有记忆、资产命中和责任事件记录计算。
- 每个影片三次重放；十个确实不同的角色完成顺序持久写入比较摘要，稳定身份、责任图 revision、事件摘要和证据引用一致。
- 复用身份资产在本地 mock 生成前命中并跳过生成；事件链记录命中、跳过、压缩和镜头规划，参考图记录 `4096x4096` 到 `1024x1024` 的尺寸/字节变化及采用理由。
- 高风险镜头使用 Blender，中风险镜头使用 3x3，低风险镜头模型直出；每条记录绑定任务、模型能力、影片约束、历史证据、来源版本和采用版本。
- 自动审查事件只把 `film-beta/scene-2/shot-3` 从版本 1 推进到版本 2，其他 15 个镜头的版本和哈希证明不变。
- 对话与 Graph 使用同一动作注册表，共享责任图变更和证据链；readiness 只依赖事实快照，不受阶段名称影响；角色返场上下文完整保留。

机器可读证据见 [`deterministic-multi-project-contract.json`](./deterministic-multi-project-contract.json)。该文件与 Hodor 连续两次生成的证据逐字节一致；摘要哈希为 `fbec8b53833825efeeed8a82bf62e8e74c6ef825a0fc2c88da72736d71ae064c`。

## 复现

```sh
bun /Users/ghostcorn/dev/hodor-web/node_modules/.bin/vitest run --config vite.react.config.ts src-react/features/collaboration/deterministic-multi-project-contract.test.ts
bun run type-check
```
