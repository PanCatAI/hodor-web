import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Link2, LoaderCircle, Maximize2, Minus, Move, Plus, Save, Trash2, Unlink, X, ZoomIn, ZoomOut } from "lucide-react";

import type { ProductionApi } from "./production-api";
import type { DerivedAsset, ImageFlowData, ImageFlowEdge, ImageFlowNode, StoryboardItem } from "./types";

interface CommonImageFlowEditorProps {
  api: ProductionApi;
  projectId: number;
  scriptId: number;
  imageModel: string;
  onClose: () => void;
  onSaved: (url: string, flowId: number) => void | Promise<void>;
}

interface StoryboardImageFlowEditorProps extends CommonImageFlowEditorProps {
  targetKind?: "storyboard";
  storyboard: StoryboardItem;
  asset?: never;
}

interface AssetImageFlowEditorProps extends CommonImageFlowEditorProps {
  targetKind: "asset";
  asset: DerivedAsset;
  storyboard?: never;
}

export type ImageFlowEditorProps = StoryboardImageFlowEditorProps | AssetImageFlowEditorProps;

const CANVAS_WIDTH = 2_600;
const CANVAS_HEIGHT = 1_800;
const NODE_WIDTH = 320;
const NODE_HEIGHT = 440;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.5;

let nodeCounter = 0;
function nextId(prefix: string) {
  nodeCounter += 1;
  return `${prefix}-${Date.now()}-${nodeCounter}`;
}

function uploadNode(image: string, index = 0): ImageFlowNode {
  return { id: nextId("upload"), type: "upload", position: { x: 100, y: 100 + index * 360 }, data: { image } };
}

function generatedNode(model: string, prompt: string, index = 0): ImageFlowNode {
  return {
    id: nextId("generated"),
    type: "generated",
    position: { x: 600, y: 100 + index * 520 },
    data: { generatedImage: "", prompt, model, quality: "1K", ratio: "16:9", references: [] },
  };
}

function imageOf(node: ImageFlowNode | undefined) {
  if (!node) return "";
  return node.type === "upload" ? (node.data.image ?? "") : (node.data.generatedImage ?? "");
}

/** References are a projection of explicit incoming edges, never an implicit all-to-all graph. */
export function graphWithSyncedReferences(flow: ImageFlowData): ImageFlowData {
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const edge of flow.edges) {
    const sources = incoming.get(edge.target) ?? [];
    sources.push(edge.source);
    incoming.set(edge.target, sources);
  }
  return {
    ...flow,
    nodes: flow.nodes.map((node) => {
      if (node.type !== "generated") return { ...node, position: { ...node.position }, data: { ...node.data } };
      const references = (incoming.get(node.id) ?? [])
        .map((sourceId) => imageOf(nodeById.get(sourceId)))
        .filter(Boolean)
        .map((image) => ({ image }));
      return { ...node, position: { ...node.position }, data: { ...node.data, references } };
    }),
    edges: flow.edges.map((edge) => ({ ...edge })),
  };
}

