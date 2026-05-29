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
}

export const pluginList = shallowRef<PluginEntry[]>([]);

const compCache: Record<string, any> = {};
const nodePathMap: Record<string, { url: string; path: string }> = {};

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
  nodes: Record<string, { path: string; name: string; sources: ("show" | "edit")[]; description?: string; icon?: string }>;
}

export async function loadApiPluginNode() {
  const res = await axios.get("/setting/pluginConfig/getPlugin");
  console.log("%c Line:66 🌮 res", "background:#e41a6a", res);

  pluginList.value = (res.data as any[]).map(({ url, id, version, ToonflowVersion, displayName, author, description, nodes }) => ({
    id,
    version,
    ToonflowVersion,
    displayName,
    author,
    description,
    nodes: Object.entries(nodes).map(([key, node]: [string, any]) => {
      const nodeId = `${id}:${key}`;
      nodePathMap[nodeId] = { url, path: node.path };
      return { nodeId, pluginId: id, name: node.name, sources: node.sources, description: node.description };
    }),
  }));
}
export async function loadPluginNode(pluginUrls: string[]) {
  const manifests = await Promise.all(
    pluginUrls.map((url) => axios.get<ManifestType>(`${url}/manifest.json`).then(({ data }) => ({ url, ...data }))),
  );
  console.log("%c Line:99 🍭 manifests", "background:#93c0a4", manifests);

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
      return {
        nodeId,
        pluginId: id,
        name: node.name,
        sources: node.sources,
        description: node.description,
        icon: node.icon ? `${url}/${node.icon}` : undefined,
      };
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

  compCache[nodeId] = comp ? markRaw(comp) : comp;
  return compCache[nodeId];
}
