import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Clapperboard, LoaderCircle, RefreshCw } from "lucide-react";

import { CanvasAgentPanel } from "@react/features/canvas";
import type { InteractiveStoryApi, InteractiveStoryNodePositionUpdate } from "./interactive-story-api";
import { InteractiveStoryCanvas } from "./interactive-story-canvas";
import type { InteractiveStoryGraph } from "./types";

export interface InteractiveStoryPageProps {
  projectId: number;
  api: InteractiveStoryApi;
  renderScriptAgent: (onBusyChange: (busy: boolean) => void, selectedNodeId: string | null) => ReactNode;
  onOpenProduction: (scriptId: number) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "互动剧情图加载失败";
}

export function InteractiveStoryPage({ projectId, api, renderScriptAgent, onOpenProduction }: InteractiveStoryPageProps) {
  const [graph, setGraph] = useState<InteractiveStoryGraph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const agentWasBusy = useRef(false);
  const graphRef = useRef<InteractiveStoryGraph | null>(null);
  const serverRevisionRef = useRef(0);
  const positionVersionRef = useRef(0);
  const dirtyPositionsRef = useRef(new Map<string, { position: { x: number; y: number }; version: number }>());
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const adoptSnapshot = useCallback((snapshot: InteractiveStoryGraph) => {
    serverRevisionRef.current = snapshot.revision;
    const dirty = dirtyPositionsRef.current;
    const merged = dirty.size
      ? {
          ...snapshot,
          nodes: snapshot.nodes.map((node) => {
            const pending = dirty.get(node.id);
            return pending ? { ...node, position: pending.position } : node;
          }),
        }
      : snapshot;
    graphRef.current = merged;
    setGraph(merged);
  }, []);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let next = await api.getGraph(projectId);
      if (!next) {
        await api.initializeGraph(projectId, `互动剧 ${projectId}`);
        next = await api.getGraph(projectId);
      }
      if (!next) throw new Error("互动剧情图初始化后仍无法读取");
      adoptSnapshot(next);
      setSelectedNodeId((current) => (next.nodes.some((node) => node.id === current) ? current : (next.entryNodeId ?? next.nodes[0]?.id ?? null)));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [adoptSnapshot, api, projectId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const savePositions = useCallback(
    (updates: InteractiveStoryNodePositionUpdate[]) => {
      const currentGraph = graphRef.current;
      if (!currentGraph || updates.length === 0) return;
      const existingIds = new Set(currentGraph.nodes.map((node) => node.id));
      const normalized = [...new Map(updates.filter((update) => existingIds.has(update.nodeId)).map((update) => [update.nodeId, update])).values()];
      if (normalized.length === 0) return;

      setError("");
      for (const update of normalized) {
        positionVersionRef.current += 1;
        dirtyPositionsRef.current.set(update.nodeId, { position: update.position, version: positionVersionRef.current });
      }
      const optimistic = {
        ...currentGraph,
        nodes: currentGraph.nodes.map((node) => {
          const update = normalized.find((item) => item.nodeId === node.id);
          return update ? { ...node, position: update.position } : node;
        }),
      };
      graphRef.current = optimistic;
      setGraph(optimistic);

      mutationQueueRef.current = mutationQueueRef.current.then(async () => {
        const pending = [...dirtyPositionsRef.current.entries()];
        const activeGraph = graphRef.current;
        if (!activeGraph || pending.length === 0) return;
        const submittedVersions = new Map(pending.map(([nodeId, value]) => [nodeId, value.version]));
        try {
          const snapshot = await api.updateNodePositions(
            projectId,
            activeGraph.id,
            serverRevisionRef.current,
            pending.map(([nodeId, value]) => ({ nodeId, position: value.position })),
          );
          for (const [nodeId, submittedVersion] of submittedVersions) {
            if (dirtyPositionsRef.current.get(nodeId)?.version === submittedVersion) dirtyPositionsRef.current.delete(nodeId);
          }
          setError("");
          adoptSnapshot(snapshot);
        } catch (cause) {
          setError(errorMessage(cause));
        }
      });
    },
    [adoptSnapshot, api, projectId],
  );

  const handleAgentBusyChange = useCallback(
    (busy: boolean) => {
      if (agentWasBusy.current && !busy) void loadGraph();
      agentWasBusy.current = busy;
    },
    [loadGraph],
  );

  const leadingControls = (
    <div className="flex items-center gap-2">
      <div className="flex h-10 items-center rounded-lg border border-slate-700 bg-slate-950/95 px-3 text-sm text-slate-200 shadow-lg">
        {graph?.title || "互动剧情"}
      </div>
      <button
        type="button"
        aria-label="刷新互动剧情"
        disabled={loading}
        onClick={() => void loadGraph()}
        className="grid size-10 place-items-center rounded-lg border border-slate-700 bg-slate-950/95 text-slate-300 shadow-lg hover:bg-slate-900 disabled:opacity-50">
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );

  const trailingControls = selectedNode ? (
    <button
      type="button"
      aria-label="进入节点生产"
      onClick={() => onOpenProduction(selectedNode.scriptId)}
      className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 text-sm text-slate-200 shadow-lg hover:bg-slate-900">
      <Clapperboard className="size-4" />
      进入节点生产
    </button>
  ) : loading ? (
    <LoaderCircle aria-label="正在读取互动剧情" className="size-5 animate-spin text-slate-300" />
  ) : null;

  return (
    <main className="relative h-screen overflow-hidden bg-[#090b10] text-slate-100">
      {graph ? (
        <InteractiveStoryCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          leadingControls={leadingControls}
          trailingControls={trailingControls}
          onSelectNode={setSelectedNodeId}
          onOpenProduction={onOpenProduction}
          onPositionsChange={savePositions}
        />
      ) : loading ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">正在读取互动剧情…</div>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">互动剧情图暂时为空。</div>
      )}
      {error ? (
        <div role="alert" className="absolute left-1/2 top-3 z-[60] -translate-x-1/2 rounded-lg border border-red-500/30 bg-slate-950 px-3 py-2 text-xs text-red-300 shadow-xl">
          {error}
        </div>
      ) : null}
      <CanvasAgentPanel
        open={agentPanelOpen}
        onOpenChange={setAgentPanelOpen}
        label="剧本智能体侧栏"
        name="剧本智能体">
        {renderScriptAgent(handleAgentBusyChange, selectedNodeId)}
      </CanvasAgentPanel>
    </main>
  );
}
