<template>
  <div v-if="show" class="fullscreenDialog">
    <div class="customCloseBtn c" @click="closeDialog">
      <i-close size="18" />
    </div>
    <VueFlow
      id="editFlow"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :only-render-visible-elements="false"
      :nodes-draggable="true"
      :nodes-connectable="true"
      :nodes-focusable="false"
      :edges-focusable="false"
      :edges-updatable="false"
      :elevate-nodes-on-select="true"
      :elevate-edges-on-select="false"
      :disable-keyboard-a11y="true"
      :select-nodes-on-drag="false"
      :auto-pan-on-node-drag="false"
      :auto-pan-on-connect="false"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :zoom-activation-key-code="null"
      :pan-activation-key-code="null"
      :min-zoom="0.5"
      :max-zoom="2"
      @pane-context-menu="onPaneContextMenu">
      <template #node-pluginNode>
        <pluginNode />
      </template>
      <template #edge-edge="props">
        <edge v-bind="props" />
      </template>
      <Background />
      <Controls />
      <MiniMap pannable zoomable position="bottom-left" style="margin-left: 60px" />
    </VueFlow>
    <contextMenu :visible="ctxMenu.visible" :x="ctxMenu.x" :y="ctxMenu.y" @close="ctxMenu.visible = false" @select="onAddNode" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { type HANDLE_TYPE, type NodeListEntry } from "@/utils/loadPluginNode";
import { provideToonflowHost } from "@/utils/toonflowHost";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import { VueFlow, useVueFlow, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "./pluginNode.vue";
import contextMenu from "./contextMenu.vue";
import edge from "./edge.vue";

const show = defineModel<boolean>({ default: false });

interface HandleData {
  type: HANDLE_TYPE;
  value: unknown;
}

const props = withDefaults(
  defineProps<{
    flowId: string | number;
    selectorMode?: HANDLE_TYPE[];
  }>(),
  {
    selectorMode: () => [],
  },
);

const emit = defineEmits<{
  (event: "close"): void;
  (event: "select", value: HandleData | null): void;
}>();

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

watch(
  () => props.flowId,
  async (id) => {
    const { data: flowItem } = await axios.post("/plugin/flow/item", { id });
    nodes.value = flowItem?.flowData?.nodes ?? [];
    edges.value = flowItem?.flowData?.edges ?? [];
  },
  { immediate: true },
);

const { project } = storeToRefs(projectStore());
const { episodesId } = storeToRefs(productionAgentStore());

provideToonflowHost({
  flowId: "editFlow",
  episodesId: () => episodesId.value,
  projectId: () => project.value?.id,
  selectorTypes: props.selectorMode,
  onSelect: (data) => emit("select", data as HandleData),
});

const { addNodes, onConnect, addEdges, screenToFlowCoordinate } = useVueFlow("editFlow");

onConnect((params) => {
  addEdges([{ ...params, type: "edge" }]);
});

const ctxMenu = reactive({ visible: false, x: 0, y: 0, flowX: 0, flowY: 0 });

function onPaneContextMenu(event: MouseEvent) {
  event.preventDefault();
  const flowPos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  ctxMenu.flowX = flowPos.x;
  ctxMenu.flowY = flowPos.y;
  ctxMenu.x = Math.min(event.clientX, window.innerWidth - 180);
  ctxMenu.y = Math.min(event.clientY, window.innerHeight - 40);
  ctxMenu.visible = true;
}

function onAddNode(nodeEntry: NodeListEntry) {
  addNodes({
    id: `${nodeEntry.nodeId}_${Date.now()}`,
    type: "pluginNode",
    position: { x: ctxMenu.flowX, y: ctxMenu.flowY },
    data: {
      pluginId: nodeEntry.nodeId,
      data: {},
    },
  });
}

function closeDialog() {
  show.value = false;
  emit("close");
}
</script>

<style lang="scss" scoped>
.fullscreenDialog {
  position: fixed;
  inset: 0;
  z-index: 2000;
  width: 100vw;
  height: 100vh;
  background: var(--td-bg-color-container);
  overflow: hidden;

  :deep(.vue-flow) {
    width: 100%;
    height: 100%;
  }

  .customCloseBtn {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 1000;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    color: var(--td-text-color-primary);
    background: var(--td-bg-color-container);
    box-shadow: var(--td-shadow-1);
    &:hover {
      background: var(--td-bg-color-container-hover);
    }
  }

  .customSelectBtn {
    position: fixed;
    top: 16px;
    right: 64px;
    z-index: 1000;
    height: 36px;
    border: none;
    border-radius: 18px;
    cursor: pointer;
    color: var(--td-text-color-anti);
    background: var(--td-brand-color);
    box-shadow: var(--td-shadow-1);
    padding: 0 16px;

    &:hover {
      background: var(--td-brand-color-hover);
    }
  }
}
</style>
