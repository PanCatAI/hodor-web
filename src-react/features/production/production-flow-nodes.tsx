import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ArrowRight, Box, BoxIcon, Copy, Download, Expand, ImageIcon, LoaderCircle, Pencil, Play, Plus, Trash2, X } from "lucide-react";

import type {
  DerivedAsset,
  ProductionAsset,
  ProductionFlowData,
  ProductionStageTarget,
  ProductionState,
  ProductionWorkbenchView,
  StoryboardItem,
} from "./types";
import type { ProductionFlowNodeId } from "./production-flow-layout";
import { ProductionTextNodeEditor } from "./production-text-node-editor";

export interface ProductionNodeHandlers {
  onTextChange: (field: "script" | "scriptPlan" | "storyboardTable", value: string) => void;
  onGenerateAsset: (assetId: number) => void;
  onRemoveAsset: (assetId: number) => void;
  onEditAsset: (asset: DerivedAsset) => void;
  onEditStoryboard: (storyboard: StoryboardItem) => void;
  onEditStoryboardInfo: (storyboard: StoryboardItem) => void;
  selectedStoryboardIds: number[];
  generatingStoryboards: boolean;
  onToggleStoryboard: (id: number) => void;
  onSelectAllStoryboards: () => void;
  onClearStoryboardSelection: () => void;
  onGenerateStoryboards: () => void;
  onDeleteStoryboards: (ids: number[]) => void;
  onInsertStoryboard: (referenceId: number, placement: "before" | "after") => void;
  onPreviewStoryboards: () => void;
  onOpenDirectorDesk: (storyboardId: number) => void;
  onOpenStage: (stage: ProductionStageTarget) => void;
  onOpenWorkbench: (view: ProductionWorkbenchView) => void;
}

export interface ProductionNodeData extends Record<string, unknown>, ProductionNodeHandlers {
  id: ProductionFlowNodeId;
  position: { x: number; y: number };
  flow: ProductionFlowData;
}

function stateLabel(state: DerivedAsset["state"] | StoryboardItem["state"]) {
  if (state === "running") return "生成中";
  if (state === "completed") return "已完成";
  if (state === "failed") return "生成失败";
  return "未生成";
}

const stageStatusContent: Record<ProductionState, { label: string; className: string }> = {
  idle: { label: "未生成", className: "border-slate-600 bg-slate-900 text-slate-400" },
  running: { label: "生成中", className: "border-blue-500/40 bg-blue-500/10 text-blue-300" },
  completed: { label: "已完成", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  failed: { label: "生成失败", className: "border-red-500/40 bg-red-500/10 text-red-300" },
};

function aggregateState(states: ProductionState[]): ProductionState {
  if (states.includes("failed")) return "failed";
  if (states.includes("running")) return "running";
  if (states.length > 0 && states.every((state) => state === "completed")) return "completed";
  return "idle";
}

function stageState(flow: ProductionFlowData, id: ProductionFlowNodeId): ProductionState {
  if (id === "source") return flow.source.state;
  if (id === "script") return flow.script.trim() ? "completed" : "idle";
  if (id === "scriptPlan") return flow.scriptPlan.trim() ? "completed" : "idle";
  if (id === "assets") {
    return aggregateState(flow.assets.flatMap((asset) => [asset.state, ...asset.derive.map((derived) => derived.state)]));
  }
  if (id === "worldAssets") {
    const states = (flow.worldAssets ?? []).map((asset): ProductionState => {
      if (asset.status === "succeeded") return "completed";
      if (asset.status === "submitting" || asset.status === "running") return "running";
      return asset.status === "failed" ? "failed" : "idle";
    });
    return aggregateState(states);
  }
  if (id === "storyboardTable") return flow.storyboardTable.trim() ? "completed" : "idle";
  if (id === "storyboard") return aggregateState(flow.storyboard.map((storyboard) => storyboard.state));
  if (id === "videoTracks") {
    return aggregateState(
      flow.videoTracks.flatMap((track) => [track.state, ...track.videoList.map((video) => video.state)]),
    );
  }
  if (id === "timeline") return flow.timeline.status;
  return aggregateState(flow.finalOutputs.map((output) => output.state));
}

function StageStatus({ id, flow }: { id: ProductionFlowNodeId; flow: ProductionFlowData }) {
  const content = stageStatusContent[stageState(flow, id)];
  return (
    <span data-testid={`stage-status-${id}`} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${content.className}`}>
      {content.label}
    </span>
  );
}

function NodeCard({
  id,
  position,
  className = "",
  onClick,
  onKeyDown,
  children,
}: {
  id: ProductionFlowNodeId;
  position: { x: number; y: number };
  className?: string;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <article
      data-testid={`flow-node-${id}`}
      data-x={position.x}
      data-y={position.y}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-lg border border-slate-700 bg-[#242626] p-4 text-slate-100 shadow-sm ${className}`}>
      {children}
    </article>
  );
}

