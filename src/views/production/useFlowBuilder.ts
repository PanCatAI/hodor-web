import productionAgentStore from "@/stores/productionAgent";
import { computed, type Ref } from "vue";
import { type Node } from "@vue-flow/core";

// ==================== 类型定义 ====================
export interface DeriveAsset {
  id: number;
  assetsId: number | null;
  name: string;
  prompt: string;
  desc: string;
  src: string;
  flowId?: number;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  type: "role" | "tool" | "scene" | "clip";
  errorReason?: string;
}

export interface AssetItem {
  id: number;
  name: string;
  desc: string;
  prompt: string;
  src: string;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  type: "role" | "tool" | "scene" | "clip";
  flowId?: number;
  derive: DeriveAsset[];
  errorReason?: string;
}

export interface Storyboard {
  id?: number;
  duration?: number;
  prompt: string;
  trackId?: number;
  associateAssetsIds?: number[];
  src: string | null;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  flowId?: number;
  reason?: string;
  videoDesc: string;
  shouldGenerateImage: number;
}

interface VideoList {
  id: number;
  prompt: string;
  duration: number;
  storyboardId: number;
  trackId: number;
}

export interface FlowData {
  script: string;
  assets: AssetItem[];
  scriptPlan: string;
  storyboardTable: string;
  storyboard: Storyboard[];
  workbench: {
    videoList: VideoList[];
  };
}

export type NodePositions = Record<string, { x: number; y: number }>;

// ==================== 构建函数 ====================
export function useFlowBuilder(spacing = 600) {
  const { flowData } = storeToRefs(productionAgentStore());
  const nodes = ref<Node[]>([]);

  onMounted(() => {
    const value = flowData.value;

    // 新格式：已经是 Node[]
    if (Array.isArray(value)) {
      return value;
    }

    // 旧格式：FlowData 对象
    const compMap: Record<string, string> = {
      script: "toonflowPlugin:script",
      assets: "toonflowPlugin:assets",
      scriptPlan: "toonflowPlugin:scriptPlan",
      storyboardTable: "toonflowPlugin:storyboardTable",
      storyboard: "toonflowPlugin:storyboard",
    };

    let col = 0;
    nodes.value = Object.keys(value)
      .map((key) => {
        const pluginId = compMap[key];
        if (!pluginId) return null;
        const node: Node = {
          id: key,
          type: "pluginNode",
          position: { x: col * spacing, y: 0 },
          data: {
            pluginId,
            data: { [key]: value[key as keyof FlowData] },
          },
        };
        col++;
        return node;
      })
      .filter(Boolean) as Node[];
  });
  return { nodes };
}
