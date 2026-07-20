import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { AlertTriangle, LoaderCircle, Pencil, RefreshCw, Save, Trash2, WandSparkles } from "lucide-react";

import { ImageFlowEditor } from "./image-flow-editor";
import type { ProductionApi } from "./production-api";
import type { DerivedAsset, ProductionFlowData } from "./types";

export interface ProductionFlowBoardProps {
  api: ProductionApi;
  projectId: number;
  scriptId: number;
  initialData: ProductionFlowData;
  imageModel?: string;
  pollIntervalMs?: number;
}

const nodeOrder = ["script", "scriptPlan", "assets", "storyboardTable", "storyboard", "workbench"] as const;
type FlowNodeId = (typeof nodeOrder)[number];

const nodeLabels: Record<FlowNodeId, string> = {
  script: "原文 / 剧本",
  scriptPlan: "拍摄计划",
  assets: "资产工厂",
  storyboardTable: "分镜表",
  storyboard: "分镜图",
  workbench: "视频工作台",
};

function autoLayout() {
  return Object.fromEntries(nodeOrder.map((id, index) => [id, { x: index * 360, y: id === "assets" ? 420 : 0 }]));
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

export function ProductionFlowBoard({ api, projectId, scriptId, initialData, imageModel = "pancat:pancat-image", pollIntervalMs = 3_000 }: ProductionFlowBoardProps) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingAsset, setEditingAsset] = useState<DerivedAsset | null>(null);

  useEffect(() => setData(initialData), [initialData]);

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

  async function generate(assetId: number) {
    setData((current) =>
      updateDerived(current, [
        {
          ...current.assets.flatMap((asset) => asset.derive).find((item) => item.id === assetId)!,
          state: "running",
          errorReason: "",
        },
      ]),
    );
    try {
      await api.generateDerivedAssets(projectId, scriptId, [assetId]);
    } catch (error) {
      setData((current) => {
        const existing = current.assets.flatMap((asset) => asset.derive).find((item) => item.id === assetId)!;
        return updateDerived(current, [{ ...existing, state: "failed", errorReason: errorMessage(error) }]);
      });
    }
  }

  async function remove(assetId: number) {
    try {
      await api.deleteDerivedAsset(projectId, assetId);
      setData((current) => ({
        ...current,
        assets: current.assets.map((asset) => ({ ...asset, derive: asset.derive.filter((item) => item.id !== assetId) })),
      }));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function adoptAsset(url: string, flowId: number) {
    if (!editingAsset) return;
    const updated: DerivedAsset = { ...editingAsset, src: url, flowId, state: "completed", errorReason: "" };
    await api.updateAssetImage(editingAsset.id, url, flowId);
    setData((current) => updateDerived(current, [updated]));
  }

  function nodeSummary(id: FlowNodeId): string {
    if (id === "script") return `${data.script.length} 字`;
    if (id === "scriptPlan") return data.scriptPlan ? "已有计划" : "待生成";
    if (id === "assets") return `${data.assets.length} 项主资产`;
    if (id === "storyboardTable") return data.storyboardTable ? "合同已建立" : "待生成";
    if (id === "storyboard") return `${data.storyboard.length} 个镜头`;
    return "图片 / 视频 / 合成";
  }

  function moveNode(id: FlowNodeId, event: DragEvent<HTMLDivElement>) {
    const canvasBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    const currentPosition = layout[id];
    const x = Number.isFinite(event.clientX) ? Math.max(0, Math.round(event.clientX - (canvasBounds?.left ?? 0))) : currentPosition.x;
    const y = Number.isFinite(event.clientY) ? Math.max(0, Math.round(event.clientY - (canvasBounds?.top ?? 0))) : currentPosition.y;
    setData((current) => ({ ...current, layout: { ...autoLayout(), ...current.layout, [id]: { x, y } } }));
  }

  const layout = { ...autoLayout(), ...data.layout };

  return (
    <section className="space-y-4" aria-label="生产流图">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">产线图与合同</h2>
          <p className="mt-1 text-xs text-slate-500">原文、计划、衍生资产、分镜表、分镜与生成工作台共用同一份服务端合同。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setData((current) => ({ ...current, layout: autoLayout() }))} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">
            自动布局
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs disabled:opacity-50">
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} 保存产线图
          </button>
        </div>
      </div>
      {notice ? <div role="status" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">{notice}</div> : null}
      <article className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <h3 className="mb-3 text-sm font-medium">流程节点</h3>
        <div aria-label="可拖动生产流程" className="relative h-[650px] min-w-[2200px] overflow-hidden rounded-lg border border-slate-800 bg-[radial-gradient(circle_at_center,_rgba(71,85,105,.28)_1px,_transparent_1px)] [background-size:24px_24px]">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
            {nodeOrder.slice(0, -1).map((id, index) => {
              const start = layout[id];
              const end = layout[nodeOrder[index + 1]];
              return <line key={id} x1={start.x + 240} y1={start.y + 58} x2={end.x} y2={end.y + 58} stroke="rgb(51 65 85)" strokeWidth="2" strokeDasharray="6 6" />;
            })}
          </svg>
          {nodeOrder.map((id, index) => {
            const position = layout[id];
            return (
              <div
                key={id}
                draggable
                onDragEnd={(event) => moveNode(id, event)}
                data-testid={`flow-node-${id}`}
                data-x={position.x}
                data-y={position.y}
                style={{ left: position.x, top: position.y }}
                className="absolute w-60 cursor-grab rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl active:cursor-grabbing"
              >
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{nodeLabels[id]}</strong><span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">{index + 1}</span></div>
                <p className="mt-3 text-xs text-slate-500">{nodeSummary(id)}</p>
              </div>
            );
          })}
        </div>
      </article>
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h3 className="mb-3 text-sm font-medium">原文 / 剧本</h3>
          <textarea aria-label="剧本原文" value={data.script} onChange={(event) => setData((current) => ({ ...current, script: event.target.value }))} className="h-48 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <h3 className="mb-3 text-sm font-medium">拍摄计划</h3>
          <textarea aria-label="拍摄计划" value={data.scriptPlan} onChange={(event) => setData((current) => ({ ...current, scriptPlan: event.target.value }))} className="h-48 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm" />
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-medium">分镜表</h3>
          <textarea aria-label="分镜表" value={data.storyboardTable} onChange={(event) => setData((current) => ({ ...current, storyboardTable: event.target.value }))} className="h-52 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs" />
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-medium">衍生资产</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.assets.flatMap((asset) =>
              asset.derive.map((item) => (
                <div key={item.id} data-testid={`derived-asset-${item.id}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-start gap-3">
                    {item.src ? <img src={item.src} alt={item.name} className="size-16 rounded-md object-cover" /> : <div className="grid size-16 place-items-center rounded-md bg-slate-800"><WandSparkles className="size-5 text-slate-600" /></div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{item.name}</strong><span className="text-[10px] text-slate-500">{asset.name}</span></div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                  {item.errorReason ? <div role="alert" className="mt-2 flex gap-1 text-xs text-red-300"><AlertTriangle className="size-3.5 shrink-0" />{item.errorReason}</div> : null}
                  <div className="mt-3 flex gap-2">
                    <button type="button" aria-label={item.state === "failed" ? "重试衍生资产" : "生成衍生资产"} disabled={item.state === "running"} onClick={() => void generate(item.id)} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs disabled:opacity-50">
                      {item.state === "running" ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}{item.state === "running" ? "生成中" : "生成"}
                    </button>
                    <button type="button" aria-label={`删除衍生资产 ${item.name}`} onClick={() => void remove(item.id)} className="rounded-md border border-red-900/60 px-2 text-red-300"><Trash2 className="size-3.5" /></button>
                    <button type="button" aria-label={`编辑衍生资产 ${item.name}`} onClick={() => setEditingAsset(item)} className="rounded-md border border-slate-700 px-2 text-slate-300"><Pencil className="size-3.5" /></button>
                  </div>
                </div>
              )),
            )}
          </div>
        </article>
      </div>
      {editingAsset ? <ImageFlowEditor api={api} projectId={projectId} scriptId={scriptId} targetKind="asset" asset={editingAsset} imageModel={imageModel} onClose={() => setEditingAsset(null)} onSaved={adoptAsset} /> : null}
    </section>
  );
}
