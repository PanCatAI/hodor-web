import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { ArrowRight, Copy, Download, Expand, ImageIcon, LoaderCircle, Pencil, Play, Plus, Trash2, X } from "lucide-react";

import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";
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
  onOpenWorkbench: () => void;
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

function NodeTitle({ label }: { label: string }) {
  return (
    <header className="production-node-drag-handle relative flex cursor-grab select-none items-center justify-between active:cursor-grabbing">
      <div className="w-fit rounded-bl-none rounded-br-lg rounded-tl-lg rounded-tr-none bg-black px-2.5 py-[5px] text-base text-white">{label}</div>
    </header>
  );
}

function MainChainHandles({ id, source = true }: { id: Exclude<ProductionFlowNodeId, "script" | "assets">; source?: boolean }) {
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
      className={`w-fit max-w-[100vw] cursor-default select-text ${id === "storyboardTable" ? "min-w-[100px]" : "min-w-[200px]"}`}>
      {id === "script" ? (
        <>
          <Handle id="script-main" type="source" position={Position.Right} />
          <Handle id="script-assets" type="source" position={Position.Bottom} />
        </>
      ) : (
        <MainChainHandles id={id} />
      )}
      <ProductionTextNodeEditor label={label} value={data.flow[id]} placeholder={placeholder} onSave={(value) => data.onTextChange(id, value)} />
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
      <NodeTitle label="衍生资产" />
      <div className="mt-2 flex flex-col">
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
      <NodeTitle label="分镜面板" />
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

function WorkbenchNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const cover = typeof nodeData.flow.workbench?.cover === "string" ? nodeData.flow.workbench.cover : "";
  const gradient =
    typeof nodeData.flow.workbench?.gradient === "string" ? nodeData.flow.workbench.gradient : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
  return (
    <NodeCard
      id="workbench"
      position={nodeData.position}
      className="min-w-[280px] cursor-pointer select-text transition-[filter] duration-100 active:brightness-90"
      onClick={nodeData.onOpenWorkbench}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          nodeData.onOpenWorkbench();
        }
      }}>
      <MainChainHandles id="workbench" source={false} />
      <NodeTitle label="视频工作台" />
      <div className="mb-3 mt-3">
        <div
          className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg"
          style={{ background: gradient }}>
          {cover ? <img src={cover} alt="视频工作台封面" className="size-full object-cover" /> : null}
          <Play className="absolute size-12 text-white/90 transition-transform duration-200 group-hover:scale-110" />
        </div>
      </div>
    </NodeCard>
  );
}

function ProductionNodeComponent(props: NodeProps) {
  const data = props.data as ProductionNodeData;
  if (data.id === "script") return <TextNode id="script" data={data} label="剧本" placeholder="暂无数据" />;
  if (data.id === "scriptPlan") return <TextNode id="scriptPlan" data={data} label="导演计划" placeholder="暂无数据" />;
  if (data.id === "storyboardTable") return <TextNode id="storyboardTable" data={data} label="分镜表" placeholder="暂无数据" />;
  if (data.id === "assets") return <AssetsNode {...props} />;
  if (data.id === "storyboard") return <StoryboardNode {...props} />;
  return <WorkbenchNode {...props} />;
}

export const ProductionFlowNode = memo(ProductionNodeComponent);
