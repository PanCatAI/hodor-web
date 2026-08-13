import type { ProjectWorldProfile, ProjectWorldProfileForm } from "./world-profile-fields";
import { worldProfileFromForm, worldProfileToForm } from "./world-profile-fields";

export interface WorldProfileEditorProps {
  value: ProjectWorldProfile;
  onChange: (value: ProjectWorldProfile) => void;
  compact?: boolean;
}

const inputClass =
  "h-10 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-blue-500";
const textareaClass =
  "min-h-24 w-full resize-y rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-blue-500";

const listFields: ReadonlyArray<{
  key: Exclude<keyof ProjectWorldProfileForm, "schemaVersion" | "genre" | "culturalBase" | "era" | "premise">;
  label: string;
  placeholder: string;
}> = [
  { key: "worldRules", label: "世界规则", placeholder: "每行一条不可违背的世界规则" },
  { key: "geography", label: "地理与疆域", placeholder: "每行一个区域、边界或自然条件" },
  { key: "peoples", label: "族群与物种", placeholder: "每行一个族群、物种及其辨识特征" },
  { key: "factions", label: "势力与组织", placeholder: "每行一个家族、教会、王国或组织" },
  { key: "religions", label: "信仰与神话", placeholder: "每行一个信仰、神祇、仪式或禁忌" },
  { key: "magicRules", label: "魔法规则", placeholder: "每行一条能力、代价、边界或例外" },
  { key: "technologyRules", label: "技术边界", placeholder: "每行一条可用或不可用的技术" },
  { key: "socialRules", label: "社会规则", placeholder: "每行一条阶层、礼仪、法律或日常习俗" },
  { key: "locations", label: "关键地点", placeholder: "每行一个地点及其叙事功能" },
  { key: "materialCulture", label: "物质文化", placeholder: "每行一条服装、建筑、器物或材料规则" },
  { key: "visualMotifs", label: "视觉母题", placeholder: "每行一个色彩、纹样、光线或反复意象" },
  { key: "castingRules", label: "角色外观规则", placeholder: "每行一条族裔、年龄、体态或造型连续性要求" },
  { key: "forbiddenElements", label: "禁止元素", placeholder: "每行一个不得出现的时代、文化或视觉元素" },
  { key: "secrets", label: "世界秘密", placeholder: "每行一个真实存在但暂未公开的秘密" },
  { key: "revealRules", label: "揭示规则", placeholder: "每行一条秘密可以在何时、由谁、以何种证据揭示" },
  { key: "unresolvedQuestions", label: "待确认问题", placeholder: "每行一个需要作者或智能体继续确认的问题" },
];

export function WorldProfileEditor({ value, onChange, compact = false }: WorldProfileEditorProps) {
  const form = worldProfileToForm(value);

  function update<Key extends keyof ProjectWorldProfileForm>(key: Key, next: ProjectWorldProfileForm[Key]) {
    onChange(worldProfileFromForm({ ...form, [key]: next }));
  }

  return (
    <section aria-label="世界设定编辑器" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1.5 text-xs text-slate-400">
          类型
          <input aria-label="世界类型" value={form.genre} onChange={(event) => update("genre", event.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-xs text-slate-400">
          文化基底
          <input
            aria-label="文化基底"
            value={form.culturalBase}
            onChange={(event) => update("culturalBase", event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-slate-400">
          时代
          <input aria-label="时代" value={form.era} onChange={(event) => update("era", event.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs text-slate-400">
        世界前提
        <textarea
          aria-label="世界前提"
          value={form.premise}
          onChange={(event) => update("premise", event.target.value)}
          className={textareaClass}
          placeholder="用一段话说明世界的核心冲突、超自然前提与故事发生条件"
        />
      </label>
      <div className={`grid gap-4 ${compact ? "grid-cols-1" : "lg:grid-cols-2"}`}>
        {listFields.map((field) => (
          <label key={field.key} className="grid gap-1.5 text-xs text-slate-400">
            {field.label}
            <textarea
              aria-label={field.label}
              value={form[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              className={textareaClass}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
