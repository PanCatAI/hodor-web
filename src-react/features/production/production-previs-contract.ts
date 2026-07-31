import { createProductionDirectorProject } from "./production-director-project";
import type { PrevisVector3, ProductionFlowData, ProductionPrevisShotContract, ProductionVideoRatio } from "./types";

function toBlender(value: [number, number, number]): PrevisVector3 { return [value[0], -value[2], value[1]]; }
function outputSize(ratio: ProductionVideoRatio) {
  if (ratio === "9:16") return { width: 720, height: 1280, fps: 24 };
  if (ratio === "1:1") return { width: 1024, height: 1024, fps: 24 };
  return { width: 1280, height: 720, fps: 24 };
}
function sourceId(id: string) { const match = /-(\d+)$/.exec(id); return match ? Number(match[1]) : undefined; }

export function createProductionPrevisContract(flow: ProductionFlowData, projectId: number, scriptId: number, storyboardId: number, ratio: ProductionVideoRatio = "16:9"): ProductionPrevisShotContract {
  const storyboard = flow.storyboard.find((item) => item.id === storyboardId);
  if (!storyboard) throw new Error("分镜不存在");
  const director = createProductionDirectorProject(flow, storyboardId);
  const durationSeconds = Math.min(60, Math.max(1, storyboard.duration || 5));
  const output = outputSize(ratio);
  const frameCount = Math.round(durationSeconds * output.fps);
  const moving = /走|跑|推进|拉近|跟随|移动|walk|run|push|track|dolly/i.test(`${storyboard.videoDesc} ${storyboard.prompt}`);
  const camera = director.cameras.find((item) => item.id === director.activeCameraId) ?? director.cameras[0];
  if (!camera) throw new Error("导演台没有可用镜头");
  const cameraStart = toBlender(camera.transform.position);
  const cameraTarget = toBlender(camera.target);
  const cameraEnd: PrevisVector3 = moving ? [cameraStart[0] + (cameraTarget[0] - cameraStart[0]) * 0.18, cameraStart[1] + (cameraTarget[1] - cameraStart[1]) * 0.18, cameraStart[2] + (cameraTarget[2] - cameraStart[2]) * 0.08] : [...cameraStart];
  return {
    schemaVersion: "1", projectId, scriptId, storyboardId,
    name: `S${String(storyboard.index + 1).padStart(2, "0")} ${storyboard.videoDesc || storyboard.prompt || "镜头预演"}`,
    durationSeconds, output,
    scene: { ...(director.sceneWorldAssetId ? { worldAssetId: director.sceneWorldAssetId } : {}), ...(director.sceneWorld?.colliderMeshUrl ? { colliderMeshUrl: director.sceneWorld.colliderMeshUrl } : {}), ...(director.sceneWorld?.panoramaUrl ? { panoramaUrl: director.sceneWorld.panoramaUrl } : {}), backgroundColor: director.scene.backgroundColor },
    actors: director.objects.filter((object) => object.kind === "character").map((object, index) => {
      const position = toBlender(object.transform.position);
      const end: PrevisVector3 = moving ? [position[0] + 0.45 + index * 0.08, position[1], position[2]] : [...position];
      return { id: object.id, name: object.name, ...(sourceId(object.id) ? { sourceAssetId: sourceId(object.id) } : {}), scale: object.transform.scale, keyframes: [{ frame: 1, position, rotationEuler: object.transform.rotation, pose: moving ? "walk" : "stand" }, { frame: frameCount, position: end, rotationEuler: object.transform.rotation, pose: moving ? "walk" : "stand" }] };
    }),
    props: director.objects.filter((object) => object.kind === "prop").map((object) => ({ id: object.id, name: object.name, ...(sourceId(object.id) ? { sourceAssetId: sourceId(object.id) } : {}), position: toBlender(object.transform.position), rotationEuler: object.transform.rotation, scale: object.transform.scale })),
    camera: { lensMm: Math.max(10, Math.min(300, 36 / (2 * Math.tan((camera.fov * Math.PI) / 360)))), keyframes: [{ frame: 1, position: cameraStart, target: cameraTarget }, { frame: frameCount, position: cameraEnd, target: cameraTarget }] },
  };
}
