# Hodor 生产画布复用记录

检视日期：2026-07-26

## T8 Penguin Canvas

- 来源：https://github.com/T8mars/T8-penguin-canvas
- 检视版本：`ce5f4cb`
- 许可证：MIT
- 本次借鉴：节点搜索、全图概览、位置历史、快捷键和小地图的交互组合。
- 实现方式：Hodor 按自身固定生产拓扑重新实现，没有复制 T8 的节点合同、任务状态或供应商调用代码。

## Open Storyboard Canvas

- 来源：https://github.com/ganbo-gab/open-storyboard-canvas
- 检视版本：`89b74e8b144090345d7fa7aeb4538c448b7b6263`
- 许可证：MIT，仓库同时要求保留其上游 Storyboard-Copilot 的作者和来源说明。
- 本次借鉴：画布节点保留导演台入口，完整 3D 工作区在全屏层中打开，截图再回流到画布资产。
- 实现方式：Hodor 继续使用自己的云端项目、资产、分镜和导演台保存合同，没有引入该项目的本地 SQLite、Tauri 命令、供应商设置或节点状态。

## StoryAI 3D Director Desk

- 来源：https://github.com/jiguang132/storyai-3d-director-desk
- 嵌入版本：`8c8bd361790be4d37158a7430365e65546e358fe`
- 许可证：MIT
- 本次接入：从生产画布的分镜卡直接打开嵌入式 3D 导演台；当前分镜、关联角色、场景参考图、道具占位和初始机位会组成有效的导演台工程。
- 法定声明和许可证继续由 `NOTICES.txt`、`vendor/storyai-3d-director-desk/LICENSE` 与 vendor manifest 保留。

## 场景生成扩展边界

生产画布只依赖通用的场景资产引用。未来可把 World Labs Marble 等空间生成服务接到后端场景供应商中，将全景图、GLB 网格或 SPZ 场景注册为 Hodor 资产，再交给导演台消费；供应商任务状态和密钥不进入前端画布合同。
