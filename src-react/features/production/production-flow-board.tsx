import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useNodesState, useUpdateNodeInternals } from "@xyflow/react";
import type { Node, NodeProps, ReactFlowInstance } from "@xyflow/react";
import { Download, X } from "lucide-react";

import { InfiniteCanvas, readCanvasWheelEvent } from "@react/features/canvas";
import { ImageFlowEditor } from "./image-flow-editor";
import type { ProductionApi } from "./production-api";
import type {
  DerivedAsset,
  ProductionFlowData,
  ProductionStageTarget,
  ProductionWorkbenchView,
  StoryboardItem,
} from "./types";
import { ProductionFlowNode } from "./production-flow-nodes";
import type { ProductionNodeData, ProductionNodeHandlers } from "./production-flow-nodes";
import {
  mergePolledDerivedAssets,
  mergePolledStoryboards,
  mergeProductionFlowSnapshot,
  productionNodeFlowChanged,
} from "./production-poll-reconciliation";
import {
  applyProductionLayout,
  mergeProductionLayout,
  productionAutoLayout,
  productionEdges,
  productionNodeLabels,
  productionNodeOrder,
} from "./production-flow-layout";
import type { ProductionFlowNodeId } from "./production-flow-layout";

export interface ProductionFlowBoardProps {
  api: ProductionApi;
  projectId: number;
  scriptId: number;
  initialData: ProductionFlowData;
  imageModel?: string;
  pollIntervalMs?: number;
  externalRevision?: number;
  immersive?: boolean;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  onChange?: (data: ProductionFlowData, baseRevision: number) => void;
  onOpenStage?: (stage: ProductionStageTarget) => void;
  onOpenWorkbench?: (view: ProductionWorkbenchView) => void;
  onOpenDirectorDesk?: (storyboardId: number) => void;
}

type ProductionNode = Node<ProductionNodeData, "production">;
type PositionSnapshot = Record<ProductionFlowNodeId, { x: number; y: number }>;

interface MeasuredLayoutNode {
  id: string;
  measured?: { width?: number; height?: number };
}

interface StableNodeMeasurementOptions<T extends MeasuredLayoutNode> {
  nodeIds: string[];
  forceMeasure: (nodeIds: string[]) => void;
  getNodes: () => T[];
  maxRetries?: number;
  delayMs?: number;
}

export { readCanvasWheelEvent };

export async function waitForStableNodeMeasurements<T extends MeasuredLayoutNode>({
  nodeIds,
  forceMeasure,
  getNodes,
  maxRetries = 30,
  delayMs = 80,
}: StableNodeMeasurementOptions<T>): Promise<T[]> {
  forceMeasure(nodeIds);
  await Promise.resolve();

  let latest = getNodes();
  let lastSnapshot = "";
  let stableCount = 0;
  for (let retries = maxRetries; retries > 0; retries -= 1) {
    latest = getNodes();
    const allMeasured = nodeIds.every((id) => {
      const node = latest.find((candidate) => candidate.id === id);
      return Boolean(node?.measured?.width && node.measured.width > 0);
    });
    if (allMeasured) {
      const snapshot = nodeIds
        .map((id) => {
          const node = latest.find((candidate) => candidate.id === id);
          return `${id}:${node?.measured?.width}x${node?.measured?.height}`;
        })
        .join(",");
      if (snapshot === lastSnapshot) {
        stableCount += 1;
        if (stableCount >= 2) return latest;
      } else {
        lastSnapshot = snapshot;
        stableCount = 0;
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }
  return latest;
}

function NodeInternalsBridge({ updateRef }: { updateRef: MutableRefObject<ReturnType<typeof useUpdateNodeInternals> | null> }) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateRef.current = updateNodeInternals;
    return () => {
      if (updateRef.current === updateNodeInternals) updateRef.current = null;
    };
  }, [updateNodeInternals, updateRef]);
  return null;
}

