<template>
  <div class="flowWrap">
    <VueFlow
      id="showFlow"
      v-model="nodes"
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
      :max-zoom="2">
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
  </div>
</template>

<script setup lang="ts">
import { VueFlow, Panel, useVueFlow, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "@/components/edit/pluginNode.vue";
import edge from "@/components/edit/edge.vue";
import provideUmd from "@/utils/umd/provideUmd";

provideUmd({ flowId: "showFlow" });

const { addNodes, onConnect, addEdges, screenToFlowCoordinate } = useVueFlow("showFlow");

onConnect((params) => {
  addEdges([{ ...params, type: "edge" }]);
});

const nodes = shallowRef<Node[]>([
  {
    id: "1",
    type: "pluginNode",
    position: { x: 500, y: 20 },
    data: {
      pluginId: "toonflowPlugin:test",
      data: {
        script: "# 123",
        showNumber: 1,
      },
    },
  },
]);
</script>

<style scoped>
.flowWrap {
  width: 100%;
  height: 100%;
}
</style>
