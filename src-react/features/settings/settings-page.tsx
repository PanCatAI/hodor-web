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

import { createSettingsApi, type SettingsApi, type SettingsSectionId } from "./settings-api";

const API_BASE_URL_KEY = "hodorApiBaseUrl";
const UI_SETTINGS_KEY = "hodorUiSettings";
const LANGUAGE_KEY = "hodorLanguage";
const OTHER_SETTINGS_KEY = "hodorOtherSettings";

interface SettingsPageProps {
  api?: SettingsApi;
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

const SECTIONS: SectionDefinition[] = [
  { id: "ui", label: "界面", description: "主题、密度和工作台显示偏好", icon: Palette },
  { id: "language", label: "语言", description: "Hodor 界面语言", icon: Languages },
  { id: "providers", label: "供应商", description: "已挂载的模型供应商及其启用状态", icon: Plug, remote: true },
  { id: "models", label: "模型映射", description: "图片、视频模型和提示词绑定", icon: Braces, remote: true },
  { id: "agents", label: "智能体", description: "阶段智能体模型部署和运行模式", icon: Bot, remote: true },
  { id: "prompts", label: "提示词", description: "读取和修改服务端提示词", icon: FileText, remote: true, writable: true },
  { id: "skills", label: "Skills", description: "浏览和修改智能体技能文件", icon: Sparkles, remote: true, writable: true },
  { id: "memory", label: "记忆", description: "记忆检索与摘要参数", icon: MemoryStick, remote: true, writable: true },
  { id: "database", label: "数据库", description: "查看本地数据库表和数据量", icon: Database, remote: true },
  { id: "files", label: "文件", description: "打开 Hodor 数据目录", icon: FolderOpen },
  { id: "other", label: "其他", description: "章节解析、超时和批量生成偏好", icon: Settings2 },
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
  return createSettingsApi(
    createApiClient({
      baseUrl: initialApiBaseUrl(),
      getToken: getSessionToken,
    }),
  );
}

function readStoredJson(key: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const stored = localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "设置接口请求失败";
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
      {!section.writable ? <p className="mt-2 text-xs text-slate-500">当前分区只读，修改仍由原服务端专用接口负责。</p> : null}
    </section>
  );
}

