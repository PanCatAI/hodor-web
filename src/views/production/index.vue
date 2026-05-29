<template>
  <div class="flowWrap">
    <VueFlow
      id="showFlow"
      v-model="nodes"
      :only-render-visible-elements="false"
      :nodes-draggable="true"
      :nodes-connectable="false"
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
      :default-edge-options="defaultEdgeOptions"
      :min-zoom="0.5"
      :max-zoom="2">
      <template #node-pluginNode>
        <pluginNode />
      </template>
      <Background />
      <Controls />
      <MiniMap pannable zoomable position="bottom-left" style="margin-left: 60px" />
      <Panel position="top-left">
        <t-select :value="episodesId" :placeholder="$t('workbench.production.selectPlaceholder')" autoWidth :options="episodesOptions" filterable>
          <template #label>
            <i-document-folder size="24" />
          </template>
        </t-select>
      </Panel>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { VueFlow, Panel, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "@/components/edit/pluginNode.vue";
import { provideToonflowHost } from "@/utils/toonflowHost";

import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());

// 向 UMD 节点注入宿主能力（show 模式：无选择器）
provideToonflowHost({ flowId: "showFlow" });

const defaultEdgeOptions = markRaw({
  type: "simple-bezier",
  animated: false,
  focusable: false,
  selectable: false,
  updatable: false,
  interactionWidth: 0,
});

onMounted(async () => {
  await getScriptData();
});

const episodesOptions = ref<{ label: string; value: number }[]>([]);

const { episodesId, status } = storeToRefs(productionAgentStore());

provide("episodesId", episodesId);
provide(
  "projectId",
  computed(() => project.value?.id),
);

async function getScriptData() {
  //获取剧本
  const { data: scriptRes } = await axios.post("/script/getScrptApi", {
    projectId: project.value?.id,
    name: "",
  });
  episodesOptions.value = scriptRes.map((ep: any) => ({
    label: ep.name,
    value: ep.id,
  }));
  if (episodesOptions.value.length) {
    episodesId.value = episodesOptions.value[0].value;
  }
  if (status.value !== "pending" && status.value !== "streaming") {
    episodesId.value && (await productionAgentStore().getFlowData());
  }
}
import { useFlowBuilder } from "./useFlowBuilder";
const { nodes } = useFlowBuilder();
</script>

<style scoped>
.flowWrap {
  width: 100%;
  height: 100%;
}
</style>
