export interface AgentDeploymentView {
  id: number;
  key?: string;
  name: string;
  model: string;
  modelName: string;
  vendorId: string | null;
  desc: string;
  temperature?: number;
  maxOutputTokens?: number;
  disabled?: boolean;
}

export type AgentDeploymentRecord = Omit<AgentDeploymentView, "temperature" | "maxOutputTokens"> & {
  temperature?: number | null;
  maxOutputTokens?: number | null;
};

const UNIVERSAL_AGENT_KEY = "universalAi";

export function normalizeAgentDeployments(items: AgentDeploymentRecord[]): AgentDeploymentView[] {
  const normalizedItems = items.map(({ temperature, maxOutputTokens, ...item }) => ({
    ...item,
    ...(temperature === undefined ? {} : { temperature: temperature ?? 1 }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens: maxOutputTokens ?? 0 }),
  }));
  const universalAgent = normalizedItems.find((item) => item.key === UNIVERSAL_AGENT_KEY);
  if (!universalAgent) return normalizedItems;

  return [
    {
      ...universalAgent,
      name: "通用文本模型",
      desc: "用于原文事件分析、资产提示词、台词提取和其他全局文本任务。原文分析失败时请先检查这里。",
    },
    ...normalizedItems.filter((item) => item.key !== UNIVERSAL_AGENT_KEY),
  ];
}
