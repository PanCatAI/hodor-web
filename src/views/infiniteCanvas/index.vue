<template>
  <div class="flowWrap">
    <VueFlow
      id="infinitCanvasFlow"
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
import { VueFlow, useVueFlow, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "@/components/edit/pluginNode.vue";
import edge from "@/components/edit/edge.vue";
import provideUmd from "@/utils/umd/provideUmd";
import contextMenu from "@/components/edit/contextMenu.vue";
import flowProjectStore from "@/stores/flowProject";
const { flowProject } = storeToRefs(flowProjectStore());
import { type NodeListEntry } from "@/utils/loadPluginNode";

// 向 UMD 节点注入宿主能力（show 模式：无选择器）

provideUmd({ flowId: "infinitCanvasFlow" });

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
onMounted(async () => {
  // await getScriptData();
});

const episodesOptions = ref<{ label: string; value: number }[]>([]);

async function getScriptData() {
  //获取剧本
  // const { data: scriptRes } = await axios.post("/script/getScrptApi", {
  //   projectId: flowProject.value?.id,
  //   name: "",
  // });
  // episodesOptions.value = scriptRes.map((ep: any) => ({
  //   label: ep.name,
  //   value: ep.id,
  // }));
}
const { addNodes, onConnect, addEdges, screenToFlowCoordinate, toObject, fromObject } = useVueFlow("infinitCanvasFlow");
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
onConnect((params) => {
  addEdges([{ ...params, type: "edge" }]);
});
async function getFlowData() {
  const res = await axios.post("/infiniteCanvas/getWorkFlow", {
    id: flowProject.value?.id,
  });
  if (res.data) {
    fromObject(res.data);
  }
}
onMounted(() => {
  getFlowData();
});
watch(
  () => [nodes.value.length, edges.value.length],
  (newVal, oldVal) => {
    const data = toObject();
    axios.post("/infiniteCanvas/updateWorkFlow", {
      id: flowProject.value?.id,
      data,
    });
    console.log("%c Line:122 🍓 data", "background:#ffdd4d", data);
    console.log("%c Line:119 🍎 newVal", "background:#b03734", newVal);
  },
);
</script>

<style scoped>
.flowWrap {
  width: 100%;
  height: 100%;
}
</style>
