import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Braces,
  Database,
  FileText,
  FolderOpen,
  Languages,
  LogOut,
  MemoryStick,
  Palette,
  Plug,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

import { Button } from "@react/components/ui/button";
import { Input } from "@react/components/ui/input";
import { Label } from "@react/components/ui/label";
import { createApiClient, resolveApiBaseUrl } from "@react/lib/api/client";
import { clearSession, getSessionToken, readSession } from "@react/lib/auth/session";
import { applyThemePreference, readPreferences, saveThemePreference, type ThemePreference } from "@react/platform";

import { createSettingsApi, type SettingsApi, type SettingsSectionId } from "./settings-api";

const API_BASE_URL_KEY = "hodorApiBaseUrl";

interface SettingsPageProps {
  api?: SettingsApi;
  apiBaseUrl?: string;
  onLoggedOut?: () => void;
}

interface SectionDefinition {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: typeof Settings2;
  remote?: boolean;
  writable?: boolean;
}

interface PromptRecord {
  id: number;
  name: string;
  type?: string;
  data: string;
}

interface VendorModel {
  name: string;
  modelName: string;
  type: "text" | "image" | "video";
  [key: string]: unknown;
}

interface VendorRecord {
  id: string;
  name: string;
  description?: string;
  enable: number | boolean;
  inputValues: Record<string, string>;
  models: VendorModel[];
  code?: string;
}

interface ModelPromptRecord {
  name: string;
  type: string;
  path: string;
  data: string;
}

interface ModelBindingRecord {
  name: string;
  model: string;
  type: string;
  path?: string;
  fileName?: string;
}

interface ModelBindingGroup {
  id: string;
  name: string;
  promptList: ModelBindingRecord[];
}

interface AgentRecord {
  id: number;
  name: string;
  model: string;
  modelName: string;
  vendorId: string | null;
  desc: string;
  temperature?: number;
  maxOutputTokens?: number;
  disabled?: boolean;
}

interface DatabaseTableRecord {
  name: string;
  rowCount: number;
}

const SECTIONS: SectionDefinition[] = [
  { id: "ui", label: "界面", description: "Hodor 工作台主题", icon: Palette },
  { id: "language", label: "语言", description: "Hodor 界面语言", icon: Languages },
  { id: "providers", label: "供应商", description: "已挂载的模型供应商及其启用状态", icon: Plug, remote: true },
  { id: "models", label: "模型映射", description: "图片、视频模型和提示词绑定", icon: Braces, remote: true },
  { id: "agents", label: "智能体", description: "阶段智能体模型部署和运行模式", icon: Bot, remote: true },
  { id: "prompts", label: "提示词", description: "读取和修改服务端提示词", icon: FileText, remote: true, writable: true },
  { id: "skills", label: "Skills", description: "浏览和修改智能体技能文件", icon: Sparkles, remote: true, writable: true },
  { id: "memory", label: "记忆", description: "记忆检索与摘要参数", icon: MemoryStick, remote: true, writable: true },
  { id: "database", label: "数据库", description: "查看本地数据库表和数据量", icon: Database, remote: true },
  { id: "files", label: "文件", description: "打开 Hodor 数据目录", icon: FolderOpen },
  { id: "other", label: "其他", description: "云端产线运行参数说明", icon: Settings2 },
  { id: "request", label: "请求", description: "Hodor 后端 API 地址", icon: Server },
  { id: "development", label: "开发", description: "智能体开发工具开关", icon: TerminalSquare, remote: true, writable: true },
  { id: "about", label: "关于", description: "版本、来源和更新检查", icon: Sparkles, remote: true },
  { id: "session", label: "会话", description: "当前 Pancat 账号和退出登录", icon: LogOut },
];

const FILE_FOLDERS = [
  { label: "数据", path: "" },
  { label: "日志", path: "logs" },
  { label: "素材", path: "oss" },
  { label: "Skills", path: "skills" },
  { label: "模型", path: "models" },
  { label: "Web", path: "web" },
  { label: "服务", path: "serve" },
  { label: "供应商适配器", path: "vendor" },
];

function initialApiBaseUrl(): string {
  return resolveApiBaseUrl({
    envBaseUrl: import.meta.env.VITE_HODOR_API_BASE_URL,
    storedBaseUrl: localStorage.getItem(API_BASE_URL_KEY),
    location: window.location,
  });
}

