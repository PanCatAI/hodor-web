import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Mesh, type Group, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { DirectorSceneWorld } from "../schema/directorProject";

type MarbleRenderQuality = "preview" | "editing" | "full";

const preferredSplatKeys: Record<MarbleRenderQuality, string[]> = {
  preview: ["100k", "low_res", "500k", "medium", "full_res", "full"],
  editing: ["500k", "medium", "100k", "low_res", "full_res", "full"],
  full: ["full_res", "full", "500k", "medium", "100k", "low_res"],
};

export function selectMarbleSplatUrl(
  urls: Record<string, string>,
  quality: MarbleRenderQuality = "editing",
): string {
  for (const key of preferredSplatKeys[quality]) {
    if (typeof urls[key] === "string" && urls[key]) return urls[key];
  }
  return Object.values(urls).find((url) => typeof url === "string" && url.length > 0) ?? "";
}

export function marbleWorldTransform(semantics: DirectorSceneWorld["semantics"]) {
  const metricScaleFactor = Number.isFinite(semantics.metricScaleFactor) && semantics.metricScaleFactor > 0
    ? semantics.metricScaleFactor
    : 1;
  const groundPlaneOffset = Number.isFinite(semantics.groundPlaneOffset)
    ? semantics.groundPlaneOffset
    : 0;
  return {
    position: [0, -groundPlaneOffset, 0] as [number, number, number],
    rotation: [Math.PI, 0, 0] as [number, number, number],
    scale: [metricScaleFactor, metricScaleFactor, metricScaleFactor] as [number, number, number],
  };
}

function makeColliderTransparent(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    child.material = materials.map((source) => {
      const material = source.clone() as Material & {
        colorWrite?: boolean;
        depthWrite?: boolean;
        opacity?: number;
        transparent?: boolean;
      };
      material.transparent = true;
      material.opacity = 0;
      material.colorWrite = false;
      material.depthWrite = false;
      return material;
    });
    child.userData.hodorCollider = true;
  });
}

function disposeColliderMaterials(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function MarbleCollider({ url, world }: { url: string; world: DirectorSceneWorld }) {
  const colliderGroupRef = useRef<Group>(null);
  const { invalidate } = useThree();
  const transform = marbleWorldTransform(world.semantics);
  useEffect(() => {
    let disposed = false;
    let collider: Object3D | null = null;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (disposed || !colliderGroupRef.current) return;
        collider = gltf.scene.clone(true);
        makeColliderTransparent(collider);
        colliderGroupRef.current.add(collider);
        invalidate();
      },
      undefined,
      () => {
        // The SPZ and panorama remain usable when an optional collider cannot load.
        invalidate();
      },
    );
    return () => {
      disposed = true;
      if (collider) {
        colliderGroupRef.current?.remove(collider);
        disposeColliderMaterials(collider);
      }
      invalidate();
    };
  }, [invalidate, url]);
  return (
    <group ref={colliderGroupRef} {...transform} name="hodor-marble-collider" />
  );
}

export function MarbleWorldScene({ world }: { world: DirectorSceneWorld }) {
  const { gl, invalidate, scene } = useThree();
  const splatGroupRef = useRef<Group>(null);
  const splatUrl = selectMarbleSplatUrl(world.spzUrls, world.renderQuality ?? "editing");
  const transform = marbleWorldTransform(world.semantics);

  useEffect(() => {
    if (!splatUrl || !splatGroupRef.current) return;
    const spark = new SparkRenderer({ renderer: gl, onDirty: invalidate });
    let disposed = false;
    let splatDisposed = false;
    const splat = new SplatMesh({
      url: splatUrl,
      lod: true,
      raycastable: false,
      onLoad: () => invalidate(),
    });
    scene.add(spark);
    splatGroupRef.current.add(splat);
    void splat.initialized.catch(() => {
      if (disposed) return;
      splatGroupRef.current?.remove(splat);
      splat.dispose();
      splatDisposed = true;
      invalidate();
    });
    invalidate();
    return () => {
      disposed = true;
      splatGroupRef.current?.remove(splat);
      scene.remove(spark);
      if (!splatDisposed) splat.dispose();
      spark.dispose();
      invalidate();
    };
  }, [gl, invalidate, scene, splatUrl]);

  return (
    <>
      <group ref={splatGroupRef} {...transform} name="hodor-marble-splat" />
      {world.colliderMeshUrl ? <MarbleCollider url={world.colliderMeshUrl} world={world} /> : null}
    </>
  );
}
