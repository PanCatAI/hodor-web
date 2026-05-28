import { h, ref } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next";
import AssetsView from "@/views/assets/index.vue";
import { openDialogWrapper } from "./dialogFactory";

interface Asset {
  id: number;
  assetsId: number | null;
  name: string;
  prompt: string;
  describe: string;
  remark: string;
  src: string;
  type: "role" | "tool" | "scene" | "clip" | "audio";
  imageId: number | null;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  sonAssets?: Asset[];
}

export type AssetType = "role" | "tool" | "scene" | "clip" | "audio";
export type ClipMediaType = "image" | "video" | "audio";

export interface AssetsSelectOptions {
  /** 限制显示的资产类型，不传则显示全部 */
  types?: AssetType[];
  /** 当 types 包含 clip 时，限制 clip 的媒体子类型（图片/视频/音频），不传则显示全部 */
  clipMediaTypes?: ClipMediaType[];
  /** 是否多选，默认 true */
  multiple?: boolean;
  /** 弹窗标题 */
  title?: string;
  selectorMode?: boolean;
}

export default function openAssetsSelector(options: AssetsSelectOptions = {}): Promise<Asset[]> {
  const { types, clipMediaTypes, multiple = true, title = window.$t("common.selectAssets"), selectorMode = false } = options;
  const assetsRef = ref<InstanceType<typeof AssetsView>>();

  return openDialogWrapper<Asset[]>((visible, finish) => {
    return h(
      TDialog,
      {
        visible,
        header: title,
        width: "80%",
        top: "5vh",
        destroyOnClose: true,
        confirmBtn: window.$t("common.confirm"),
        cancelBtn: window.$t("common.cancel"),
        onConfirm: () => {
          const selectedKeys = assetsRef.value?.selectedRowKeys || [];
          const selectedSubKeys = assetsRef.value?.selectedSubRowKeys || [];
          const data = assetsRef.value?.tableData || [];
          // 选中的父资产
          const selectedParents = data.filter((item) => selectedKeys.includes(item.id));
          // 选中的子资产
          const selectedSubs: Asset[] = [];
          data.forEach((item) => {
            item.sonAssets?.forEach((sub: any) => {
              if (selectedSubKeys.includes(sub.id)) selectedSubs.push(sub);
            });
          });
          finish([...selectedParents, ...selectedSubs] as any[]);
        },
        onClose: () => finish([]),
        onCancel: () => finish([]),
      },
      {
        default: () =>
          h("div", { style: "height: 72vh; overflow: auto;" }, [
            h(AssetsView, {
              ref: assetsRef,
              selectorMode: selectorMode,
              allowedTypes: types,
              clipMediaTypes,
              multiple,
            }),
          ]),
      },
    );
  });
}
