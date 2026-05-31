<template>
  <div class="node">
    <div class="tabBar">
      <div class="tabBarLeft">
        <img v-if="nodeEntry?.icon" :src="nodeEntry.icon" class="tabBarIcon" />
        <i-compass v-else theme="outline" size="16" fill="var(--td-brand-color)" />
        <input
          v-if="editingName"
          ref="nameInputRef"
          v-model="nameEditValue"
          class="tabBarNameInput"
          @blur="saveName"
          @keydown.enter.prevent="saveName"
          @keydown.escape.prevent="cancelName"
          @mousedown.stop
          @click.stop
          @dblclick.stop />
        <span v-else class="tabBarName" @dblclick.stop="startEditName">{{ node.data.name || nodeEntry?.name || "未命名插件" }}</span>
      </div>
      <div class="tabBarActions">
        <button type="button" class="tabBarBtn" title="刷新节点" @click.stop="handleRefresh">
          <i-refresh theme="outline" size="14" />
        </button>
        <button type="button" class="tabBarBtn" title="复制节点" @click.stop="handleCopy">
          <i-copy theme="outline" size="14" />
        </button>
        <button type="button" class="tabBarBtn tabBarBtnDanger" title="删除节点" @click.stop="handleDelete">
          <i-delete theme="outline" size="14" />
        </button>
      </div>
    </div>
    <component v-if="comp" :is="comp" ref="compRef" v-model:nodeProps="node" v-model:DATA="node.data.data" />
    <div v-else-if="loading" class="loadingBox">
      <t-loading size="small" />
    </div>
    <div v-else class="errorBox">
      <i-caution theme="outline" size="16" fill="var(--td-error-color)" />
      <div class="errorContent">
        <div class="errorTitle">插件加载异常</div>
        <div class="errorPluginId">{{ node.data.pluginId }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNode, useVueFlow } from "@vue-flow/core";
import { manifestList, loadUmdNode, remoteTools } from "@/utils/umd/index";

const { node } = useNode();
const { removeNodes, addNodes, findNode } = useVueFlow();

provide("NODE_ID", node.id);

if (!remoteTools.value[node.data.pluginId]) remoteTools.value[node.data.pluginId] = {};
provide("REMOTE_TOOLS", remoteTools.value[node.data.pluginId]);

onUnmounted(() => {
  const pluginId = node.data.pluginId as `${string}:${string}`;
  delete remoteTools.value[pluginId];
});

const nodeEntry = computed(() => {
  const [pid, nkey] = (node.data.pluginId as string).split(":");
  const plugin = manifestList.value.find((p) => p.id === pid);
  if (!plugin) return null;
  const n = plugin.nodes[nkey];
  if (!n) return null;
  return { ...n, icon: n.icon ? `${plugin.url}/${n.icon}` : undefined };
});
const comp = shallowRef<any>(null);
const loading = ref(true);
const compRef = ref<any>(null);

watchEffect(() => {
  if (compRef.value != null && "HANDLEDOPT" in compRef.value) {
    node.data.handle = compRef.value.HANDLEDOPT;
  }
});

onUnmounted(() => {
  node.data.handle = undefined;
});

loadUmdNode(node.data.pluginId as `${string}:${string}`)
  .then((c) => {
    comp.value = c;
  })
  .catch(() => {})
  .finally(() => {
    loading.value = false;
  });

function handleRefresh() {
  comp.value = null;
  loading.value = true;
  loadUmdNode(node.data.pluginId as `${string}:${string}`, true)
    .then((c) => {
      comp.value = c;
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false;
    });
}

function handleDelete() {
  removeNodes(node.id);
}

const editingName = ref(false);
const nameEditValue = ref("");
const nameInputRef = ref<HTMLInputElement | null>(null);

function startEditName() {
  nameEditValue.value = node.data.name || nodeEntry.value?.name || "";
  editingName.value = true;
  nextTick(() => {
    nameInputRef.value?.select();
  });
}

function saveName() {
  const trimmed = nameEditValue.value.trim();
  node.data.name = trimmed || undefined;
  editingName.value = false;
}

function cancelName() {
  editingName.value = false;
}

function handleCopy() {
  const source = findNode(node.id);
  if (!source) return;
  addNodes({
    id: `${source.id}_copy_${Date.now()}`,
    type: source.type,
    position: { x: source.position.x + 30, y: source.position.y + 30 },
    data: JSON.parse(JSON.stringify(source.data)),
  });
}
</script>

<style lang="scss" scoped>
.node {
  min-width: 200px;
  border-radius: 8px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  contain: layout style;
}

.tabBar {
  overflow: hidden;
  border-radius: 8px 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-component-border);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  .tabBarLeft {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .tabBarIcon {
    width: 20px;
    height: 20px;
    object-fit: contain;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .tabBarName {
    font-size: 13px;
    font-weight: 500;
    color: var(--td-text-color-primary);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tabBarNameInput {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--td-text-color-primary);
    line-height: 1.4;
    background: var(--td-bg-color-container);
    border: 1px solid var(--td-brand-color);
    border-radius: 3px;
    padding: 0 4px;
    outline: none;
    width: 100%;
    user-select: text;
  }

  .tabBarActions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .tabBarBtn {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--td-text-color-secondary);

    &:hover {
      background: var(--td-bg-color-container-hover);
      color: var(--td-text-color-primary);
    }
  }

  .tabBarBtnDanger:hover {
    color: var(--td-error-color);
  }

  &:hover .tabBarActions {
    opacity: 1;
  }
}

.loadingBox {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.errorBox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: var(--td-error-color-light);
  color: var(--td-error-color);

  .errorContent {
    flex: 1;
    min-width: 0;
  }

  .errorTitle {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .errorPluginId {
    font-size: 12px;
    color: var(--td-text-color-secondary);
    word-break: break-all;
  }
}

$handelSize: 10px;

:deep(.vue-flow__handle) {
  width: $handelSize;
  height: $handelSize;
}
:deep(.source) {
  &::after {
    content: "";
    position: absolute;
    width: 50px;
    height: 50px;
    z-index: -1;
    border-radius: 50%;
    top: -25px;
    left: -25px;
  }
}

// handle dataType 颜色
:deep(.handleType-image) {
  background: #4f9cf9;
  border-color: #1677ff;
}
:deep(.handleType-text) {
  background: #52c41a;
  border-color: #389e0d;
}
:deep(.handleType-video) {
  background: #722ed1;
  border-color: #531dab;
}

// 连接中/有效时覆盖颜色，与类型色保持区分
:deep(.vue-flow__handle-connecting) {
  background: #ff6060 !important;
  border-color: #d9363e !important;
}
:deep(.vue-flow__handle-valid) {
  background: #5d9 !important;
  border-color: #389e0d !important;
}
</style>
