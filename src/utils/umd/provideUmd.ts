import projectStore from "@/stores/project";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import createKnexProxy from "@/utils/umd/tRPC";

const { project } = storeToRefs(projectStore());

interface ProvideOptions {
  flowId: string;
  episodesId?: number;
}

const filePost = async (type: string, path: string, data?: string) => {
  const r = await axios.post("/plugin/file", { type, path, data });
  return r.data;
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
    project: project.value,
    episodesId: provideOptions.episodesId,
  });
};
