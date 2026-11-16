import { useGLTF } from '@react-three/drei';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { withBase } from '../utils/paths';

type CandidateHeadKitProps = {
  /** Approved head kit path, e.g. /assets/avatars/likeness/ke-zhi-en-2026-head.glb */
  path: string;
  /** HeadPivot of the cloned candidate model. */
  head: THREE.Object3D;
  /** Merged body meshes that carry the candidate's skin material. */
  skinMeshes: THREE.Object3D[];
};

function materialNamed(
  root: THREE.Object3D,
  name: string,
): THREE.MeshStandardMaterial | null {
  const matches: THREE.MeshStandardMaterial[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (
        material instanceof THREE.MeshStandardMaterial &&
        material.name === name
      ) {
        matches.push(material);
      }
    }
  });
  return matches[0] ?? null;
}

/**
 * Head kits are authored in the base model's rest pose around y = 2.035, so a
 * kit drops straight onto HeadPivot without re-scaling. Installing one hides
 * the base head meshes rather than deleting them, which keeps animation,
 * bounds and the shared template untouched and makes a rollback trivial.
 */
export default function CandidateHeadKit({
  path,
  head,
  skinMeshes,
}: CandidateHeadKitProps) {
  const gltf = useGLTF(withBase(path));

  useLayoutEffect(() => {
    const hidden: THREE.Object3D[] = [];
    for (const child of head.children) {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && child.visible) {
        child.visible = false;
        hidden.push(child);
      }
    }

    const kit = gltf.scene.clone(true);
    kit.name = 'HeadKit';
    head.add(kit);

    // The kit bakes the observed skin tone; reuse it for neck and palms so the
    // head never disagrees with the hands.
    const kitSkin = materialNamed(kit, 'Skin');
    const restored: Array<[THREE.MeshStandardMaterial, THREE.Color]> = [];
    const skinColor = kitSkin?.color;
    if (skinColor) {
      for (const node of skinMeshes) {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          restored.push([material, material.color.clone()]);
          material.color.copy(skinColor);
        }
      }
    }

    return () => {
      head.remove(kit);
      for (const child of hidden) child.visible = true;
      for (const [material, color] of restored) material.color.copy(color);
    };
  }, [gltf.scene, head, skinMeshes]);

  return null;
}
