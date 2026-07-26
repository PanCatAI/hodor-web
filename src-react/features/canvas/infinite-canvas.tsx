import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Maximize2, Redo2, Search, Undo2, Workflow, X } from "lucide-react";
import "@xyflow/react/dist/style.css";

export type CanvasWheelEvent = "zoom" | "scroll";

export interface InfiniteCanvasProps<TNode extends Node = Node> {
  nodes: TNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<TNode>;
  nodeTypes?: NodeTypes;
  children?: ReactNode;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  ariaLabel: string;
  testId: string;
  onNodeClick?: (node: TNode) => void;
  onNodeDoubleClick?: (node: TNode) => void;
  onNodeDragStart?: (node: TNode) => void;
  onNodeDragStop?: (node: TNode) => void;
  onInit?: (instance: ReactFlowInstance<TNode>) => void;
  onAutoLayout?: (instance: ReactFlowInstance<TNode> | null) => void | Promise<void>;
  getNodeLabel?: (node: TNode) => string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  showMiniMap?: boolean;
}

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

export function readCanvasWheelEvent(storage: Pick<Storage, "getItem"> = globalThis.localStorage): CanvasWheelEvent {
  const direct = storage.getItem("canvasWheelEvent");
  if (direct === "zoom" || direct === "scroll") return direct;

  try {
    const legacy = JSON.parse(storage.getItem("setting") ?? "null") as { canvasWheelEvent?: unknown } | null;
    if (legacy?.canvasWheelEvent === "zoom" || legacy?.canvasWheelEvent === "scroll") return legacy.canvasWheelEvent;
  } catch {
    // Keep the production canvas default when the legacy value is malformed.
  }
  return "zoom";
}

