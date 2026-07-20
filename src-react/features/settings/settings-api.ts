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
        case "providers":
          return transport.request("/setting/vendorConfig/addVendor", post(value));
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
          throw new Error("这个设置分区暂不支持保存");
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
      throw new Error("这个操作尚未接入");
    },
  };
}