function createDefaultSettingsApi(): SettingsApi {
  const baseUrl = initialApiBaseUrl();
  const client = createApiClient({ baseUrl, getToken: getSessionToken });
  return createSettingsApi({
    request: client.request,
    async requestBlob(path, init = {}) {
      const headers = new Headers(init.headers);
      const token = getSessionToken();
      if (token) headers.set("Authorization", token);
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`, { ...init, headers });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `数据库导出失败 (${response.status})`);
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const rawFilename = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1];
      const filename = rawFilename ? decodeURIComponent(rawFilename.replace(/\"/g, "")) : `hodor-backup-${Date.now()}.json`;
      return { blob: await response.blob(), filename };
    },
  });
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "设置接口请求失败";
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("无法读取备份文件"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("无法读取参考文件"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function splitVendorModel(value: string): [string, string] {
  const separator = value.indexOf(":");
  return separator < 0 ? [value, ""] : [value.slice(0, separator), value.slice(separator + 1)];
}

function modelModes(model: VendorModel): string[] {
  if (Array.isArray(model.mode)) {
    return model.mode.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).filter((value): value is string => Boolean(value));
  }
  return typeof model.mode === "string" && model.mode ? [model.mode] : ["text"];
}

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.content === "string") {
      return [typeof record.thinking === "string" ? record.thinking : "", record.content].filter(Boolean).join("\n\n");
    }
  }
  return formatJson(value);
}

interface JsonPanelProps {
  section: SectionDefinition;
  value: string;
  loading: boolean;
  error: string;
  savedMessage: string;
  onChange: (value: string) => void;
  onReload: () => void;
  onSave: () => void;
}

function JsonPanel({ section, value, loading, error, savedMessage, onChange, onReload, onSave }: JsonPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-[#10131a] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-semibold text-slate-100">{section.label}配置</h2>
          <p className="mt-1 text-sm text-slate-500">{section.description}</p>
        </div>
        <Button variant="ghost" onClick={onReload} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
        {section.writable ? (
          <Button onClick={onSave} disabled={loading}>
            <Save className="mr-2 size-4" />
            保存{section.label}配置
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {savedMessage ? (
        <p role="status" className="mb-4 text-sm text-emerald-400">
          {savedMessage}
        </p>
      ) : null}
      <Label htmlFor={`settings-${section.id}-json`}>{section.label} JSON</Label>
      <textarea
        id={`settings-${section.id}-json`}
        aria-label={`${section.label} JSON`}
        className="mt-2 min-h-[360px] w-full resize-y rounded-lg border border-border bg-black/30 p-4 font-mono text-xs leading-6 text-slate-200 outline-none focus:border-primary"
        readOnly={!section.writable}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </section>
  );
}

export function SettingsPage({ api, apiBaseUrl: configuredApiBaseUrl, onLoggedOut }: SettingsPageProps) {
  const settingsApi = useMemo(() => api ?? createDefaultSettingsApi(), [api]);
  const [activeId, setActiveId] = useState<SettingsSectionId>("request");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => configuredApiBaseUrl ?? initialApiBaseUrl());
  const [remoteJson, setRemoteJson] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => readPreferences().theme);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [skillPaths, setSkillPaths] = useState<string[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [providers, setProviders] = useState<VendorRecord[]>([]);
  const [addingProvider, setAddingProvider] = useState(false);
  const [providerCodeDraft, setProviderCodeDraft] = useState("");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerInputsDraft, setProviderInputsDraft] = useState("{}");
  const [deletingProviderId, setDeletingProviderId] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [editingModelName, setEditingModelName] = useState("");
  const [testingModel, setTestingModel] = useState<{ vendorId: string; model: VendorModel } | null>(null);
  const [modelTestPrompt, setModelTestPrompt] = useState("");
  const [modelTestMode, setModelTestMode] = useState("text");
  const [modelTestReference, setModelTestReference] = useState<{ type: "image" | "video" | "audio"; data: string } | null>(null);
  const [modelTestResult, setModelTestResult] = useState<unknown>(null);
  const [modelBindings, setModelBindings] = useState<ModelBindingGroup[]>([]);
  const [modelPrompts, setModelPrompts] = useState<ModelPromptRecord[]>([]);
  const [bindingSelections, setBindingSelections] = useState<Record<string, string>>({});
  const [editingModelPrompt, setEditingModelPrompt] = useState<ModelPromptRecord | null>(null);
  const [modelPromptDraft, setModelPromptDraft] = useState<ModelPromptRecord>({ name: "", type: "video", path: "", data: "" });
  const [deletingModelPromptPath, setDeletingModelPromptPath] = useState("");
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentUseMode, setAgentUseMode] = useState("0");
  const [agentProviders, setAgentProviders] = useState<VendorRecord[]>([]);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTableRecord[]>([]);
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);
  const [clearingTable, setClearingTable] = useState("");
  const [clearAllText, setClearAllText] = useState("");
  const [developmentSwitch, setDevelopmentSwitch] = useState("0");
  const [aboutVersion, setAboutVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<Record<string, unknown> | null>(null);
  const [confirmingMemoryClear, setConfirmingMemoryClear] = useState(false);

  const activeSection = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  async function loadRemote(section: SettingsSectionId, preserveMessage = false) {
    setLoading(true);
    setError("");
    if (!preserveMessage) setSavedMessage("");
    try {
      const result = await settingsApi.load(section);
      setRemoteJson(formatJson(result));
      if (section === "providers") {
        setProviders(Array.isArray(result) ? (result as VendorRecord[]) : []);
        setEditingProviderId("");
        setDeletingProviderId("");
      }
      if (section === "models" && result && typeof result === "object") {
        const data = result as { bindings?: unknown; prompts?: unknown };
        const groups = Array.isArray(data.bindings) ? (data.bindings as ModelBindingGroup[]) : [];
        setModelBindings(groups);
        setModelPrompts(Array.isArray(data.prompts) ? (data.prompts as ModelPromptRecord[]) : []);
        const selected: Record<string, string> = {};
        groups.forEach((group) =>
          group.promptList.forEach((item) => {
            selected[`${group.id}:${item.model}`] = item.path ?? "";
          }),
        );
        setBindingSelections(selected);
      }
      if (section === "agents" && result && typeof result === "object") {
        const data = result as {
          deployments?: { qrdinaryData?: AgentRecord[]; advancedData?: AgentRecord[] };
          useMode?: unknown;
          providers?: unknown;
        };
        const deployment = data.deployments ?? {};
        setAgents(data.useMode === "1" ? (deployment.advancedData ?? []) : (deployment.qrdinaryData ?? []));
        setAgentUseMode(typeof data.useMode === "string" ? data.useMode : "0");
        setAgentProviders(Array.isArray(data.providers) ? (data.providers as VendorRecord[]) : []);
      }
      if (section === "database") {
        setDatabaseTables(Array.isArray(result) ? (result as DatabaseTableRecord[]) : []);
      }
      if (section === "development") {
        setDevelopmentSwitch(typeof result === "string" ? result : "0");
      }
      if (section === "about") {
        setAboutVersion(typeof result === "string" ? result : String((result as { version?: unknown })?.version ?? ""));
      }
      if (section === "prompts") {
        const records = Array.isArray(result) ? (result as PromptRecord[]) : [];
        setPrompts(records);
        const first = records[0];
        setSelectedPromptId(first?.id ?? null);
        setPromptDraft(first?.data ?? "");
      }
      if (section === "skills") {
        setSkillPaths(Array.isArray(result) ? result.filter((value): value is string => typeof value === "string") : []);
        setSelectedSkillPath("");
        setSkillDraft("");
      }
    } catch (requestError) {
      setRemoteJson("{}");
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeSection.remote) return;
    void loadRemote(activeSection.id);
    // The API object is deliberately stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection.id, activeSection.remote, settingsApi]);

  function saveApiBaseUrl() {
    const normalized = apiBaseUrl.trim().replace(/\/+$/, "");
    localStorage.setItem(API_BASE_URL_KEY, normalized);
    setApiBaseUrl(normalized);
    setSavedMessage("后端地址已保存");
  }

  async function saveRemote() {
    setError("");
    setSavedMessage("");
    try {
      const value = JSON.parse(remoteJson) as unknown;
      const payload = activeId === "development" ? { switchAiDevTool: value } : value;
      await settingsApi.save(activeId, payload);
      setSavedMessage(`${activeSection.label}配置已保存`);
    } catch (saveError) {
      setError(saveError instanceof SyntaxError ? "JSON 格式有误，请检查后再保存" : errorMessage(saveError));
    }
  }

  function logout() {
    clearSession();
    if (onLoggedOut) {
      onLoggedOut();
      return;
    }
    window.location.hash = "/login";
  }

  function chooseSection(id: SettingsSectionId) {
    setActiveId(id);
    setError("");
    setSavedMessage("");
  }

  function renderContent() {
    if (activeId === "prompts") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold text-slate-100">提示词管理</h2>
              <p className="mt-1 text-sm text-slate-500">按提示词记录提交 id 和正文，兼容原服务端更新合同。</p>
            </div>
            <Button variant="ghost" onClick={() => void loadRemote("prompts")} disabled={loading}>
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              disabled={selectedPromptId === null || loading}
              onClick={async () => {
                if (selectedPromptId === null) return;
                setError("");
                try {
                  await settingsApi.save("prompts", { id: selectedPromptId, data: promptDraft });
                  setSavedMessage("提示词已保存");
                } catch (requestError) {
                  setError(errorMessage(requestError));
                }
              }}>
              <Save className="mr-2 size-4" />
              保存提示词
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          <label className="grid gap-2 text-sm text-slate-300">
            提示词
            <select
              className="h-11 rounded-md border border-border bg-black/20 px-3"
              value={selectedPromptId ?? ""}
              onChange={(event) => {
                const id = Number(event.target.value);
                const record = prompts.find((prompt) => prompt.id === id);
                setSelectedPromptId(record?.id ?? null);
                setPromptDraft(record?.data ?? "");
                setSavedMessage("");
              }}>
              {prompts.length === 0 ? <option value="">暂无提示词</option> : null}
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                  {prompt.type ? ` · ${prompt.type}` : ""}
                </option>
              ))}
            </select>
          </label>
          <Label htmlFor="settings-prompt-content" className="mt-4 block">
            提示词内容
          </Label>
          <textarea
            id="settings-prompt-content"
            aria-label="提示词内容"
            className="mt-2 min-h-[360px] w-full rounded-lg border border-border bg-black/30 p-4 font-mono text-xs leading-6"
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
          />
        </section>
      );
    }

    if (activeId === "skills") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold text-slate-100">Skills 管理</h2>
              <p className="mt-1 text-sm text-slate-500">选择 Markdown 技能文件后读取或保存内容。</p>
            </div>
            <Button variant="ghost" onClick={() => void loadRemote("skills")} disabled={loading}>
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              disabled={!selectedSkillPath || loading}
              onClick={async () => {
                if (!selectedSkillPath) return;
                setError("");
                try {
                  await settingsApi.save("skills", { path: selectedSkillPath, content: skillDraft });
                  setSavedMessage("Skill 已保存");
                } catch (requestError) {
                  setError(errorMessage(requestError));
                }
              }}>
              <Save className="mr-2 size-4" />
              保存 Skill
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="max-h-[420px] overflow-auto rounded-lg border border-border bg-black/20 p-2">
              {skillPaths.length === 0 ? <p className="p-3 text-sm text-slate-500">暂无技能文件</p> : null}
              {skillPaths.map((path) => (
                <button
                  type="button"
                  key={path}
                  className={`block w-full rounded-md px-3 py-2 text-left text-xs ${selectedSkillPath === path ? "bg-primary text-primary-foreground" : "text-slate-300 hover:bg-white/5"}`}
                  onClick={async () => {
                    setSelectedSkillPath(path);
                    setError("");
                    setSavedMessage("");
                    try {
                      const result = await settingsApi.run("skills", "content", { path });
                      setSkillDraft(typeof result === "string" ? result : String((result as { content?: unknown })?.content ?? ""));
                    } catch (requestError) {
                      setError(errorMessage(requestError));
                    }
                  }}>
                  {path}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="settings-skill-content">Skill 内容</Label>
              <textarea
                id="settings-skill-content"
                aria-label="Skill 内容"
                className="mt-2 min-h-[390px] w-full rounded-lg border border-border bg-black/30 p-4 font-mono text-xs leading-6"
                value={skillDraft}
                onChange={(event) => setSkillDraft(event.target.value)}
                disabled={!selectedSkillPath}
              />
            </div>
          </div>
        </section>
      );
    }

    if (activeId === "providers") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-5 flex items-start gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold text-slate-100">供应商配置</h2>
              <p className="mt-1 text-sm text-slate-500">维护启用状态、输入参数和供应商模型。密码字段只在当前编辑框内显示。</p>
            </div>
            <Button variant="ghost" onClick={() => setAddingProvider((current) => !current)}>
              添加供应商
            </Button>
            <Button variant="ghost" onClick={() => void loadRemote("providers")} disabled={loading}>
              <RefreshCw className="mr-2 size-4" />
              刷新
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          {addingProvider ? (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <Label htmlFor="provider-typescript">供应商适配器 TypeScript</Label>
              <p className="mt-1 text-xs text-slate-500">
                代码必须导出 vendor、textRequest、imageRequest 和 videoRequest；敏感配置请使用适配器输入项，避免写进代码。
              </p>
              <textarea
                id="provider-typescript"
                aria-label="供应商适配器 TypeScript"
                className="mt-3 min-h-72 w-full rounded-lg border border-border bg-black/30 p-3 font-mono text-xs"
                value={providerCodeDraft}
                onChange={(event) => setProviderCodeDraft(event.target.value)}
                spellCheck={false}
              />
              <div className="mt-3 flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddingProvider(false);
                    setProviderCodeDraft("");
                  }}>
                  取消
                </Button>
                <Button
                  disabled={!providerCodeDraft.trim()}
                  onClick={async () => {
                    try {
                      await settingsApi.run("providers", "add", { tsCode: providerCodeDraft });
                      setAddingProvider(false);
                      setProviderCodeDraft("");
                      setSavedMessage("供应商适配器已导入");
                      await loadRemote("providers", true);
                    } catch (requestError) {
                      setError(errorMessage(requestError));
                    }
                  }}>
                  导入供应商适配器
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4">
            {providers.length === 0 && !loading ? <p className="text-sm text-slate-500">暂无供应商</p> : null}
            {providers.map((provider) => {
              const enabled = provider.enable === true || provider.enable === 1;
              const editing = editingProviderId === provider.id;
              return (
                <article key={provider.id} className="rounded-lg border border-border bg-black/20 p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="mr-auto">
                      <h3 className="font-medium text-slate-100">{provider.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {provider.id} · {provider.description || "无说明"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={`编辑${provider.name}`}
                      onClick={() => {
                        setEditingProviderId(editing ? "" : provider.id);
                        setProviderInputsDraft(formatJson(provider.inputValues));
                        setProviderCodeDraft(provider.code ?? "");
                        setModelDraft("");
                      }}>
                      {editing ? "收起" : "编辑"}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`${enabled ? "停用" : "启用"}${provider.name}`}
                      onClick={async () => {
                        setError("");
                        try {
                          await settingsApi.run("providers", "enable", { id: provider.id, enable: enabled ? 0 : 1 });
                          setSavedMessage(`${provider.name}已${enabled ? "停用" : "启用"}`);
                          await loadRemote("providers", true);
                        } catch (requestError) {
                          setError(errorMessage(requestError));
                        }
                      }}>
                      {enabled ? "停用" : "启用"}
                    </Button>
                    <Button
                      className="bg-red-500 text-white hover:bg-red-400"
                      aria-label={`删除${provider.name}`}
                      onClick={() => setDeletingProviderId(provider.id)}>
                      删除
                    </Button>
                  </div>
                  {deletingProviderId === provider.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                      <p className="mr-auto text-sm text-red-200">删除会同时清除该供应商的智能体绑定。</p>
                      <Button variant="ghost" onClick={() => setDeletingProviderId("")}>
                        取消
                      </Button>
                      <Button
                        className="bg-red-500 text-white"
                        onClick={async () => {
                          try {
                            await settingsApi.run("providers", "delete", { id: provider.id });
                            setDeletingProviderId("");
                            setSavedMessage("供应商已删除");
                            await loadRemote("providers", true);
                          } catch (requestError) {
                            setError(errorMessage(requestError));
                          }
                        }}>
                        确认删除供应商
                      </Button>
                    </div>
                  ) : null}
                  {editing ? (
                    <div className="mt-4 grid gap-4 border-t border-border pt-4">
                      <div>
                        <Label htmlFor={`provider-inputs-${provider.id}`}>供应商输入 JSON</Label>
                        <textarea
                          id={`provider-inputs-${provider.id}`}
                          aria-label="供应商输入 JSON"
                          className="mt-2 min-h-36 w-full rounded-lg border border-border bg-black/30 p-3 font-mono text-xs"
                          value={providerInputsDraft}
                          onChange={(event) => setProviderInputsDraft(event.target.value)}
                        />
                        <Button
                          className="mt-3"
                          onClick={async () => {
                            try {
                              const inputValues = JSON.parse(providerInputsDraft) as Record<string, string>;
                              await settingsApi.run("providers", "updateInputs", { id: provider.id, inputValues });
                              setSavedMessage("供应商配置已保存");
                            } catch (requestError) {
                              setError(requestError instanceof SyntaxError ? "供应商输入 JSON 格式有误" : errorMessage(requestError));
                            }
                          }}>
                          <Save className="mr-2 size-4" />
                          保存供应商
                        </Button>
                      </div>
                      <div>
                        <Label htmlFor={`provider-code-${provider.id}`}>供应商适配器代码</Label>
                        <textarea
                          id={`provider-code-${provider.id}`}
                          className="mt-2 min-h-72 w-full rounded-lg border border-border bg-black/30 p-3 font-mono text-xs"
                          value={providerCodeDraft}
                          onChange={(event) => setProviderCodeDraft(event.target.value)}
                          spellCheck={false}
                        />
                        <Button
                          className="mt-3"
                          disabled={!providerCodeDraft.trim()}
                          onClick={async () => {
                            try {
                              await settingsApi.run("providers", "updateCode", { id: provider.id, tsCode: providerCodeDraft });
                              setSavedMessage("供应商适配器代码已保存");
                              await loadRemote("providers", true);
                            } catch (requestError) {
                              setError(errorMessage(requestError));
                            }
                          }}>
                          保存适配器代码
                        </Button>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="mr-auto text-sm font-medium">模型</h4>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditingModelName("");
                              setModelDraft(formatJson({ name: "", modelName: "", type: "image", mode: ["text"] }));
                            }}>
                            新增模型
                          </Button>
                        </div>
                        <div className="mt-2 grid gap-2">
                          {provider.models.map((model) => (
                            <div key={model.modelName} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
                              <span className="mr-auto">
                                {model.name} · {model.modelName} · {model.type}
                              </span>
                              <Button
                                variant="ghost"
                                aria-label={`测试模型${model.modelName}`}
                                onClick={() => {
                                  setTestingModel({ vendorId: provider.id, model });
                                  setModelTestPrompt("");
                                  setModelTestMode(modelModes(model)[0] ?? "text");
                                  setModelTestReference(null);
                                  setModelTestResult(null);
                                }}>
                                测试
                              </Button>
                              <Button
                                variant="ghost"
                                aria-label={`编辑模型${model.modelName}`}
                                onClick={() => {
                                  setEditingModelName(model.modelName);
                                  setModelDraft(formatJson(model));
                                }}>
                                编辑
                              </Button>
                              <Button
                                variant="ghost"
                                aria-label={`删除模型${model.modelName}`}
                                onClick={async () => {
                                  try {
                                    await settingsApi.run("providers", "deleteModel", { id: provider.id, modelName: model.modelName });
                                    await loadRemote("providers", true);
                                  } catch (requestError) {
                                    setError(errorMessage(requestError));
                                  }
                                }}>
                                删除
                              </Button>
                            </div>
                          ))}
                        </div>
                        {modelDraft ? (
                          <div className="mt-3">
                            <Label htmlFor={`provider-model-${provider.id}`}>供应商模型 JSON</Label>
                            <textarea
                              id={`provider-model-${provider.id}`}
                              className="mt-2 min-h-48 w-full rounded-lg border border-border bg-black/30 p-3 font-mono text-xs"
                              value={modelDraft}
                              onChange={(event) => setModelDraft(event.target.value)}
                            />
                            <Button
                              className="mt-3"
                              onClick={async () => {
                                try {
                                  const model = JSON.parse(modelDraft) as VendorModel;
                                  const action = editingModelName ? "updateModel" : "addModel";
                                  await settingsApi.run("providers", action, {
                                    id: provider.id,
                                    ...(editingModelName ? { modelName: editingModelName } : {}),
                                    model,
                                  });
                                  setModelDraft("");
                                  setEditingModelName("");
                                  await loadRemote("providers", true);
                                } catch (requestError) {
                                  setError(requestError instanceof SyntaxError ? "模型 JSON 格式有误" : errorMessage(requestError));
                                }
                              }}>
                              保存模型
                            </Button>
                          </div>
                        ) : null}
                        {testingModel?.vendorId === provider.id ? (
                          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                            <div className="flex items-start gap-3">
                              <div className="mr-auto">
                                <h5 className="font-medium">测试 {testingModel.model.name}</h5>
                                <p className="mt-1 text-xs text-slate-500">请求只包含模型标识和本次测试输入，不会携带供应商密钥。</p>
                              </div>
                              <Button variant="ghost" onClick={() => setTestingModel(null)}>
                                关闭
                              </Button>
                            </div>
                            <Label htmlFor={`model-test-prompt-${provider.id}`} className="mt-4 block">
                              {testingModel.model.type === "text"
                                ? "文本测试消息"
                                : testingModel.model.type === "image"
                                  ? "图片测试提示词"
                                  : "视频测试提示词"}
                            </Label>
                            <textarea
                              id={`model-test-prompt-${provider.id}`}
                              aria-label={
                                testingModel.model.type === "text"
                                  ? "文本测试消息"
                                  : testingModel.model.type === "image"
                                    ? "图片测试提示词"
                                    : "视频测试提示词"
                              }
                              className="mt-2 min-h-28 w-full rounded-lg border border-border bg-black/30 p-3 text-sm"
                              value={modelTestPrompt}
                              onChange={(event) => setModelTestPrompt(event.target.value)}
                            />
                            {testingModel.model.type === "video" ? (
                              <label className="mt-3 grid gap-2 text-sm">
                                视频测试模式
                                <select
                                  aria-label="视频测试模式"
                                  className="h-10 rounded-md border border-border bg-black/30 px-3"
                                  value={modelTestMode}
                                  onChange={(event) => setModelTestMode(event.target.value)}>
                                  {modelModes(testingModel.model).map((mode) => (
                                    <option key={mode} value={mode}>
                                      {mode}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                            {testingModel.model.type !== "text" ? (
                              <Label className="mt-3 block cursor-pointer rounded-md border border-border p-3 text-sm">
                                {testingModel.model.type === "image" ? "图片测试参考图" : "视频测试参考文件"}
                                <input
                                  className="mt-2 block w-full text-xs"
                                  aria-label={testingModel.model.type === "image" ? "图片测试参考图" : "视频测试参考文件"}
                                  type="file"
                                  accept={testingModel.model.type === "image" ? "image/*" : "image/*,video/*,audio/*"}
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) {
                                      setModelTestReference(null);
                                      return;
                                    }
                                    try {
                                      const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
                                      setModelTestReference({ type, data: await readFileDataUrl(file) });
                                    } catch (requestError) {
                                      setError(errorMessage(requestError));
                                    }
                                  }}
                                />
                              </Label>
                            ) : null}
                            <Button
                              className="mt-4"
                              disabled={!modelTestPrompt.trim() || loading}
                              onClick={async () => {
                                const { model, vendorId } = testingModel;
                                setError("");
                                setModelTestResult(null);
                                setLoading(true);
                                try {
                                  let result: unknown;
                                  if (model.type === "text") {
                                    result = await settingsApi.run("providers", "testText", {
                                      id: vendorId,
                                      modelName: model.modelName,
                                      messages: [{ role: "user", content: modelTestPrompt }],
                                    });
                                  } else if (model.type === "image") {
                                    result = await settingsApi.run("providers", "testImage", {
                                      id: vendorId,
                                      modelName: model.modelName,
                                      prompt: modelTestPrompt,
                                      ...(modelTestReference ? { imageBase64: modelTestReference.data } : {}),
                                    });
                                  } else {
                                    const reference = modelTestReference;
                                    result = await settingsApi.run("providers", "testVideo", {
                                      id: vendorId,
                                      modelName: model.modelName,
                                      mode: modelTestMode,
                                      prompt: modelTestPrompt,
                                      images: reference?.type === "image" ? [{ type: "image", base64: reference.data }] : [],
                                      videos: reference?.type === "video" ? [{ type: "video", base64: reference.data }] : [],
                                      audios: reference?.type === "audio" ? [{ type: "audio", base64: reference.data }] : [],
                                    });
                                  }
                                  setModelTestResult(result);
                                } catch (requestError) {
                                  setError(errorMessage(requestError));
                                } finally {
                                  setLoading(false);
                                }
                              }}>
                              开始模型测试
                            </Button>
                            {modelTestResult !== null ? (
                              <div className="mt-4 rounded-lg border border-border bg-black/30 p-3">
                                {testingModel.model.type === "image" && typeof modelTestResult === "string" ? (
                                  <img className="max-h-72 rounded-md" alt="模型测试图片" src={modelTestResult} />
                                ) : testingModel.model.type === "video" && typeof modelTestResult === "string" ? (
                                  <video className="max-h-72 w-full rounded-md" aria-label="模型测试视频" controls src={modelTestResult} />
                                ) : (
                                  <pre role="status" className="whitespace-pre-wrap text-xs text-slate-200">
                                    {resultText(modelTestResult)}
                                  </pre>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      );
    }

    if (activeId === "models") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold">模型提示词映射</h2>
              <p className="mt-1 text-sm text-slate-500">把视频模型绑定到服务端提示词文件。</p>
            </div>
            <Button variant="ghost" onClick={() => void loadRemote("models")}>
              <RefreshCw className="mr-2 size-4" />
              刷新
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingModelPrompt(null);
                setModelPromptDraft({ name: "", type: "video", path: "", data: "" });
              }}>
              新建提示词文件
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          <div className="grid gap-4">
            {modelBindings.flatMap((group) =>
              group.promptList.map((binding) => {
                const key = `${group.id}:${binding.model}`;
                return (
                  <div
                    key={key}
                    className="grid gap-3 rounded-lg border border-border bg-black/20 p-4 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_auto] md:items-end">
                    <div>
                      <p className="font-medium">{binding.name}</p>
                      <p className="text-xs text-slate-500">
                        {group.name} · <span>{binding.model}</span>
                      </p>
                    </div>
                    <label className="grid gap-2 text-sm">
                      提示词
                      <select
                        aria-label={`${binding.model} 提示词`}
                        className="h-10 rounded-md border border-border bg-black/30 px-3"
                        value={bindingSelections[key] ?? ""}
                        onChange={(event) => setBindingSelections((current) => ({ ...current, [key]: event.target.value }))}>
                        <option value="">不绑定</option>
                        {modelPrompts
                          .filter((prompt) => !binding.type || prompt.type === binding.type)
                          .map((prompt) => (
                            <option key={prompt.path} value={prompt.path}>
                              {prompt.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Button
                      aria-label={`保存 ${binding.model} 映射`}
                      onClick={async () => {
                        const path = bindingSelections[key] ?? "";
                        const selected = modelPrompts.find((prompt) => prompt.path === path);
                        try {
                          await settingsApi.run("models", "bindPrompt", {
                            vendorId: group.id,
                            model: binding.model,
                            path,
                            fileName: selected?.name ?? "",
                          });
                          setSavedMessage(`${binding.model} 映射已保存`);
                        } catch (requestError) {
                          setError(errorMessage(requestError));
                        }
                      }}>
                      保存映射
                    </Button>
                  </div>
                );
              }),
            )}
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-medium">提示词文件</h3>
            <div className="mt-3 grid gap-2">
              {modelPrompts.map((prompt) => (
                <div key={prompt.path} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-black/20 p-3">
                  <div className="mr-auto">
                    <p className="text-sm font-medium">{prompt.name}</p>
                    <p className="text-xs text-slate-500">{prompt.path}</p>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`编辑提示词${prompt.name}`}
                    onClick={() => {
                      setEditingModelPrompt(prompt);
                      setModelPromptDraft(prompt);
                      setDeletingModelPromptPath("");
                    }}>
                    编辑
                  </Button>
                  <Button variant="ghost" aria-label={`删除提示词${prompt.name}`} onClick={() => setDeletingModelPromptPath(prompt.path)}>
                    删除
                  </Button>
                  {deletingModelPromptPath === prompt.path ? (
                    <div className="flex w-full items-center gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-3">
                      <span className="mr-auto text-sm text-red-200">确认删除 {prompt.name}？</span>
                      <Button variant="ghost" onClick={() => setDeletingModelPromptPath("")}>
                        取消
                      </Button>
                      <Button
                        className="bg-red-500 text-white"
                        onClick={async () => {
                          try {
                            await settingsApi.run("models", "deletePrompt", { path: prompt.path });
                            setDeletingModelPromptPath("");
                            setSavedMessage("提示词文件已删除");
                            await loadRemote("models", true);
                          } catch (requestError) {
                            setError(errorMessage(requestError));
                          }
                        }}>
                        确认删除提示词
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-border bg-black/20 p-4">
              <h4 className="font-medium">{editingModelPrompt ? `编辑 ${editingModelPrompt.name}` : "新建提示词文件"}</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  提示词文件名
                  <Input
                    aria-label="提示词文件名"
                    disabled={Boolean(editingModelPrompt)}
                    value={modelPromptDraft.name}
                    onChange={(event) => setModelPromptDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  提示词类型
                  <select
                    aria-label="提示词类型"
                    disabled={Boolean(editingModelPrompt)}
                    className="h-10 rounded-md border border-border bg-black/30 px-3"
                    value={modelPromptDraft.type}
                    onChange={(event) => setModelPromptDraft((current) => ({ ...current, type: event.target.value }))}>
                    <option value="image">图片</option>
                    <option value="video">视频</option>
                  </select>
                </label>
              </div>
              <Label htmlFor="model-prompt-file-content" className="mt-3 block">
                提示词文件内容
              </Label>
              <textarea
                id="model-prompt-file-content"
                aria-label="提示词文件内容"
                className="mt-2 min-h-40 w-full rounded-lg border border-border bg-black/30 p-3 font-mono text-xs"
                value={modelPromptDraft.data}
                onChange={(event) => setModelPromptDraft((current) => ({ ...current, data: event.target.value }))}
              />
              <Button
                className="mt-3"
                disabled={!modelPromptDraft.name.trim()}
                onClick={async () => {
                  try {
                    const action = editingModelPrompt ? "updatePrompt" : "savePrompt";
                    await settingsApi.run("models", action, {
                      name: modelPromptDraft.name.trim(),
                      type: modelPromptDraft.type,
                      data: modelPromptDraft.data,
                    });
                    setEditingModelPrompt(null);
                    setModelPromptDraft({ name: "", type: "video", path: "", data: "" });
                    setSavedMessage(editingModelPrompt ? "提示词文件已更新" : "提示词文件已创建");
                    await loadRemote("models", true);
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                {editingModelPrompt ? "保存提示词文件" : "创建提示词文件"}
              </Button>
            </div>
          </div>
        </section>
      );
    }

    if (activeId === "agents") {
      const textModels = agentProviders.flatMap((provider) =>
        provider.models
          .filter((model) => model.type === "text")
          .map((model) => ({ value: `${provider.id}:${model.modelName}`, label: `${provider.name} · ${model.name}` })),
      );
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold">智能体部署</h2>
              <p className="mt-1 text-sm text-slate-500">普通模式使用阶段级配置，高级模式允许独立温度和输出长度。</p>
            </div>
            <label className="grid gap-2 text-sm">
              运行模式
              <select
                aria-label="智能体运行模式"
                className="h-10 rounded-md border border-border bg-black/30 px-3"
                value={agentUseMode}
                onChange={async (event) => {
                  const next = event.target.value;
                  try {
                    await settingsApi.run("agents", "updateUseMode", { agentUseMode: next });
                    setAgentUseMode(next);
                    await loadRemote("agents", true);
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                <option value="0">普通</option>
                <option value="1">高级</option>
              </select>
            </label>
            {agentUseMode === "1" ? (
              <Button
                onClick={async () => {
                  try {
                    await settingsApi.run("agents", "deployMany", { items: agents });
                    setSavedMessage("智能体配置已批量保存");
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                批量保存当前智能体
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          <div className="grid gap-3">
            {agents.map((agent) => {
              const selected = agent.modelName
                ? agent.vendorId && !agent.modelName.startsWith(`${agent.vendorId}:`)
                  ? `${agent.vendorId}:${agent.modelName}`
                  : agent.modelName
                : "";
              return (
                <article
                  key={agent.id}
                  className="grid gap-3 rounded-lg border border-border bg-black/20 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_100px_130px_auto] lg:items-end">
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{agent.desc}</p>
                  </div>
                  <label className="grid gap-2 text-sm">
                    文本模型
                    <select
                      aria-label={`${agent.name} 模型`}
                      className="h-10 rounded-md border border-border bg-black/30 px-3"
                      value={selected}
                      onChange={(event) => {
                        const [vendorId] = splitVendorModel(event.target.value);
                        const option = textModels.find((item) => item.value === event.target.value);
                        setAgents((current) =>
                          current.map((item) =>
                            item.id === agent.id
                              ? { ...item, vendorId: vendorId || null, modelName: event.target.value, model: option?.label ?? "" }
                              : item,
                          ),
                        );
                      }}>
                      <option value="">未配置</option>
                      {textModels.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    温度
                    <Input
                      aria-label={`${agent.name} 温度`}
                      type="number"
                      step="0.1"
                      value={agent.temperature ?? 1}
                      onChange={(event) =>
                        setAgents((current) =>
                          current.map((item) => (item.id === agent.id ? { ...item, temperature: Number(event.target.value) } : item)),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    最大输出
                    <Input
                      aria-label={`${agent.name} 最大输出`}
                      type="number"
                      min="0"
                      value={agent.maxOutputTokens ?? 0}
                      onChange={(event) =>
                        setAgents((current) =>
                          current.map((item) => (item.id === agent.id ? { ...item, maxOutputTokens: Number(event.target.value) } : item)),
                        )
                      }
                    />
                  </label>
                  <Button
                    onClick={async () => {
                      try {
                        await settingsApi.save("agents", agent);
                        setSavedMessage(`${agent.name}已保存`);
                      } catch (requestError) {
                        setError(errorMessage(requestError));
                      }
                    }}>
                    保存
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      );
    }

    if (activeId === "database") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="font-semibold">本地数据库</h2>
              <p className="mt-1 text-sm text-slate-500">导入会替换当前数据库，执行前请先导出备份。</p>
            </div>
            <Button variant="ghost" onClick={() => void loadRemote("database")}>
              <RefreshCw className="mr-2 size-4" />
              刷新
            </Button>
            <Button
              onClick={async () => {
                try {
                  const result = (await settingsApi.run("database", "export")) as { blob: Blob; filename: string };
                  const url = URL.createObjectURL(result.blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = result.filename;
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(url);
                  setSavedMessage("数据库备份已导出");
                } catch (requestError) {
                  setError(errorMessage(requestError));
                }
              }}>
              导出数据库
            </Button>
            <Label className="cursor-pointer rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black">
              选择备份
              <input
                aria-label="导入数据库文件"
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const data = JSON.parse(await readFileText(file)) as Record<string, unknown>;
                    if (!data.tables || typeof data.tables !== "object") throw new Error("备份文件缺少 tables");
                    setPendingImport(data);
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                  event.target.value = "";
                }}
              />
            </Label>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {savedMessage ? (
            <p role="status" className="mb-4 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
          {pendingImport ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="mr-auto text-sm">备份格式已通过检查，确认后替换当前数据。</p>
              <Button variant="ghost" onClick={() => setPendingImport(null)}>
                取消
              </Button>
              <Button
                className="bg-amber-500 text-black"
                onClick={async () => {
                  try {
                    await settingsApi.run("database", "import", pendingImport);
                    setPendingImport(null);
                    setSavedMessage("数据库已导入");
                    await loadRemote("database", true);
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                确认导入数据库
              </Button>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border">
            {databaseTables.map((table) => (
              <div key={table.name} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <span className="mr-auto font-mono text-sm">{table.name}</span>
                <span className="text-sm text-slate-500">{table.rowCount} 行</span>
                {clearingTable === table.name ? (
                  <>
                    <Button variant="ghost" onClick={() => setClearingTable("")}>
                      取消
                    </Button>
                    <Button
                      className="bg-red-500 text-white"
                      onClick={async () => {
                        try {
                          await settingsApi.run("database", "clearTable", { tableName: table.name });
                          setClearingTable("");
                          await loadRemote("database", true);
                        } catch (requestError) {
                          setError(errorMessage(requestError));
                        }
                      }}>
                      确认清空
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setClearingTable(table.name)}>
                    清空表
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <h3 className="font-medium text-red-200">清空全部数据</h3>
            <p className="mt-1 text-sm text-slate-500">输入 HODOR 后才能执行。</p>
            <div className="mt-3 flex gap-3">
              <Input
                aria-label="清空数据库确认词"
                value={clearAllText}
                onChange={(event) => setClearAllText(event.target.value)}
                placeholder="HODOR"
              />
              <Button
                disabled={clearAllText !== "HODOR"}
                className="bg-red-500 text-white"
                onClick={async () => {
                  try {
                    await settingsApi.run("database", "clearAll");
                    setClearAllText("");
                    setSavedMessage("数据库已清空");
                    await loadRemote("database", true);
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                清空数据库
              </Button>
            </div>
          </div>
        </section>
      );
    }

    if (activeId === "development") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold">开发工具</h2>
          <p className="mt-1 text-sm text-slate-500">浏览器开发工具请使用浏览器快捷键；这里仅管理服务端 AI 调试数据开关。</p>
          {error ? (
            <p role="alert" className="my-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <label className="mt-5 flex max-w-xl items-center gap-3 rounded-lg border border-border p-4">
            <input
              type="checkbox"
              aria-label="AI 开发工具"
              checked={developmentSwitch === "1"}
              onChange={(event) => setDevelopmentSwitch(event.target.checked ? "1" : "0")}
            />
            <span className="mr-auto">记录智能体开发调试信息</span>
          </label>
          <Button
            className="mt-4"
            onClick={async () => {
              try {
                await settingsApi.save("development", { switchAiDevTool: developmentSwitch });
                setSavedMessage("开发配置已保存");
              } catch (requestError) {
                setError(errorMessage(requestError));
              }
            }}>
            保存开发配置
          </Button>
          {savedMessage ? (
            <p role="status" className="mt-3 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
        </section>
      );
    }

    if (activeId === "about") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Hodor</p>
          <h2 className="mt-2 text-2xl font-semibold">全自动内容生产工作台</h2>
          <p className="mt-2 text-sm text-slate-500">
            版本 {aboutVersion || "读取中"} · 按仓库 LICENSE 条款内部使用 · Based on Toonflow by HBAI-Ltd · 保留 NOTICE。
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-black/20 p-3">
            <img src="./upstream/toonflow-logo.png" alt="Toonflow 原项目标识" className="h-9 w-auto object-contain" />
            <p className="text-xs leading-5 text-slate-500">Hodor 基于 Toonflow 修改，原项目标识、版权和来源声明按 LICENSE 保留。</p>
          </div>
          {error ? (
            <p role="alert" className="my-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              onClick={async () => {
                try {
                  const result = (await settingsApi.run("about", "checkUpdate", { source: "github", url: null })) as Record<string, unknown>;
                  setUpdateInfo(result);
                } catch (requestError) {
                  setError(errorMessage(requestError));
                }
              }}>
              检查更新
            </Button>
            <a
              className="rounded-md border border-border px-4 py-2 text-sm"
              href="https://github.com/PanCatAI/hodor"
              target="_blank"
              rel="noreferrer">
              代码仓库
            </a>
            <a
              className="rounded-md border border-border px-4 py-2 text-sm"
              href="https://github.com/PanCatAI/hodor/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer">
              许可证
            </a>
          </div>
          {updateInfo ? (
            <p role="status" className="mt-4 text-sm text-emerald-400">
              {updateInfo.needUpdate
                ? `发现新版本 ${String(updateInfo.latestVersion ?? "")}`
                : `当前已是最新版本 ${String(updateInfo.latestVersion ?? aboutVersion)}`}
            </p>
          ) : null}
        </section>
      );
    }

    if (activeId === "memory") {
      return (
        <div className="grid gap-5">
          <JsonPanel
            section={activeSection}
            value={remoteJson}
            loading={loading}
            error={error}
            savedMessage={savedMessage}
            onChange={setRemoteJson}
            onReload={() => void loadRemote("memory")}
            onSave={() => void saveRemote()}
          />
          <section className="rounded-xl border border-red-500/20 bg-[#10131a] p-5">
            <h2 className="font-semibold text-red-200">清空全部记忆</h2>
            <p className="mt-1 text-sm text-slate-500">该操作会删除所有已保存的智能体记忆，无法在浏览器中撤销。</p>
            {confirmingMemoryClear ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <span className="mr-auto text-sm text-red-200">确认清空全部记忆？</span>
                <Button variant="ghost" onClick={() => setConfirmingMemoryClear(false)}>
                  取消
                </Button>
                <Button
                  className="bg-red-500 text-white"
                  onClick={async () => {
                    try {
                      await settingsApi.run("memory", "clear");
                      setConfirmingMemoryClear(false);
                      setSavedMessage("全部记忆已清空");
                      await loadRemote("memory", true);
                    } catch (requestError) {
                      setError(errorMessage(requestError));
                    }
                  }}>
                  确认清空记忆
                </Button>
              </div>
            ) : (
              <Button className="mt-4 bg-red-500 text-white" onClick={() => setConfirmingMemoryClear(true)}>
                清空全部记忆
              </Button>
            )}
          </section>
        </div>
      );
    }

    if (activeSection.remote) {
      return (
        <JsonPanel
          section={activeSection}
          value={remoteJson}
          loading={loading}
          error={error}
          savedMessage={savedMessage}
          onChange={setRemoteJson}
          onReload={() => void loadRemote(activeId)}
          onSave={() => void saveRemote()}
        />
      );
    }

    if (activeId === "ui") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold text-slate-100">界面偏好</h2>
          <label className="mt-5 grid max-w-md gap-2 text-sm text-slate-300">
            主题
            <select
              aria-label="主题"
              className="h-11 rounded-md border border-border bg-black/20 px-3"
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemePreference)}>
              <option value="dark">深色</option>
              <option value="light">浅色</option>
              <option value="auto">跟随系统</option>
            </select>
          </label>
          <Button
            className="mt-5"
            onClick={() => {
              saveThemePreference(theme);
              applyThemePreference(theme);
              setSavedMessage("主题已保存");
            }}>
            保存主题
          </Button>
          {savedMessage ? (
            <p role="status" className="mt-3 text-sm text-emerald-400">
              {savedMessage}
            </p>
          ) : null}
        </section>
      );
    }

    if (activeId === "language") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold text-slate-100">界面语言</h2>
          <p className="mt-3 rounded-lg border border-border bg-black/20 p-4 text-sm text-slate-300">当前界面仅提供简体中文。</p>
        </section>
      );
    }

    if (activeId === "files") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold text-slate-100">Hodor 文件目录</h2>
          <p className="mt-1 text-sm text-slate-500">桌面运行时会由后端打开对应目录；浏览器环境会返回后端能力错误。</p>
          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {FILE_FOLDERS.map((folder) => (
              <button
                type="button"
                key={folder.path}
                className="flex items-center gap-3 rounded-lg border border-border bg-black/20 p-4 text-left text-sm hover:border-primary/50"
                onClick={async () => {
                  setError("");
                  try {
                    await settingsApi.run("files", "open", { path: folder.path });
                  } catch (requestError) {
                    setError(errorMessage(requestError));
                  }
                }}>
                <FolderOpen className="size-5 text-primary" />
                {folder.label}
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (activeId === "other") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold">运行参数</h2>
          <p className="mt-3 rounded-lg border border-border bg-black/20 p-4 text-sm leading-6 text-slate-300">
            运行参数由云端产线合同管理，不在浏览器本地保存。批量并发、任务超时、剧本拆分和画布行为会在对应工作台接入真实合同后提供。
          </p>
        </section>
      );
    }

    if (activeId === "request") {
      return (
        <div className="grid gap-5">
          <section className="rounded-xl border border-border bg-[#10131a] p-5">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Server className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-100">后端连接</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">修改后刷新页面，新请求会连接到这个地址。</p>
              </div>
            </div>
            <Label htmlFor="settings-api-base-url">Hodor API 地址</Label>
            <Input
              id="settings-api-base-url"
              className="mt-2"
              value={apiBaseUrl}
              onChange={(event) => {
                setApiBaseUrl(event.target.value);
                setSavedMessage("");
              }}
              placeholder="https://hodor.pancat.ai/api"
            />
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={saveApiBaseUrl}>
                <Save className="mr-2 size-4" />
                保存地址
              </Button>
              {savedMessage ? (
                <span role="status" className="text-sm text-emerald-400">
                  {savedMessage}
                </span>
              ) : null}
            </div>
          </section>
          <section className="rounded-xl border border-red-500/20 bg-[#10131a] p-5">
            <h2 className="font-semibold text-slate-100">Pancat 会话</h2>
            <p className="mt-1 text-sm text-slate-500">退出后需要重新登录才能进入 Hodor 工作台。</p>
            {confirmingLogout ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <p className="mr-auto text-sm text-red-200">确定清除当前登录状态吗？</p>
                <Button variant="ghost" onClick={() => setConfirmingLogout(false)}>
                  取消
                </Button>
                <Button className="bg-red-500 text-white hover:bg-red-400" onClick={logout}>
                  确认退出
                </Button>
              </div>
            ) : (
              <Button className="mt-4 bg-red-500 text-white hover:bg-red-400" onClick={() => setConfirmingLogout(true)}>
                <LogOut className="mr-2 size-4" />
                退出登录
              </Button>
            )}
          </section>
        </div>
      );
    }

    const session = readSession();
    return (
      <section className="rounded-xl border border-red-500/20 bg-[#10131a] p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-red-500/10 text-red-400">
            <LogOut className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-100">Pancat 会话</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {session ? `${session.name} · ${session.partnerName}` : "当前浏览器没有完整的 Pancat 登录信息"}
            </p>
          </div>
        </div>
        <p className="mb-5 rounded-lg border border-border bg-black/20 p-4 text-sm text-slate-400">
          账号资料和密码统一由 Pancat 管理，Hodor 后端不保存或修改密码。
        </p>
        {confirmingLogout ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="mr-auto text-sm text-red-200">确定清除当前登录状态吗？</p>
            <Button variant="ghost" onClick={() => setConfirmingLogout(false)}>
              取消
            </Button>
            <Button className="bg-red-500 text-white hover:bg-red-400" onClick={logout}>
              确认退出
            </Button>
          </div>
        ) : (
          <Button className="bg-red-500 text-white hover:bg-red-400" onClick={() => setConfirmingLogout(true)}>
            <LogOut className="mr-2 size-4" />
            退出登录
          </Button>
        )}
      </section>
    );
  }

  return (
    <main className="min-h-full bg-[#090b10] p-4 text-foreground lg:p-8">
      <header className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">设置中心</h1>
        <p className="mt-2 text-sm text-slate-400">管理 Hodor 工作台、服务端配置和 Pancat 登录状态。</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="设置分区"
          className="grid content-start gap-1 rounded-xl border border-border bg-[#10131a] p-2 sm:grid-cols-3 xl:grid-cols-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = section.id === activeId;
            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-slate-300 hover:bg-white/5"
                }`}
                onClick={() => chooseSection(section.id)}>
                <Icon className="size-4 shrink-0" />
                {section.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0">{renderContent()}</div>
      </div>
    </main>
  );
}
