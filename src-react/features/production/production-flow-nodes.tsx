import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { AlertTriangle, ArrowRight, Clapperboard, ImageIcon, LoaderCircle, Pencil, Play, RefreshCw, Trash2, WandSparkles } from "lucide-react";

import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";
import type { ProductionFlowNodeId } from "./production-flow-layout";
import { productionNodeLabels } from "./production-flow-layout";

export interface ProductionNodeHandlers {
  onTextChange: (field: "script" | "scriptPlan" | "storyboardTable", value: string) => void;
  onGenerateAsset: (assetId: number) => void;
  onRemoveAsset: (assetId: number) => void;
  onEditAsset: (asset: DerivedAsset) => void;
  onEditStoryboard: (storyboard: StoryboardItem) => void;
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
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>{value.trim() ? `${value.length} 字` : "等待智能体写入"}</span>
          <span>可直接编辑</span>
        </div>
        <textarea
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(event) => data.onTextChange(id, event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          className={`nodrag nowheel w-full resize-none rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs leading-6 text-slate-200 outline-none transition focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/10 ${tall ? "h-72 font-mono" : "h-64"}`}
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
      <div className="relative aspect-square bg-slate-900">
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
            className="nodrag absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-red-500/90 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">
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
  return (
    <div className="w-[680px]">
      <NodeFrame id="assets" position={nodeData.position}>
        <Handle id="assets-target" type="target" position={Position.Top} className="!size-3 !border-2 !border-slate-950 !bg-amber-400" />
        <div className="max-h-[680px] space-y-4 overflow-auto p-4 nowheel">
          {nodeData.flow.assets.length ? (
            nodeData.flow.assets.map((asset) => (
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
        </div>
      </NodeFrame>
    </div>
  );
}

function StoryboardNode({ data }: NodeProps) {
  const nodeData = data as ProductionNodeData;
  return (
    <div className="w-[780px]">
      <NodeFrame id="storyboard" position={nodeData.position}>
        <MainChainHandles id="storyboard" />
        <div className="max-h-[620px] overflow-auto p-4 nowheel">
          {nodeData.flow.storyboard.length ? (
            <div className="grid grid-cols-3 gap-3">
              {nodeData.flow.storyboard.map((storyboard, index) => (
                <article key={storyboard.id} className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
                  <button
                    type="button"
                    aria-label={`编辑分镜图 ${index + 1}`}
                    onClick={() => nodeData.onEditStoryboard(storyboard)}
                    className="nodrag relative block aspect-video w-full overflow-hidden bg-slate-950 text-left">
                    {storyboard.src ? (
                      <img
                        src={storyboard.src}
                        alt={`分镜 ${index + 1}`}
                        className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid size-full place-items-center">
                        <ImageIcon className="size-7 text-slate-700" />
                      </span>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 font-mono text-[9px] text-blue-300">
                      S{String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="absolute bottom-2 right-2 rounded bg-slate-950/80 px-2 py-1 text-[9px] text-slate-300">
                      {stateLabel(storyboard.state)}
                    </span>
                  </button>
                  <div className="space-y-1.5 p-3">
                    <p className="line-clamp-2 min-h-8 text-[10px] leading-4 text-slate-300">{storyboard.prompt || "尚未填写画面提示词"}</p>
                    <p className="line-clamp-1 text-[9px] text-slate-600">{storyboard.videoDesc || "暂无镜头运动描述"}</p>
                    {storyboard.errorReason ? (
                      <p role="alert" className="line-clamp-2 text-[9px] text-red-300">
                        {storyboard.errorReason}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
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