/** Deterministic left-to-right layout, only applied by explicit user action. */
export function layoutImageFlow(flow: ImageFlowData): ImageFlowData {
  const indegree = new Map(flow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  const depth = new Map(flow.nodes.map((node) => [node.id, node.type === "generated" ? 1 : 0]));
  for (const edge of flow.edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const queue = flow.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index];
    for (const targetId of outgoing.get(sourceId) ?? []) {
      depth.set(targetId, Math.max(depth.get(targetId) ?? 0, (depth.get(sourceId) ?? 0) + 1));
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) queue.push(targetId);
    }
  }
  const rowByDepth = new Map<number, number>();
  return graphWithSyncedReferences({
    ...flow,
    nodes: flow.nodes.map((node) => {
      const column = depth.get(node.id) ?? (node.type === "generated" ? 1 : 0);
      const row = rowByDepth.get(column) ?? 0;
      rowByDepth.set(column, row + 1);
      return { ...node, position: { x: 100 + column * 500, y: 100 + row * 520 } };
    }),
  });
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "图片工作流操作失败";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function edgePath(source: ImageFlowNode, target: ImageFlowNode) {
  const startX = source.position.x + NODE_WIDTH;
  const startY = source.position.y + 82;
  const endX = target.position.x;
  const endY = target.position.y + 82;
  const bend = Math.max(80, Math.abs(endX - startX) * 0.45);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

function edgeMidpoint(edge: ImageFlowEdge, nodeById: Map<string, ImageFlowNode>) {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  if (!source || !target) return { x: 0, y: 0 };
  return {
    x: (source.position.x + NODE_WIDTH + target.position.x) / 2,
    y: (source.position.y + target.position.y) / 2 + 82,
  };
}

export function ImageFlowEditor(props: ImageFlowEditorProps) {
  const { api, projectId, scriptId, imageModel, onClose, onSaved } = props;
  const targetSelection =
    props.targetKind === "asset" ? { kind: "asset" as const, target: props.asset } : { kind: "storyboard" as const, target: props.storyboard };
  const targetKind = targetSelection.kind;
  const target = targetSelection.target;
  const targetPrompt = target.prompt ?? "";
  const initialFlowId = target.flowId;
  const initialFlow = useMemo<ImageFlowData>(
    () => {
      const reference = target.src ? uploadNode(target.src) : null;
      const generated = generatedNode(imageModel, targetPrompt);
      return graphWithSyncedReferences({
        nodes: [...(reference ? [reference] : []), generated],
        edges: reference ? [{ id: nextId("edge"), source: reference.id, target: generated.id }] : [],
      });
    },
    // The editor is remounted per target. Rebuilding during an edit would discard local graph changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.id, targetKind],
  );
  const [flow, setFlow] = useState<ImageFlowData>(initialFlow);
  const [activeFlowId, setActiveFlowId] = useState<number | undefined>(initialFlowId);
  const [loading, setLoading] = useState(Boolean(initialFlowId));
  const [busyNodeId, setBusyNodeId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectingFrom, setConnectingFrom] = useState("");
  const [selectedResultNodeId, setSelectedResultNodeId] = useState("");
  const [viewport, setViewport] = useState({ x: 40, y: 40, zoom: 1 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialFlowId) return;
    let active = true;
    void api
      .getImageFlow(initialFlowId)
      .then((data) => {
        if (!active || !data) return;
        const normalized = graphWithSyncedReferences(data);
        setFlow(normalized);
        setSelectedResultNodeId([...normalized.nodes].reverse().find((node) => node.type === "generated" && node.data.generatedImage)?.id ?? "");
      })
      .catch((cause) => active && setError(messageOf(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, initialFlowId]);

  const nodeById = useMemo(() => new Map(flow.nodes.map((node) => [node.id, node])), [flow.nodes]);
  const selectedResult = nodeById.get(selectedResultNodeId)?.data.generatedImage ?? "";

  function changeNode(id: string, data: Partial<ImageFlowNode["data"]>) {
    setFlow((current) =>
      graphWithSyncedReferences({
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...data } } : node)),
      }),
    );
  }

  function removeNode(id: string) {
    setConnectingFrom((source) => (source === id ? "" : source));
    setSelectedResultNodeId((selected) => (selected === id ? "" : selected));
    setFlow((current) =>
      graphWithSyncedReferences({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id),
        edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
      }),
    );
  }

  function connectTo(targetId: string) {
    if (!connectingFrom || connectingFrom === targetId) return;
    setFlow((current) => {
      const duplicate = current.edges.some(
        (edge) => (edge.source === connectingFrom && edge.target === targetId) || (edge.source === targetId && edge.target === connectingFrom),
      );
      if (duplicate) return current;
      return graphWithSyncedReferences({
        ...current,
        edges: [...current.edges, { id: nextId("edge"), source: connectingFrom, target: targetId }],
      });
    });
    setConnectingFrom("");
  }

  function disconnect(edgeId: string) {
    setFlow((current) => graphWithSyncedReferences({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }));
  }

  function beginDrag(event: React.PointerEvent, node: ImageFlowNode) {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, position: { ...node.position } };
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) / viewport.zoom;
      const dy = (moveEvent.clientY - start.y) / viewport.zoom;
      setFlow((current) => ({
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                position: {
                  x: Math.round(clamp(start.position.x + dx, 0, CANVAS_WIDTH - NODE_WIDTH)),
                  y: Math.round(clamp(start.position.y + dy, 0, CANVAS_HEIGHT - NODE_HEIGHT)),
                },
              }
            : item,
        ),
      }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const start = { x: event.clientX, y: event.clientY, viewport: { ...viewport } };
    const move = (moveEvent: PointerEvent) =>
      setViewport((current) => ({
        ...current,
        x: start.viewport.x + moveEvent.clientX - start.x,
        y: start.viewport.y + moveEvent.clientY - start.y,
      }));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function changeZoom(delta: number) {
    setViewport((current) => ({ ...current, zoom: clamp(current.zoom + delta, MIN_ZOOM, MAX_ZOOM) }));
  }

  function fitView() {
    if (!flow.nodes.length) return setViewport({ x: 40, y: 40, zoom: 1 });
    const bounds = flow.nodes.reduce(
      (result, node) => ({
        minX: Math.min(result.minX, node.position.x),
        minY: Math.min(result.minY, node.position.y),
        maxX: Math.max(result.maxX, node.position.x + NODE_WIDTH),
        maxY: Math.max(result.maxY, node.position.y + NODE_HEIGHT),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const width = canvasRef.current?.clientWidth || 1_200;
    const height = canvasRef.current?.clientHeight || 700;
    const zoom = clamp(Math.min((width - 96) / (bounds.maxX - bounds.minX), (height - 96) / (bounds.maxY - bounds.minY)), MIN_ZOOM, MAX_ZOOM);
    setViewport({ x: 48 - bounds.minX * zoom, y: 48 - bounds.minY * zoom, zoom });
  }

  async function upload(file: File, generatedTargetId?: string) {
    setError("");
    setNotice("");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      const url = await api.uploadFlowImage(projectId, scriptId, base64);
      if (generatedTargetId) {
        changeNode(generatedTargetId, { generatedImage: url });
        setSelectedResultNodeId(generatedTargetId);
      } else {
        setFlow((current) => {
          const count = current.nodes.filter((node) => node.type === "upload").length;
          return { ...current, nodes: [...current.nodes, uploadNode(url, count)] };
        });
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function generate(node: ImageFlowNode) {
    setBusyNodeId(node.id);
    setError("");
    setNotice("");
    try {
      const normalized = graphWithSyncedReferences(flow);
      const currentNode = normalized.nodes.find((item) => item.id === node.id) ?? node;
      const references = (currentNode.data.references ?? []).map((item) => item.image).filter(Boolean);
      const url = await api.generateFlowImage({
        model: currentNode.data.model || imageModel,
        references,
        quality: currentNode.data.quality || "1K",
        ratio: currentNode.data.ratio || "16:9",
        prompt: currentNode.data.prompt || targetPrompt,
        projectId,
      });
      changeNode(node.id, { generatedImage: url });
      setSelectedResultNodeId(node.id);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyNodeId("");
    }
  }

  async function persistFlow() {
    const normalized = graphWithSyncedReferences(flow);
    let flowId = activeFlowId;
    if (flowId) await api.updateImageFlow(flowId, normalized);
    else {
      flowId = await api.saveImageFlow(normalized);
      if (!flowId) throw new Error("图片工作流没有返回编号");
      setActiveFlowId(flowId);
    }
    setFlow(normalized);
    return flowId;
  }

  async function saveGraph() {
    setBusyNodeId("save");
    setError("");
    setNotice("");
    try {
      await persistFlow();
      setNotice("工作流已保存");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyNodeId("");
    }
  }

  async function adopt() {
    if (!selectedResult) return;
    setBusyNodeId("adopt");
    setError("");
    setNotice("");
    try {
      const flowId = await persistFlow();
      if (targetKind === "storyboard") await api.updateStoryboardImage(target.id, selectedResult, flowId);
      await onSaved(selectedResult, flowId);
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyNodeId("");
    }
  }

  async function closeEditor() {
    if (!activeFlowId) return onClose();
    setBusyNodeId("close");
    setError("");
    setNotice("");
    try {
      await persistFlow();
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusyNodeId("");
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/80">
        <LoaderCircle aria-label="读取图片工作流" className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="图片工作流" className="fixed inset-0 z-50 flex flex-col bg-[#080a0f] text-slate-100">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div>
          <h2 className="font-semibold">{targetKind === "asset" ? "资产图片工作流" : "分镜图片工作流"}</h2>
          <p className="mt-1 text-xs text-slate-500">拖动节点安排画布，点选端口建立连接；参考图只来自当前连线。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">
            <ImagePlus className="mr-1 inline size-3.5" />
            上传参考图
            <input
              aria-label="上传参考图"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setFlow((current) => {
                const count = current.nodes.filter((node) => node.type === "generated").length;
                return { ...current, nodes: [...current.nodes, generatedNode(imageModel, targetPrompt, count)] };
              })
            }
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">
            <Plus className="mr-1 inline size-3.5" />
            新增生成节点
          </button>
          <button
            type="button"
            onClick={() => setFlow((current) => layoutImageFlow(current))}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500">
            自动布局
          </button>
          <span className="mx-1 h-6 w-px bg-slate-800" />
          <button type="button" aria-label="缩小画布" onClick={() => changeZoom(-0.1)} className="rounded-lg border border-slate-700 p-2">
            <ZoomOut className="size-4" />
          </button>
          <span className="w-10 text-center text-xs text-slate-500">{Math.round(viewport.zoom * 100)}%</span>
          <button type="button" aria-label="放大画布" onClick={() => changeZoom(0.1)} className="rounded-lg border border-slate-700 p-2">
            <ZoomIn className="size-4" />
          </button>
          <button type="button" aria-label="适应画布" onClick={fitView} className="rounded-lg border border-slate-700 p-2">
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void closeEditor()}
            disabled={Boolean(busyNodeId)}
            aria-label="关闭图片工作流"
            className="rounded-lg border border-slate-700 p-2 disabled:opacity-50">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mx-5 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mx-5 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}
      {connectingFrom ? (
        <div
          role="status"
          className="mx-5 mt-3 flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
          <span>正在从 {connectingFrom} 连线，请点击生成节点左侧端口。</span>
          <button type="button" onClick={() => setConnectingFrom("")} className="underline">
            取消连线
          </button>
        </div>
      ) : null}

      <div
        ref={canvasRef}
        data-testid="image-flow-canvas"
        className="relative m-4 flex-1 cursor-grab overflow-hidden rounded-xl border border-slate-800 bg-[#0d1119] active:cursor-grabbing"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(100,116,139,.32) 1px, transparent 1px)",
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onPointerDown={beginPan}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(event.deltaY < 0 ? 0.08 : -0.08);
        }}>
        <div
          className="absolute left-0 top-0"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}>
          <svg aria-label="工作流连线" className="pointer-events-none absolute inset-0 overflow-visible" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
            {flow.edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const targetNode = nodeById.get(edge.target);
              return source && targetNode ? (
                <path key={edge.id} d={edgePath(source, targetNode)} fill="none" stroke="#3b82f6" strokeWidth="3" />
              ) : null;
            })}
          </svg>

          {flow.edges.map((edge) => {
            const midpoint = edgeMidpoint(edge, nodeById);
            return (
              <button
                key={edge.id}
                type="button"
                aria-label={`断开 ${edge.source} 到 ${edge.target}`}
                title={`${edge.source} → ${edge.target}`}
                onClick={() => disconnect(edge.id)}
                className="absolute z-20 grid size-7 place-items-center rounded-full border border-blue-400/50 bg-slate-950 text-blue-300 shadow-lg hover:bg-red-950 hover:text-red-300"
                style={{ left: midpoint.x - 14, top: midpoint.y - 14 }}>
                <Unlink className="size-3.5" />
              </button>
            );
          })}

          {flow.nodes.map((node) => {
            const isSelected = node.id === selectedResultNodeId;
            return (
              <article
                key={node.id}
                data-testid={`image-flow-node-${node.id}`}
                className={`absolute z-10 w-80 overflow-hidden rounded-xl border bg-slate-950 shadow-2xl ${isSelected ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-700"}`}
                style={{ left: node.position.x, top: node.position.y }}>
                <header className="flex h-12 items-center justify-between border-b border-slate-800 px-3">
                  {node.type === "generated" ? (
                    <button
                      type="button"
                      aria-label={`连接到 ${node.id}`}
                      disabled={!connectingFrom || connectingFrom === node.id}
                      onClick={() => connectTo(node.id)}
                      className="-ml-5 grid size-7 place-items-center rounded-full border border-blue-400 bg-slate-950 text-blue-300 disabled:border-slate-700 disabled:text-slate-700">
                      <Link2 className="size-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    aria-label={`拖动节点 ${node.id}`}
                    onPointerDown={(event) => beginDrag(event, node)}
                    className="flex flex-1 cursor-grab items-center justify-center gap-2 text-xs font-medium text-slate-300 active:cursor-grabbing">
                    <Move className="size-3.5" />
                    {node.type === "upload" ? "参考图" : "图片生成"}
                  </button>
                  <button
                    type="button"
                    aria-label={`从 ${node.id} 开始连线`}
                    onClick={() => setConnectingFrom(node.id)}
                    className="grid size-7 place-items-center rounded-full border border-blue-400 bg-slate-950 text-blue-300">
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除节点 ${node.id}`}
                    onClick={() => removeNode(node.id)}
                    className="ml-2 rounded p-1 text-slate-600 hover:text-red-400">
                    <Trash2 className="size-4" />
                  </button>
                </header>

                {node.type === "upload" ? (
                  <div className="p-3">
                    {node.data.image ? (
                      <img
                        src={node.data.image}
                        alt={`工作流参考图 ${node.data.image}`}
                        draggable={false}
                        className="aspect-square w-full rounded-lg bg-slate-900 object-contain"
                      />
                    ) : (
                      <div className="grid aspect-square place-items-center rounded-lg bg-slate-900 text-xs text-slate-600">等待上传</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 p-3">
                    <div className="relative">
                      {node.data.generatedImage ? (
                        <img
                          src={node.data.generatedImage}
                          alt="工作流生成结果"
                          draggable={false}
                          className="aspect-video w-full rounded-lg bg-slate-900 object-contain"
                        />
                      ) : (
                        <div className="grid aspect-video place-items-center rounded-lg bg-slate-900 text-xs text-slate-600">等待生成</div>
                      )}
                      {isSelected ? (
                        <span className="absolute right-2 top-2 rounded-full bg-emerald-500 p-1 text-black">
                          <Check className="size-3.5" />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-h-10 gap-1 overflow-x-auto rounded-lg bg-slate-900 p-1.5">
                      {(node.data.references ?? []).length ? (
                        (node.data.references ?? []).map((reference, index) => (
                          <img key={`${reference.image}-${index}`} src={reference.image} alt="已连接参考图" className="size-9 rounded object-cover" />
                        ))
                      ) : (
                        <span className="self-center px-1 text-[10px] text-slate-600">没有连接参考图</span>
                      )}
                    </div>
                    <textarea
                      aria-label="生成提示词"
                      value={node.data.prompt ?? ""}
                      onChange={(event) => changeNode(node.id, { prompt: event.target.value })}
                      placeholder={targetPrompt}
                      className="h-20 w-full resize-none rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs outline-none focus:border-blue-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        aria-label="图片模型"
                        value={node.data.model || imageModel}
                        onChange={(event) => changeNode(node.id, { model: event.target.value })}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs"
                      />
                      <select
                        aria-label="图片质量"
                        value={node.data.quality || "1K"}
                        onChange={(event) => changeNode(node.id, { quality: event.target.value })}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 text-xs">
                        <option>1K</option>
                        <option>2K</option>
                        <option>4K</option>
                      </select>
                      <select
                        aria-label="图片比例"
                        value={node.data.ratio || "16:9"}
                        onChange={(event) => changeNode(node.id, { ratio: event.target.value })}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 text-xs">
                        <option>16:9</option>
                        <option>9:16</option>
                        <option>1:1</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                      <label className="cursor-pointer rounded-lg border border-slate-700 px-2 py-2 text-center text-[11px] hover:border-slate-500">
                        上传结果
                        <input
                          aria-label={`上传结果 ${node.id}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0], node.id)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void generate(node)}
                        disabled={busyNodeId === node.id}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs disabled:opacity-50">
                        {busyNodeId === node.id ? "生成中" : "生成工作流图片"}
                      </button>
                      <button
                        type="button"
                        aria-label={`选择结果 ${node.id}`}
                        disabled={!node.data.generatedImage}
                        onClick={() => setSelectedResultNodeId(node.id)}
                        className="rounded-lg border border-emerald-500/50 px-2 py-2 text-xs text-emerald-300 disabled:border-slate-800 disabled:text-slate-700">
                        选择
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <footer className="flex min-h-16 items-center justify-between gap-3 border-t border-slate-800 bg-[#080a0f]/95 px-5 py-3">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Minus className="size-3" />
          {flow.nodes.length} 个节点 · {flow.edges.length} 条连线 · {activeFlowId ? `工作流 #${activeFlowId}` : "新工作流"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void saveGraph()}
            disabled={Boolean(busyNodeId)}
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm disabled:opacity-50">
            <Save className="size-4" />
            {busyNodeId === "save" ? "保存中" : "保存工作流"}
          </button>
          <button
            type="button"
            onClick={() => void adopt()}
            disabled={!selectedResult || Boolean(busyNodeId)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:bg-slate-800 disabled:text-slate-500">
            <Check className="size-4" />
            {busyNodeId === "adopt" ? "采用中" : "采用并保存"}
          </button>
        </div>
      </footer>
    </div>
  );
}
