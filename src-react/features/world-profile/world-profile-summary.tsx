import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";

import {
  projectWorldProfileCompletion,
  projectWorldProfileSummary,
  type ProjectWorldProfile,
} from "./world-profile-fields";

export function WorldProfileSummary({ profile, compact = false }: { profile: ProjectWorldProfile | null; compact?: boolean }) {
  const completion = projectWorldProfileCompletion(profile);
  const content =
    completion === "complete"
      ? { Icon: CircleCheck, label: "世界设定已配置", style: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" }
      : completion === "partial"
        ? { Icon: CircleAlert, label: "世界设定待完善", style: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" }
        : { Icon: CircleDashed, label: "未配置世界设定", style: "border-slate-700 bg-slate-900 text-slate-400" };
  const { Icon } = content;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${content.style}`}>
        <Icon className="size-3.5" />
        {content.label}
      </span>
      <p className={`${compact ? "line-clamp-2 text-xs leading-5" : "text-sm leading-6"} text-slate-400`}>
        {projectWorldProfileSummary(profile)}
      </p>
    </div>
  );
}
