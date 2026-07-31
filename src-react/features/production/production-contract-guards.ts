import type {
  BlockingPlan,
  CinematicCoveragePlan,
  CoverageBundle,
  CoverageCameraRole,
  CoverageCameraStatus,
  CoverageMediaAsset,
  CoverageShotSize,
  CoverageTimedMediaAsset,
  CoverageVector3,
  ProductionPrevisRender,
  ProductionPrevisShotContract,
  ProductionState,
  RecommendedCut,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new Error(`合同校验失败: ${path} ${expected}`);
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "必须是对象");
  return value as UnknownRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "必须是数组");
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) fail(path, "必须是非空字符串");
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "必须是有限数字");
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "必须是布尔值");
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path, true);
}

function optionalNumber(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : number(value, path);
}

function literalOne(value: unknown, path: string): "1" {
  if (value !== "1") fail(path, "必须等于 1");
  return "1";
}

function vector3(value: unknown, path: string): CoverageVector3 {
  const values = array(value, path);
  if (values.length !== 3) fail(path, "必须包含 3 个数字");
  return [number(values[0], `${path}[0]`), number(values[1], `${path}[1]`), number(values[2], `${path}[2]`)];
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => string(item, `${path}[${index}]`));
}

function cameraRole(value: unknown, path: string): CoverageCameraRole {
  switch (value) {
    case "MASTER": case "TWO_SHOT": case "OTS_A": case "OTS_B": case "SINGLE_A": case "SINGLE_B":
    case "REACTION_A": case "REACTION_B": case "INSERT": case "BRIDGE": return value;
    default: return fail(path, "包含未知机位角色");
  }
}

function shotSize(value: unknown, path: string): CoverageShotSize {
  switch (value) {
    case "extreme-wide": case "wide": case "medium": case "close-up": case "extreme-close-up": return value;
    default: return fail(path, "包含未知景别");
  }
}

function cameraStatus(value: unknown, path: string): CoverageCameraStatus {
  switch (value) {
    case "planned": case "queued": case "rendering": case "previs-ready": case "generating": case "ready": case "failed": return value;
    default: return fail(path, "包含未知机位状态");
  }
}

export function parseProductionState(value: unknown, path: string): ProductionState {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  switch (normalized) {
    case "idle": case "未生成": return "idle";
    case 0: case 2: case "生成中": case "处理中": case "排队中": case "pending": case "processing": case "queued": case "rendering": case "generating": case "running": return "running";
    case 1: case "生成成功": case "已完成": case "成功": case "success": case "ready": case "previs-ready": case "completed": return "completed";
    case -1: case "生成失败": case "失败": case "异常": case "error": case "failed": return "failed";
    default: return fail(path, "包含未知生产状态");
  }
}

export function parseBlockingPlan(value: unknown, path = "coverage.plan.blocking"): BlockingPlan {
  const item = record(value, path);
  const axis = record(item.axis, `${path}.axis`);
  const allowedSide = axis.allowedSide === "left" || axis.allowedSide === "right"
    ? axis.allowedSide
    : fail(`${path}.axis.allowedSide`, "必须是 left 或 right");
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    sceneId: string(item.sceneId, `${path}.sceneId`),
    performanceTakeId: string(item.performanceTakeId, `${path}.performanceTakeId`),
    durationSeconds: number(item.durationSeconds, `${path}.durationSeconds`),
    fps: number(item.fps, `${path}.fps`),
    axis: {
      fromActorId: string(axis.fromActorId, `${path}.axis.fromActorId`),
      toActorId: string(axis.toActorId, `${path}.axis.toActorId`),
      allowedSide,
    },
    actorAnchors: array(item.actorAnchors, `${path}.actorAnchors`).map((entry, index) => {
      const anchorPath = `${path}.actorAnchors[${index}]`;
      const anchor = record(entry, anchorPath);
      const lookAtActorId = optionalString(anchor.lookAtActorId, `${anchorPath}.lookAtActorId`);
      return {
        actorId: string(anchor.actorId, `${anchorPath}.actorId`),
        anchorId: string(anchor.anchorId, `${anchorPath}.anchorId`),
        position: vector3(anchor.position, `${anchorPath}.position`),
        rotationEuler: vector3(anchor.rotationEuler, `${anchorPath}.rotationEuler`),
        ...(lookAtActorId === undefined ? {} : { lookAtActorId }),
      };
    }),
    beats: array(item.beats, `${path}.beats`).map((entry, index) => {
      const beatPath = `${path}.beats[${index}]`;
      const beat = record(entry, beatPath);
      const speakerId = optionalString(beat.speakerId, `${beatPath}.speakerId`);
      return {
        id: string(beat.id, `${beatPath}.id`),
        startFrame: number(beat.startFrame, `${beatPath}.startFrame`),
        endFrame: number(beat.endFrame, `${beatPath}.endFrame`),
        ...(speakerId === undefined ? {} : { speakerId }),
        reactionActorIds: stringArray(beat.reactionActorIds, `${beatPath}.reactionActorIds`),
        intensity: number(beat.intensity, `${beatPath}.intensity`),
        action: string(beat.action, `${beatPath}.action`),
      };
    }),
  };
}

