import type { DerivedAsset, ProductionAsset, ProductionFlowData, StoryboardItem } from "./types";

export interface ProductionDirectorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ProductionDirectorProject {
  version: 1;
  scene: {
    scale: number;
    position: [number, number, number];
    rotation: [number, number, number];
    backgroundColor: string;
    panoramaYaw: number;
    panoramaRadius: number;
    showLabels: boolean;
    snapToGrid: boolean;
    showGround: boolean;
    groundOpacity: number;
    groundHeight: number;
  };
  assets: Array<{
    id: string;
    kind: "character" | "scene" | "prop" | "panorama";
    sourceType: "image";
    fileName: string;
    name: string;
    url: string;
    assetSource: "library";
    projectionMode?: "backdrop";
  }>;
  objects: Array<{
    id: string;
    name: string;
    kind: "character" | "prop" | "camera";
    visible: boolean;
    locked: boolean;
    transform: ProductionDirectorTransform;
    bodyType?: "mannequin";
    color?: string;
    geometryType?: "box";
    linkedCameraId?: string;
    characterRig?: {
      rigType: "ue4-mannequin";
      posePresetId: "stand";
      controls: Record<string, number>;
    };
  }>;
  cameras: Array<{
    id: string;
    name: string;
    fov: number;
    transform: ProductionDirectorTransform;
    targetMode: "manual";
    target: [number, number, number];
    lastCaptureUrl: null;
    captures: [];
  }>;
  activeCameraId: string;
  panoramaAssetId: string | null;
}

const roleColors = ["#4F8EF7", "#E0524D", "#E91E63", "#F2A900", "#9C4DCC", "#12B886"];

function transform(
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): ProductionDirectorTransform {
  return { position, rotation, scale };
}

function safeFileName(prefix: string, id: number, src: string) {
  const extension = /\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(src)?.[1]?.replace("jpeg", "jpg") ?? "jpg";
  return `${prefix}-${id}.${extension}`;
}

type DirectorSourceAsset = DerivedAsset | ProductionAsset;

function referencedAssets(flow: ProductionFlowData, storyboard: StoryboardItem): DirectorSourceAsset[] {
  const assets = flow.assets.flatMap((asset) => [asset, ...asset.derive]);
  const ids = new Set(storyboard.associateAssetsIds ?? []);
  if (!ids.size) return assets.filter((asset) => asset.type === "role" || asset.type === "scene");
  const matched = assets.filter(
    (asset) => ids.has(asset.id) || ("assetsId" in asset && asset.assetsId != null && ids.has(asset.assetsId)),
  );
  return matched.length ? matched : assets.filter((asset) => asset.type === "role" || asset.type === "scene");
}

export function createProductionDirectorProject(flow: ProductionFlowData, storyboardId: number): ProductionDirectorProject {
  const storyboard = flow.storyboard.find((item) => item.id === storyboardId) ?? flow.storyboard[0];
  if (!storyboard) throw new Error("当前剧本没有可用分镜");

  const assets = referencedAssets(flow, storyboard);
  const roles = assets.filter((asset) => asset.type === "role");
  const scenes = assets.filter((asset) => asset.type === "scene" && asset.src);
  const props = assets.filter((asset) => asset.type === "tool" || asset.type === "clip");
  const directorAssets: ProductionDirectorProject["assets"] = [];

  for (const role of roles) {
    if (!role.src) continue;
    directorAssets.push({
      id: `asset-role-${role.id}`,
      kind: "character",
      sourceType: "image",
      fileName: safeFileName("role", role.id, role.src),
      name: role.name,
      url: role.src,
      assetSource: "library",
    });
  }
  for (const scene of scenes) {
    directorAssets.push({
      id: `asset-scene-${scene.id}`,
      kind: "panorama",
      sourceType: "image",
      fileName: safeFileName("scene", scene.id, scene.src),
      name: scene.name,
      url: scene.src,
      assetSource: "library",
      projectionMode: "backdrop",
    });
  }
  if (storyboard.src) {
    directorAssets.push({
      id: `asset-storyboard-${storyboard.id}`,
      kind: "panorama",
      sourceType: "image",
      fileName: safeFileName("storyboard", storyboard.id, storyboard.src),
      name: `S${String(storyboard.index + 1).padStart(2, "0")} 分镜参考`,
      url: storyboard.src,
      assetSource: "library",
      projectionMode: "backdrop",
    });
  }

  const cameraId = `camera-storyboard-${storyboard.id}`;
  const characterObjects: ProductionDirectorProject["objects"] = roles.map((role, index) => ({
    id: `character-${role.id}`,
    name: role.name,
    kind: "character",
    visible: true,
    locked: false,
    bodyType: "mannequin",
    color: roleColors[index % roleColors.length],
    transform: transform([(index - (roles.length - 1) / 2) * 1.35, 0, 0]),
    characterRig: {
      rigType: "ue4-mannequin",
      posePresetId: "stand",
      controls: {},
    },
  }));
  const propObjects: ProductionDirectorProject["objects"] = props.map((prop, index) => ({
    id: `prop-${prop.id}`,
    name: prop.name,
    kind: "prop",
    visible: true,
    locked: false,
    color: "#d7e7ff",
    geometryType: "box",
    transform: transform([(index - (props.length - 1) / 2) * 1.1, 0.45, -1.5], [0, 0, 0], [0.45, 0.45, 0.45]),
  }));
  const cameraTransform = transform([0, 1.65, 5.2]);
  const cameraName = `S${String(storyboard.index + 1).padStart(2, "0")} · ${storyboard.videoDesc || storyboard.prompt || "默认机位"}`;

  return {
    version: 1,
    scene: {
      scale: 1,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      backgroundColor: "#0b0d10",
      panoramaYaw: 0,
      panoramaRadius: 60,
      showLabels: true,
      snapToGrid: true,
      showGround: true,
      groundOpacity: 0.4,
      groundHeight: 0,
    },
    assets: directorAssets,
    objects: [
      ...characterObjects,
      ...propObjects,
      {
        id: `camera-object-storyboard-${storyboard.id}`,
        name: cameraName,
        kind: "camera",
        visible: true,
        locked: false,
        linkedCameraId: cameraId,
        transform: cameraTransform,
      },
    ],
    cameras: [
      {
        id: cameraId,
        name: cameraName,
        fov: 50,
        transform: cameraTransform,
        targetMode: "manual",
        target: [0, 1, 0],
        lastCaptureUrl: null,
        captures: [],
      },
    ],
    activeCameraId: cameraId,
    panoramaAssetId: scenes[0] ? `asset-scene-${scenes[0].id}` : storyboard.src ? `asset-storyboard-${storyboard.id}` : null,
  };
}
