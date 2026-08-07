# 确定性多项目协作与局部修复合同

该证据与 Hodor 的本地 mock 回放使用同一 `deterministic-multi-project-v1` 合同。网页端继续复用既有 ProductionGraph 动作派发器和事件/动作对等测试；新增夹具只位于协作测试路径，不改变业务实现。

## 结果

- 两个 `filmId`、四个 `scene`、十六个 `shot` 并发回放通过，影片图谱、私有记忆、资产和责任图均无串线。
- 创建命令各重放三次，账本每个影片只保留一个 `taskId`、`roleRunId`、`assetId` 和 `referenceId`。
- 角色完成顺序随机化十次后，稳定身份、责任图 revision、事件摘要和证据引用一致。
- 复用身份资产在本地 mock 生成前命中；参考图记录 `4096x4096` 到 `1024x1024` 的尺寸/字节变化及采用理由。
- 高风险镜头使用 Blender，中风险镜头使用 3x3，低风险镜头模型直出；每条记录绑定任务、模型能力、影片约束、历史证据、来源版本和采用版本。
- 自动审查只把 `film-beta/scene-2/shot-3` 从版本 1 推进到版本 2，其他镜头版本和哈希不变。
- 对话与 Graph 使用同一动作注册表，readiness 只依赖事实快照，不受阶段名称影响。

机器可读证据见 [`deterministic-multi-project-contract.json`](./deterministic-multi-project-contract.json)。Hodor 完整回放日志、账本、事件摘要和图快照见 Hodor 仓库同名证据文件；摘要哈希为 `d36af65efa3ae1ec0879446bd6c964307937b067396dfd06891039cb16bac4be`。

## 复现

```sh
bun /Users/ghostcorn/dev/hodor-web/node_modules/.bin/vitest run --config vite.react.config.ts src-react/features/collaboration/deterministic-multi-project-contract.test.ts
bun run type-check
```
