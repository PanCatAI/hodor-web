import type { DataType, DataTypeMap } from "./nodeType";
import { type MaybeRefOrGetter } from "vue";

import openAssetManager from "@/utils/ui/openAssetManager";
import openStoryboardImageCheck from "@/utils/ui/openStoryboardImageCheck";
import openEditor from "@/utils/ui/openEditor";

import projectStore from "@/stores/project";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import createKnexProxy from "@/utils/umd/tRPC";

import { providersLogo, modelProviderRules } from "@/utils/providersLogo";

const { project } = storeToRefs(projectStore());

interface ProvideOptions<T extends DataType = DataType> {
  flowId: string;
  episodesId?: MaybeRefOrGetter<string | number | undefined>;
  projectId?: MaybeRefOrGetter<string | number | undefined>;
  selectorTypes?: T[];
  onSelect?: (data: DataTypeMap[T]) => void;
}

const filePost = async (type: string, path: string, data?: string) => {
  const r = await axios.post("/plugin/file", { type, path, data });
  return r.data;
};

const ui = {
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
interface GenerateFlowVideoParams {
  projectId: number;
  scriptId: number;
  references: string[];
  prompt: string;
  model: string;
  mode: string;
  resolution: string;
  duration: number;
  audio: boolean;
  ratio: string;
  filePath: string;
}
const ai = {
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
  generateImage: async (params: GenerateFlowImageParams): Promise<{ url: string }> => {
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
  generateVideo: async (params: GenerateFlowVideoParams) => {
    const response = await axios.post("/production/editImage/generateFlowVideo", {
      references: params.references ?? [],
      model: params.model,
      prompt: params.prompt,
      projectId: params.projectId,
      audio: params.audio,
      duration: params.duration,
      mode: params.mode,
      filePath: params.filePath,
      resolution: params.resolution,
      ratio: params.ratio,
      scriptId: -1,
    });
    return response.data;
  },
  uploadFile: async (params: { base64: string; oldUrl?: string; projectId: number }) => {
    const response = await axios.post("/infiniteCanvas/uploadFile", {
      base64: params.base64,
      ...(params.oldUrl ? { oldUrl: params.oldUrl } : {}),
      projectId: params.projectId,
    });
    return response.data;
  },
};

export default (provideOptions: ProvideOptions) => {
  const { baseUrl, themeSetting, language } = storeToRefs(settingStore());
  const themeMode = computed(() => themeSetting.value.mode);

  provide("TOONFLOW_PROVIDE_UMD", {
    baseUrl,
    flowId: provideOptions.flowId,
    file: {
      get: (path: string) => filePost("get", path),
      write: (path: string, data: string) => filePost("write", path, data),
      delete: (path: string) => filePost("delete", path),
    },
    sql: createKnexProxy(),
    episodesId: computed(() => toValue(provideOptions.episodesId)),
    projectId: computed(() => toValue(provideOptions?.projectId ?? project.value?.id)),
    ui,
    language,
    themeMode,
    selector:
      provideOptions.selectorTypes && provideOptions.selectorTypes.length > 0
        ? { types: provideOptions.selectorTypes, onSelect: provideOptions.onSelect }
        : null,
    ai,
  });
};
