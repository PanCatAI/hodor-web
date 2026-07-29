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

const UNIVERSAL_AGENT_KEY = "universalAi";

export function normalizeAgentDeployments(items: AgentDeploymentView[]): AgentDeploymentView[] {
  const universalAgent = items.find((item) => item.key === UNIVERSAL_AGENT_KEY);
  if (!universalAgent) return items;

  return [
    {
      ...universalAgent,
      name: "通用文本模型",
      desc: "用于原文事件分析、资产提示词、台词提取和其他全局文本任务。原文分析失败时请先检查这里。",
    },
    ...items.filter((item) => item.key !== UNIVERSAL_AGENT_KEY),
  ];
}