export function SettingsPage({ api, onLoggedOut }: SettingsPageProps) {
  const settingsApi = useMemo(() => api ?? createDefaultSettingsApi(), [api]);
  const [activeId, setActiveId] = useState<SettingsSectionId>("request");
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);
  const [remoteJson, setRemoteJson] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => readStoredJson(UI_SETTINGS_KEY, { theme: "dark", density: "comfortable" }));
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_KEY) || "zh-CN");
  const [otherJson, setOtherJson] = useState(() =>
    formatJson(
      readStoredJson(OTHER_SETTINGS_KEY, {
        axiosTimeOut: 300,
        assetsBatchGenereateSize: 3,
        scriptEpisodeLength: 3000,
        canvasWheelEvent: "zoom",
      }),
    ),
  );
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [skillPaths, setSkillPaths] = useState<string[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState("");
  const [skillDraft, setSkillDraft] = useState("");

  const activeSection = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  async function loadRemote(section: SettingsSectionId) {
    setLoading(true);
    setError("");
    setSavedMessage("");
    try {
      const result = await settingsApi.load(section);
      setRemoteJson(formatJson(result));
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

  function saveOtherSettings() {
    setError("");
    try {
      const value = JSON.parse(otherJson);
      localStorage.setItem(OTHER_SETTINGS_KEY, JSON.stringify(value));
      setOtherJson(formatJson(value));
      setSavedMessage("其他配置已保存");
    } catch {
      setError("JSON 格式有误，请检查后再保存");
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
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />刷新
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
              }}
            >
              <Save className="mr-2 size-4" />保存提示词
            </Button>
          </div>
          {error ? <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
          {savedMessage ? <p role="status" className="mb-4 text-sm text-emerald-400">{savedMessage}</p> : null}
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
              }}
            >
              {prompts.length === 0 ? <option value="">暂无提示词</option> : null}
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>{prompt.name}{prompt.type ? ` · ${prompt.type}` : ""}</option>
              ))}
            </select>
          </label>
          <Label htmlFor="settings-prompt-content" className="mt-4 block">提示词内容</Label>
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
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />刷新
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
              }}
            >
              <Save className="mr-2 size-4" />保存 Skill
            </Button>
          </div>
          {error ? <p role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
          {savedMessage ? <p role="status" className="mb-4 text-sm text-emerald-400">{savedMessage}</p> : null}
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
                  }}
                >
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
      const theme = String(uiSettings.theme ?? "dark");
      const density = String(uiSettings.density ?? "comfortable");
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold text-slate-100">界面偏好</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              主题
              <select
                className="h-11 rounded-md border border-border bg-black/20 px-3"
                value={theme}
                onChange={(event) => setUiSettings((current) => ({ ...current, theme: event.target.value }))}
              >
                <option value="dark">深色</option>
                <option value="light">浅色</option>
                <option value="system">跟随系统</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              信息密度
              <select
                className="h-11 rounded-md border border-border bg-black/20 px-3"
                value={density}
                onChange={(event) => setUiSettings((current) => ({ ...current, density: event.target.value }))}
              >
                <option value="comfortable">舒适</option>
                <option value="compact">紧凑</option>
              </select>
            </label>
          </div>
          <Button
            className="mt-5"
            onClick={() => {
              localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings));
              setSavedMessage("界面偏好已保存");
            }}
          >
            保存界面偏好
          </Button>
          {savedMessage ? <p role="status" className="mt-3 text-sm text-emerald-400">{savedMessage}</p> : null}
        </section>
      );
    }

    if (activeId === "language") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <Label htmlFor="settings-language">界面语言</Label>
          <select
            id="settings-language"
            className="mt-2 h-11 w-full max-w-md rounded-md border border-border bg-black/20 px-3"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
          </select>
          <Button
            className="mt-5 block"
            onClick={() => {
              localStorage.setItem(LANGUAGE_KEY, language);
              setSavedMessage("语言设置已保存");
            }}
          >
            保存语言
          </Button>
          {savedMessage ? <p role="status" className="mt-3 text-sm text-emerald-400">{savedMessage}</p> : null}
        </section>
      );
    }

    if (activeId === "files") {
      return (
        <section className="rounded-xl border border-border bg-[#10131a] p-5">
          <h2 className="font-semibold text-slate-100">Hodor 文件目录</h2>
          <p className="mt-1 text-sm text-slate-500">桌面运行时会由后端打开对应目录；浏览器环境会返回后端能力错误。</p>
          {error ? <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
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
                }}
              >
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
          <Label htmlFor="settings-other-json">其他 JSON</Label>
          {error ? <p role="alert" className="my-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
          <textarea
            id="settings-other-json"
            className="mt-2 min-h-[360px] w-full rounded-lg border border-border bg-black/30 p-4 font-mono text-xs leading-6"
            value={otherJson}
            onChange={(event) => setOtherJson(event.target.value)}
          />
          <Button className="mt-4" onClick={saveOtherSettings}>保存其他配置</Button>
          {savedMessage ? <p role="status" className="mt-3 text-sm text-emerald-400">{savedMessage}</p> : null}
        </section>
      );
    }

    if (activeId === "request") {
      return (
        <div className="grid gap-5">
          <section className="rounded-xl border border-border bg-[#10131a] p-5">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Server className="size-5" /></div>
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
              <Button onClick={saveApiBaseUrl}><Save className="mr-2 size-4" />保存地址</Button>
              {savedMessage ? <span role="status" className="text-sm text-emerald-400">{savedMessage}</span> : null}
            </div>
          </section>
          <section className="rounded-xl border border-red-500/20 bg-[#10131a] p-5">
            <h2 className="font-semibold text-slate-100">Pancat 会话</h2>
            <p className="mt-1 text-sm text-slate-500">退出后需要重新登录才能进入 Hodor 工作台。</p>
            {confirmingLogout ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <p className="mr-auto text-sm text-red-200">确定清除当前登录状态吗？</p>
                <Button variant="ghost" onClick={() => setConfirmingLogout(false)}>取消</Button>
                <Button className="bg-red-500 text-white hover:bg-red-400" onClick={logout}>确认退出</Button>
              </div>
            ) : (
              <Button className="mt-4 bg-red-500 text-white hover:bg-red-400" onClick={() => setConfirmingLogout(true)}>
                <LogOut className="mr-2 size-4" />退出登录
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
          <div className="grid size-10 place-items-center rounded-lg bg-red-500/10 text-red-400"><LogOut className="size-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-100">Pancat 会话</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {session ? `${session.name} · ${session.partnerName}` : "当前浏览器没有完整的 Pancat 登录信息"}
            </p>
          </div>
        </div>
        {confirmingLogout ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="mr-auto text-sm text-red-200">确定清除当前登录状态吗？</p>
            <Button variant="ghost" onClick={() => setConfirmingLogout(false)}>取消</Button>
            <Button className="bg-red-500 text-white hover:bg-red-400" onClick={logout}>确认退出</Button>
          </div>
        ) : (
          <Button className="bg-red-500 text-white hover:bg-red-400" onClick={() => setConfirmingLogout(true)}>
            <LogOut className="mr-2 size-4" />退出登录
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
        <nav aria-label="设置分区" className="grid content-start gap-1 rounded-xl border border-border bg-[#10131a] p-2 sm:grid-cols-3 xl:grid-cols-1">
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
                onClick={() => chooseSection(section.id)}
              >
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
