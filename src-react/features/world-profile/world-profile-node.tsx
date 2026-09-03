import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Globe2, Pencil } from "lucide-react";

import { WorldProfileSummary } from "./world-profile-summary";
import type { ProjectWorldProfile } from "./world-profile-fields";

export interface WorldProfileNodeData extends Record<string, unknown> {
  profile: ProjectWorldProfile | null;
  mode: "production" | "interactive";
  onOpen: () => void;
}

export function WorldProfileNode({ id, data }: NodeProps) {
  const node = data as WorldProfileNodeData;
  return (
    <article
      data-testid="world-profile-node"
      className="w-[330px] rounded-lg border border-zinc-500/40 bg-[#262626] p-4 text-slate-100 shadow-sm">
      {node.mode === "production" ? (
        <>
          <Handle id="worldProfile-script" type="source" position={Position.Right} style={{ top: "32%" }} />
          <Handle id="worldProfile-scriptPlan" type="source" position={Position.Right} style={{ top: "52%" }} />
          <Handle id="worldProfile-assets" type="source" position={Position.Right} style={{ top: "72%" }} />
        </>
      ) : (
        <Handle id={`${id}-source`} type="source" position={Position.Right} />
      )}
      <header className="production-node-drag-handle flex cursor-grab items-center gap-2 active:cursor-grabbing">
        <span className="grid size-8 place-items-center rounded-lg bg-zinc-500/15 text-zinc-300">
          <Globe2 className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">项目世界设定</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">所有生成阶段共享</p>
        </div>
      </header>
      <div className="mt-4">
        <WorldProfileSummary profile={node.profile} compact />
      </div>
      <button
        type="button"
        aria-label="编辑项目世界设定"
        onClick={(event) => {
          event.stopPropagation();
          node.onOpen();
        }}
        className="nodrag mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
        <Pencil className="size-3.5" />
        查看与编辑
      </button>
    </article>
  );
}