export function parseCinematicCoveragePlan(value: unknown, path = "coverage.plan"): CinematicCoveragePlan {
  const item = record(value, path);
  const editPolicy = record(item.editPolicy, `${path}.editPolicy`);
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    coverageId: string(item.coverageId, `${path}.coverageId`),
    projectId: number(item.projectId, `${path}.projectId`),
    scriptId: number(item.scriptId, `${path}.scriptId`),
    storyboardId: number(item.storyboardId, `${path}.storyboardId`),
    presetId: string(item.presetId, `${path}.presetId`),
    blocking: parseBlockingPlan(item.blocking, `${path}.blocking`),
    cameras: array(item.cameras, `${path}.cameras`).map((entry, index) => {
      const cameraPath = `${path}.cameras[${index}]`;
      const camera = record(entry, cameraPath);
      return {
        cameraId: string(camera.cameraId, `${cameraPath}.cameraId`),
        role: cameraRole(camera.role, `${cameraPath}.role`),
        shotSize: shotSize(camera.shotSize, `${cameraPath}.shotSize`),
        lensMm: number(camera.lensMm, `${cameraPath}.lensMm`),
        subjects: stringArray(camera.subjects, `${cameraPath}.subjects`),
        foregroundSubjects: stringArray(camera.foregroundSubjects, `${cameraPath}.foregroundSubjects`),
        activeBeatIds: stringArray(camera.activeBeatIds, `${cameraPath}.activeBeatIds`),
        handlesFrames: number(camera.handlesFrames, `${cameraPath}.handlesFrames`),
        language: string(camera.language, `${cameraPath}.language`),
      };
    }),
    editPolicy: {
      startWide: boolean(editPolicy.startWide, `${path}.editPolicy.startWide`),
      preferListenerOnReveal: boolean(editPolicy.preferListenerOnReveal, `${path}.editPolicy.preferListenerOnReveal`),
      reserveCloseUpUntilIntensity: number(editPolicy.reserveCloseUpUntilIntensity, `${path}.editPolicy.reserveCloseUpUntilIntensity`),
      minimumShotFrames: number(editPolicy.minimumShotFrames, `${path}.editPolicy.minimumShotFrames`),
    },
  };
}

function mediaAsset(value: unknown, path: string): CoverageMediaAsset {
  const item = record(value, path);
  return { key: string(item.key, `${path}.key`), url: string(item.url, `${path}.url`) };
}

function timedMediaAsset(value: unknown, path: string): CoverageTimedMediaAsset {
  const item = record(value, path);
  return { ...mediaAsset(item, path), frame: number(item.frame, `${path}.frame`) };
}

function optionalMedia(value: unknown, path: string) {
  return value === undefined ? undefined : mediaAsset(value, path);
}

function optionalTimedMediaArray(value: unknown, path: string) {
  return value === undefined ? undefined : array(value, path).map((item, index) => timedMediaAsset(item, `${path}[${index}]`));
}

