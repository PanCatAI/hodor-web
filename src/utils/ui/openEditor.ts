import { h } from "vue";
import type { HANDLE_TYPE } from "@/utils/loadPluginNode";
import EditView from "@/components/edit/index.vue";
import { openDialogWrapper } from "./dialogFactory";

export interface HandleData<T extends HANDLE_TYPE = HANDLE_TYPE> {
  type: T;
  value: unknown;
}

export interface OpenEditorConfig {
  flowId: string | number;
  selectorMode?: HANDLE_TYPE[];
}

export default function openEditor(config: OpenEditorConfig): Promise<void | HandleData | null> {
  const { flowId, selectorMode = [] } = config;
  const isSelector = selectorMode.length > 0;

  return openDialogWrapper<void | HandleData | null>((visible, finish) => {
    return h(EditView, {
      modelValue: visible,
      flowId,
      selectorMode,
      "onUpdate:modelValue": (value: boolean) => {
        if (!value) finish(isSelector ? null : undefined);
      },
      onSelect: (value: HandleData | null) => finish(value),
      onClose: () => finish(isSelector ? null : undefined),
    });
  });
}
