import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

import type { HodorApiClient } from "@react/lib/api/client";

export interface CurrentProject {
  id: number;
  projectType: string;
}

export interface CurrentProjectState {
  project: CurrentProject | null;
  loading: boolean;
  error: string;
}

const CurrentProjectContext = createContext<CurrentProjectState | null>(null);

export function CurrentProjectProvider({ value, children }: { value: CurrentProjectState; children: ReactNode }) {
  return createElement(CurrentProjectContext.Provider, { value }, children);
}

export function useCurrentProjectContext() {
  const value = useContext(CurrentProjectContext);
  if (!value) throw new Error("CurrentProjectProvider 未挂载");
  return value;
}

function normalizeProjects(value: unknown): CurrentProject[] {
  const items = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = Number(record.id);
    if (!Number.isInteger(id) || id <= 0) return [];
    return [{ id, projectType: typeof record.projectType === "string" ? record.projectType : "" }];
  });
}

export function useCurrentProject(apiClient: HodorApiClient, projectId: number | null) {
  const [project, setProject] = useState<CurrentProject | null>(null);
  const [loading, setLoading] = useState(projectId != null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setError("");
    if (projectId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void apiClient
      .request<unknown>("/project/getProject", { method: "POST" })
      .then((value) => {
        if (cancelled) return;
        const current = normalizeProjects(value).find((item) => item.id === projectId) ?? null;
        setProject(current);
        if (!current) setError("找不到当前项目");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "项目类型读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, projectId]);

  return { project, loading, error };
}
