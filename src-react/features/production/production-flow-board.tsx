import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Background, Controls, ReactFlow, useNodesState, useUpdateNodeInternals } from "@xyflow/react";
import type { Node, NodeProps, ReactFlowInstance } from "@xyflow/react";
import { Download, Workflow, X } from "lucide-react";
import "@xyflow/react/dist/style.css";

import { ImageFlowEditor } from "./image-flow-editor";
import type { ProductionApi } from "./production-api";
import type { DerivedAsset, ProductionFlowData, StoryboardItem } from "./types";
import { ProductionFlowNode } from "./production-flow-nodes";
import type { ProductionNodeData, ProductionNodeHandlers } from "./production-flow-nodes";
import { applyProductionLayout, mergeProductionLayout, productionAutoLayout, productionEdges, productionNodeOrder } from "./production-flow-layout";
import type { ProductionFlowNodeId } from "./production-flow-layout";

// React Flow relies on ResizeObserver. The desktop/browser runtime provides it;
// this fallback keeps server rendering and DOM-only test environments usable.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const element = target as HTMLElement;
      const width = Number.parseFloat(element.style.width) || 500;
      const height = Number.parseFloat(element.style.height) || 500;
      if (!element.offsetWidth) Object.defineProperty(element, "offsetWidth", { configurable: true, value: width });
      if (!element.offsetHeight) Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
    }
    unobserve() {}
    disconnect() {}
  };
}

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
  onOpenWorkbench?: () => void;
}

type ProductionNode = Node<ProductionNodeData, "production">;

export type CanvasWheelEvent = "zoom" | "scroll";

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

export function readCanvasWheelEvent(storage: Pick<Storage, "getItem"> = globalThis.localStorage): CanvasWheelEvent {
  const direct = storage.getItem("canvasWheelEvent");
  if (direct === "zoom" || direct === "scroll") return direct;

  try {
    const legacy = JSON.parse(storage.getItem("setting") ?? "null") as { canvasWheelEvent?: unknown } | null;
    if (legacy?.canvasWheelEvent === "zoom" || legacy?.canvasWheelEvent === "scroll") return legacy.canvasWheelEvent;
  } catch {
    // Keep the upstream default when the legacy Pinia value is malformed.
  }
  return "zoom";
}

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
  const map = new Map(updates.map((item) => [item.id, item]));
  return {
    ...data,
    assets: data.assets.map((asset) => ({
      ...asset,
      derive: asset.derive.map((item) => {
        const update = map.get(item.id);
        return update ? { ...item, ...update, src: update.src || item.src } : item;
      }),
    })),
  };
}

function updateStoryboard(data: ProductionFlowData, update: StoryboardItem) {
  return { ...data, storyboard: data.storyboard.map((item) => (item.id === update.id ? { ...item, ...update, src: update.src || item.src } : item)) };
}

