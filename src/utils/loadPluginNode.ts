import axios from "axios";

export type HANDLE_TYPE = "INT" | "FLOAT" | "STRING" | "BOOLEAN" | "IMAGE" | "MASK" | "AUDIO" | "VIDEO" | "LATENT" | "CONDITIONING" | "ANY";

export interface HANDLEDOPT {
  inputs?: {
    [handleId: string]: HANDLE_TYPE[];
  };
  outputs?: {
    [handleId: string]: {
      type: HANDLE_TYPE[];
      value?: unknown | null;
    };
  };
}

export interface PluginEntry {
  id: string;
  version: string;
  ToonflowVersion: string;
  displayName: string;
  author: string;
  description: string;
  nodes: NodeListEntry[];
}

export interface NodeListEntry {
  nodeId: string;
  pluginId: string;
  name: string;
  sources: ("show" | "edit")[];
  description?: string;
  icon?: string;
  defaultData?: Record<string, unknown>;
}

export const pluginList = shallowRef<PluginEntry[]>([]);

const compCache: Record<string, any> = {};
const nodePathMap: Record<string, { url: string; path: string }> = {};

function compressBase64Icon(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 50;
      const h = 50;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp"));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

function loadUmd(url: string, globalName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve((window as any)[globalName]);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

interface ManifestType {
  id: string;
  version: string;
  ToonflowVersion: string;
  displayName: string;
  author: string;
  description: string;
  nodes: Record<string, { path: string; name: string; sources: ("show" | "edit")[]; description?: string }>;
}

export async function loadPluginNode(pluginUrls: string[]) {
  const manifests = await Promise.all(
    pluginUrls.map((url) => axios.get<ManifestType>(`${url}/manifest.json`).then(({ data }) => ({ url, ...data }))),
  );

  pluginList.value = manifests.map(({ url, id, version, ToonflowVersion, displayName, author, description, nodes }) => ({
    id,
    version,
    ToonflowVersion,
    displayName,
    author,
    description,
    nodes: Object.entries(nodes).map(([key, node]) => {
      const nodeId = `${id}:${key}`;
      nodePathMap[nodeId] = { url, path: node.path };
      return { nodeId, pluginId: id, name: node.name, sources: node.sources, description: node.description };
    }),
  }));
}

export async function loadNodeComp(nodeId: string, force = false): Promise<any> {
  if (!force && compCache[nodeId]) return compCache[nodeId];
  if (force) delete compCache[nodeId];

  const record = nodePathMap[nodeId];
  if (!record) throw new Error(`未知节点: ${nodeId}`);

  const mod = await loadUmd(`${record.url}/${record.path}`, nodeId);
  const comp = mod?.default ?? mod;

  const entry = pluginList.value.flatMap((p) => p.nodes).find((n) => n.nodeId === nodeId);
  if (entry) {
    const icon = mod.icon;
    entry.icon = typeof icon === "string" && icon.startsWith("data:image/") ? await compressBase64Icon(icon) : icon;
    entry.defaultData = mod.defaultData;
    triggerRef(pluginList);
  }

  // markRaw 避免 Vue 把组件定义对象套上响应式代理
  compCache[nodeId] = comp ? markRaw(comp) : comp;
  return compCache[nodeId];
}
