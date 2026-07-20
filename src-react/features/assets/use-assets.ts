import { useCallback, useEffect, useMemo, useState } from "react";

import type { AssetApi } from "./asset-api";
import { collectGeneratingIds, mergeAssetUpdates } from "./asset-state";
import type { AssetRecord, AssetType } from "./types";

interface UseAssetsOptions {
  api: AssetApi;
  projectId: number;
  type: AssetType;
  name: string;
  page: number;
  pageSize: number;
  pollInterval?: number;
}

export function useAssets({ api, projectId, type, name, page, pageSize, pollInterval = 3000 }: UseAssetsOptions) {
  const [items, setItems] = useState<AssetRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAssets({ projectId, type, name: name || undefined, page, limit: pageSize });
      setItems(result.items);
      setTotal(result.total);
    } catch (reason) {
      setItems([]);
      setTotal(0);
      setError(reason instanceof Error ? reason.message : "资产加载失败");
    } finally {
      setLoading(false);
    }
  }, [api, name, page, pageSize, projectId, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const jobs = useMemo(() => collectGeneratingIds(items), [items]);

  useEffect(() => {
    if (!jobs.imageIds.length && !jobs.promptIds.length) return;

    const poll = async () => {
      try {
        const [imageUpdates, promptUpdates] = await Promise.all([
          jobs.imageIds.length ? api.pollImageAssets(jobs.imageIds) : Promise.resolve([]),
          jobs.promptIds.length ? api.pollPromptAssets(jobs.promptIds) : Promise.resolve([]),
        ]);
        if (imageUpdates.length || promptUpdates.length) {
          setItems((current) => mergeAssetUpdates(current, [...imageUpdates, ...promptUpdates]));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "生成状态更新失败");
      }
    };

    const timer = window.setInterval(() => void poll(), pollInterval);
    return () => window.clearInterval(timer);
  }, [api, jobs.imageIds.join(","), jobs.promptIds.join(","), pollInterval]);

  return { items, total, loading, error, reload: load };
}