export function parseCoverageBundle(value: unknown, path = "coverage.bundle"): CoverageBundle {
  const item = record(value, path);
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    coverageId: string(item.coverageId, `${path}.coverageId`),
    sceneId: string(item.sceneId, `${path}.sceneId`),
    performanceTakeId: string(item.performanceTakeId, `${path}.performanceTakeId`),
    durationSeconds: number(item.durationSeconds, `${path}.durationSeconds`),
    fps: number(item.fps, `${path}.fps`),
    frameCount: number(item.frameCount, `${path}.frameCount`),
    cameras: array(item.cameras, `${path}.cameras`).map((entry, index) => {
      const cameraPath = `${path}.cameras[${index}]`;
      const camera = record(entry, cameraPath);
      const assets = camera.assets === undefined ? undefined : record(camera.assets, `${cameraPath}.assets`);
      const quality = camera.quality === undefined ? undefined : record(camera.quality, `${cameraPath}.quality`);
      const retry = camera.retry === undefined ? undefined : record(camera.retry, `${cameraPath}.retry`);
      const renderId = optionalString(camera.renderId, `${cameraPath}.renderId`);
      const videoId = optionalNumber(camera.videoId, `${cameraPath}.videoId`);
      const qualityStatus = quality === undefined ? undefined : quality.status === "pending" || quality.status === "passed" || quality.status === "failed"
        ? quality.status
        : fail(`${cameraPath}.quality.status`, "必须是 pending、passed 或 failed");
      const score = quality === undefined ? undefined : optionalNumber(quality.score, `${cameraPath}.quality.score`);
      const lastError = retry === undefined ? undefined : optionalString(retry.lastError, `${cameraPath}.retry.lastError`);
      const lastAttemptAt = retry === undefined ? undefined : optionalString(retry.lastAttemptAt, `${cameraPath}.retry.lastAttemptAt`);
      return {
        cameraId: string(camera.cameraId, `${cameraPath}.cameraId`),
        role: cameraRole(camera.role, `${cameraPath}.role`),
        startFrame: number(camera.startFrame, `${cameraPath}.startFrame`),
        endFrame: number(camera.endFrame, `${cameraPath}.endFrame`),
        beatIds: stringArray(camera.beatIds, `${cameraPath}.beatIds`),
        subjects: stringArray(camera.subjects, `${cameraPath}.subjects`),
        status: cameraStatus(camera.status, `${cameraPath}.status`),
        ...(renderId === undefined ? {} : { renderId }),
        ...(videoId === undefined ? {} : { videoId }),
        ...(assets === undefined ? {} : { assets: {
          ...(assets.previewVideo === undefined ? {} : { previewVideo: optionalMedia(assets.previewVideo, `${cameraPath}.assets.previewVideo`) }),
          ...(assets.firstFrame === undefined ? {} : { firstFrame: optionalMedia(assets.firstFrame, `${cameraPath}.assets.firstFrame`) }),
          ...(assets.lastFrame === undefined ? {} : { lastFrame: optionalMedia(assets.lastFrame, `${cameraPath}.assets.lastFrame`) }),
          ...(assets.manifest === undefined ? {} : { manifest: optionalMedia(assets.manifest, `${cameraPath}.assets.manifest`) }),
          ...(assets.controlFrames === undefined ? {} : { controlFrames: optionalTimedMediaArray(assets.controlFrames, `${cameraPath}.assets.controlFrames`) }),
          ...(assets.depthMaps === undefined ? {} : { depthMaps: optionalTimedMediaArray(assets.depthMaps, `${cameraPath}.assets.depthMaps`) }),
          ...(assets.masks === undefined ? {} : { masks: optionalTimedMediaArray(assets.masks, `${cameraPath}.assets.masks`) }),
        } }),
        ...(quality === undefined || qualityStatus === undefined ? {} : { quality: {
          status: qualityStatus,
          ...(score === undefined ? {} : { score }),
          issues: array(quality.issues, `${cameraPath}.quality.issues`).map((entry, issueIndex) => {
            const issuePath = `${cameraPath}.quality.issues[${issueIndex}]`;
            const issue = record(entry, issuePath);
            const severity = issue.severity === "warning" || issue.severity === "error" ? issue.severity : fail(`${issuePath}.severity`, "必须是 warning 或 error");
            return { code: string(issue.code, `${issuePath}.code`), severity, message: string(issue.message, `${issuePath}.message`) };
          }),
        } }),
        ...(retry === undefined ? {} : { retry: {
          attempt: number(retry.attempt, `${cameraPath}.retry.attempt`),
          maxAttempts: number(retry.maxAttempts, `${cameraPath}.retry.maxAttempts`),
          ...(lastError === undefined ? {} : { lastError }),
          ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }),
        } }),
      };
    }),
  };
}

export function parseRecommendedCut(value: unknown, path = "coverage.recommendedCut"): RecommendedCut {
  const item = record(value, path);
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    coverageId: string(item.coverageId, `${path}.coverageId`),
    performanceTakeId: string(item.performanceTakeId, `${path}.performanceTakeId`),
    fps: number(item.fps, `${path}.fps`),
    durationFrames: number(item.durationFrames, `${path}.durationFrames`),
    clips: array(item.clips, `${path}.clips`).map((entry, index) => {
      const clipPath = `${path}.clips[${index}]`;
      const clip = record(entry, clipPath);
      return {
        id: string(clip.id, `${clipPath}.id`),
        cameraId: string(clip.cameraId, `${clipPath}.cameraId`),
        startFrame: number(clip.startFrame, `${clipPath}.startFrame`),
        endFrame: number(clip.endFrame, `${clipPath}.endFrame`),
        sourceInFrame: number(clip.sourceInFrame, `${clipPath}.sourceInFrame`),
        sourceOutFrame: number(clip.sourceOutFrame, `${clipPath}.sourceOutFrame`),
        videoId: number(clip.videoId, `${clipPath}.videoId`),
      };
    }),
  };
}

