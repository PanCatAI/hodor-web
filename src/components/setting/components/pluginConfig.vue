<template>
  <div class="modelServe">
    <!-- 左侧插件列表 -->
    <div class="modelList">
      <div class="listFooter">
        <t-button block theme="primary" @click="openAddPluginDialog">
          <template #icon><t-icon name="add" /></template>
          {{ $t("settings.plugin.addPlugin") }}
        </t-button>
      </div>
      <div class="listContent">
        <t-menu v-model="activePluginId" theme="light" v-if="pluginList.length > 0" width="100">
          <t-menu-item v-for="(item, index) in pluginList" :key="index" :value="item.id" style="position: relative">
            <span class="menuItemName">{{ item.displayName }}</span>
          </t-menu-item>
        </t-menu>
        <t-empty v-else :description="$t('settings.plugin.noPlugin')" style="margin-top: 16px"></t-empty>
      </div>
    </div>

    <!-- 右侧配置面板 -->
    <div v-if="currentPlugin" class="modelParameter">
      <div class="configuration">
        <div class="infoBox ac jb">
          <span class="idBox">#{{ currentPlugin.id }}</span>
          <span class="author">@{{ currentPlugin.author }}</span>
        </div>

        <div class="plugin-info">
          <div class="info-row">
            <span class="infoLabel">{{ $t("settings.plugin.version") }}：</span>
            <span>v{{ currentPlugin.version }}</span>
          </div>
          <div class="info-row">
            <span class="infoLabel">{{ $t("settings.plugin.description") }}：</span>
            <span>{{ currentPlugin.description }}</span>
          </div>
        </div>

        <t-table row-key="key" :data="Object.values(currentPlugin.nodes)" :columns="columns">
          <template #operation="{ row }">
            <t-space :size="0">
              <t-button theme="primary" variant="text" @click="checkPlugin(row, currentPlugin.id)">
                <template #icon><t-icon name="browse" /></template>
                查看
              </t-button>
            </t-space>
          </template>
        </t-table>

        <div class="updateAction">
          <t-button theme="primary" variant="outline" @click="handleUpdateCurrentPlugin">
            <template #icon><t-icon name="refresh" /></template>
            {{ $t("settings.plugin.updatePlugin") }}
          </t-button>
          <t-button theme="danger" @click="handleDeleteCurrentPlugin">
            {{ $t("settings.plugin.deletePlugin") }}
          </t-button>
        </div>
      </div>
    </div>

    <!-- 无选中时的空状态 -->
    <div v-else class="modelParameter">
      <t-empty :description="$t('settings.plugin.selectPluginHint')" style="margin-top: 100px" />
    </div>

    <!-- 新增/更新插件弹窗（共用） -->
    <t-dialog
      v-model:visible="pluginDialogVisible"
      :header="pluginDialogMode === 'add' ? $t('settings.plugin.addPluginTitle') : $t('settings.plugin.updatePluginTitle')"
      width="600px"
      placement="center"
      :close-on-overlay-click="false"
      :confirm-btn="null"
      :cancel-btn="null"
      @closed="onPluginDialogClosed">
      <div class="addPluginContent">
        <!-- 更新模式提示 -->
        <p v-if="pluginDialogMode === 'update'" class="updatePluginHint" style="margin-bottom: 16px; color: var(--td-text-color-secondary)">
          {{ $t("settings.plugin.updatePluginHint", { name: currentPlugin?.displayName ?? "" }) }}
        </p>

        <t-radio-group v-model="addMode" variant="default-filled" style="margin-bottom: 20px">
          <t-radio-button value="upload">{{ $t("settings.plugin.uploadPlugin") }}</t-radio-button>
          <t-radio-button value="linkAdd">{{ $t("settings.plugin.linkAdd") }}</t-radio-button>
        </t-radio-group>

        <!-- 上传区域 -->
        <div class="uploadMode" v-if="addMode === 'upload'">
          <div class="uploadArea" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
            <t-upload
              ref="uploadRef"
              v-model="pluginFileList"
              theme="file"
              :multiple="false"
              :max="1"
              accept=".zip,.tgz,.tar.gz"
              :before-upload="handleBeforeUpload"
              style="display: none" />
            <div class="dragIcon">
              <t-icon name="upload" size="32px" />
            </div>
            <p class="uploadText">{{ $t("settings.plugin.dragOrClick") }}</p>
            <p class="uploadHint">{{ $t("settings.plugin.fileLimit") }}</p>
          </div>
          <div v-if="pluginFileList.length" class="file-list">
            <t-tag v-for="file in pluginFileList" :key="file.name" theme="primary" variant="light" closable @close="removeFile(file)">
              {{ file.name }}
            </t-tag>
          </div>
        </div>

        <!-- 链接添加区域 -->
        <div class="linkMode" v-if="addMode === 'linkAdd'">
          <t-input v-model="pluginLink" :placeholder="$t('settings.plugin.linkPlaceholder')" clearable size="large">
            <template #prefix-icon><t-icon name="link" /></template>
          </t-input>
          <p class="linkHint">{{ $t("settings.plugin.linkHint") }}</p>
        </div>

        <div class="dialogFooter">
          <t-button theme="default" @click="pluginDialogVisible = false">{{ $t("common.cancel") }}</t-button>
          <t-button theme="primary" :loading="pluginDialogLoading" :disabled="!canConfirm" @click="handleConfirmPlugin">
            {{ $t("common.confirm") }}
          </t-button>
        </div>
      </div>
    </t-dialog>

    <!-- 查看插件节点内容弹窗 -->
    <t-dialog
      v-model:visible="contentDialogVisible"
      :header="contentDialogTitle"
      width="60vw"
      placement="center"
      :close-on-overlay-click="true"
      :confirm-btn="null"
      :cancel-btn="{ content: $t('common.close') }"
      @closed="onContentDialogClosed">
      <div class="contentViewer">
        <template v-if="contentLoading">
          <t-loading size="small" />
        </template>
        <VueFlow
          id="checkFlow"
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
          <template #node-pluginNode="nodeProps">
            <div class="exampleBox">
              <div class="bar">
                <span class="barTitle">{{ nodeProps.data?.name || "" }}</span>
                <span class="barId">#{{ nodeProps.data?.pluginId }}</span>
              </div>
              <div class="exampleBody">
                <component v-if="loadedComp" :is="loadedComp" ref="compRef" :nodeProps="nodeProps" :DATA="nodeProps.data?.data" />
              </div>
            </div>
          </template>
          <template #edge-edge="props">
            <edge v-bind="props" />
          </template>
          <Background />
          <Controls />
          <MiniMap pannable zoomable position="bottom-left" style="margin-left: 60px" />
        </VueFlow>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { LoadingPlugin, type TableProps, type UploadFile } from "tdesign-vue-next";
