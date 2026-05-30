import { h } from "vue";
import type { DataType, DataTypeMap } from "@/utils/umd/nodeType";
import EditView from "@/components/edit/index.vue";
import { openDialogWrapper } from "./dialogFactory";

export interface HandleData<T extends DataType = DataType> {
  type: T;
  value?: DataTypeMap[T] | null;
}

export interface OpenEditorConfig {
  dataId: string | number;
  dataType?: "infiniteCanvas" | "editFlow";
  selectorMode?: DataType[];
}

export default function openEditor(config: OpenEditorConfig): Promise<void | HandleData | null> {
  console.log("%c Line:18 🌮 config", "background:#ffdd4d", config);
  const { dataId, dataType, selectorMode = [] } = config;
  const isSelector = selectorMode.length > 0;

  return openDialogWrapper<void | HandleData | null>((visible, finish) => {
    return h(EditView, {
      modelValue: visible,
      dataId,
      ...(dataType !== undefined ? { dataType } : {}),
      selectorMode,
      "onUpdate:modelValue": (value: boolean) => {
        if (!value) finish(isSelector ? null : undefined);
      },
      onSelect: (value: HandleData | null) => finish(value),
      onClose: () => finish(isSelector ? null : undefined),
    });
  });
}
