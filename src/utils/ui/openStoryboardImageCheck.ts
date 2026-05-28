import { h } from "vue";
import StoryboardImageCheck from "@/components/storyboardImageCheck.vue";
import { openDialogWrapper } from "./dialogFactory";

export interface StoryboardSelectOptions {
  /** 是否多选，默认 false */
  multiple?: boolean;
  /** 指定剧本 ID，不传则显示剧本下拉选择 */
  scriptId?: number;
}

export default function openStoryboardImageCheck(options: StoryboardSelectOptions = {}): Promise<any[]> {
  const { multiple = false, scriptId } = options;

  return openDialogWrapper<any[]>((visible, finish) => {
    return h(StoryboardImageCheck, {
      modelValue: visible,
      "onUpdate:modelValue": () => {},
      multiple,
      scriptId,
      onConfirm: (rows: any[]) => finish(rows),
      onCancel: () => finish([]),
    });
  });
}