export function InfiniteCanvas<TNode extends Node>({
  nodes,
  edges,
  onNodesChange,
  nodeTypes,
  children,
  leadingControls,
  trailingControls,
  ariaLabel,
  testId,
  onNodeClick,
  onNodeDoubleClick,
  onNodeDragStart,
  onNodeDragStop,
  onInit,
  onAutoLayout,
  getNodeLabel,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  showMiniMap = false,
}: InfiniteCanvasProps<TNode>) {
  const [spacePressed, setSpacePressed] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [canvasWheelEvent, setCanvasWheelEvent] = useState<CanvasWheelEvent>(() => readCanvasWheelEvent());
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<TNode> | null>(null);
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
  const [nodeQuery, setNodeQuery] = useState("");
  const interactionTimerRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const spacePanRef = useRef<{ startX: number; startY: number; viewportX: number; viewportY: number; zoom: number } | null>(null);
  const matchingNodes = useMemo(() => {
    const query = nodeQuery.trim().toLocaleLowerCase();
    if (!query || !getNodeLabel) return nodes;
    return nodes.filter((node) => getNodeLabel(node).toLocaleLowerCase().includes(query));
  }, [getNodeLabel, nodeQuery, nodes]);

  useEffect(() => {
    function syncCanvasWheelEvent(event: StorageEvent) {
      if (event.key && event.key !== "canvasWheelEvent" && event.key !== "setting") return;
      setCanvasWheelEvent(readCanvasWheelEvent());
    }
    window.addEventListener("storage", syncCanvasWheelEvent);
    return () => window.removeEventListener("storage", syncCanvasWheelEvent);
  }, []);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    }
    function handleCanvasShortcut(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLocaleLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo?.();
        else onUndo?.();
        return;
      }
      if (modifier && event.key.toLocaleLowerCase() === "y") {
        event.preventDefault();
        onRedo?.();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setNodeSearchOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      if (event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        void flowInstance?.fitView({ duration: 250, padding: 0.12 });
      }
    }
    document.addEventListener("keydown", handleCanvasShortcut);
    return () => document.removeEventListener("keydown", handleCanvasShortcut);
  }, [flowInstance, onRedo, onUndo]);

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

  useEffect(
    () => () => {
      window.clearTimeout(interactionTimerRef.current);
    },
    [],
  );

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

  function locateNode(node: TNode) {
    void flowInstance?.fitView({ nodes: [node], duration: 280, padding: 1.4, maxZoom: 1.25 });
    setNodeSearchOpen(false);
    setNodeQuery("");
  }

  return (
    <section className="relative h-full min-h-0">
      <div className="absolute left-0 top-[10px] z-30 flex items-center gap-2">
        {leadingControls}
        <button
          type="button"
          title="自动布局"
          aria-label="自动布局"
          onClick={() => void onAutoLayout?.(flowInstance)}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900"
        >
          <Workflow className="size-4" />
        </button>
        {trailingControls}
      </div>
      <div className="absolute left-1/2 top-[10px] z-40 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          title="撤销位置（⌘/Ctrl+Z）"
          aria-label="撤销位置"
          disabled={!canUndo}
          onClick={onUndo}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-35">
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          title="重做位置（⇧⌘/Ctrl+Z）"
          aria-label="重做位置"
          disabled={!canRedo}
          onClick={onRedo}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-35">
          <Redo2 className="size-4" />
        </button>
        <button
          type="button"
          title="查找节点（/）"
          aria-label="查找节点"
          onClick={() => {
            setNodeSearchOpen((current) => !current);
            window.requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900">
          <Search className="size-4" />
        </button>
        <button
          type="button"
          title="概览全图（F）"
          aria-label="概览全图"
          onClick={() => void flowInstance?.fitView({ duration: 250, padding: 0.12 })}
          className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900">
          <Maximize2 className="size-4" />
        </button>
      </div>
      {nodeSearchOpen ? (
        <div className="absolute left-1/2 top-14 z-50 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/98 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-800 p-2">
            <Search className="size-4 shrink-0 text-slate-500" />
            <input
              ref={searchInputRef}
              type="search"
              aria-label="查找画布节点"
              value={nodeQuery}
              onChange={(event) => setNodeQuery(event.target.value)}
              placeholder="输入节点名称"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
            <button
              type="button"
              aria-label="关闭节点查找"
              onClick={() => setNodeSearchOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {matchingNodes.length ? (
              matchingNodes.map((node) => {
                const label = getNodeLabel?.(node) || node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    aria-label={`定位到 ${label}`}
                    onClick={() => locateNode(node)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">
                    <span>{label}</span>
                    <span className="font-mono text-[10px] text-slate-600">{node.id}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-xs text-slate-500">没有匹配节点</div>
            )}
          </div>
        </div>
      ) : null}
      <div
        data-testid={testId}
        data-interacting={isInteracting ? "true" : "false"}
        aria-label={ariaLabel}
        onMouseDown={beginSpacePan}
        className={`relative h-full min-h-0 overflow-hidden bg-slate-950 ${spacePressed ? "cursor-grab" : "cursor-default"}`}
      >
        <ReactFlow<TNode>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick ? (_event, node) => onNodeClick(node) : undefined}
          onNodeDoubleClick={onNodeDoubleClick ? (_event, node) => onNodeDoubleClick(node) : undefined}
          onNodeDragStart={(_event, node) => {
            beginInteraction();
            onNodeDragStart?.(node);
          }}
          onNodeDragStop={(_event, node) => {
            onNodeDragStop?.(node);
            endInteraction();
          }}
          onMoveStart={beginInteraction}
          onMoveEnd={endInteraction}
          onInit={(instance) => {
            setFlowInstance(instance);
            onInit?.(instance);
          }}
          nodeTypes={nodeTypes as Record<string, (props: NodeProps) => ReactNode> | undefined}
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
          colorMode="dark"
        >
          {children}
          <Background />
          {showMiniMap ? (
            <div data-testid="canvas-minimap">
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                className="!rounded-xl !border !border-slate-700 !bg-slate-950/90"
                nodeColor="#334155"
                maskColor="rgba(2, 6, 23, 0.72)"
              />
            </div>
          ) : null}
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}
