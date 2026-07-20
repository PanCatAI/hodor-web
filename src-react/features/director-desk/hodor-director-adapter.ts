import type { HodorApiClient } from "@react/lib/api/client";

import type {
  DirectorDeskAdapter,
  DirectorDeskCaptureUploadInput,
  DirectorDeskLoadReceipt,
  DirectorDeskSaveInput,
  DirectorDeskSaveReceipt,
  DirectorDeskScope,
} from "./director-desk-contract";

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
  paths: {
    loadProject: string;
    saveProject: string;
    uploadCapture: string;
  } = {
    loadProject: "/directorDesk/getProject",
    saveProject: "/directorDesk/saveProject",
    uploadCapture: "/directorDesk/uploadCapture",
  },
): DirectorDeskAdapter {
  return {
    async loadProject(scope: DirectorDeskScope) {
      return client.request<DirectorDeskLoadReceipt | null>(paths.loadProject, {
        method: "POST",
        body: JSON.stringify({
          projectId: apiScopeId(scope.projectId),
          storyboardId: apiScopeId(scope.storyboardId),
        }),
      });
    },

    async saveProject(input: DirectorDeskSaveInput) {
      return client.request<DirectorDeskSaveReceipt>(paths.saveProject, {
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
      const receipt = await client.request<Record<string, unknown>>(paths.uploadCapture, {
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
  };
}
