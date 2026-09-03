/**
 * 目标优先的项目入口草稿。
 *
 * 项目列表页的大型目标对话框把「制作目标 / 项目类型 / 必要约束」写入草稿，
 * 创建项目后进入统一画布；画布的目标提示读取草稿预填，用户确认后把约束
 * 写入 ProductionGraph 的目标节点，随后清除草稿。这样目标只输入一次，
 * 创建项目与建立生产图两个步骤共享同一份意图。
 */

export const PROJECT_GOAL_DRAFT_KEY = "hodorProjectGoalDraft";

export interface ProjectGoalDraft {
  goal: string;
  constraints: string;
  projectType: string;
}

export function readProjectGoalDraft(storage: Pick<Storage, "getItem"> = globalThis.sessionStorage): ProjectGoalDraft | null {
  try {
    const raw = storage.getItem(PROJECT_GOAL_DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ProjectGoalDraft>;
    if (typeof value.goal !== "string" || !value.goal.trim()) return null;
    return {
      goal: value.goal.trim(),
      constraints: typeof value.constraints === "string" ? value.constraints.trim() : "",
      projectType: typeof value.projectType === "string" ? value.projectType : "novel",
    };
  } catch {
    return null;
  }
}

export function writeProjectGoalDraft(draft: ProjectGoalDraft, storage: Pick<Storage, "setItem"> = globalThis.sessionStorage) {
  storage.setItem(PROJECT_GOAL_DRAFT_KEY, JSON.stringify(draft));
}

export function clearProjectGoalDraft(storage: Pick<Storage, "removeItem"> = globalThis.sessionStorage) {
  storage.removeItem(PROJECT_GOAL_DRAFT_KEY);
}

/** 把「必要约束」文本按行拆成 ProductionGraph 约束条目。 */
export function parseGoalConstraints(constraints: string): { code: string; params: Record<string, unknown> }[] {
  return constraints
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ code: "user-specified", params: { text } }));
}
