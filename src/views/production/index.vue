<template>
  <div class="flowWrap" v-loading="flowLoading">
    <VueFlow
      id="showFlow"
      v-model="flowData"
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
      :default-edge-options="defaultEdgeOptions"
      :min-zoom="0.5"
      :max-zoom="2">
      <template #node-pluginNode>
        <pluginNode />
      </template>
      <Background />
      <Controls />
      <MiniMap pannable zoomable position="bottom-left" style="margin-left: 60px" />
      <Panel position="top-left" class="topLeftPanel">
        <t-select :value="episodesId" :placeholder="$t('workbench.production.selectPlaceholder')" autoWidth :options="episodesOptions" filterable>
          <template #label>
            <i-document-folder size="24" />
          </template>
        </t-select>
        <t-button theme="default" variant="outline" shape="square" :loading="flowLoading" @click="handleRefresh">
          <template #icon><i-refresh theme="outline" size="16" /></template>
        </t-button>
      </Panel>
      <div class="chatBox">
        <t-button variant="outline" class="showChat c" shape="square" v-show="!showChat" @click.stop="showChat = true">
          <template #icon><i-message theme="outline" size="16" /></template>
        </t-button>
        <transition name="slide" v-show="showChat" v-if="episodesId">
          <chat :title="title" v-model="flowData" @close="showChat = false" />
        </transition>
      </div>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import _ from "lodash";
import { watchDebounced } from "@vueuse/core";
import axios from "@/utils/axios";
import { VueFlow, Panel, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "@/components/edit/pluginNode.vue";
import chat from "./chat.vue";
import provideUmd from "@/utils/umd/provideUmd";

import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";

import { remoteTools } from "@/utils/umd/index";

const { project } = storeToRefs(projectStore());
const { flowData, episodesId } = storeToRefs(productionAgentStore());

provideUmd({ flowId: "showFlow", episodesId: () => episodesId.value });

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

const flowLoading = ref(false);

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
}

async function loadFlowData(id: number) {
  flowLoading.value = true;
  try {
    const { data } = await axios.post("/production/getFlowData", {
      projectId: project.value?.id,
      episodesId: id,
    });
    //兼容
    if (_.isObject(data) && !Array.isArray(data)) {
      // 旧格式：FlowData 对象
      const compMap: Record<string, string> = {
        script: "toonflowPlugin:script",
        assets: "toonflowPlugin:assets",
        scriptPlan: "toonflowPlugin:scriptPlan",
        storyboardTable: "toonflowPlugin:storyboardTable",
        storyboard: "toonflowPlugin:storyboard",
      };

      let col = 0;
      flowData.value = Object.keys(data)
        .map((key) => {
          const pluginId = compMap[key];
          if (!pluginId) return null;
          const node: Node = {
            id: key,
            type: "pluginNode",
            position: { x: col * 600, y: 0 },
            data: {
              pluginId,
              data: { [key]: (data as any)[key as any] },
            },
          };
          col++;
          return node;
        })
        .filter(Boolean) as Node[];
    } else {
      flowData.value = data;
    }
  } finally {
    // 等响应式更新完成再放开保存,避免加载触发自动保存
    await nextTick();
    flowLoading.value = false;
  }
}

function handleRefresh() {
  if (episodesId.value) loadFlowData(episodesId.value);
}

watch(
  episodesId,
  (newVal) => {
    if (newVal) loadFlowData(newVal);
  },
  { immediate: true },
);

watchDebounced(
  flowData,
  async () => {
    if (flowLoading.value) return;
    if (!episodesId.value) return;
    await axios.post("/production/saveFlowData", {
      projectId: project.value?.id,
      episodesId: episodesId.value,
      data: flowData.value,
    });
  },
  { deep: true, debounce: 800, maxWait: 5000 },
);

const showChat = ref(true);
const title = computed(() => {
  const episode = episodesOptions.value.find((option) => option.value === episodesId.value);
  return episode ? episode.label : "";
});
</script>

<style lang="scss" scoped>
.flowWrap {
  width: 100%;
  height: 100%;
  .topLeftPanel {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chatBox {
    .showChat {
      position: absolute;
      top: 10px;
      right: 0;
      z-index: 10;
      cursor: pointer;
    }
  }
}
:deep(.slide-enter-active),
:deep(.slide-leave-active) {
  transition: transform 0.3s ease-out;
}
:deep(.slide-enter-from) {
  transform: translateX(100%);
}
:deep(.slide-leave-to) {
  transform: translateX(100%);
}
</style>