function updateStoryboards(current: StoryboardItem[], updates: StoryboardItem[]) {
  const map = new Map(updates.map((item) => [item.id, item]));
  return current.map((item) => {
    const update = map.get(item.id);
    return update
      ? {
          ...item,
          ...update,
          index: update.index ?? item.index,
          prompt: update.prompt || item.prompt,
          videoDesc: update.videoDesc || item.videoDesc,
          src: update.src || item.src,
        }
      : item;
  });
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
  onOpenWorkbench,
}: ProductionFlowBoardProps) {
  const [data, setData] = useState(initialData);
  const [notice, setNotice] = useState("");
  const [editingAsset, setEditingAsset] = useState<DerivedAsset | null>(null);
  const [editingStoryboard, setEditingStoryboard] = useState<StoryboardItem | null>(null);
  const [editingStoryboardInfo, setEditingStoryboardInfo] = useState<StoryboardItem | null>(null);
  const [selectedStoryboardIds, setSelectedStoryboardIds] = useState<number[]>([]);
  const [generatingStoryboards, setGeneratingStoryboards] = useState(false);
  const [storyboardPreview, setStoryboardPreview] = useState("");
  const [spacePressed, setSpacePressed] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [canvasWheelEvent, setCanvasWheelEvent] = useState<CanvasWheelEvent>(() => readCanvasWheelEvent());
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ProductionNode> | null>(null);
  const identityRef = useRef(`${projectId}:${scriptId}`);
  const revisionRef = useRef(externalRevision);
  const interactionTimerRef = useRef(0);
  const initializationRunRef = useRef(0);
  const layoutRunRef = useRef(0);
  const layoutCompletedRef = useRef("");
  const mountedRef = useRef(false);
  const spacePanRef = useRef<{ startX: number; startY: number; viewportX: number; viewportY: number; zoom: number } | null>(null);
  const updateNodeInternalsRef = useRef<ReturnType<typeof useUpdateNodeInternals> | null>(null);

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

  const openWorkbench = useCallback(() => {
    onOpenWorkbench?.();
  }, [onOpenWorkbench]);

  const toggleStoryboard = useCallback((id: number) => {
    setSelectedStoryboardIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const selectAllStoryboards = useCallback(() => {
    setSelectedStoryboardIds(data.storyboard.map((item) => item.id));
  }, [data.storyboard]);

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
        setData((current) => ({ ...current, storyboard: updateStoryboards(current.storyboard, updates) }));
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
        const referenceIndex = data.storyboard.findIndex((item) => item.id === referenceId);
        const insertionIndex = Math.max(0, referenceIndex + (placement === "after" ? 1 : 0));
        const storyboard = [...data.storyboard];
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
        const nextFlow = { ...data, storyboard: storyboard.map((item, index) => ({ ...item, index })) };
        setData(nextFlow);
        await api.saveFlowData(projectId, scriptId, nextFlow);
      } catch (error) {
        setNotice(`新增分镜失败：${errorMessage(error)}`);
      }
    },
    [api, data, projectId, scriptId],
  );

  const previewStoryboards = useCallback(async () => {
    const ids = data.storyboard.filter((item) => item.src).map((item) => item.id);
    if (!ids.length) return;
    setNotice("");
    try {
      setStoryboardPreview(await api.previewStoryboards(ids));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [api, data.storyboard]);

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
      onDeleteStoryboards: (ids) => void deleteStoryboards(ids),
      onInsertStoryboard: (id, placement) => void insertStoryboard(id, placement),
      onPreviewStoryboards: () => void previewStoryboards(),
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
      openWorkbench,
      previewStoryboards,
      remove,
      selectAllStoryboards,
      selectedStoryboardIds,
      toggleStoryboard,
    ],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ProductionNode>(createNodes(initialData, handlers));
  const edges = useMemo(() => productionEdges(), []);
  const nodeTypes = useMemo(() => ({ production: ProductionFlowNode as (props: NodeProps) => React.ReactNode }), []);

  useEffect(() => {
    function syncCanvasWheelEvent(event: StorageEvent) {
      if (event.key && event.key !== "canvasWheelEvent" && event.key !== "setting") return;
      setCanvasWheelEvent(readCanvasWheelEvent());
    }
    window.addEventListener("storage", syncCanvasWheelEvent);
    return () => window.removeEventListener("storage", syncCanvasWheelEvent);
  }, []);

  useEffect(() => {
    const identity = `${projectId}:${scriptId}`;
    const identityChanged = identityRef.current !== identity;
    const revisionChanged = revisionRef.current !== externalRevision;
    if (!identityChanged && !revisionChanged) return;
    identityRef.current = identity;
    initializationRunRef.current += 1;
    layoutRunRef.current += 1;
    layoutCompletedRef.current = "";
    revisionRef.current = externalRevision;
    mountedRef.current = false;
    setData(initialData);
    if (identityChanged) {
      setSelectedStoryboardIds([]);
      setStoryboardPreview("");
    }
    setNodes(createNodes(initialData, handlers));
  }, [externalRevision, handlers, initialData, projectId, scriptId, setNodes]);

  useEffect(() => {
    if (flowInstance) void initializeLayout(flowInstance);
  }, [externalRevision, projectId, scriptId]);

  useEffect(
    () => () => {
      window.clearTimeout(interactionTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...handlers, id: node.id as ProductionFlowNodeId, position: node.position, flow: data },
      })),
    );
  }, [data, handlers, setNodes]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onChange?.(data, revisionRef.current);
  }, [data, onChange]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    }
    function keyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;
      event.preventDefault();
      setSpacePressed(true);
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpacePressed(false);
    }
    function release() {
      setSpacePressed(false);
    }
    document.addEventListener("keydown", keyDown);
    document.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
    };
  }, []);

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
        .then((updates) => setData((current) => ({ ...current, storyboard: updateStoryboards(current.storyboard, updates) })))
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

  function beginInteraction() {
    window.clearTimeout(interactionTimerRef.current);
    setIsInteracting(true);
  }

  function endInteraction() {
    window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => setIsInteracting(false), 150);
  }

  function moveSpacePan(event: MouseEvent) {
    const origin = spacePanRef.current;
    if (!origin || !flowInstance) return;
    void flowInstance.setViewport({
      x: origin.viewportX + event.clientX - origin.startX,
      y: origin.viewportY + event.clientY - origin.startY,
      zoom: origin.zoom,
    });
  }

  function endSpacePan() {
    spacePanRef.current = null;
    document.removeEventListener("mousemove", moveSpacePan);
    document.removeEventListener("mouseup", endSpacePan);
    endInteraction();
  }

  function beginSpacePan(event: React.MouseEvent<HTMLDivElement>) {
    if (!spacePressed || event.button !== 0 || !flowInstance) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = flowInstance.getViewport();
    spacePanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
      zoom: viewport.zoom,
    };
    beginInteraction();
    document.addEventListener("mousemove", moveSpacePan);
    document.addEventListener("mouseup", endSpacePan, { once: true });
  }

  function applyAutoLayout(instance = flowInstance, measuredNodes = instance?.getNodes() ?? nodes) {
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
    window.requestAnimationFrame(() => void instance?.fitView({ duration: 300 }));
  }

  async function runAutoLayout(instance = flowInstance) {
    if (!instance) return false;
    const run = ++layoutRunRef.current;
    const nodeIds = instance.getNodes().map((node) => node.id);
    const measuredNodes = await waitForStableNodeMeasurements({
      nodeIds,
      forceMeasure: (ids) => updateNodeInternalsRef.current?.(ids),
      getNodes: () => instance.getNodes(),
    });
    if (run !== layoutRunRef.current) return false;
    applyAutoLayout(instance, measuredNodes);
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
    if (await runAutoLayout(instance)) layoutCompletedRef.current = layoutKey;
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
    <section className="relative h-full min-h-0" aria-label="生产流图">
      <div className="absolute left-0 top-[10px] z-30 flex items-center gap-2">
        {leadingControls}
        <button
          type="button"
          title="自动布局"
          aria-label="自动布局"
          onClick={() => void runAutoLayout()}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900">
          <Workflow className="size-4" />
        </button>
        {trailingControls}
      </div>
      {notice ? (
        <div
          role="status"
          className="absolute left-1/2 top-32 z-30 -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 shadow-xl">
          {notice}
        </div>
      ) : null}
      <div
        data-testid="production-infinite-canvas"
        data-interacting={isInteracting ? "true" : "false"}
        aria-label="可拖动生产流程"
        onMouseDown={beginSpacePan}
        className={`relative h-full min-h-0 overflow-hidden bg-slate-950 ${spacePressed ? "cursor-grab" : "cursor-default"}`}>
        <ReactFlow<ProductionNode>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStart={beginInteraction}
          onNodeDragStop={(_event, node) => {
            updateNodePosition(node);
            endInteraction();
          }}
          onMoveStart={beginInteraction}
          onMoveEnd={endInteraction}
          onInit={(instance) => {
            setFlowInstance(instance);
            void initializeLayout(instance);
          }}
          nodeTypes={nodeTypes}
          nodesDraggable={!spacePressed}
          nodesConnectable={!spacePressed}
          elementsSelectable={!spacePressed}
          panOnDrag
          panActivationKeyCode={null}
          zoomActivationKeyCode={null}
          panOnScroll={canvasWheelEvent === "scroll"}
          zoomOnScroll={canvasWheelEvent === "zoom"}
          zoomOnPinch
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={10}
          fitView
          onlyRenderVisibleElements={false}
          nodesFocusable={false}
          edgesFocusable={false}
          edgesReconnectable={false}
          elevateEdgesOnSelect={false}
          selectNodesOnDrag={false}
          autoPanOnNodeDrag={false}
          autoPanOnConnect={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={{ hideAttribution: true }}
          colorMode="dark">
          <NodeInternalsBridge updateRef={updateNodeInternalsRef} />
          <Background />
          <Controls />
        </ReactFlow>
      </div>
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
