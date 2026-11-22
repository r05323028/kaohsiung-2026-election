import * as THREE from 'three';

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
 * Drops an approved head kit onto a candidate's HeadPivot.
 *
 * The kit is authored in the base model's rest pose around y = 2.035, so it is
 * added without re-scaling. The base head meshes are hidden rather than
 * deleted: animation, bounds and the shared template stay untouched and a
 * rollback is a visibility flip. The returned function restores the pivot and
 * any skin colour it borrowed, which keeps StrictMode double-mounts and rapid
 * candidate switching clean.
 */
export function installHeadKit(
  head: THREE.Object3D,
  kitScene: THREE.Object3D,
  skinMeshes: readonly THREE.Object3D[],
): () => void {
  const hidden: THREE.Object3D[] = [];
  for (const child of head.children) {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && child.visible) {
      child.visible = false;
      hidden.push(child);
    }
  }

  const kit = kitScene.clone(true);
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
}
