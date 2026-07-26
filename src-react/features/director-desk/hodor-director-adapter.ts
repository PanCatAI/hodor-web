import type { HodorApiClient } from "@react/lib/api/client";

import type {
  DirectorDeskAdapter,
  DirectorDeskCaptureUploadInput,
  DirectorDeskLoadReceipt,
  DirectorDeskSaveInput,
  DirectorDeskSaveReceipt,
  DirectorDeskScope,
  DirectorWorldJob,
  DirectorWorldJobInput,
  DirectorWorldStartInput,
} from "./director-desk-contract";

export interface HodorDirectorDeskAdapter extends DirectorDeskAdapter {
  startWorldGeneration(input: DirectorWorldStartInput): Promise<DirectorWorldJob>;
  getWorldGeneration(input: DirectorWorldJobInput): Promise<DirectorWorldJob>;
  refreshWorldGeneration(input: DirectorWorldJobInput): Promise<DirectorWorldJob>;
}

function stableCaptureReceipt(receipt: Record<string, unknown>) {
  const stable: Record<string, string | number> = {};
  for (const field of ["assetId", "imageId"] as const) {
    const value = receipt[field];
    if ((typeof value === "string" && value.trim()) || typeof value === "number") stable[field] = value;
  }
  for (const field of ["filePath", "requestId"] as const) {
    const value = receipt[field];
    if (typeof value === "string" && value.trim()) stable[field] = value;
  }
  return stable;
}

function cloudCaptures(captures: DirectorDeskSaveInput["captures"]) {
  return captures
    .filter((capture) => capture.status === "ready" && typeof capture.url === "string" && capture.url.trim())
    .map(({ dataUrl: _dataUrl, error: _error, assetReceipt, ...capture }) => ({
      ...capture,
      assetReceipt: assetReceipt ? stableCaptureReceipt(assetReceipt as Record<string, unknown>) : undefined,
    }));
}

function apiScopeId(value: DirectorDeskScope["projectId"]) {
  if (typeof value === "number") return value;
  const numeric = Number(value);
  return value.trim() && Number.isFinite(numeric) ? numeric : value;
}

async function blobToDataUrl(body: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("导演台截图读取失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(body);
  });
}

export function createHodorDirectorDeskAdapter(
  client: Pick<HodorApiClient, "request">,
  paths: Partial<{
    loadProject: string;
    saveProject: string;
    uploadCapture: string;
    startWorld: string;
    getWorld: string;
    refreshWorld: string;
  }> = {},
): HodorDirectorDeskAdapter {
  const resolvedPaths = {
    loadProject: "/directorDesk/getProject",
    saveProject: "/directorDesk/saveProject",
    uploadCapture: "/directorDesk/uploadCapture",
    startWorld: "/directorDesk/startWorldGeneration",
    getWorld: "/directorDesk/getWorldGeneration",
    refreshWorld: "/directorDesk/refreshWorldGeneration",
    ...paths,
  };

  function worldScope(input: DirectorWorldJobInput) {
    return {
      projectId: apiScopeId(input.scope.projectId),
      storyboardId: apiScopeId(input.scope.storyboardId),
      jobId: input.jobId,
    };
  }

  return {
    async loadProject(scope: DirectorDeskScope) {
      return client.request<DirectorDeskLoadReceipt | null>(resolvedPaths.loadProject, {
        method: "POST",
        body: JSON.stringify({
          projectId: apiScopeId(scope.projectId),
          storyboardId: apiScopeId(scope.storyboardId),
        }),
      });
    },

    async saveProject(input: DirectorDeskSaveInput) {
      return client.request<DirectorDeskSaveReceipt>(resolvedPaths.saveProject, {
        method: "POST",
        body: JSON.stringify({
          projectId: apiScopeId(input.scope.projectId),
          storyboardId: apiScopeId(input.scope.storyboardId),
          projectJson: input.projectJson,
          captures: cloudCaptures(input.captures),
          updatedAt: input.updatedAt,
          revision: input.revision,
        }),
      });
    },

    async uploadCapture(input: DirectorDeskCaptureUploadInput) {
      const dataUrl = await blobToDataUrl(input.body);
      const receipt = await client.request<Record<string, unknown>>(resolvedPaths.uploadCapture, {
        method: "POST",
        body: JSON.stringify({
          projectId: apiScopeId(input.scope.projectId),
          storyboardId: apiScopeId(input.scope.storyboardId),
          fileName: input.fileName,
          contentType: input.contentType,
          dataUrl,
        }),
      });
      if (typeof receipt.url !== "string" || !receipt.url.trim()) {
        throw new Error("导演台截图上传成功，但没有返回可用 URL");
      }
      return { ...stableCaptureReceipt(receipt), url: receipt.url };
    },

    async startWorldGeneration(input: DirectorWorldStartInput) {
      return client.request<DirectorWorldJob>(resolvedPaths.startWorld, {
        method: "POST",
        body: JSON.stringify({
          projectId: apiScopeId(input.scope.projectId),
          storyboardId: apiScopeId(input.scope.storyboardId),
          requestId: input.requestId,
          prompt: input.prompt,
          displayName: input.displayName,
          model: input.model,
          sourceImageUrl: input.sourceImageUrl,
          sourceIsPanorama: input.sourceIsPanorama ?? false,
        }),
      });
    },

    async getWorldGeneration(input: DirectorWorldJobInput) {
      return client.request<DirectorWorldJob>(resolvedPaths.getWorld, {
        method: "POST",
        body: JSON.stringify(worldScope(input)),
      });
    },

    async refreshWorldGeneration(input: DirectorWorldJobInput) {
      return client.request<DirectorWorldJob>(resolvedPaths.refreshWorld, {
        method: "POST",
        body: JSON.stringify(worldScope(input)),
      });
    },
  };
}
