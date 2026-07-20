export type SettingsSectionId =
  | "ui"
  | "language"
  | "providers"
  | "models"
  | "agents"
  | "prompts"
  | "skills"
  | "memory"
  | "database"
  | "files"
  | "other"
  | "request"
  | "development"
  | "about"
  | "session";

export interface SettingsTransport {
  request(path: string, init?: RequestInit): Promise<unknown>;
  requestBlob?(path: string, init?: RequestInit): Promise<{ blob: Blob; filename: string }>;
}

export interface SettingsApi {
  load(section: SettingsSectionId): Promise<unknown>;
  save(section: SettingsSectionId, value: unknown): Promise<unknown>;
  run(section: SettingsSectionId, action: string, payload?: unknown): Promise<unknown>;
}

function post(body?: unknown): RequestInit {
  return {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export function createSettingsApi(transport: SettingsTransport): SettingsApi {
  return {
    async load(section) {
      switch (section) {
        case "providers":
          return transport.request("/setting/vendorConfig/getVendorList", post());
        case "models": {
          const [bindings, prompts] = await Promise.all([
            transport.request("/setting/modelMap/getImageAndVideoModel", post()),
            transport.request("/setting/modelMap/getPromptList"),
          ]);
          return { bindings, prompts };
        }
        case "agents": {
          const [deployments, useMode, providers] = await Promise.all([
            transport.request("/setting/agentDeploy/getAgentDeploy", post()),
            transport.request("/setting/agentDeploy/getAgentUseMode"),
            transport.request("/setting/vendorConfig/getVendorList", post()),
          ]);
          return { deployments, useMode, providers };
        }
        case "prompts":
          return transport.request("/setting/promptManage/getPrompt", post());
        case "skills":
          return transport.request("/setting/skillManagement/getSkillList", post());
        case "memory":
          return transport.request("/setting/memoryConfig/getMemory");
        case "database":
          return transport.request("/setting/dbConfig/dbInfo");
        case "development":
          return transport.request("/setting/dev/getSwitchAiDevTool");
        case "about":
          return transport.request("/other/getVersion");
        default:
          return {};
      }
    },

    async save(section, value) {
      switch (section) {
        case "agents":
          return transport.request("/setting/agentDeploy/updateAgentModel", post(value));
        case "prompts":
          return transport.request("/setting/promptManage/updatePrompt", post(value));
        case "skills":
          return transport.request("/setting/skillManagement/saveSkillContent", post(value));
        case "memory":
          return transport.request("/setting/memoryConfig/sureMemory", post(value));
        case "development":
          return transport.request("/setting/dev/updateSwitchAiDevTool", post(value));
        default:
          throw new Error(`设置分区不支持整体保存：${section}`);
      }
    },

    async run(section, action, payload) {
      if (section === "files" && action === "open") {
        return transport.request("/setting/fileManagement/openFolder", post(payload));
      }
      if (section === "memory" && action === "clear") {
        return transport.request("/setting/memoryConfig/delAllMemory", post());
      }
      if (section === "skills" && action === "content") {
        return transport.request("/setting/skillManagement/getSkillContent", post(payload));
      }
      if (section === "about" && action === "checkUpdate") {
        return transport.request("/setting/about/checkUpdate", post(payload ?? { source: "github", url: null }));
      }
      if (section === "providers") {
        const paths: Record<string, string> = {
          updateInputs: "/setting/vendorConfig/updateVendorInputs",
          enable: "/setting/vendorConfig/enableVendor",
          delete: "/setting/vendorConfig/deleteVendor",
          addModel: "/setting/vendorConfig/addVendorModel",
          updateModel: "/setting/vendorConfig/upVendorModel",
          deleteModel: "/setting/vendorConfig/delVendorModel",
          add: "/setting/vendorConfig/addVendor",
          updateCode: "/setting/vendorConfig/updateCode",
          testText: "/setting/vendorConfig/modelTest/textTest",
          testImage: "/setting/vendorConfig/modelTest/imageTest",
          testVideo: "/setting/vendorConfig/modelTest/videoTest",
        };
        const path = paths[action];
        if (path) return transport.request(path, post(payload));
      }
      if (section === "models") {
        const paths: Record<string, string> = {
          bindPrompt: "/setting/modelMap/bindingPrompt",
          savePrompt: "/setting/modelMap/savePrompt",
          updatePrompt: "/setting/modelMap/updatePrompt",
          deletePrompt: "/setting/modelMap/deletePrompt",
        };
        const path = paths[action];
        if (path) return transport.request(path, post(payload));
      }
      if (section === "agents" && action === "updateUseMode") {
        return transport.request("/setting/agentDeploy/updateUseMode", post(payload));
      }
      if (section === "agents" && action === "deployMany") {
        return transport.request("/setting/agentDeploy/deployAgentModel", post(payload));
      }
      if (section === "database" && action === "export") {
        if (!transport.requestBlob) throw new Error("当前连接不支持下载数据库备份");
        return transport.requestBlob("/setting/dbConfig/exportData");
      }
      if (section === "database" && action === "import") {
        return transport.request("/setting/dbConfig/importData", post(payload));
      }
      if (section === "database" && action === "clearTable") {
        return transport.request("/setting/dbConfig/clearTable", post(payload));
      }
      if (section === "database" && action === "clearAll") {
        return transport.request("/setting/dbConfig/clearData");
      }
      throw new Error(`设置操作不存在：${section}/${action}`);
    },
  };
}
