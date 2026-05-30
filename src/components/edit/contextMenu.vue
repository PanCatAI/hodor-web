<template>
  <teleport to="body">
    <template v-if="visible">
      <div class="contextMenuMask" @click="close" @contextmenu.prevent="close" />
      <ul class="contextMenu" :style="posStyle" @contextmenu.prevent>
        <template v-if="filteredPlugins.length">
          <li v-for="plugin in filteredPlugins" :key="plugin.id" class="contextMenuItem">
            <div class="contextMenuItemContent">
              <span>{{ plugin.displayName }}</span>
              <i-right theme="outline" size="12" />
            </div>
            <ul class="contextMenuSub">
              <li v-for="node in plugin.editNodes" :key="node.nodeId" class="contextMenuSubItem" @click="handleSelect(plugin, node.nodeId)">
                <div class="nodeIcon">
                  <img v-if="node.icon" :src="node.icon" />
                  <i-compass v-else theme="outline" size="14" fill="var(--td-brand-color)" />
                </div>
                <div class="nodeInfo">
                  <span class="nodeName">{{ node.name }}</span>
                  <span v-if="node.description" class="nodeDesc">{{ node.description }}</span>
                </div>
              </li>
            </ul>
          </li>
        </template>
        <li v-else class="contextMenuEmpty">暂无可用节点</li>
      </ul>
    </template>
  </teleport>
</template>

<script setup lang="ts">
import { manifestList, type ManifestNode } from "@/utils/umd/index";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    x: number;
    y: number;
    sourceType?: "edit" | "show" | "all";
  }>(),
  {
    sourceType: "edit",
  },
);

const emit = defineEmits<{
  close: [];
  select: [pluginNodeId: `${string}:${string}`];
}>();

const posStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));

const filteredPlugins = computed(() =>
  manifestList.value
    .map((plugin) => {
      const nodes = Object.entries(plugin.nodes).map(([nodeId, node]) => ({ nodeId, ...node }));
      return {
        ...plugin,
        editNodes: props.sourceType === "all" ? nodes : nodes.filter((n) => n.sources.includes(props.sourceType as "edit" | "show")),
      };
    })
    .filter((p) => p.editNodes.length > 0),
);

function close() {
  emit("close");
}

function handleSelect(plugin: (typeof manifestList.value)[number], key: string) {
  emit("select", `${plugin.id}:${key}`);
  close();
}

watchEffect((onCleanup) => {
  if (!props.visible) return;
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);
  onCleanup(() => document.removeEventListener("keydown", onKeydown));
});
</script>

<style lang="scss" scoped>
.contextMenuMask {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.contextMenu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  padding: 4px 0;
  margin: 0;
  list-style: none;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium, 6px);
  box-shadow: var(--td-shadow-2);

  .contextMenuItem {
    position: relative;

    &:hover {
      > .contextMenuItemContent {
        background: var(--td-bg-color-container-hover);
      }
      > .contextMenuSub {
        display: block;
      }
    }

    .contextMenuItemContent {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 7px 12px;
      cursor: pointer;
      color: var(--td-text-color-primary);
      font-size: 14px;
      white-space: nowrap;
      user-select: none;
    }

    .contextMenuSub {
      display: none;
      position: absolute;
      left: 100%;
      top: -4px;
      min-width: 160px;
      padding: 4px 0;
      margin: 0;
      list-style: none;
      background: var(--td-bg-color-container);
      border: 1px solid var(--td-component-border);
      border-radius: var(--td-radius-medium, 6px);
      box-shadow: var(--td-shadow-2);
      z-index: 10000;

      .contextMenuSubItem {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 7px 12px;
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--td-bg-color-container-hover);
        }

        .nodeIcon {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          margin-top: 1px;
          display: flex;
          align-items: center;
          justify-content: center;

          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 4px;
          }
        }

        .nodeInfo {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;

          .nodeName {
            font-size: 14px;
            color: var(--td-text-color-primary);
            white-space: nowrap;
          }

          .nodeDesc {
            font-size: 12px;
            color: var(--td-text-color-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 180px;
          }
        }
      }
    }
  }

  .contextMenuEmpty {
    padding: 7px 12px;
    color: var(--td-text-color-disabled);
    font-size: 14px;
  }
}
</style>
