import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";

import { InfiniteCanvas, topologyLevelLayout } from "@react/features/canvas";
import { InteractiveStoryFlowNode, type InteractiveStoryNodeData } from "./interactive-story-node";
import type { InteractiveStoryNodePositionUpdate } from "./interactive-story-api";
import type { InteractiveStoryGraph } from "./types";

type StoryNode = Node<InteractiveStoryNodeData, "interactiveStory">;

export interface InteractiveStoryCanvasProps {
  graph: InteractiveStoryGraph;
  selectedNodeId: string | null;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  onSelectNode: (nodeId: string) => void;
  onOpenProduction: (scriptId: number) => void;
  onPositionsChange: (positions: InteractiveStoryNodePositionUpdate[]) => void;
}

function createNodes(
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  onOpenProduction: (scriptId: number) => void,
): StoryNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: "interactiveStory",
    position: node.position,
    dragHandle: ".production-node-drag-handle",
    selectable: true,
    focusable: false,
    data: {
      title: node.title,
      summary: node.summary,
      kind: node.kind,
      status: node.status,
      scriptId: node.scriptId,
      entry: graph.entryNodeId === node.id,
      selected: selectedNodeId === node.id,
      onOpenProduction,
    },
  }));
}

function sameNodeView(current: StoryNode, next: StoryNode): boolean {
  return (
    current.position.x === next.position.x &&
    current.position.y === next.position.y &&
    current.data.title === next.data.title &&
    current.data.summary === next.data.summary &&
    current.data.kind === next.data.kind &&
    current.data.status === next.data.status &&
    current.data.scriptId === next.data.scriptId &&
    current.data.entry === next.data.entry &&
    current.data.selected === next.data.selected &&
    current.data.onOpenProduction === next.data.onOpenProduction
  );
}

export function reconcileInteractiveStoryNodes(
  currentNodes: StoryNode[],
  graph: InteractiveStoryGraph,
  selectedNodeId: string | null,
  onOpenProduction: (scriptId: number) => void,
): StoryNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return createNodes(graph, selectedNodeId, onOpenProduction).map((nextNode) => {
    const currentNode = currentById.get(nextNode.id);
    if (!currentNode) return nextNode;
    if (sameNodeView(currentNode, nextNode)) return currentNode;
    return { ...currentNode, ...nextNode };
  });
}

function createEdges(graph: InteractiveStoryGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: `${edge.sourceNodeId}-source`,
    targetHandle: `${edge.targetNodeId}-target`,
    label: edge.choiceText,
    animated: false,
    style: { stroke: "#475569", strokeWidth: 2 },
    labelStyle: { fill: "#cbd5e1", fontSize: 12 },
    labelBgStyle: { fill: "#0f172a", fillOpacity: 0.92 },
    labelBgPadding: [8, 5],
    labelBgBorderRadius: 6,
  }));
}

function sameEdgeView(current: Edge, next: Edge): boolean {
  return (
    current.source === next.source &&
    current.target === next.target &&
    current.sourceHandle === next.sourceHandle &&
    current.targetHandle === next.targetHandle &&
    current.label === next.label
  );
}

export function reconcileInteractiveStoryEdges(currentEdges: Edge[], graph: InteractiveStoryGraph): Edge[] {
  const currentById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  return createEdges(graph).map((nextEdge) => {
    const currentEdge = currentById.get(nextEdge.id);
    return currentEdge && sameEdgeView(currentEdge, nextEdge) ? currentEdge : nextEdge;
  });
}

function layoutNodes(nodes: StoryNode[], instance: ReactFlowInstance<StoryNode> | null) {
  if (!instance) return nodes;
  const current = new Map(instance.getNodes().map((node) => [node.id, node]));
  const layout = topologyLevelLayout({
    nodeIds: nodes.map((node) => node.id),
    edges: instance.getEdges().map((edge) => ({ source: edge.source, target: edge.target })),
    nodeSizes: Object.fromEntries(
      nodes.map((node) => {
        const measured = current.get(node.id);
        return [node.id, { width: measured?.measured?.width || 320, height: measured?.measured?.height || 220 }];
      }),
    ),
    fallbackNodeSize: { width: 320, height: 220 },
    gap: 100,
  });
  return nodes.map((node) => ({ ...node, position: layout[node.id] ?? node.position }));
}

export function InteractiveStoryCanvas({
  graph,
  selectedNodeId,
  leadingControls,
  trailingControls,
  onSelectNode,
  onOpenProduction,
  onPositionsChange,
}: InteractiveStoryCanvasProps) {
  const initialNodes = useMemo(() => createNodes(graph, selectedNodeId, onOpenProduction), [graph, onOpenProduction, selectedNodeId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryNode>(initialNodes);
  const [edges, setEdges] = useState(() => createEdges(graph));
  const nodeTypes = useMemo(() => ({ interactiveStory: InteractiveStoryFlowNode as (props: NodeProps) => React.ReactNode }), []);

  useEffect(() => {
    setNodes((currentNodes) =>
      reconcileInteractiveStoryNodes(currentNodes, graph, selectedNodeId, onOpenProduction),
    );
  }, [graph, onOpenProduction, selectedNodeId, setNodes]);

  useEffect(() => {
    setEdges((currentEdges) => reconcileInteractiveStoryEdges(currentEdges, graph));
  }, [graph]);

  return (
    <InfiniteCanvas<StoryNode>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      leadingControls={leadingControls}
      trailingControls={trailingControls}
      ariaLabel="互动剧情画布"
      testId="interactive-story-infinite-canvas"
      onNodeClick={(node) => onSelectNode(node.id)}
      onNodeDoubleClick={(node) => onOpenProduction(node.data.scriptId)}
      onNodeDragStop={(flowNode) => {
        onPositionsChange([
          {
            nodeId: flowNode.id,
            position: { x: Math.round(flowNode.position.x), y: Math.round(flowNode.position.y) },
          },
        ]);
      }}
      onAutoLayout={(instance) => {
        const nextNodes = layoutNodes(nodes, instance);
        setNodes(nextNodes);
        onPositionsChange(nextNodes.map((node) => ({ nodeId: node.id, position: node.position })));
        window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
      }}
    />
  );
}
