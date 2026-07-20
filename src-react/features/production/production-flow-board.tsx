import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, BaseEdge, Controls, getBezierPath, MiniMap, ReactFlow, useNodesState } from "@xyflow/react";
import type { EdgeProps, Node, NodeProps, ReactFlowInstance } from "@xyflow/react";
import { Focus, LoaderCircle, Map as MapIcon, Save, Sparkles } from "lucide-react";
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
  onChange?: (data: ProductionFlowData) => void;
  onOpenWorkbench?: () => void;
}

type ProductionNode = Node<ProductionNodeData, "production">;

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

function ProductionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 });
  return (
    <g data-testid={`flow-edge-${id}`} data-edge-id={id}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
    </g>
  );
}

function createNodes(flow: ProductionFlowData, handlers: ProductionNodeHandlers): ProductionNode[] {
  const layout = mergeProductionLayout(flow.layout);
  return productionNodeOrder.map((id) => ({
    id,
    type: "production",
    position: layout[id],
    dragHandle: ".production-node-drag-handle",
    selectable: true,
    focusable: true,
    initialWidth: id === "storyboard" ? 780 : id === "assets" ? 680 : id === "storyboardTable" ? 620 : id === "workbench" ? 420 : 560,
    initialHeight: id === "assets" ? 620 : id === "storyboard" ? 540 : id === "workbench" ? 330 : id === "storyboardTable" ? 410 : 360,
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
  onChange,
  onOpenWorkbench,
}: ProductionFlowBoardProps) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingAsset, setEditingAsset] = useState<DerivedAsset | null>(null);
  const [editingStoryboard, setEditingStoryboard] = useState<StoryboardItem | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ProductionNode> | null>(null);
  const identityRef = useRef(`${projectId}:${scriptId}`);
  const mountedRef = useRef(false);

  const changeText = useCallback((field: "script" | "scriptPlan" | "storyboardTable", value: string) => {
    setData((current) => ({ ...current, [field]: value }));
  }, []);

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

  const handlers = useMemo<ProductionNodeHandlers>(
    () => ({
      onTextChange: changeText,
      onGenerateAsset: (id) => void generate(id),
      onRemoveAsset: (id) => void remove(id),
      onEditAsset: setEditingAsset,
      onEditStoryboard: setEditingStoryboard,
      onOpenWorkbench: openWorkbench,
    }),
    [changeText, generate, openWorkbench, remove],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ProductionNode>(createNodes(initialData, handlers));
  const edges = useMemo(() => productionEdges(), []);
  const nodeTypes = useMemo(() => ({ production: ProductionFlowNode as (props: NodeProps) => React.ReactNode }), []);
  const edgeTypes = useMemo(() => ({ production: ProductionEdge }), []);

  useEffect(() => {
    const identity = `${projectId}:${scriptId}`;
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    mountedRef.current = false;
    setData(initialData);
    setNodes(createNodes(initialData, handlers));
  }, [handlers, initialData, projectId, scriptId, setNodes]);

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
    onChange?.(data);
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

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      await api.saveFlowData(projectId, scriptId, data);
      setNotice("产线图已保存");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function updateNodePosition(node: ProductionNode) {
    const id = node.id as ProductionFlowNodeId;
    const position = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    setNodes((current) => current.map((item) => (item.id === id ? { ...item, position, data: { ...item.data, position } } : item)));
    setData((current) => ({ ...current, layout: { ...mergeProductionLayout(current.layout), [id]: position } }));
  }

  function autoLayout() {
    const layout = productionAutoLayout();
    setNodes((current) =>
      applyProductionLayout(current, layout).map((node) => ({ ...node, data: { ...node.data, position: layout[node.id as ProductionFlowNodeId] } })),
    );
    setData((current) => ({ ...current, layout }));
    window.requestAnimationFrame(() => void flowInstance?.fitView({ padding: 0.12, duration: 420, maxZoom: 0.9 }));
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

  return (
    <section className="space-y-3" aria-label="生产流图">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">产线无限画布</h2>
          <p className="mt-1 text-xs text-slate-500">滚轮缩放，拖动空白处平移；按住空格可从节点上拖动画布。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void flowInstance?.fitView({ padding: 0.12, duration: 320, maxZoom: 0.9 })}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">
            <Focus className="size-3.5" />
            适应画布
          </button>
          <button
            type="button"
            onClick={autoLayout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">
            <MapIcon className="size-3.5" />
            自动布局
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs hover:bg-blue-500 disabled:opacity-50">
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}保存产线图
          </button>
        </div>
      </div>
      {notice ? (
        <div role="status" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
          {notice}
        </div>
      ) : null}
      <div
        data-testid="production-infinite-canvas"
        aria-label="可拖动生产流程"
        className={`relative h-[72vh] min-h-[680px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 ${spacePressed ? "cursor-grabbing" : "cursor-default"}`}>
        <ReactFlow<ProductionNode>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_event, node) => updateNodePosition(node)}
          onInit={setFlowInstance}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={!spacePressed}
          nodesConnectable={false}
          elementsSelectable={!spacePressed}
          panOnDrag={[0, 1, 2]}
          panActivationKeyCode="Space"
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={10}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }}
          onlyRenderVisibleElements={false}
          proOptions={{ hideAttribution: true }}
          colorMode="dark">
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#334155" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => (node.id === "assets" ? "#f59e0b" : node.id === "workbench" ? "#22c55e" : "#3b82f6")}
            maskColor="rgba(2, 6, 23, .76)"
            className="!border !border-slate-700 !bg-slate-950"
          />
          <Controls showInteractive={false} className="!overflow-hidden !rounded-lg !border !border-slate-700 !bg-slate-950" />
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/85 px-3 py-1.5 text-[10px] text-slate-400 backdrop-blur">
            <Sparkles className="size-3 text-blue-400" />
            主链与资产分支使用固定合同连线
          </div>
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
    </section>
  );
}
