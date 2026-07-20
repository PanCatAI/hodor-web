import type { HodorApiClient } from "@react/lib/api/client";

import type {
  DirectorDeskAdapter,
  DirectorDeskCaptureUploadInput,
  DirectorDeskSaveInput,
} from "./director-desk-contract";

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
): DirectorDeskAdapter {
  return {
    async saveProject(input: DirectorDeskSaveInput) {
      return {
        revision: `local:${String(input.scope.projectId)}:${String(input.scope.storyboardId)}`,
        savedAt: input.updatedAt,
        persistence: "local-draft",
      };
    },

    async uploadCapture(input: DirectorDeskCaptureUploadInput) {
      const dataUrl = await blobToDataUrl(input.body);
      await client.request("/assets/uploadClip", {
        method: "POST",
        body: JSON.stringify({
          projectId: Number(input.scope.projectId),
          base64Data: dataUrl,
          type: "clip",
          name: input.fileName,
        }),
      });
      return {
        url: dataUrl,
        requestId: `hodor-director:${String(input.scope.storyboardId)}:${input.fileName}`,
      };
    },
  };
}
