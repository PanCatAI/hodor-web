import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";

import { InfiniteCanvas, topologyLevelLayout } from "@react/features/canvas";
import type { ProductionFlowData, ProductionGenerationData } from "@react/features/production";
import {
  buildInteractiveProductionTopology,
  type InteractiveProductionStage,
  type InteractiveProductionTopology,
} from "./interactive-production-topology";
import {
  InteractiveProductionStageNode,
  type InteractiveProductionStageNodeData,
} from "./interactive-production-stage-node";
import { InteractiveStoryFlowNode, type InteractiveStoryNodeData } from "./interactive-story-node";
import type { InteractiveStoryNodePositionUpdate } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";
import type { ProjectWorldProfile } from "@react/features/world-profile/world-profile-fields";
import { WorldProfileNode, type WorldProfileNodeData } from "@react/features/world-profile/world-profile-node";

type AggregateNodeData = InteractiveStoryNodeData | InteractiveProductionStageNodeData | WorldProfileNodeData;
type AggregateNode = Node<AggregateNodeData, "interactiveStory" | "interactiveProductionStage" | "worldProfile">;

export interface InteractiveStoryCanvasProps {
  graph: InteractiveStoryGraph;
  selectedNodeId: string | null;
  flowsByScriptId: Record<number, ProductionFlowData | undefined>;
  generationByScriptId: Record<number, ProductionGenerationData | undefined>;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  onSelectNode: (nodeId: string) => void;
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void;
  onPositionsChange: (positions: InteractiveStoryNodePositionUpdate[]) => void;
  worldProfile: ProjectWorldProfile | null;
  onOpenWorldProfile: () => void;
}

function createAggregateNode(
  topologyNode: InteractiveProductionTopology["nodes"][number],
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  flowsByScriptId: Record<number, ProductionFlowData | undefined>,
  generationByScriptId: Record<number, ProductionGenerationData | undefined>,
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void,
  worldProfile: ProjectWorldProfile | null,
  onOpenWorldProfile: () => void,
): AggregateNode {
  if (topologyNode.kind === "worldProfile") {
    return {
      id: topologyNode.id,
      type: "worldProfile",
      position: topologyNode.position,
      draggable: false,
      selectable: true,
      focusable: false,
      data: { profile: worldProfile, mode: "interactive", onOpen: onOpenWorldProfile },
    };
  }
  const storyNode = graph.nodes.find((candidate) => candidate.id === topologyNode.storyNodeId);
  if (!storyNode) throw new Error(`互动剧情节点不存在: ${topologyNode.storyNodeId}`);
  if (topologyNode.stage === "script") {
    return {
      id: topologyNode.id,
      type: "interactiveStory",
      position: topologyNode.position,
      dragHandle: ".production-node-drag-handle",
      draggable: true,
      selectable: true,
      focusable: false,
      data: {
        storyNodeId: storyNode.id,
        title: storyNode.title,
        summary: storyNode.summary,
        kind: storyNode.kind,
        status: storyNode.status,
        scriptId: storyNode.scriptId,
        entry: graph.entryNodeId === storyNode.id,
        selected: selectedNodeId === storyNode.id,
        onOpenStage,
      },
    };
  }
  return {
    id: topologyNode.id,
    type: "interactiveProductionStage",
    position: topologyNode.position,
    draggable: false,
    selectable: true,
    focusable: false,
    data: {
      storyNodeId: storyNode.id,
      storyTitle: storyNode.title,
      stage: topologyNode.stage,
      flow: flowsByScriptId[storyNode.scriptId],
      generation: generationByScriptId[storyNode.scriptId],
      onOpenStage,
    },
  };
}

function createNodes(
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  flowsByScriptId: Record<number, ProductionFlowData | undefined>,
  generationByScriptId: Record<number, ProductionGenerationData | undefined>,
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void,
  worldProfile: ProjectWorldProfile | null,
  onOpenWorldProfile: () => void,
): AggregateNode[] {
  const topology = buildInteractiveProductionTopology(graph);
  return topology.nodes.map((node) =>
    createAggregateNode(node, graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage, worldProfile, onOpenWorldProfile),
  );
}

function createEdges(graph: InteractiveStoryGraph): Edge[] {
  return buildInteractiveProductionTopology(graph).edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: `${edge.source}-source`,
    targetHandle: `${edge.target}-target`,
    label: edge.label,
    animated: edge.kind === "choice",
    style: {
      stroke: edge.kind === "choice" ? "#7b7b7b" : "#535353",
      strokeWidth: edge.kind === "choice" ? 3 : 2,
    },
    labelStyle: { fill: "#e8e8e8", fontSize: 12 },
    labelBgStyle: { fill: "#171717", fillOpacity: 0.94 },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 6,
  }));
}