import axios from "@/utils/axios";
import { VueFlow, useVueFlow, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import edge from "@/components/edit/edge.vue";
import { loadApiUmd } from "@/utils/umd/index";

interface PluginNode {
  path: string;
  name: string;
  sources: string[];
  description: string;
}

interface PluginConfigList {
  manifest_version: number;
  id: string;
  version: string;
  ToonflowVersion: string;
  displayName: string;
  author: string;
  description: string;
  nodes: Record<string, PluginNode>;
  buildTime: number;
}
const { addNodes, removeNodes, toObject } = useVueFlow("checkFlow");

const pluginList = ref<PluginConfigList[]>([]);

// ── 当前选中插件 ──
const activePluginId = ref<string>();
const currentPlugin = computed(() => pluginList.value.find((p) => p.id === activePluginId.value));

// ==================== 新增/更新插件（共用弹窗） ====================
const pluginDialogVisible = ref(false);
const pluginDialogMode = ref<"add" | "update">("add");
const pluginDialogLoading = ref(false);
const addMode = ref<"upload" | "linkAdd">("upload");
const pluginFileList = ref<UploadFile[]>([]);
const pluginLink = ref("");
const uploadRef = ref();

// 是否可以确认：上传模式需要文件，链接模式需要填写 URL
const canConfirm = computed(() => {
  if (addMode.value === "linkAdd") {
    return pluginLink.value.trim().length > 0;
  }
  return pluginFileList.value.length > 0;
});

function openAddPluginDialog() {
  pluginDialogMode.value = "add";
  addMode.value = "upload";
  pluginFileList.value = [];
  pluginLink.value = "";
  pluginDialogVisible.value = true;
}

function handleUpdateCurrentPlugin() {
  if (!currentPlugin.value) return;
  pluginDialogMode.value = "update";
  addMode.value = "upload";
  pluginFileList.value = [];
  pluginLink.value = "";
  pluginDialogVisible.value = true;
}

function onPluginDialogClosed() {
  pluginFileList.value = [];
  pluginLink.value = "";
}

function triggerUpload() {
  uploadRef.value?.triggerUpload();
}

function removeFile(file: UploadFile) {
  pluginFileList.value = pluginFileList.value.filter((f) => f.name !== file.name);
}

provideToonflowHost({
  flowId: "editFlow",
  selectorTypes: [],
});

function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length) {
    handleBeforeUpload({ raw: files[0] } as UploadFile);
  }
}

async function handleBeforeUpload(file: UploadFile): Promise<boolean> {
  const validTypes = [".zip", ".tgz", ".tar.gz"];
  const fileName = file.raw?.name ?? file.name ?? "";
  const isValid = validTypes.some((t) => fileName.endsWith(t));
  if (!isValid) {
    window.$message.warning($t("settings.plugin.invalidFileType"));
    return false;
  }
  pluginFileList.value = [file];
  return false;
}

