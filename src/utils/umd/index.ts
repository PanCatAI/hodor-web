import { z } from "zod";
import axios from "axios";

export type ManifestNode = { path: string; name: string; sources: ("show" | "edit")[]; description?: string; icon?: string };

export interface ManifestType {
  id: string;
  version: string;
  ToonflowVersion: string;
  displayName: string;
  author: string;
  description: string;
  nodes: Record<string, ManifestNode>;
  url?: string;
}

export const manifestList = ref<ManifestType[]>([]);

export async function loadApiUmd() {
  return;
  const res = await axios.get("/setting/pluginConfig/getPlugin");
  manifestList.value = res.data as ManifestType[];
}

export async function registerUmd(pluginUrls: string[]) {
  manifestList.value = await Promise.all(
    pluginUrls.map((url) => axios.get<ManifestType>(`${url}/manifest.json`).then(({ data }) => ({ url, ...data }))),
  );
}

const compCache: Record<string, any> = {};
export async function loadUmdNode(pluginNodeId: `${string}:${string}`, force = false) {
  if (!force && compCache[pluginNodeId]) return compCache[pluginNodeId];
  if (force) delete compCache[pluginNodeId];
  const [pluginId, nodeId] = pluginNodeId.split(":") as [string, string];
  const plugin = manifestList.value.find((m) => m.id === pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  const nodeInfo = plugin.nodes[nodeId];
  if (!nodeInfo) throw new Error(`Node ${nodeId} not found in plugin ${pluginId}`);
  const Comp = await loadUmd(`${plugin.url}/${nodeInfo.path}`, pluginNodeId);
  compCache[pluginNodeId] = Comp;
  return Comp;
}

function loadUmd(url: string, globalName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve((window as any)[globalName].default);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export type ToolCoonfig<TAttrs extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> = {
  description: string;
  inputSchema: TAttrs;
  execute: (inputSchema: z.infer<TAttrs>) => void;
};

export const remoteTools = ref<Record<`${string}:${string}`, Record<string, ToolCoonfig>>>({});
