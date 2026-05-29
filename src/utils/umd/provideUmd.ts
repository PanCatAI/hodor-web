import { type MaybeRefOrGetter } from "vue";

import openAssetManager from "@/utils/ui/openAssetManager";
import openStoryboardImageCheck from "@/utils/ui/openStoryboardImageCheck";
import openEditor from "@/utils/ui/openEditor";

import projectStore from "@/stores/project";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import createKnexProxy from "@/utils/umd/tRPC";

const { project } = storeToRefs(projectStore());

interface ProvideOptions {
  flowId: string;
  episodesId?: MaybeRefOrGetter<string | number | undefined>;
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

export default (provideOptions: ProvideOptions) => {
  const { baseUrl } = storeToRefs(settingStore());
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
    projectId: computed(() => toValue(project.value?.id)),
    ui,
  });
};