export function parsePrevisShotContract(value: unknown, path = "previs.contract"): ProductionPrevisShotContract {
  const item = record(value, path);
  const output = record(item.output, `${path}.output`);
  const scene = record(item.scene, `${path}.scene`);
  const worldAssetId = optionalNumber(scene.worldAssetId, `${path}.scene.worldAssetId`);
  const colliderMeshUrl = optionalString(scene.colliderMeshUrl, `${path}.scene.colliderMeshUrl`);
  const panoramaUrl = optionalString(scene.panoramaUrl, `${path}.scene.panoramaUrl`);
  const camera = record(item.camera, `${path}.camera`);
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    projectId: number(item.projectId, `${path}.projectId`),
    scriptId: number(item.scriptId, `${path}.scriptId`),
    storyboardId: number(item.storyboardId, `${path}.storyboardId`),
    name: string(item.name, `${path}.name`),
    durationSeconds: number(item.durationSeconds, `${path}.durationSeconds`),
    output: { width: number(output.width, `${path}.output.width`), height: number(output.height, `${path}.output.height`), fps: number(output.fps, `${path}.output.fps`) },
    scene: {
      ...(worldAssetId === undefined ? {} : { worldAssetId }),
      ...(colliderMeshUrl === undefined ? {} : { colliderMeshUrl }),
      ...(panoramaUrl === undefined ? {} : { panoramaUrl }),
      backgroundColor: string(scene.backgroundColor, `${path}.scene.backgroundColor`),
    },
    actors: array(item.actors, `${path}.actors`).map((entry, index) => {
      const actorPath = `${path}.actors[${index}]`;
      const actor = record(entry, actorPath);
      const sourceAssetId = optionalNumber(actor.sourceAssetId, `${actorPath}.sourceAssetId`);
      return {
        id: string(actor.id, `${actorPath}.id`), name: string(actor.name, `${actorPath}.name`),
        ...(sourceAssetId === undefined ? {} : { sourceAssetId }),
        scale: vector3(actor.scale, `${actorPath}.scale`),
        keyframes: array(actor.keyframes, `${actorPath}.keyframes`).map((keyframeEntry, keyframeIndex) => {
          const keyframePath = `${actorPath}.keyframes[${keyframeIndex}]`;
          const keyframe = record(keyframeEntry, keyframePath);
          const pose = optionalString(keyframe.pose, `${keyframePath}.pose`);
          return { frame: number(keyframe.frame, `${keyframePath}.frame`), position: vector3(keyframe.position, `${keyframePath}.position`), rotationEuler: vector3(keyframe.rotationEuler, `${keyframePath}.rotationEuler`), ...(pose === undefined ? {} : { pose }) };
        }),
      };
    }),
    props: array(item.props, `${path}.props`).map((entry, index) => {
      const propPath = `${path}.props[${index}]`;
      const prop = record(entry, propPath);
      const sourceAssetId = optionalNumber(prop.sourceAssetId, `${propPath}.sourceAssetId`);
      return { id: string(prop.id, `${propPath}.id`), name: string(prop.name, `${propPath}.name`), ...(sourceAssetId === undefined ? {} : { sourceAssetId }), position: vector3(prop.position, `${propPath}.position`), rotationEuler: vector3(prop.rotationEuler, `${propPath}.rotationEuler`), scale: vector3(prop.scale, `${propPath}.scale`) };
    }),
    camera: {
      lensMm: number(camera.lensMm, `${path}.camera.lensMm`),
      keyframes: array(camera.keyframes, `${path}.camera.keyframes`).map((entry, index) => {
        const keyframePath = `${path}.camera.keyframes[${index}]`;
        const keyframe = record(entry, keyframePath);
        return { frame: number(keyframe.frame, `${keyframePath}.frame`), position: vector3(keyframe.position, `${keyframePath}.position`), target: vector3(keyframe.target, `${keyframePath}.target`) };
      }),
    },
  };
}

export function parsePrevisResult(value: unknown, path = "previs.result"): NonNullable<ProductionPrevisRender["result"]> {
  const item = record(value, path);
  return {
    schemaVersion: literalOne(item.schemaVersion, `${path}.schemaVersion`),
    previewVideoKey: string(item.previewVideoKey, `${path}.previewVideoKey`), previewVideoUrl: string(item.previewVideoUrl, `${path}.previewVideoUrl`),
    firstFrameKey: string(item.firstFrameKey, `${path}.firstFrameKey`), firstFrameUrl: string(item.firstFrameUrl, `${path}.firstFrameUrl`),
    lastFrameKey: string(item.lastFrameKey, `${path}.lastFrameKey`), lastFrameUrl: string(item.lastFrameUrl, `${path}.lastFrameUrl`),
    manifestKey: string(item.manifestKey, `${path}.manifestKey`), manifestUrl: string(item.manifestUrl, `${path}.manifestUrl`),
    width: number(item.width, `${path}.width`), height: number(item.height, `${path}.height`), fps: number(item.fps, `${path}.fps`), frameCount: number(item.frameCount, `${path}.frameCount`), durationSeconds: number(item.durationSeconds, `${path}.durationSeconds`),
  };
}