function NodeTitle({
  label,
  status,
  openAction,
}: {
  label: string;
  status?: React.ReactNode;
  openAction?: { label: string; onOpen: () => void };
}) {
  return (
    <header className="production-node-drag-handle relative flex cursor-grab select-none items-center justify-between active:cursor-grabbing">
      <div className="w-fit rounded-bl-none rounded-br-lg rounded-tl-lg rounded-tr-none bg-black px-2.5 py-[5px] text-base text-white">{label}</div>
      <div className="nodrag ml-4 flex items-center gap-2">
        {status}
        {openAction ? (
          <button
            type="button"
            aria-label={openAction.label}
            onClick={(event) => {
              event.stopPropagation();
              openAction.onOpen();
            }}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-blue-500 hover:text-blue-300">
            打开
          </button>
        ) : null}
      </div>
    </header>
  );
}

function MainChainHandles({ id, source = true }: { id: Exclude<ProductionFlowNodeId, "source" | "script" | "assets">; source?: boolean }) {
  return (
    <>
      <Handle id={`${id}-target`} type="target" position={Position.Left} />
      {source ? <Handle id={`${id}-source`} type="source" position={Position.Right} /> : null}
    </>
  );
}

function TextNode({
  id,
  data,
  label,
  placeholder,
}: {
  id: "script" | "scriptPlan" | "storyboardTable";
  data: ProductionNodeData;
  label: string;
  placeholder: string;
}) {
  return (
    <NodeCard
      id={id}
      position={data.position}
      className={`cursor-default select-text ${
        id === "script" ? "w-[680px] max-w-[80vw]" : "w-[560px] max-w-[72vw]"
      }`}>
      {id === "script" ? (
        <>
          <Handle id="script-target" type="target" position={Position.Left} />
          <Handle id="script-main" type="source" position={Position.Right} />
          <Handle id="script-assets" type="source" position={Position.Bottom} />
        </>
      ) : (
        <MainChainHandles id={id} />
      )}
      <ProductionTextNodeEditor
        label={label}
        value={data.flow[id]}
        placeholder={placeholder}
        onSave={(value) => data.onTextChange(id, value)}
        status={<StageStatus id={id} flow={data.flow} />}
        openAction={
          id === "script"
            ? {
                label: "打开剧本",
                onOpen: () => data.onOpenStage("script"),
              }
            : undefined
        }
      />
    </NodeCard>
  );
}

function SourceNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const chapters = nodeData.flow.source.chapters;
  return (
    <NodeCard id="source" position={nodeData.position} className="w-[360px] cursor-default select-text">
      <Handle id="source-source" type="source" position={Position.Right} />
      <NodeTitle
        label="原文"
        status={<StageStatus id="source" flow={nodeData.flow} />}
        openAction={{ label: "打开原文", onOpen: () => nodeData.onOpenStage("source") }}
      />
      <div className="nodrag mt-3 space-y-2">
        <p className="text-xs text-slate-400">
          共 {chapters.length} 章 · 已分析 {chapters.filter((chapter) => chapter.eventState > 0).length} 章
        </p>
        {chapters.length ? (
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {chapters.slice(0, 6).map((chapter) => (
              <article key={chapter.id} className="rounded border border-slate-700/70 bg-slate-950/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span className="truncate">{chapter.chapter || `第 ${chapter.chapterIndex + 1} 章`}</span>
                  {chapter.charCount ? <span className="shrink-0">{chapter.charCount.toLocaleString()} 字</span> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{chapter.contentPreview || "暂无正文摘要"}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">暂无原文</p>
        )}
      </div>
    </NodeCard>
  );
}

function triggerAnchorClick(href: string, filename: string, newTab = false) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  if (newTab) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function ImageTools({ src, name, scale = 1 }: { src: string; name: string; scale?: number }) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const bigSrc = src.split("?")[0] || src;

  useEffect(() => {
    if (!previewVisible) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewVisible(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewVisible]);

  const handleCopy = async () => {
    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = src;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("图片加载失败"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("转换失败");
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("转换失败"))), "image/png");
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setFeedback("已复制到剪贴板");
    } catch {
      setFeedback("复制失败");
    }
  };

  const handleDownload = async () => {
    const filename = bigSrc.split("/").pop()?.split("?")[0] || "image";
    let objectUrl = "";
    try {
      const response = await fetch(bigSrc, { mode: "cors" });
      if (!response.ok) throw new Error("下载失败");
      objectUrl = URL.createObjectURL(await response.blob());
      triggerAnchorClick(objectUrl, filename);
      setFeedback("开始下载");
    } catch {
      triggerAnchorClick(bigSrc, filename, true);
      setFeedback("当前图片源可能限制下载，已尝试在新窗口打开");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const toolClassName =
    "grid size-7 place-items-center rounded border border-slate-500 bg-[#242626]/90 text-white hover:bg-[#343636] focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <>
      <div
        data-testid={`image-tools-${name}`}
        style={{ transform: `scale(${scale})`, transformOrigin: "bottom right" }}
        className="production-node-hover-tools nodrag absolute bottom-1 right-1 z-20 flex gap-1 opacity-0 transition-opacity group-hover/image:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          title="复制图片"
          aria-label={`复制${name}`}
          onClick={(event) => {
            event.stopPropagation();
            void handleCopy();
          }}
          className={toolClassName}>
          <Copy className="size-4" />
        </button>
        <button
          type="button"
          title="预览"
          aria-label={`预览${name}`}
          onClick={(event) => {
            event.stopPropagation();
            setPreviewVisible(true);
          }}
          className={toolClassName}>
          <Expand className="size-4" />
        </button>
        <button
          type="button"
          title="下载"
          aria-label={`下载${name}`}
          onClick={(event) => {
            event.stopPropagation();
            void handleDownload();
          }}
          className={toolClassName}>
          <Download className="size-4" />
        </button>
      </div>
      <span role="status" className="sr-only">
        {feedback}
      </span>
      {previewVisible && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`预览 ${name}`}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-6"
              onClick={() => setPreviewVisible(false)}
              onPointerDown={(event) => event.stopPropagation()}>
              <img src={bigSrc} alt={`预览 ${name}`} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
              <button
                type="button"
                aria-label="关闭预览"
                title="关闭"
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewVisible(false);
                }}
                className="absolute right-5 top-5 grid size-10 place-items-center rounded border border-white/40 bg-black/60 text-white hover:bg-black/80">
                <X className="size-5" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function AssetImage({ asset, original }: { asset: DerivedAsset | ProductionAsset; original: boolean }) {
  const completedImage = original ? Boolean(asset.src) : Boolean(asset.src && asset.state === "completed");
  return (
    <div className="production-node-media group/image relative aspect-square w-full overflow-hidden rounded bg-[#303232]">
      {completedImage ? (
        <>
          <img src={asset.src} alt={asset.name} className="size-full object-contain" loading="lazy" />
          <ImageTools src={asset.src} name={asset.name} />
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-slate-400">
          {asset.state === "running" ? <LoaderCircle className="size-5 animate-spin" /> : null}
          {asset.state === "failed" ? (
            <span title={asset.errorReason || undefined} className="text-red-400">
              生成失败
            </span>
          ) : null}
          {asset.state !== "running" && asset.state !== "failed" ? <span>未生成</span> : null}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, original, data }: { asset: DerivedAsset | ProductionAsset; original: boolean; data: ProductionNodeData }) {
  const openEditor = () => {
    if (!original) data.onEditAsset(asset as DerivedAsset);
  };
  return (
    <article
      data-testid={original ? "original-asset-card" : `derived-asset-${asset.id}`}
      role={original ? undefined : "button"}
      aria-label={original ? undefined : `编辑衍生资产 ${asset.name}`}
      tabIndex={original ? undefined : 0}
      onClick={openEditor}
      onKeyDown={(event) => {
        if (!original && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openEditor();
        }
      }}
      className={`group relative flex w-[200px] shrink-0 flex-col justify-between rounded-lg border border-slate-700 bg-[#292b2b] p-3 ${original ? "" : "cursor-pointer"}`}>
      <AssetImage asset={asset} original={original} />
      {!original ? (
        <button
          type="button"
          aria-label={`删除衍生资产 ${asset.name}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onRemoveAsset(asset.id);
          }}
          className="production-node-hover-tools nodrag absolute right-1 top-1 grid size-7 place-items-center rounded-lg bg-red-600/80 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 focus:opacity-100">
          <Trash2 className="size-4" />
        </button>
      ) : null}
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
          <span className="max-w-[120px] truncate">{asset.name}</span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${original ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
            {original ? "原资产" : "衍生"}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{asset.desc}</p>
      </div>
    </article>
  );
}

function AssetsNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  return (
    <NodeCard id="assets" position={nodeData.position} className="w-fit cursor-default select-text">
      <Handle id="assets-target" type="target" position={Position.Top} />
      <Handle id="assets-source" type="source" position={Position.Right} />
      <NodeTitle
        label="衍生资产"
        status={<StageStatus id="assets" flow={nodeData.flow} />}
        openAction={{ label: "打开资产", onOpen: () => nodeData.onOpenStage("assets") }}
      />
      <div className="nodrag nowheel mt-2 flex max-h-[720px] flex-col overflow-y-auto pr-2">
        {nodeData.flow.assets.length
          ? nodeData.flow.assets.map((asset, index) => (
              <div key={asset.id} data-testid="asset-row" className={`flex items-stretch gap-3 p-2.5 ${index ? "mt-2" : ""}`}>
                <AssetCard asset={asset} original data={nodeData} />
                <div className="flex shrink-0 items-center">
                  <ArrowRight className="size-8 text-slate-400" />
                </div>
                <div className="flex items-stretch gap-3">
                  {asset.derive.length ? (
                    asset.derive.map((derived) => <AssetCard key={derived.id} asset={derived} original={false} data={nodeData} />)
                  ) : (
                    <div className="flex w-[200px] shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-[#292b2b] text-sm text-slate-400">
                      无衍生资产
                    </div>
                  )}
                </div>
              </div>
            ))
          : null}
      </div>
    </NodeCard>
  );
}

function WorldAssetsNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const worldAssets = nodeData.flow.worldAssets ?? [];
  const scenes = nodeData.flow.assets
    .flatMap((asset) => [asset, ...asset.derive])
    .filter((asset) => asset.type === "scene");
  const worldsBySource = new Map(worldAssets.map((asset) => [asset.sourceSceneAssetId, asset]));

  return (
    <NodeCard id="worldAssets" position={nodeData.position} className="w-[440px] cursor-default select-text">
      <Handle id="worldAssets-target" type="target" position={Position.Left} />
      <Handle id="worldAssets-source" type="source" position={Position.Right} />
      <NodeTitle label="三维场景资产" status={<StageStatus id="worldAssets" flow={nodeData.flow} />} />
      <div className="nodrag nowheel mt-3 max-h-[640px] space-y-3 overflow-y-auto pr-1">
        {scenes.length ? scenes.map((scene) => {
          const world = worldsBySource.get(scene.id);
          const splatKeys = world ? Object.keys(world.spzUrls) : [];
          const storyboardId =
            world?.storyboardId ??
            nodeData.flow.storyboard.find((storyboard) => storyboard.associateAssetsIds?.includes(scene.id))?.id;
          return (
            <article key={scene.id} className="overflow-hidden rounded-lg border border-slate-700 bg-[#292b2b]">
              <div className="flex gap-3 p-3">
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded bg-slate-900 text-slate-500">
                  {world?.thumbnailUrl || world?.panoramaUrl || scene.src ? (
                    <img
                      src={world?.thumbnailUrl || world?.panoramaUrl || scene.src}
                      alt={scene.name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : <BoxIcon className="size-7" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">{scene.name}</strong>
                    <span className="text-[11px] text-slate-400">
                      {world?.status === "succeeded" ? "可复用" : world?.status === "failed" ? "生成失败" : world ? "生成中" : "未生成"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{world?.caption || scene.desc}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    {splatKeys.length ? (
                      <span className="rounded bg-violet-500/15 px-2 py-1 text-violet-300">
                        SPZ {splatKeys.map((key) => key === "full_res" || key === "full" ? "完整精度" : key).join(" · ")}
                      </span>
                    ) : <span className="rounded bg-slate-800 px-2 py-1 text-slate-400">SPZ 待生成</span>}
                    {world?.colliderMeshUrl ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">碰撞网格可用</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label={`在导演台打开三维场景 ${scene.name}`}
                disabled={!storyboardId}
                onClick={() => storyboardId && nodeData.onOpenDirectorDesk(storyboardId)}
                className="w-full border-t border-slate-700 px-3 py-2 text-left text-xs text-blue-300 hover:bg-blue-500/10 disabled:text-slate-600">
                {world ? "打开三维场景" : "进入导演台生成"}
              </button>
            </article>
          );
        }) : (
          <div className="flex min-h-24 items-center justify-center text-sm text-slate-500">暂无场景资产</div>
        )}
      </div>
    </NodeCard>
  );
}

const storyboardTagColors = ["#5bccb3", "#9c7cfc", "#fbbf24", "#5b9afc", "#e86b6b", "#7cb8fc", "#e8a855", "#34d399"];

function StoryboardNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const selected = new Set(nodeData.selectedStoryboardIds);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [gridScale, setGridScale] = useState(() => {
    const stored = Number.parseFloat(globalThis.localStorage?.getItem("storyboardGridScale") ?? "1");
    return Number.isFinite(stored) && stored >= 0.1 && stored <= 3 ? stored : 1;
  });

  useEffect(() => {
    globalThis.localStorage?.setItem("storyboardGridScale", String(gridScale));
  }, [gridScale]);

  const frameSize = 200 * gridScale;
  const overlayScale = gridScale <= 1 ? gridScale : 1;
  return (
    <NodeCard id="storyboard" position={nodeData.position} className="min-w-[500px] max-w-[100vw] cursor-default select-text">
      <MainChainHandles id="storyboard" />
      <NodeTitle
        label="分镜面板"
        status={<StageStatus id="storyboard" flow={nodeData.flow} />}
        openAction={{ label: "打开分镜", onOpen: () => nodeData.onOpenStage("storyboard") }}
      />
      <div className="mt-3">
        {nodeData.flow.storyboard.length ? (
          <div className="flex flex-wrap items-start gap-0">
            {nodeData.flow.storyboard.map((storyboard, index) => (
              <article
                key={storyboard.id}
                data-testid={`canvas-storyboard-${storyboard.id}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="group relative m-1 inline-flex items-start">
                <button
                  type="button"
                  aria-label={`在分镜 ${storyboard.id} 前插入`}
                  onClick={() => nodeData.onInsertStoryboard(storyboard.id, "before")}
                  className={`production-node-hover-tools nodrag absolute left-0 top-1/2 z-10 grid size-8 -translate-x-[calc(50%+4px)] -translate-y-1/2 place-items-center rounded-full border border-blue-500 bg-[#242626] text-blue-400 transition-opacity ${hoveredIndex === index ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
                  <Plus className="size-4" />
                </button>
                <div className="cursor-pointer">
                  <div
                    data-testid={`storyboard-frame-image-${storyboard.id}`}
                    style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
                    className={`production-node-media relative shrink-0 overflow-hidden rounded-lg bg-[#303232] ${selected.has(storyboard.id) ? "ring-2 ring-blue-500" : ""}`}>
                    <label
                      style={{ transform: `scale(${overlayScale})`, transformOrigin: "top left" }}
                      className="nodrag absolute left-[3px] top-[3px] z-[3] flex items-center gap-1">
                      <input
                        type="checkbox"
                        aria-label={`选择分镜 ${storyboard.id}`}
                        checked={selected.has(storyboard.id)}
                        onChange={() => nodeData.onToggleStoryboard(storyboard.id)}
                        className="size-4 accent-blue-500"
                      />
                      <span
                        className="rounded px-1 text-[10px] font-semibold leading-[18px] text-white"
                        style={{ backgroundColor: storyboardTagColors[index % storyboardTagColors.length] }}>
                        S{String(index + 1).padStart(2, "0")}
                      </span>
                    </label>
                    {storyboard.src && storyboard.state === "completed" ? (
                      <div className="group/image size-full">
                        <img
                          src={storyboard.src}
                          alt={`画布分镜 ${index + 1}`}
                          onClick={() => nodeData.onEditStoryboard(storyboard)}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                        <ImageTools src={storyboard.src} name={`分镜 ${storyboard.id}`} scale={overlayScale} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => nodeData.onEditStoryboard(storyboard)}
                        className="nodrag flex size-full flex-col items-center justify-center gap-1.5 text-xs text-slate-400">
                        {storyboard.state === "running" ? <LoaderCircle className="size-5 animate-spin" /> : null}
                        {storyboard.state === "failed" ? <span className="text-red-400">生成失败</span> : null}
                        {storyboard.state !== "running" && storyboard.state !== "failed" ? <span>未生成</span> : null}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`删除分镜 ${storyboard.id}`}
                      onClick={() => nodeData.onDeleteStoryboards([storyboard.id])}
                      style={{ transform: `scale(${overlayScale})`, transformOrigin: "top right" }}
                      className="production-node-hover-tools nodrag absolute right-[3px] top-[3px] z-10 grid size-7 place-items-center rounded-lg bg-red-600/80 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 focus:opacity-100">
                      <Trash2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑分镜信息 ${storyboard.id}`}
                      onClick={() => nodeData.onEditStoryboardInfo(storyboard)}
                      style={{ transform: `scale(${overlayScale})`, transformOrigin: "bottom left" }}
                      className="production-node-hover-tools nodrag absolute bottom-[3px] left-[3px] z-10 grid size-7 place-items-center rounded-lg bg-blue-500/80 text-white opacity-0 transition-opacity hover:bg-blue-500 group-hover:opacity-100 focus:opacity-100">
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`在 3D 导演台打开分镜 S${String(index + 1).padStart(2, "0")}`}
                      title="3D 导演台"
                      onClick={() => nodeData.onOpenDirectorDesk(storyboard.id)}
                      style={{ transform: `scale(${overlayScale})`, transformOrigin: "bottom left" }}
                      className="production-node-hover-tools nodrag absolute bottom-[3px] left-9 z-10 grid size-7 place-items-center rounded-lg bg-amber-500/85 text-slate-950 opacity-0 transition-opacity hover:bg-amber-400 group-hover:opacity-100 focus:opacity-100">
                      <Box className="size-4" />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`在分镜 ${storyboard.id} 后插入`}
                  onClick={() => nodeData.onInsertStoryboard(storyboard.id, "after")}
                  className={`production-node-hover-tools nodrag absolute right-0 top-1/2 z-10 grid size-8 translate-x-[calc(50%+4px)] -translate-y-1/2 place-items-center rounded-full border border-blue-500 bg-[#242626] text-blue-400 transition-opacity ${hoveredIndex === index ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
                  <Plus className="size-4" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex min-h-24 items-center justify-center text-sm text-slate-400">
            <ImageIcon className="mr-2 size-5" />
            暂无数据
          </div>
        )}

        <label className="nodrag mt-3 flex items-center gap-2 text-[13px]">
          缩放比例
          <input
            aria-label="分镜缩放比例"
            type="number"
            min="0.1"
            max="3"
            step="0.1"
            value={gridScale}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setGridScale(Math.min(3, Math.max(0.1, value)));
            }}
            className="w-[120px] rounded border border-slate-600 bg-[#1b1c1c] px-2 py-1 text-sm outline-none focus:border-blue-500"
          />
        </label>

        <div data-testid="storyboard-selection-controls" className="nodrag mb-1.5 mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-blue-500/15 px-2 py-1 text-xs text-blue-300">已选 {selected.size} 项</span>
          <button
            type="button"
            disabled={!nodeData.flow.storyboard.length}
            onClick={nodeData.onClearStoryboardSelection}
            className="rounded border border-slate-600 px-2 py-1 text-xs disabled:opacity-50">
            取消选择
          </button>
          <button
            type="button"
            disabled={!nodeData.flow.storyboard.length}
            onClick={nodeData.onSelectAllStoryboards}
            className="rounded border border-slate-600 px-2 py-1 text-xs disabled:opacity-50">
            全选
          </button>
          <button
            type="button"
            aria-label="批量删除分镜"
            disabled={!nodeData.flow.storyboard.length || !selected.size}
            onClick={() => nodeData.onDeleteStoryboards(nodeData.selectedStoryboardIds)}
            className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50">
            批量删除
          </button>
        </div>

        <div data-testid="storyboard-primary-actions" className="nodrag flex items-center gap-2.5">
          <button
            type="button"
            aria-label="预览全部分镜"
            disabled={!nodeData.flow.storyboard.length}
            onClick={nodeData.onPreviewStoryboards}
            className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            宫格预览
          </button>
          <button
            type="button"
            aria-label="批量生成分镜图"
            disabled={!nodeData.flow.storyboard.length || !selected.size || nodeData.generatingStoryboards}
            onClick={nodeData.onGenerateStoryboards}
            className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {nodeData.generatingStoryboards ? "生成中" : "生成分镜图"}
          </button>
        </div>
      </div>
    </NodeCard>
  );
}

function WorkbenchStageNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const id = nodeData.id;
  if (id !== "videoTracks" && id !== "timeline" && id !== "finalOutput") return null;
  const view: ProductionWorkbenchView | null = id === "videoTracks" ? "generate" : id === "timeline" ? "editVideo" : null;
  const label = id === "videoTracks" ? "视频轨道" : id === "timeline" ? "剪辑时间线" : "最终成片";
  const cover = typeof nodeData.flow.workbench?.cover === "string" ? nodeData.flow.workbench.cover : "";
  const gradient =
    typeof nodeData.flow.workbench?.gradient === "string" ? nodeData.flow.workbench.gradient : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
  const completedVideos = nodeData.flow.videoTracks.flatMap((track) => track.videoList).filter((video) => video.state === "completed" && video.src);
  const latestOutput = nodeData.flow.finalOutputs.at(0);
  const summary =
    id === "videoTracks"
      ? `${nodeData.flow.videoTracks.length} 条轨道 · ${completedVideos.length} 个可用视频`
      : id === "timeline"
        ? `${nodeData.flow.timeline.clips.length} 个片段 · 版本 ${nodeData.flow.timeline.revision}`
        : latestOutput
          ? `${Math.round(latestOutput.duration)} 秒 · ${(latestOutput.size / 1024 / 1024).toFixed(1)} MB`
          : "尚未生成最终成片";
  return (
    <NodeCard
      id={id}
      position={nodeData.position}
      className={`min-w-[280px] select-text ${view ? "cursor-pointer transition-[filter] duration-100 active:brightness-90" : "cursor-default"}`}
      onClick={view ? () => nodeData.onOpenWorkbench(view) : undefined}
      onKeyDown={(event) => {
        if (view && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          nodeData.onOpenWorkbench(view);
        }
      }}>
      <MainChainHandles id={id} source={id !== "finalOutput"} />
      <NodeTitle label={label} status={<StageStatus id={id} flow={nodeData.flow} />} />
      <div className="mb-3 mt-3">
        <div
          className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg"
          style={{ background: gradient }}>
          {id === "videoTracks" && cover ? <img src={cover} alt="视频工作台封面" className="size-full object-cover" /> : null}
          {id === "finalOutput" && latestOutput?.src ? (
            <video
              src={latestOutput.src}
              aria-label="最终成片预览"
              className="nodrag size-full object-cover"
              preload="metadata"
              controls
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {id !== "finalOutput" || !latestOutput?.src ? (
            <Play className="absolute size-12 text-white/90 transition-transform duration-200 group-hover:scale-110" />
          ) : null}
        </div>
        <p className="mt-3 text-xs text-slate-400">{summary}</p>
        {id === "timeline" && nodeData.flow.timeline.errorReason ? (
          <p className="mt-2 line-clamp-2 text-xs text-red-300">{nodeData.flow.timeline.errorReason}</p>
        ) : null}
      </div>
    </NodeCard>
  );
}

function ProductionNodeComponent(props: NodeProps) {
  const data = props.data as ProductionNodeData;
  if (data.id === "source") return <SourceNode {...props} />;
  if (data.id === "script") return <TextNode id="script" data={data} label="剧本" placeholder="暂无数据" />;
  if (data.id === "scriptPlan") return <TextNode id="scriptPlan" data={data} label="导演计划" placeholder="暂无数据" />;
  if (data.id === "storyboardTable") return <TextNode id="storyboardTable" data={data} label="分镜表" placeholder="暂无数据" />;
  if (data.id === "assets") return <AssetsNode {...props} />;
  if (data.id === "worldAssets") return <WorldAssetsNode {...props} />;
  if (data.id === "storyboard") return <StoryboardNode {...props} />;
  return <WorkbenchStageNode {...props} />;
}

export const ProductionFlowNode = memo(ProductionNodeComponent);
