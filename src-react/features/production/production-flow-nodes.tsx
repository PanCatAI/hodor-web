import { memo, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  Clapperboard,
  Download,
  Eye,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  WandSparkles,
} from "lucide-react";

import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";
import type { ProductionFlowNodeId } from "./production-flow-layout";
import { productionNodeLabels } from "./production-flow-layout";
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

function NodeFrame({ id, position, children }: { id: ProductionFlowNodeId; position: { x: number; y: number }; children: React.ReactNode }) {
  return (
    <article
      data-testid={`flow-node-${id}`}
      data-x={position.x}
      data-y={position.y}
      className="overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-950/95 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,.58)] backdrop-blur">
      <header className="production-node-drag-handle flex cursor-grab items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-3 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 rounded-full bg-blue-400 shadow-[0_0_16px_rgba(96,165,250,.9)]" />
          <strong className="truncate text-sm tracking-wide">{productionNodeLabels[id]}</strong>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-500">{id}</span>
      </header>
      {children}
    </article>
  );
}

function MainChainHandles({ id, source = true }: { id: Exclude<ProductionFlowNodeId, "script" | "assets">; source?: boolean }) {
  return (
    <>
      <Handle id={`${id}-target`} type="target" position={Position.Left} className="!size-3 !border-2 !border-slate-950 !bg-blue-400" />
      {source ? (
        <Handle id={`${id}-source`} type="source" position={Position.Right} className="!size-3 !border-2 !border-slate-950 !bg-blue-400" />
      ) : null}
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
  const value = data.flow[id];
  const tall = id === "storyboardTable";
  return (
    <NodeFrame id={id} position={data.position}>
      {id === "script" ? (
        <>
          <Handle id="script-main" type="source" position={Position.Right} className="!size-3 !border-2 !border-slate-950 !bg-blue-400" />
          <Handle id="script-assets" type="source" position={Position.Bottom} className="!size-3 !border-2 !border-slate-950 !bg-amber-400" />
        </>
      ) : (
        <MainChainHandles id={id} />
      )}
      <div className="p-4">
        <ProductionTextNodeEditor
          label={label}
          value={value}
          placeholder={placeholder}
          tall={tall}
          onSave={(nextValue) => data.onTextChange(id, nextValue)}
        />
      </div>
    </NodeFrame>
  );
}

function AssetThumb({ asset, original, data }: { asset: DerivedAsset | ProductionAsset; original?: boolean; data: ProductionNodeData }) {
  return (
    <div
      data-testid={original ? undefined : `derived-asset-${asset.id}`}
      className="group w-44 shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80">
      <div className="production-node-media relative aspect-square bg-slate-900">
        {asset.src ? (
          <img src={asset.src} alt={asset.name} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center text-slate-600">
            {asset.state === "running" ? <LoaderCircle className="size-6 animate-spin text-blue-400" /> : <WandSparkles className="size-6" />}
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-medium ${original ? "bg-emerald-500/90 text-emerald-950" : "bg-amber-400/90 text-amber-950"}`}>
          {original ? "主资产" : "衍生"}
        </span>
        {!original ? (
          <button
            type="button"
            aria-label={`删除衍生资产 ${asset.name}`}
            onClick={() => data.onRemoveAsset(asset.id)}
            className="production-node-hover-tools nodrag absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-red-500/90 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <strong className="truncate text-xs">{asset.name}</strong>
          <span className="shrink-0 text-[9px] text-slate-500">{stateLabel(asset.state)}</span>
        </div>
        <p className="line-clamp-2 min-h-8 text-[10px] leading-4 text-slate-500">{asset.desc || asset.prompt || "暂无描述"}</p>
        {asset.errorReason ? (
          <div role="alert" className="flex gap-1 text-[10px] leading-4 text-red-300">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-2">{asset.errorReason}</span>
          </div>
        ) : null}
        {!original ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label={asset.state === "failed" ? "重试衍生资产" : "生成衍生资产"}
              disabled={asset.state === "running"}
              onClick={() => data.onGenerateAsset(asset.id)}
              className="nodrag flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] hover:border-blue-500/60 disabled:opacity-50">
              {asset.state === "running" ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              {asset.state === "running" ? "生成中" : "生成"}
            </button>
            <button
              type="button"
              aria-label={`编辑衍生资产 ${asset.name}`}
              onClick={() => data.onEditAsset(asset as DerivedAsset)}
              className="nodrag grid size-7 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-blue-500/60">
              <Pencil className="size-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssetsNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const [visibleAssetCount, setVisibleAssetCount] = useState(12);
  const visibleAssets = nodeData.flow.assets.slice(0, visibleAssetCount);
  const hiddenAssetCount = Math.max(0, nodeData.flow.assets.length - visibleAssets.length);
  return (
    <div className="w-[680px]">
      <NodeFrame id="assets" position={nodeData.position}>
        <Handle id="assets-target" type="target" position={Position.Top} className="!size-3 !border-2 !border-slate-950 !bg-amber-400" />
        <div className="max-h-[680px] space-y-4 overflow-auto p-4 nowheel">
          {nodeData.flow.assets.length ? (
            visibleAssets.map((asset) => (
              <section key={asset.id} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                <div className="flex items-center gap-3 overflow-x-auto pb-1 nowheel">
                  <AssetThumb asset={asset} original data={nodeData} />
                  <ArrowRight className="size-5 shrink-0 text-slate-700" />
                  {asset.derive.length ? (
                    asset.derive.map((item) => <AssetThumb key={item.id} asset={item} data={nodeData} />)
                  ) : (
                    <div className="grid h-44 w-44 shrink-0 place-items-center rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-600">
                      暂无衍生资产
                    </div>
                  )}
                </div>
              </section>
            ))
          ) : (
            <div className="grid h-48 place-items-center rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              <div>
                <ImageIcon className="mx-auto mb-3 size-7 text-slate-700" />
                等待资产智能体写入人物、场景与道具
              </div>
            </div>
          )}
          {hiddenAssetCount ? (
            <button
              type="button"
              onClick={() => setVisibleAssetCount((current) => current + 12)}
              className="nodrag w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs text-blue-300 hover:border-blue-500/60">
              显示更多资产（剩余 {hiddenAssetCount} 个）
            </button>
          ) : null}
        </div>
      </NodeFrame>
    </div>
  );
}

function StoryboardNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const selected = new Set(nodeData.selectedStoryboardIds);
  const [visibleStoryboardCount, setVisibleStoryboardCount] = useState(24);
  const visibleStoryboards = nodeData.flow.storyboard.slice(0, visibleStoryboardCount);
  const hiddenStoryboardCount = Math.max(0, nodeData.flow.storyboard.length - visibleStoryboards.length);
  const [gridScale, setGridScale] = useState(() => {
    const stored = Number.parseFloat(globalThis.localStorage?.getItem("hodor-storyboard-grid-scale") ?? "1");
    return Number.isFinite(stored) && stored >= 0.6 && stored <= 1.6 ? stored : 1;
  });
  useEffect(() => {
    globalThis.localStorage?.setItem("hodor-storyboard-grid-scale", String(gridScale));
  }, [gridScale]);
  return (
    <div className="w-[780px]">
      <NodeFrame id="storyboard" position={nodeData.position}>
        <MainChainHandles id="storyboard" />
        <div className="max-h-[680px] overflow-auto p-4 nowheel">
          {nodeData.flow.storyboard.length ? (
            <>
              <div className="nodrag mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">已选 {selected.size}</span>
                <button
                  type="button"
                  onClick={nodeData.onSelectAllStoryboards}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] hover:border-blue-500/60">
                  <CheckSquare className="size-3" />
                  全选
                </button>
                <button
                  type="button"
                  onClick={nodeData.onClearStoryboardSelection}
                  disabled={!selected.size}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] disabled:opacity-40">
                  <Square className="size-3" />
                  清空
                </button>
                <button
                  type="button"
                  aria-label="批量生成分镜图"
                  onClick={nodeData.onGenerateStoryboards}
                  disabled={!selected.size || nodeData.generatingStoryboards}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] text-white hover:bg-blue-500 disabled:opacity-40">
                  {nodeData.generatingStoryboards ? <LoaderCircle className="size-3 animate-spin" /> : <WandSparkles className="size-3" />}
                  批量生成
                </button>
                <button
                  type="button"
                  aria-label="批量删除分镜"
                  onClick={() => nodeData.onDeleteStoryboards(nodeData.selectedStoryboardIds)}
                  disabled={!selected.size}
                  className="flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1.5 text-[10px] text-red-300 disabled:opacity-40">
                  <Trash2 className="size-3" />
                  批量删除
                </button>
                <button
                  type="button"
                  aria-label="预览全部分镜"
                  onClick={nodeData.onPreviewStoryboards}
                  disabled={!nodeData.flow.storyboard.some((item) => item.src)}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] disabled:opacity-40">
                  <Eye className="size-3" />
                  预览 / 下载
                </button>
                <label className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
                  缩放
                  <input
                    aria-label="分镜缩放比例"
                    type="range"
                    min="0.6"
                    max="1.6"
                    step="0.1"
                    value={gridScale}
                    onChange={(event) => setGridScale(Number(event.target.value))}
                    className="w-20 accent-blue-500"
                  />
                  {gridScale.toFixed(1)}×
                </label>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(190 * gridScale)}px, 1fr))` }}>
                {visibleStoryboards.map((storyboard, index) => (
                  <article
                    key={storyboard.id}
                    data-testid={`canvas-storyboard-${storyboard.id}`}
                    className={`group overflow-hidden rounded-xl border bg-slate-900/70 ${selected.has(storyboard.id) ? "border-blue-500 ring-1 ring-blue-500/30" : "border-slate-800"}`}>
                    <div className="production-node-media relative aspect-video w-full overflow-hidden bg-slate-950">
                      {storyboard.src ? (
                        <img
                          src={storyboard.src}
                          alt={`画布分镜 ${index + 1}`}
                          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : storyboard.state === "running" ? (
                        <span className="grid size-full place-items-center">
                          <LoaderCircle className="size-7 animate-spin text-blue-400" />
                        </span>
                      ) : (
                        <span className="grid size-full place-items-center">
                          <ImageIcon className="size-7 text-slate-700" />
                        </span>
                      )}
                      <label className="nodrag absolute left-2 top-2 flex cursor-pointer items-center gap-1.5 rounded bg-slate-950/85 px-2 py-1 font-mono text-[9px] text-blue-300">
                        <input
                          type="checkbox"
                          aria-label={`选择分镜 ${storyboard.id}`}
                          checked={selected.has(storyboard.id)}
                          onChange={() => nodeData.onToggleStoryboard(storyboard.id)}
                          className="size-3 accent-blue-500"
                        />
                        S{String(index + 1).padStart(2, "0")}
                      </label>
                      <span className="absolute bottom-2 right-2 rounded bg-slate-950/80 px-2 py-1 text-[9px] text-slate-300">
                        {stateLabel(storyboard.state)}
                      </span>
                      <div className="production-node-hover-tools nodrag absolute bottom-2 left-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label={`在分镜 ${storyboard.id} 前插入`}
                          onClick={() => nodeData.onInsertStoryboard(storyboard.id, "before")}
                          className="grid size-6 place-items-center rounded bg-slate-950/90 text-slate-200 hover:text-blue-300">
                          <Plus className="size-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`编辑分镜图 ${index + 1}`}
                          onClick={() => nodeData.onEditStoryboard(storyboard)}
                          className="grid size-6 place-items-center rounded bg-slate-950/90 text-slate-200 hover:text-blue-300">
                          <Pencil className="size-3" />
                        </button>
                        {storyboard.src ? (
                          <a
                            aria-label={`下载分镜 ${storyboard.id}`}
                            href={storyboard.src}
                            download={`storyboard-${String(index + 1).padStart(2, "0")}.jpg`}
                            className="grid size-6 place-items-center rounded bg-slate-950/90 text-slate-200 hover:text-blue-300">
                            <Download className="size-3" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`删除分镜 ${storyboard.id}`}
                          onClick={() => nodeData.onDeleteStoryboards([storyboard.id])}
                          className="grid size-6 place-items-center rounded bg-red-500/90 text-white">
                          <Trash2 className="size-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`在分镜 ${storyboard.id} 后插入`}
                          onClick={() => nodeData.onInsertStoryboard(storyboard.id, "after")}
                          className="grid size-6 place-items-center rounded bg-slate-950/90 text-slate-200 hover:text-blue-300">
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5 p-3">
                      <p className="line-clamp-2 min-h-8 text-[10px] leading-4 text-slate-300">{storyboard.prompt || "尚未填写画面提示词"}</p>
                      <p className="line-clamp-1 text-[9px] text-slate-600">{storyboard.videoDesc || "暂无镜头运动描述"}</p>
                      <button
                        type="button"
                        aria-label={`编辑分镜信息 ${storyboard.id}`}
                        onClick={() => nodeData.onEditStoryboardInfo(storyboard)}
                        className="nodrag text-[9px] text-blue-300 hover:text-blue-200">
                        编辑提示词与镜头描述
                      </button>
                      {storyboard.errorReason ? (
                        <p role="alert" className="line-clamp-2 text-[9px] text-red-300">
                          {storyboard.errorReason}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              {hiddenStoryboardCount ? (
                <button
                  type="button"
                  onClick={() => setVisibleStoryboardCount((current) => current + 24)}
                  className="nodrag mt-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs text-blue-300 hover:border-blue-500/60">
                  显示更多分镜（剩余 {hiddenStoryboardCount} 个）
                </button>
              ) : null}
            </>
          ) : (
            <div className="grid h-52 place-items-center rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
              <div>
                <Clapperboard className="mx-auto mb-3 size-7 text-slate-700" />
                等待分镜智能体写入镜头
              </div>
            </div>
          )}
        </div>
      </NodeFrame>
    </div>
  );
}

function WorkbenchNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  const cover = nodeData.flow.storyboard.find((item) => item.src)?.src;
  return (
    <div className="w-[420px]">
      <NodeFrame id="workbench" position={nodeData.position}>
        <MainChainHandles id="workbench" source={false} />
        <div className="p-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,.3),_transparent_45%),linear-gradient(135deg,#0f172a,#020617)]">
            {cover ? <img src={cover} alt="视频工作台封面" className="size-full object-cover opacity-60" /> : null}
            <div className="absolute inset-0 grid place-items-center">
              <span className="grid size-14 place-items-center rounded-full border border-white/20 bg-slate-950/70">
                <Play className="ml-1 size-6 text-blue-300" />
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <strong className="text-xs">进入生成与合成工作台</strong>
              <p className="mt-1 text-[10px] text-slate-500">{nodeData.flow.storyboard.length} 个镜头可用于视频生成</p>
            </div>
            <button
              type="button"
              onClick={nodeData.onOpenWorkbench}
              className="nodrag flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-medium text-white hover:bg-blue-500">
              <Clapperboard className="size-3.5" />
              打开工作台
            </button>
          </div>
        </div>
      </NodeFrame>
    </div>
  );
}

function ProductionNodeComponent(props: NodeProps) {
  const data = props.data as ProductionNodeData;
  if (data.id === "script")
    return (
      <div className="w-[560px]">
        <TextNode id="script" data={data} label="剧本原文" placeholder="等待原文或剧本内容" />
      </div>
    );
  if (data.id === "scriptPlan")
    return (
      <div className="w-[560px]">
        <TextNode id="scriptPlan" data={data} label="拍摄计划" placeholder="等待导演智能体生成拍摄计划" />
      </div>
    );
  if (data.id === "storyboardTable")
    return (
      <div className="w-[620px]">
        <TextNode id="storyboardTable" data={data} label="分镜表" placeholder="等待导演智能体生成分镜合同" />
      </div>
    );
  if (data.id === "assets") return <AssetsNode {...props} />;
  if (data.id === "storyboard") return <StoryboardNode {...props} />;
  return <WorkbenchNode {...props} />;
}

export const ProductionFlowNode = memo(ProductionNodeComponent);
