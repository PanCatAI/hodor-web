import { useCallback, useState } from "react";
import { Clapperboard, Database, FileText, RefreshCw, RotateCcw, UserCheck } from "lucide-react";

import { CreationProfilesView } from "./creation-profiles";
import { EvidenceStatusView } from "./evidence-status";
import { FourthWallView } from "./fourth-wall";
import { ProfessionalReviewView } from "./professional-review";
import { RollbackStatusView } from "./rollback-status";
import type { StudioOsApi } from "./studio-os-api";

export interface StudioOsPageProps {
  api: StudioOsApi;
}

/**
 * Studio OS entry: the governed v5 professional-creation evaluation console.
 * All views bind to the same backend HTTP evidence identifiers used by
 * PostgreSQL readback (evidenceId `ev:<runId>:<domain>`, HTTP path
 * `/api/evolution/evidence/<evidenceId>`, database record `db:<evidenceId>`).
 */
export function StudioOsPage({ api }: StudioOsPageProps) {
  const [reloadKey, setReloadKey] = useState(0);

  const bumpReload = useCallback(() => setReloadKey((value) => value + 1), []);

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-border bg-gradient-to-br from-[#0d1322] to-[#0a0d13] p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Clapperboard aria-hidden="true" size={20} className="text-blue-400" />
          Studio OS · 专业创作评估运行时
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          绑定已验证 v5 包（commit 4ef737c60b1a7bf6691f2415254654ab00152ed1）的十域专业创作评估证据：
          短剧、互动剧、电视剧、电影、AINovel 原创性、专业编剧审核、第四墙互动、共生反馈、精确回滚与匹配对照。
          每个视图都指向与 PostgreSQL 回读一致的 HTTP 证据标识。
        </p>
        <button
          type="button"
          onClick={bumpReload}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/5"
        >
          <RefreshCw aria-hidden="true" size={14} />
          刷新全部视图
        </button>
      </header>

      <EvidenceStatusView key={`evidence-${reloadKey}`} api={api} onEvidenceCreated={bumpReload} />

      <div>
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
          <Database aria-hidden="true" size={16} className="text-blue-400" />
          创建画像（五种专业创作格式）
        </h3>
        <CreationProfilesView key={`profiles-${reloadKey}`} api={api} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ProfessionalReviewView key={`review-${reloadKey}`} api={api} />
        <FourthWallView key={`fourth-wall-${reloadKey}`} api={api} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RollbackStatusView key={`rollback-${reloadKey}`} api={api} />
        <div className="rounded-xl border border-dashed border-border p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
            <FileText aria-hidden="true" size={16} className="text-blue-400" />
            审核与回滚证据绑定
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            专业编剧审核与精确回滚分别绑定证据标识
            <code className="mx-1 rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-slate-400">ev:&lt;runId&gt;:professional-screenwriter-review</code>
            与
            <code className="mx-1 rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-slate-400">ev:&lt;runId&gt;:rollback</code>，
            其 HTTP 回读路径与数据库记录标识均可在上方的“证据状态”中核对。回滚采用精确幂等语义：重复调用解析到同一回执，读回状态稳定为
            <code className="mx-1 rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-slate-400">artifact:target-policy-v4</code>。
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <UserCheck aria-hidden="true" size={14} className="text-emerald-400" />
            第四墙互动保持选择加入与可回退个性化；审核与回滚视图不做任何写入，仅通过后端只读回读端点呈现。
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <RotateCcw aria-hidden="true" size={14} className="text-amber-400" />
            冻结 v5 包路径与比较预算保持只读，本入口不弱化任何硬门。
          </p>
        </div>
      </div>
    </div>
  );
}
