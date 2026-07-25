export type InteractiveStoryGraphStatus = "draft" | "ready" | "producing" | "completed" | "blocked";
export type InteractiveStoryNodeKind = "scene" | "branch" | "hub" | "ending";
export type InteractiveStoryNodeStatus = "draft" | "ready" | "producing" | "completed" | "blocked";
export type InteractiveStoryVariableType = "boolean" | "number" | "string" | "inventory";

export interface InteractiveStoryPosition {
  x: number;
  y: number;
}

export interface InteractiveStoryEffect {
  variable: string;
  operation: "set" | "increment" | "decrement" | "toggle" | "append" | "remove";
  value?: unknown;
}

export interface InteractiveStoryNode {
  id: string;
  graphId: string;
  scriptId: number;
  kind: InteractiveStoryNodeKind;
  title: string;
  summary: string;
  position: InteractiveStoryPosition;
  status: InteractiveStoryNodeStatus;
  script: {
    id: number;
    name: string;
    content: string;
    createTime: number | null;
  } | null;
  createdAt: number;
  updatedAt: number;
}

export interface InteractiveStoryEdge {
  id: string;
  graphId: string;
  sourceNodeId: string;
  targetNodeId: string;
  choiceText: string;
  condition: string | null;
  effects: InteractiveStoryEffect[];
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface InteractiveStoryVariable {
  id: string;
  graphId: string;
  name: string;
  label: string;
  type: InteractiveStoryVariableType;
  initialValue: unknown;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface InteractiveStoryGraph {
  id: string;
  projectId: number;
  title: string;
  entryNodeId: string | null;
  status: InteractiveStoryGraphStatus;
  revision: number;
  nodes: InteractiveStoryNode[];
  edges: InteractiveStoryEdge[];
  variables: InteractiveStoryVariable[];
  createdAt: number;
  updatedAt: number;
}
