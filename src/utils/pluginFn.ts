import openAssetManager from "@/utils/ui/openAssetManager";
import openEditor from "@/utils/ui/openEditor";
import openStoryboardImageCheck from "@/utils/ui/openStoryboardImageCheck";
import axios from "@/utils/axios";
import { providersLogo, modelProviderRules } from "@/utils/providersLogo";
import useStore from "@/stores/index";

/** 资产增删查改 */
export const assets = {
  insert: (data: Record<string, any>) => axios.post("/plugin/assets/add", data),
  update: (data: Record<string, any>) => axios.post("/plugin/assets/update", data),
  del: (id: number | number[]) => axios.post("/plugin/assets/delete", { id }),
  list: (params: Record<string, any> = {}) => axios.post("/plugin/assets/list", params),
  item:(id: number) => axios.post("/plugin/assets/item", { id }),
  updateAssetsUrl: async (assetsId: number, imageUrl: string, flowId: number) => {
    await axios.post("/production/assets/updateAssetsUrl", {
      id: assetsId,
      url: imageUrl,
      flowId,
    });
  },
};

export const flow = {
  insert: (data: Record<string, any>) => axios.post("/plugin/flow/add", data),
  update: (data: Record<string, any>) => axios.post("/plugin/flow/update", data),
  del: (id: number | number[]) => axios.post("/plugin/flow/delete", { id }),
  list: (params: Record<string, any> = {}) => axios.post("/plugin/flow/list", params),
  item: (id: number) => axios.post("/plugin/flow/item", { id }),
};

export const ui = {
  openEditor,
  openAssetManager,
  openStoryboardImageCheck,
};

interface ModelItem {
  id: number;
  label: string;
  value: string;
  vendorId: number;
  type: string;
}

interface ModelGroup {
  group: string;
  id: number;
  children: ModelItem[];
}

interface GenerateFlowImageParams {
  model: string;
  quality: string;
  ratio: string;
  prompt?: string;
  references?: string[];
  projectId: number;
}

export const ai = {
  // ── 模型 ──────────────────────────────────────────────
  getModelList: async (type: "text" | "image" | "all" | "video"): Promise<ModelGroup[]> => {
    const response = await axios.post("/modelSelect/getModelList", { type });
    const groupMap = new Map<string | number, ModelGroup>();
    response.data.forEach((item: any) => {
      const groupKey = item.id;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { group: item.name, id: item.id, children: [] });
      }
      groupMap.get(groupKey)!.children.push({
        id: item.id,
        label: item.label,
        value: item.value,
        vendorId: item.vendorId,
        type: item.type,
      });
    });
    return Array.from(groupMap.values());
  },
  getModelDetail: async (modelId: string) => {
    const response = await axios.post("/modelSelect/getModelDetail", { modelId });
    return response.data;
  },
  getModelIcon: (label?: string, value?: string): string | null => {
    const source = `${label || ""} ${value || ""}`.trim();
    if (!source) return null;
    const matched = modelProviderRules.find((rule) => rule.pattern.test(source));
    return matched ? (providersLogo[matched.provider] ?? null) : null;
  },
  generateFlowImage: async (params: GenerateFlowImageParams): Promise<{ url: string }> => {
    const response = await axios.post("/production/editImage/generateFlowImage", {
      references: params.references ?? [],
      model: params.model,
      quality: params.quality,
      ratio: params.ratio,
      prompt: params.prompt,
      projectId: params.projectId,
    });
    return response.data;
  },
};
