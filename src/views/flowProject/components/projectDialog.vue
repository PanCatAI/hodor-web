<template>
  <div class="addProject">
    <t-dialog
      placement="center"
      v-model:visible="addProjectShow"
      :header="isEdit ? $t('workbench.project.dialog.editTitle') : $t('workbench.project.dialog.addTitle')"
      width="40%"
      @confirm="handleOk"
      @close-btn-click="handleCancel"
      @cancel="handleCancel"
      :confirm-btn="isEdit ? $t('workbench.project.dialog.save') : $t('workbench.project.dialog.ok')"
      :cancel-btn="$t('workbench.project.dialog.cancel')">
      <t-form :data="formState" label-align="top">
        <t-form-item :label="$t('workbench.project.dialog.projectName')">
          <t-input v-model="formState.name" :placeholder="$t('workbench.project.dialog.projectNamePh')" />
        </t-form-item>
        <t-form-item :label="$t('workbench.infinite.dialog.projectIntro')">
          <t-textarea
            v-model="formState.intro"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :placeholder="$t('workbench.infinite.dialog.projectIntroPh')" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import axios from "@/utils/axios";

const addProjectShow = defineModel<boolean>();
const props = defineProps<{
  projectData: ProjectData | null;
}>();
const emit = defineEmits<{
  (e: "submit"): void;
}>();

// ===== 类型定义 =====
interface ProjectData {
  id: string;
  name: string;
  intro: string;
}

const isEdit = computed(() => !!props.projectData);

const DEFAULT_FORM: () => ProjectData = () => ({
  id: "",
  name: "",
  intro: "",
});

// ===== 表单 =====
const formState = ref(DEFAULT_FORM());

function resetForm() {
  formState.value = DEFAULT_FORM();
}

function handleCancel() {
  addProjectShow.value = false;
  resetForm();
}

function handleOk() {
  if (!formState.value.name) return window.$message.warning($t("workbench.project.msg.enterProjectName"));
  if (!formState.value.intro) return window.$message.warning($t("workbench.project.msg.enterProjectIntro"));
  if (isEdit.value) {
    axios
      .post("/flowProject/updateFlowProject", {
        id: formState.value.id as unknown as string,
        name: formState.value.name,
        intro: formState.value.intro,
      })
      .then(() => {
        window.$message.success($t("workbench.project.msg.editSuccess"));
        emit("submit");
      })
      .catch((e) => {
        window.$message.error(e.message ?? $t("workbench.project.msg.editFailed"));
      });
  } else {
    axios
      .post("/flowProject/addFlowProject", {
        name: formState.value.name,
        intro: formState.value.intro,
      })
      .then(() => {
        window.$message.success($t("workbench.project.msg.addSuccess"));
        emit("submit");
      })
      .catch((e) => {
        window.$message.error(e.message ?? $t("workbench.project.msg.addFailed"));
      });
  }
  resetForm();
  addProjectShow.value = false;
}
</script>

<style lang="scss" scoped>
.formColumns {
  display: flex;
  gap: 24px;

  .formLeft {
    flex: 1;
    min-width: 0;
  }

  .formRight {
    flex: 1;
    min-width: 0;
  }
}
.directorManual {
  width: 100%;
  height: 50%;
  .directorManualHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .artStyleContent {
    height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
  }
}
.artStylePicker {
  width: 100%;
  height: 50%;
  .artStyleHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .artStyleContent {
    height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
  }
}

.gridContainer {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;

  .gridItem {
    cursor: pointer;
    transition: transform 0.2s ease;
    border: 2px solid transparent;
    border-radius: 6px;
    position: relative;

    &:hover {
      transform: scale(1.03);
      .editBtn {
        z-index: 2;
        opacity: 1;
      }
      .delBtn {
        z-index: 2;
        opacity: 1;
      }
      .preview {
        z-index: 2;
        opacity: 1;
      }
    }

    &.active {
      border-color: var(--td-brand-color);
      position: relative;
      &::after {
        content: "";
        position: absolute;
        inset: 0;
        background-color: #0000006b;
        color: rgb(109, 226, 109);
        line-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        height: 100%;
      }
    }

    .imageWrapper {
      position: relative;
      overflow: hidden;
      border-radius: 4px;

      .artImage {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        display: block;
      }

      .text {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
        text-align: center;
        padding: 6px;
        font-size: 12px;
        line-height: 1;
      }
    }
    .editBtn {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .delBtn {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .preview {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }
  }
}

// 视觉手册名称与封面同行布局
.nameAndCoverRow {
  gap: 16px;
  width: 100%;
  .nameField {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mdFileLocation {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .coverField {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 20px;
  }

  .fieldLabel {
    font-size: 14px;
    color: var(--td-text-color-primary);
  }
}

// 画风弹窗样式
.coverUploadArea {
  width: 100%;

  .coverPreview {
    display: flex;
    align-items: center;
    gap: 12px;

    .coverImg {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--td-component-border);
    }
  }

  &.multiCoverUploadArea {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;

    .coverPreview {
      position: relative;
      flex-shrink: 0;

      .coverImg {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid var(--td-component-border);
        display: block;
      }

      .coverImgRemove {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--td-error-color);
        color: #fff;
        border-radius: 50%;
        cursor: pointer;
        font-size: 10px;
        z-index: 1;

        &:hover {
          background: var(--td-error-color-hover);
        }
      }
    }
  }

  .coverUploadTrigger {
    width: 80px;
    height: 80px;
    border: 2px dashed var(--td-component-border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--td-text-color-placeholder);
    gap: 4px;
    font-size: 12px;
    transition: border-color 0.2s;
    white-space: nowrap;

    &:hover {
      border-color: var(--td-brand-color);
      color: var(--td-brand-color);
    }
  }
}

.promptEditorWrapper {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  .promptEditorHeader {
    display: flex;
    margin-bottom: 8px;

    .aiExtractInline {
      width: 100%;
      .aiImageList {
        display: flex;
        align-items: center;
        gap: 4px;

        .aiImageItem {
          position: relative;
          width: 36px;
          height: 36px;

          .aiImg {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid var(--td-component-border);
          }

          .aiImgRemove {
            position: absolute;
            top: -5px;
            right: -5px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--td-error-color);
            color: #fff;
            border-radius: 50%;
            cursor: pointer;
            font-size: 9px;
          }
        }

        .aiImageAdd {
          width: 36px;
          height: 36px;
          border: 2px dashed var(--td-component-border);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--td-text-color-placeholder);
          transition: border-color 0.2s;

          &:hover {
            border-color: var(--td-brand-color);
            color: var(--td-brand-color);
          }
        }
      }
    }
  }
}

// MdEditor 在弹窗内的样式调整
:deep(.md-editor) {
  border-radius: 6px;
}

// 画风弹窗整体高度72vh
:deep(.artStyleDialog) {
  .t-dialog__body {
    height: 75vh;
    overflow-y: auto;
  }
}
</style>