function updateDerived(data: ProductionFlowData, updates: DerivedAsset[]) {
  const assets = mergePolledDerivedAssets(data.assets, updates);
  return assets === data.assets ? data : { ...data, assets };
}

function updateStoryboard(data: ProductionFlowData, update: StoryboardItem) {
  const storyboard = mergePolledStoryboards(data.storyboard, [update]);
  return storyboard === data.storyboard ? data : { ...data, storyboard };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

function createNodes(flow: ProductionFlowData, handlers: ProductionNodeHandlers): ProductionNode[] {
  const layout = mergeProductionLayout(flow.layout);
  return productionNodeOrder.map((id) => ({
    id,
    type: "production",
    position: layout[id],
    dragHandle: ".production-node-drag-handle",
    selectable: true,
    focusable: false,
    initialWidth: 150,
    initialHeight: 50,
    data: { ...handlers, id, position: layout[id], flow },
  }));
}

export function ProductionFlowBoard({
  api,
  projectId,
  scriptId,
  initialData,
  imageModel = "pancat:pancat-image",
  pollIntervalMs = 3_000,
  externalRevision = 0,
  leadingControls,
  trailingControls,
  onChange,
  onOpenStage,
  onOpenWorkbench,
  onOpenDirectorDesk,
}: ProductionFlowBoardProps) {
  const [data, setData] = useState(initialData);
  const [notice, setNotice] = useState("");
  const [editingAsset, setEditingAsset] = useState<DerivedAsset | null>(null);
  const [editingStoryboard, setEditingStoryboard] = useState<StoryboardItem | null>(null);
  const [editingStoryboardInfo, setEditingStoryboardInfo] = useState<StoryboardItem | null>(null);
  const [selectedStoryboardIds, setSelectedStoryboardIds] = useState<number[]>([]);
  const [generatingStoryboards, setGeneratingStoryboards] = useState(false);
  const [storyboardPreview, setStoryboardPreview] = useState("");
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ProductionNode> | null>(null);
  const identityRef = useRef(`${projectId}:${scriptId}`);
  const revisionRef = useRef(externalRevision);
  const initializationRunRef = useRef(0);
  const layoutRunRef = useRef(0);
  const layoutCompletedRef = useRef("");
  const mountedRef = useRef(false);
  const dataRef = useRef(initialData);
  const incomingDataRef = useRef(initialData);
  const suppressNextChangeRef = useRef(false);
  const updateNodeInternalsRef = useRef<ReturnType<typeof useUpdateNodeInternals> | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const changeText = useCallback(
    (field: "script" | "scriptPlan" | "storyboardTable", value: string) => {
      setData((current) => {
        const next = { ...current, [field]: value };
        void api.saveFlowData(projectId, scriptId, next).catch((error) => setNotice(errorMessage(error)));
        return next;
      });
    },
    [api, projectId, scriptId],
  );

  const generate = useCallback(
    async (assetId: number) => {
      setData((current) => {
        const existing = current.assets.flatMap((asset) => asset.derive).find((item) => item.id === assetId);
        if (!existing) return current;
        return updateDerived(current, [{ ...existing, state: "running", errorReason: "" }]);
      });
      try {
        await api.generateDerivedAssets(projectId, scriptId, [assetId]);
      } catch (error) {
        setData((current) => {
          const existing = current.assets.flatMap((asset) => asset.derive).find((item) => item.id === assetId);
          return existing ? updateDerived(current, [{ ...existing, state: "failed", errorReason: errorMessage(error) }]) : current;
        });
      }
    },
    [api, projectId, scriptId],
  );

  const remove = useCallback(
    async (assetId: number) => {
      if (!window.confirm("确定删除该衍生资产吗？")) return;
      try {
        await api.deleteDerivedAsset(projectId, assetId);
        setData((current) => ({
          ...current,
          assets: current.assets.map((asset) => ({ ...asset, derive: asset.derive.filter((item) => item.id !== assetId) })),
        }));
      } catch (error) {
        setNotice(errorMessage(error));
      }
    },
    [api, projectId],
  );

  const openStage = useCallback((stage: ProductionStageTarget) => {
    onOpenStage?.(stage);
  }, [onOpenStage]);

  const openWorkbench = useCallback((view: ProductionWorkbenchView) => {
    onOpenWorkbench?.(view);
  }, [onOpenWorkbench]);

  const openDirectorDesk = useCallback((storyboardId: number) => {
    onOpenDirectorDesk?.(storyboardId);
  }, [onOpenDirectorDesk]);

  const toggleStoryboard = useCallback((id: number) => {
    setSelectedStoryboardIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const selectAllStoryboards = useCallback(() => {
    setSelectedStoryboardIds(dataRef.current.storyboard.map((item) => item.id));
  }, []);

  const clearStoryboardSelection = useCallback(() => setSelectedStoryboardIds([]), []);

  const generateStoryboards = useCallback(async () => {
    if (!selectedStoryboardIds.length) return;
    const ids = [...selectedStoryboardIds];
    setGeneratingStoryboards(true);
    setNotice("");
    setData((current) => ({
      ...current,
      storyboard: current.storyboard.map((item) => (ids.includes(item.id) ? { ...item, state: "running", errorReason: "" } : item)),
    }));
    try {
      const updates = await api.generateStoryboards({ projectId, scriptId, storyboardIds: ids });
      if (updates.length) {
        setData((current) => {
          const storyboard = mergePolledStoryboards(current.storyboard, updates);
          return storyboard === current.storyboard ? current : { ...current, storyboard };
        });
      }
      setSelectedStoryboardIds([]);
    } catch (error) {
      const message = errorMessage(error);
      setData((current) => ({
        ...current,
        storyboard: current.storyboard.map((item) => (ids.includes(item.id) ? { ...item, state: "failed", errorReason: message } : item)),
      }));
      setNotice(message);
    } finally {
      setGeneratingStoryboards(false);
    }
  }, [api, projectId, scriptId, selectedStoryboardIds]);

  const retryStoryboard = useCallback(async (id: number) => {
    setNotice("");
    setData((current) => ({
      ...current,
      storyboard: current.storyboard.map((item) => (item.id === id ? { ...item, state: "running", errorReason: "" } : item)),
    }));
    try {
      const updates = await api.generateStoryboards({ projectId, scriptId, storyboardIds: [id] });
      if (updates.length) {
        setData((current) => {
          const storyboard = mergePolledStoryboards(current.storyboard, updates);
          return storyboard === current.storyboard ? current : { ...current, storyboard };
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      setData((current) => ({
        ...current,
        storyboard: current.storyboard.map((item) => (item.id === id ? { ...item, state: "failed", errorReason: message } : item)),
      }));
      setNotice(message);
    }
  }, [api, projectId, scriptId]);

  const deleteStoryboards = useCallback(
    async (ids: number[]) => {
      if (!ids.length || !window.confirm(`确定删除选中的 ${ids.length} 个分镜吗？`)) return;
      setNotice("");
      try {
        await api.deleteStoryboards(projectId, ids);
        setData((current) => ({
          ...current,
          storyboard: current.storyboard.filter((item) => !ids.includes(item.id)).map((item, index) => ({ ...item, index })),
        }));
        setSelectedStoryboardIds((current) => current.filter((id) => !ids.includes(id)));
      } catch (error) {
        setNotice(errorMessage(error));
      }
    },
    [api, projectId],
  );

  const insertStoryboard = useCallback(
    async (referenceId: number, placement: "before" | "after") => {
      setNotice("");
      try {
        const id = await api.addStoryboard(projectId, scriptId, {
          prompt: "",
          duration: 0,
          state: "未生成",
          videoDesc: "",
          shouldGenerateImage: 0,
          src: null,
        });
        const currentData = dataRef.current;
        const referenceIndex = currentData.storyboard.findIndex((item) => item.id === referenceId);
        const insertionIndex = Math.max(0, referenceIndex + (placement === "after" ? 1 : 0));
        const storyboard = [...currentData.storyboard];
        storyboard.splice(insertionIndex, 0, {
          id,
          index: insertionIndex,
          prompt: "",
          videoDesc: "",
          src: "",
          state: "idle",
          errorReason: "",
          duration: 0,
          shouldGenerateImage: 0,
        });
        const nextFlow = { ...currentData, storyboard: storyboard.map((item, index) => ({ ...item, index })) };
        setData(nextFlow);
        await api.saveFlowData(projectId, scriptId, nextFlow);
      } catch (error) {
        setNotice(`新增分镜失败：${errorMessage(error)}`);
      }
    },
    [api, projectId, scriptId],
  );

  const previewStoryboards = useCallback(async () => {
    const ids = dataRef.current.storyboard.filter((item) => item.src).map((item) => item.id);
    if (!ids.length) return;
    setNotice("");
    try {
      setStoryboardPreview(await api.previewStoryboards(ids));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [api]);

  const handlers = useMemo<ProductionNodeHandlers>(
    () => ({
      onTextChange: changeText,
      onGenerateAsset: (id) => void generate(id),
      onRemoveAsset: (id) => void remove(id),
      onEditAsset: setEditingAsset,
      onEditStoryboard: setEditingStoryboard,
      onEditStoryboardInfo: setEditingStoryboardInfo,
      selectedStoryboardIds,
      generatingStoryboards,
      onToggleStoryboard: toggleStoryboard,
      onSelectAllStoryboards: selectAllStoryboards,
      onClearStoryboardSelection: clearStoryboardSelection,
      onGenerateStoryboards: () => void generateStoryboards(),
      onRetryStoryboard: (id) => void retryStoryboard(id),
      onDeleteStoryboards: (ids) => void deleteStoryboards(ids),
      onInsertStoryboard: (id, placement) => void insertStoryboard(id, placement),
      onPreviewStoryboards: () => void previewStoryboards(),
      onOpenDirectorDesk: openDirectorDesk,
      onOpenStage: openStage,
      onOpenWorkbench: openWorkbench,
    }),
    [
      changeText,
      clearStoryboardSelection,
      deleteStoryboards,
      generate,
      generateStoryboards,
      generatingStoryboards,
      insertStoryboard,
      openStage,
      openDirectorDesk,
      openWorkbench,
      previewStoryboards,
      remove,
      retryStoryboard,
      selectAllStoryboards,
      selectedStoryboardIds,
      toggleStoryboard,
    ],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ProductionNode>(createNodes(initialData, handlers));
  const [positionHistory, setPositionHistory] = useState<{ past: PositionSnapshot[]; future: PositionSnapshot[] }>({
    past: [],
    future: [],
  });
  const dragStartSnapshotRef = useRef<PositionSnapshot | null>(null);
  const edges = useMemo(() => productionEdges(), []);
  const nodeTypes = useMemo(() => ({ production: ProductionFlowNode as (props: NodeProps) => React.ReactNode }), []);

  useEffect(() => {
    const identity = `${projectId}:${scriptId}`;
    const identityChanged = identityRef.current !== identity;
    const revisionChanged = revisionRef.current !== externalRevision;
    const snapshotChanged = incomingDataRef.current !== initialData;
    if (!identityChanged && !revisionChanged) {
      if (snapshotChanged) {
        incomingDataRef.current = initialData;
        const merged = mergeProductionFlowSnapshot(dataRef.current, initialData);
        if (merged !== dataRef.current) {
          dataRef.current = merged;
          suppressNextChangeRef.current = true;
          setData(merged);
        }
      }
      return;
    }
    identityRef.current = identity;
    initializationRunRef.current += 1;
    layoutRunRef.current += 1;
    layoutCompletedRef.current = "";
    revisionRef.current = externalRevision;
    incomingDataRef.current = initialData;
    dataRef.current = initialData;
    mountedRef.current = false;
    setData(initialData);
    if (identityChanged) {
      setSelectedStoryboardIds([]);
      setStoryboardPreview("");
      setPositionHistory({ past: [], future: [] });
    }
    setNodes(createNodes(initialData, handlers));
  }, [externalRevision, handlers, initialData, projectId, scriptId, setNodes]);

  useEffect(() => {
    if (flowInstance) void initializeLayout(flowInstance);
  }, [externalRevision, projectId, scriptId]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const id = node.id as ProductionFlowNodeId;
        const flowChanged = productionNodeFlowChanged(id, node.data.flow, data);
        const storyboardControlsChanged =
          id === "storyboard" &&
          (node.data.selectedStoryboardIds !== handlers.selectedStoryboardIds ||
            node.data.generatingStoryboards !== handlers.generatingStoryboards);
        if (!flowChanged && !storyboardControlsChanged) return node;
        return {
          ...node,
          data: { ...node.data, ...handlers, id, position: node.position, flow: data },
        };
      }),
    );
  }, [data, handlers, setNodes]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (suppressNextChangeRef.current) {
      suppressNextChangeRef.current = false;
      return;
    }
    onChange?.(data, revisionRef.current);
  }, [data, onChange]);

  const runningAssetIds = useMemo(
    () => data.assets.flatMap((asset) => asset.derive.filter((item) => item.state === "running").map((item) => item.id)),
    [data.assets],
  );

  const runningStoryboardIds = useMemo(() => data.storyboard.filter((item) => item.state === "running").map((item) => item.id), [data.storyboard]);

  useEffect(() => {
    if (runningAssetIds.length === 0) return;
    const timer = window.setInterval(() => {
      void api
        .pollDerivedAssets(runningAssetIds)
        .then((updates) => setData((current) => updateDerived(current, updates)))
        .catch((error) => setNotice(errorMessage(error)));
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, runningAssetIds.join(",")]);

  useEffect(() => {
    if (!runningStoryboardIds.length) return;
    const timer = window.setInterval(() => {
      void api
        .pollStoryboards(runningStoryboardIds)
        .then((updates) =>
          setData((current) => {
            const storyboard = mergePolledStoryboards(current.storyboard, updates);
            return storyboard === current.storyboard ? current : { ...current, storyboard };
          }),
        )
        .catch((error) => setNotice(`分镜轮询暂时失败：${errorMessage(error)}`));
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [api, pollIntervalMs, runningStoryboardIds.join(",")]);

  function updateNodePosition(node: ProductionNode) {
    const id = node.id as ProductionFlowNodeId;
    const position = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    setNodes((current) => current.map((item) => (item.id === id ? { ...item, position, data: { ...item.data, position } } : item)));
    setData((current) => ({ ...current, layout: { ...mergeProductionLayout(current.layout), [id]: position } }));
  }

  function readPositionSnapshot(sourceNodes = nodes): PositionSnapshot {
    return Object.fromEntries(
      productionNodeOrder.map((id) => {
        const node = sourceNodes.find((candidate) => candidate.id === id);
        const position = node?.position ?? mergeProductionLayout(data.layout)[id];
        return [id, { x: Math.round(position.x), y: Math.round(position.y) }];
      }),
    ) as PositionSnapshot;
  }

  function samePositionSnapshot(left: PositionSnapshot, right: PositionSnapshot) {
    return productionNodeOrder.every((id) => left[id].x === right[id].x && left[id].y === right[id].y);
  }

  function rememberPositionSnapshot(snapshot: PositionSnapshot | null, current = readPositionSnapshot()) {
    if (!snapshot) return;
    if (samePositionSnapshot(snapshot, current)) return;
    setPositionHistory((history) => ({
      past: [...history.past, snapshot].slice(-80),
      future: [],
    }));
  }

  function applyPositionSnapshot(snapshot: PositionSnapshot) {
    setNodes((current) =>
      applyProductionLayout(current, snapshot).map((node) => ({
        ...node,
        data: { ...node.data, position: snapshot[node.id as ProductionFlowNodeId] },
      })),
    );
    setData((current) => ({ ...current, layout: snapshot }));
    window.requestAnimationFrame(() => void flowInstance?.fitView({ duration: 250, padding: 0.12 }));
  }

  function undoPosition() {
    const previous = positionHistory.past.at(-1);
    if (!previous) return;
    const current = readPositionSnapshot();
    setPositionHistory((history) => ({
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, 80),
    }));
    applyPositionSnapshot(previous);
  }

  function redoPosition() {
    const next = positionHistory.future[0];
    if (!next) return;
    const current = readPositionSnapshot();
    setPositionHistory((history) => ({
      past: [...history.past, current].slice(-80),
      future: history.future.slice(1),
    }));
    applyPositionSnapshot(next);
  }

  function applyAutoLayout(instance = flowInstance, measuredNodes = instance?.getNodes() ?? nodes, remember = true) {
    const before = remember ? readPositionSnapshot(measuredNodes) : null;
    const nodeSizes = Object.fromEntries(
      measuredNodes.map((node) => [
        node.id,
        {
          width: node.measured?.width || 150,
          height: node.measured?.height || 50,
        },
      ]),
    );
    const layout = productionAutoLayout({ nodeSizes });
    setNodes((current) =>
      applyProductionLayout(current, layout).map((node) => ({ ...node, data: { ...node.data, position: layout[node.id as ProductionFlowNodeId] } })),
    );
    setData((current) => ({ ...current, layout }));
    rememberPositionSnapshot(before, layout);
    window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
  }

  async function runAutoLayout(instance = flowInstance, remember = true) {
    if (!instance) return false;
    const run = ++layoutRunRef.current;
    const nodeIds = instance.getNodes().map((node) => node.id);
    const measuredNodes = await waitForStableNodeMeasurements({
      nodeIds,
      forceMeasure: (ids) => updateNodeInternalsRef.current?.(ids),
      getNodes: () => instance.getNodes(),
    });
    if (run !== layoutRunRef.current) return false;
    applyAutoLayout(instance, measuredNodes, remember);
    return true;
  }

  async function initializeLayout(instance: ReactFlowInstance<ProductionNode>) {
    const run = ++initializationRunRef.current;
    for (let retries = 60; retries > 0; retries -= 1) {
      if (run !== initializationRunRef.current) return;
      const currentNodes = instance.getNodes();
      if (currentNodes.length > 0 && currentNodes.every((node) => node.measured?.width && node.measured.width > 0)) break;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (run === initializationRunRef.current) await layoutWhenNodesAreStable(instance);
  }

  async function layoutWhenNodesAreStable(instance = flowInstance) {
    const layoutKey = `${projectId}:${scriptId}:${externalRevision}`;
    if (layoutCompletedRef.current === layoutKey) return;
    if (await runAutoLayout(instance, false)) layoutCompletedRef.current = layoutKey;
  }

  async function adoptAsset(url: string, flowId: number) {
    if (!editingAsset) return;
    const updated: DerivedAsset = { ...editingAsset, src: url, flowId, state: "completed", errorReason: "" };
    await api.updateAssetImage(editingAsset.id, url, flowId);
    setData((current) => updateDerived(current, [updated]));
  }

  async function adoptStoryboard(url: string, flowId: number) {
    if (!editingStoryboard) return;
    const updated: StoryboardItem = { ...editingStoryboard, src: url, flowId, state: "completed", errorReason: "" };
    await api.updateStoryboardImage(editingStoryboard.id, url, flowId);
    setData((current) => updateStoryboard(current, updated));
  }

  async function saveStoryboardInfo() {
    if (!editingStoryboardInfo) return;
    setNotice("");
    try {
      await api.editStoryboard(editingStoryboardInfo.id, editingStoryboardInfo.prompt, editingStoryboardInfo.videoDesc);
      setData((current) => updateStoryboard(current, editingStoryboardInfo));
      setEditingStoryboardInfo(null);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return (
    <section
      className="relative h-full min-h-0"
      aria-label="生产流图"
      data-production-flow-contract="source-to-final-v1"
    >
      {notice ? (
        <div
          role="status"
          className="absolute left-1/2 top-32 z-30 -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 shadow-xl">
          {notice}
        </div>
      ) : null}
      <InfiniteCanvas<ProductionNode>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        leadingControls={leadingControls}
        trailingControls={trailingControls}
        ariaLabel="可拖动生产流程"
        testId="production-infinite-canvas"
        getNodeLabel={(node) => productionNodeLabels[node.id as ProductionFlowNodeId]}
        showMiniMap
        canUndo={positionHistory.past.length > 0}
        canRedo={positionHistory.future.length > 0}
        onUndo={undoPosition}
        onRedo={redoPosition}
        onNodeDragStart={() => {
          dragStartSnapshotRef.current = readPositionSnapshot();
        }}
        onNodeDragStop={(node) => {
          updateNodePosition(node);
          rememberPositionSnapshot(dragStartSnapshotRef.current);
          dragStartSnapshotRef.current = null;
        }}
        onInit={(instance) => {
          setFlowInstance(instance);
          void initializeLayout(instance);
        }}
        onAutoLayout={(instance) => void runAutoLayout(instance, true)}>
        <NodeInternalsBridge updateRef={updateNodeInternalsRef} />
      </InfiniteCanvas>
      {editingAsset ? (
        <ImageFlowEditor
          api={api}
          projectId={projectId}
          scriptId={scriptId}
          targetKind="asset"
          asset={editingAsset}
          imageModel={imageModel}
          onClose={() => setEditingAsset(null)}
          onSaved={adoptAsset}
        />
      ) : null}
      {editingStoryboard ? (
        <ImageFlowEditor
          api={api}
          projectId={projectId}
          scriptId={scriptId}
          storyboard={editingStoryboard}
          imageModel={imageModel}
          onClose={() => setEditingStoryboard(null)}
          onSaved={adoptStoryboard}
        />
      ) : null}
      {editingStoryboardInfo ? (
        <div role="dialog" aria-label="编辑分镜信息" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/85 p-6 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveStoryboardInfo();
            }}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <strong className="text-sm">编辑分镜信息</strong>
              <button
                type="button"
                aria-label="关闭分镜信息编辑"
                onClick={() => setEditingStoryboardInfo(null)}
                className="rounded-lg border border-slate-700 p-2">
                <X className="size-4" />
              </button>
            </div>
            <label className="grid gap-2 text-xs text-slate-400">
              画面提示词
              <textarea
                aria-label="画面提示词"
                value={editingStoryboardInfo.prompt}
                onChange={(event) => setEditingStoryboardInfo((current) => (current ? { ...current, prompt: event.target.value } : current))}
                className="h-28 resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <label className="grid gap-2 text-xs text-slate-400">
              镜头描述
              <textarea
                aria-label="镜头描述"
                value={editingStoryboardInfo.videoDesc}
                onChange={(event) => setEditingStoryboardInfo((current) => (current ? { ...current, videoDesc: event.target.value } : current))}
                className="h-24 resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingStoryboardInfo(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">
                取消
              </button>
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500">
                保存分镜信息
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {storyboardPreview ? (
        <div role="dialog" aria-label="分镜合并预览" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/85 p-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-sm">分镜合并预览</strong>
              <button
                type="button"
                aria-label="关闭分镜预览"
                onClick={() => setStoryboardPreview("")}
                className="rounded-lg border border-slate-700 p-2">
                <X className="size-4" />
              </button>
            </div>
            <img src={storyboardPreview} alt="画布分镜合并预览" className="w-full rounded-xl" />
            <a
              href={storyboardPreview}
              download="storyboard-preview.jpg"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500">
              <Download className="size-3.5" />
              下载合并预览
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