function layoutNodes(nodes: AggregateNode[], instance: ReactFlowInstance<AggregateNode> | null) {
  if (!instance) return nodes;
  const current = new Map(instance.getNodes().map((node) => [node.id, node]));
  const layout = topologyLevelLayout({
    nodeIds: nodes.map((node) => node.id),
    edges: instance.getEdges().map((edge) => ({ source: edge.source, target: edge.target })),
    nodeSizes: Object.fromEntries(
      nodes.map((node) => {
        const measured = current.get(node.id);
        return [node.id, { width: measured?.measured?.width || 330, height: measured?.measured?.height || 220 }];
      }),
    ),
    fallbackNodeSize: { width: 330, height: 220 },
    gap: 90,
  });
  return nodes.map((node) => ({ ...node, position: layout[node.id] ?? node.position }));
}

export function InteractiveStoryCanvas({
  graph,
  selectedNodeId,
  flowsByScriptId,
  generationByScriptId,
  leadingControls,
  trailingControls,
  onSelectNode,
  onOpenStage,
  onPositionsChange,
  worldProfile,
  onOpenWorldProfile,
}: InteractiveStoryCanvasProps) {
  const worldProfileRef = useRef(worldProfile);
  const openWorldProfileRef = useRef(onOpenWorldProfile);
  worldProfileRef.current = worldProfile;
  openWorldProfileRef.current = onOpenWorldProfile;
  const openWorldProfile = useCallback(() => openWorldProfileRef.current(), []);
  const initialNodes = useMemo(
    () => createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage, worldProfileRef.current, openWorldProfile),
    [flowsByScriptId, generationByScriptId, graph, onOpenStage, openWorldProfile, selectedNodeId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AggregateNode>(initialNodes);
  const edges = useMemo(() => createEdges(graph), [graph]);
  const nodeTypes = useMemo(
    () => ({
      interactiveStory: InteractiveStoryFlowNode as (props: NodeProps) => React.ReactNode,
      interactiveProductionStage: InteractiveProductionStageNode as (props: NodeProps) => React.ReactNode,
      worldProfile: WorldProfileNode as (props: NodeProps) => React.ReactNode,
    }),
    [],
  );

  useEffect(() => {
    setNodes(createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage, worldProfileRef.current, openWorldProfile));
  }, [flowsByScriptId, generationByScriptId, graph, onOpenStage, openWorldProfile, selectedNodeId, setNodes]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) =>
        node.type === "worldProfile"
          ? { ...node, data: { ...(node.data as WorldProfileNodeData), profile: worldProfile } }
          : node,
      ),
    );
  }, [setNodes, worldProfile]);

  return (
    <InfiniteCanvas<AggregateNode>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      leadingControls={leadingControls}
      trailingControls={trailingControls}
      ariaLabel="互动剧情画布"
      testId="interactive-story-infinite-canvas"
      onNodeClick={(node) => {
        if (node.type !== "worldProfile") onSelectNode((node.data as InteractiveStoryNodeData | InteractiveProductionStageNodeData).storyNodeId);
      }}
      onNodeDoubleClick={(node) =>
        node.type === "worldProfile"
          ? openWorldProfile()
          : onOpenStage(
              (node.data as InteractiveStoryNodeData | InteractiveProductionStageNodeData).storyNodeId,
              node.type === "interactiveStory" ? "script" : (node.data as InteractiveProductionStageNodeData).stage,
            )
      }
      onNodeDragStop={(flowNode) => {
        if (flowNode.type !== "interactiveStory") return;
        onPositionsChange([
          {
              nodeId: (flowNode.data as InteractiveStoryNodeData).storyNodeId,
            position: {
              x: Math.round(flowNode.position.x / 4),
              y: Math.round(flowNode.position.y / 2),
            },
          },
        ]);
      }}
      onAutoLayout={(instance) => {
        const nextNodes = layoutNodes(nodes, instance);
        setNodes(nextNodes);
        onPositionsChange(
          nextNodes
            .filter((node) => node.type === "interactiveStory")
            .map((node) => ({
              nodeId: (node.data as InteractiveStoryNodeData).storyNodeId,
              position: { x: Math.round(node.position.x / 4), y: Math.round(node.position.y / 2) },
            })),
        );
        window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
      }}
    />
  );
}