/**
 * 将 File 对象转为 base64 字符串
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function handleConfirmPlugin() {
  const firstConfirm = DialogPlugin.confirm({
    theme: "danger",
    header: $t("settings.pluginConfig.msg.highRiskConfirm"),
    body: $t("settings.pluginConfig.msg.linkAddVendorRiskBody"),
    confirmBtn: { content: $t("settings.vendor.msg.iKnowRisk"), theme: "danger" },
    cancelBtn: $t("settings.vendor.msg.cancel"),
    onConfirm: async () => {
      firstConfirm.destroy();
      pluginDialogLoading.value = true;
      const instance = LoadingPlugin({
        fullscreen: true,
        attach: "body",
        preventScrollThrough: false,
      });
      const timer = setTimeout(() => {
        instance.hide();
        clearTimeout(timer);
      }, 1000);
      try {
        if (addMode.value === "linkAdd") {
          // 链接模式（新增/更新通用）
          const link = pluginLink.value.trim();
          if (!link) {
            window.$message.error($t("settings.plugin.addFailed"));
            return;
          }
          const url = pluginDialogMode.value === "update" ? "/setting/pluginConfig/updatePlugin" : "/setting/pluginConfig/addPlugin";
          const payload: Record<string, any> = { link };
          if (pluginDialogMode.value === "update") {
            payload.id = currentPlugin.value!.id;
          }
          const res = await axios.post(url, payload);
          window.$message.success(
            (res as any)?.message ?? (pluginDialogMode.value === "update" ? $t("settings.plugin.updateSuccess") : $t("settings.plugin.addSuccess")),
          );
        } else {
          // 上传模式（新增/更新通用）
          const rawFile = pluginFileList.value[0]?.raw;
          if (!rawFile) {
            window.$message.error($t("settings.plugin.addFailed"));
            return;
          }
          const base64Data = await fileToBase64(rawFile);
          const url = pluginDialogMode.value === "update" ? "/setting/pluginConfig/updatePlugin" : "/setting/pluginConfig/addPlugin";
          const payload: Record<string, any> = { base64Data };
          if (pluginDialogMode.value === "update") {
            payload.id = currentPlugin.value!.id;
          }
          const res = await axios.post(url, payload);
          window.$message.success(
            (res as any)?.message ?? (pluginDialogMode.value === "update" ? $t("settings.plugin.updateSuccess") : $t("settings.plugin.addSuccess")),
          );
        }

        pluginDialogVisible.value = false;
        getPluginList();
        loadApiUmd();
      } catch (err: any) {
        window.$message.error(err?.message ?? $t("settings.plugin.addFailed"));
      } finally {
        clearTimeout(timer);
        pluginDialogLoading.value = false;
        instance.hide();
      }
    },
    onClose: () => firstConfirm.hide(),
  });
}

// ==================== 删除插件 ====================
function handleDeleteCurrentPlugin() {
  if (!currentPlugin.value) return;
  const item = currentPlugin.value;
  const confirmDialog = DialogPlugin.confirm({
    theme: "danger",
    header: $t("settings.plugin.deleteConfirmTitle"),
    body: `${$t("settings.plugin.deleteConfirmMsg", { name: item?.displayName ?? "" })}`,
    confirmBtn: { content: $t("common.confirm"), theme: "danger" },
    cancelBtn: $t("settings.vendor.msg.cancel"),
    onConfirm: async () => {
      try {
        const res = await axios.post("/setting/pluginConfig/deletePlugin", {
          id: item.id,
        });

        window.$message.success((res as any)?.message ?? $t("settings.plugin.deleteSuccess"));
        if (activePluginId.value === item.id) {
          activePluginId.value = undefined;
        }
        getPluginList();
      } catch (err: any) {
        window.$message.error(err?.message ?? $t("settings.plugin.deleteFailed"));
      } finally {
        confirmDialog.destroy();
      }
    },
  });
}

// ==================== 数据加载 ====================
onMounted(() => {
  getPluginList();
});

function getPluginList() {
  axios.get("/setting/pluginConfig/getPlugin").then((res) => {
    pluginList.value = res.data;
    // 自动选中第一个插件
    if (pluginList.value.length && !pluginList.value.some((p) => p.id === activePluginId.value)) {
      activePluginId.value = pluginList.value[0].id;
    }
  });
}

// ==================== 表格列定义 ====================
const columns: TableProps["columns"] = [
  {
    colKey: "name",
    title: "名称",
    width: 150,
    align: "left",
  },
  {
    colKey: "description",
    title: "描述",
    width: 150,
    align: "left",
  },
  {
    colKey: "operation",
    title: "操作",
    width: 100,
    align: "center",
    fixed: "right",
    cell: "operation",
  },
];

// ==================== 查看插件节点内容 ====================
const contentDialogVisible = ref(false);
const contentDialogTitle = ref("");
const contentLoading = ref(false);
const loadedComp = shallowRef<any>(null);

async function checkPlugin(row: PluginNode, id: string) {
  contentDialogTitle.value = `${row.name} - ${row.path}`;
  contentDialogVisible.value = true;
  contentLoading.value = true;
  loadedComp.value = null;
  try {
    const { data } = await axios.post("/setting/pluginConfig/getPluginInfo", {
      id: id,
      filePath: row.path,
    });

    const code = data.content;

    if (!code) {
      window.$message.warning("文件内容为空");
      contentDialogVisible.value = false;
      return;
    }
    const nodeId = `${id}:${row.path.split(".")[0]}`;
    const mod = window[nodeId as any];

    const comp = (mod as any)?.default ?? mod;
    loadedComp.value = comp ? markRaw(comp) : comp;
    addNodes({
      id: `${Date.now()}`,
      type: "pluginNode",
      position: { x: 0, y: 0 },
      data: {
        pluginId: nodeId,
        data: loadedComp.value?.defaultData ? { ...loadedComp.value.defaultData } : {},
      },
    });
    setTimeout(() => {}, 5000);
  } catch (err: any) {
    window.$message.error(err?.message ?? "获取文件内容失败");
    contentDialogVisible.value = false;
  } finally {
    contentLoading.value = false;
  }
}

function onContentDialogClosed() {
  loadedComp.value = null;
  removeNodes(toObject().nodes.map((n: Node) => n.id));
}
</script>

<style lang="scss" scoped>
.modelServe {
  width: 100%;
  height: 100%;
  display: flex;

  .modelList {
    width: 280px;
    height: 90%;
    min-height: 0;

    .listContent {
      flex: 1;
      min-height: 0;
      overflow: auto;
      height: 100%;
    }

    .listFooter {
      padding: 0 10px 10px;
      margin-right: 6px;
    }

    .menu-item-content {
      display: flex;
      align-items: center;
      gap: 8px;

      .menuItemName {
        max-width: 200px;
        font-weight: 500;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .menu-item-version {
        font-size: 11px;
        color: var(--td-text-color-placeholder);
        flex-shrink: 0;
      }
    }
  }

  .modelParameter {
    width: 100%;
    height: 100%;

    .infoBox {
      font-size: 12px;
      opacity: 0.6;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      .idBox {
        font-weight: 600;
      }

      .author {
        font-style: italic;
      }
    }

    .configuration {
      height: 95%;
      padding-right: 10px;
      overflow-y: auto;

      .plugin-info {
        padding: 0 0 16px;
        border-bottom: 1px solid var(--td-component-border);
        margin-bottom: 12px;

        .info-row {
          display: flex;
          align-items: flex-start;
          margin-bottom: 6px;
          font-size: 13px;
          line-height: 1.6;

          .infoLabel {
            color: var(--td-text-color-secondary);
            flex-shrink: 0;
          }
        }
      }
    }

    .updateAction {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;

      & > * {
        margin-left: 8px;
      }
    }
  }

  :deep(.t-default-menu) {
    width: 100% !important;
  }
}

.addPluginContent {
  .uploadMode {
    .uploadArea {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      border: 2px dashed var(--td-component-border);
      border-radius: 8px;
      cursor: pointer;
      transition:
        border-color 0.2s,
        background-color 0.2s;

      &:hover {
        border-color: var(--td-brand-color);
        background-color: var(--td-brand-color-light);
      }

      .dragIcon {
        margin-bottom: 12px;
      }

      .uploadText {
        font-size: 14px;
        color: var(--td-text-color-secondary);
        margin: 0 0 4px;
      }

      .uploadHint {
        font-size: 12px;
        color: var(--td-text-color-placeholder);
        margin: 0;
      }
    }

    .file-list {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  .linkMode {
    margin-bottom: 16px;

    .linkHint {
      font-size: 12px;
      color: var(--td-text-color-placeholder);
      margin: 8px 0 0;
    }
  }

  .dialogFooter {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--td-component-border);
  }
}

.contentViewer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 60vh;
  .exampleBox {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    min-width: 280px;
    max-width: 100%;

    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: linear-gradient(135deg, var(--td-brand-color, #0052d9), var(--td-brand-color-7, #0034b5));
      color: #fff;
      user-select: none;

      .barTitle {
        font-size: 14px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 200px;
      }

      .barId {
        font-size: 11px;
        opacity: 0.75;
        flex-shrink: 0;
        margin-left: 12px;
        font-family: monospace;
      }
    }

    .exampleBody {
      padding: 16px;
      min-height: 80px;
    }
  }
}

.jb {
  display: flex;
  justify-content: space-between;
}

.ac {
  display: flex;
  align-items: center;
}
</style>
