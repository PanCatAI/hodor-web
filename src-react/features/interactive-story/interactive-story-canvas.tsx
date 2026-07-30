import { useEffect, useMemo, type ReactNode } from "react";
import { useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";

import { InfiniteCanvas, topologyLevelLayout } from "@react/features/canvas";
import type { ProductionFlowData, ProductionGenerationData } from "@react/features/production";
import {
  buildInteractiveProductionTopology,
  type InteractiveProductionStage,
  type InteractiveProductionTopologyNode,
} from "./interactive-production-topology";
import {
  InteractiveProductionStageNode,
  type InteractiveProductionStageNodeData,
} from "./interactive-production-stage-node";
import { InteractiveStoryFlowNode, type InteractiveStoryNodeData } from "./interactive-story-node";
import type { InteractiveStoryNodePositionUpdate } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";

type AggregateNodeData = InteractiveStoryNodeData | InteractiveProductionStageNodeData;
type AggregateNode = Node<AggregateNodeData, "interactiveStory" | "interactiveProductionStage">;

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
}

function createAggregateNode(
  topologyNode: InteractiveProductionTopologyNode,
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  flowsByScriptId: Record<number, ProductionFlowData | undefined>,
  generationByScriptId: Record<number, ProductionGenerationData | undefined>,
  onOpenStage: (storyNodeId: string, stage: InteractiveProductionStage) => void,
): AggregateNode {
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
): AggregateNode[] {
  const topology = buildInteractiveProductionTopology(graph);
  return topology.nodes.map((node) =>
    createAggregateNode(node, graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage),
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
      stroke: edge.kind === "choice" ? "#3b82f6" : "#475569",
      strokeWidth: edge.kind === "choice" ? 3 : 2,
    },
    labelStyle: { fill: "#dbeafe", fontSize: 12 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.94 },
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
}: InteractiveStoryCanvasProps) {
  const initialNodes = useMemo(
    () => createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage),
    [flowsByScriptId, generationByScriptId, graph, onOpenStage, selectedNodeId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AggregateNode>(initialNodes);
  const edges = useMemo(() => createEdges(graph), [graph]);
  const nodeTypes = useMemo(
    () => ({
      interactiveStory: InteractiveStoryFlowNode as (props: NodeProps) => React.ReactNode,
      interactiveProductionStage: InteractiveProductionStageNode as (props: NodeProps) => React.ReactNode,
    }),
    [],
  );

  useEffect(() => {
    setNodes(createNodes(graph, selectedNodeId, flowsByScriptId, generationByScriptId, onOpenStage));
  }, [flowsByScriptId, generationByScriptId, graph, onOpenStage, selectedNodeId, setNodes]);

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
      onNodeClick={(node) => onSelectNode(node.data.storyNodeId)}
      onNodeDoubleClick={(node) =>
        onOpenStage(
          node.data.storyNodeId,
          node.type === "interactiveStory" ? "script" : (node.data as InteractiveProductionStageNodeData).stage,
        )
      }
      onNodeDragStop={(flowNode) => {
        if (flowNode.type !== "interactiveStory") return;
        onPositionsChange([
          {
            nodeId: flowNode.data.storyNodeId,
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
              nodeId: node.data.storyNodeId,
              position: { x: Math.round(node.position.x / 4), y: Math.round(node.position.y / 2) },
            })),
        );
        window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
      }}
    />
  );
}
