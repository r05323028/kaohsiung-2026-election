import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installHeadKit } from './head-kit-install';

function mesh(name: string, material: THREE.Material): THREE.Mesh {
  const created = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  created.name = name;
  return created;
}

function standardMaterial(
  name: string,
  color: number,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color });
  material.name = name;
  return material;
}

function pivotWithBaseHead(): THREE.Object3D {
  const pivot = new THREE.Object3D();
  pivot.name = 'HeadPivot';
  pivot.add(mesh('Head', standardMaterial('Material_4', 0xffffff)));
  pivot.add(mesh('Eye_L', standardMaterial('Material_13', 0x223344)));
  pivot.add(new THREE.Object3D());
  return pivot;
}

function kitScene(skinColor: number | null): THREE.Object3D {
  const scene = new THREE.Group();
  if (skinColor !== null) {
    scene.add(mesh('KitSkin', standardMaterial('Skin', skinColor)));
  }
  scene.add(mesh('KitHair', standardMaterial('Hair', 0x111111)));
  return scene;
}

describe('installHeadKit', () => {
  it('hides the base head meshes and attaches the kit under the pivot', () => {
    const pivot = pivotWithBaseHead();
    const skinMeshes = [
      mesh('Merged_skin', standardMaterial('Skin', 0xffffff)),
    ];

    const uninstall = installHeadKit(pivot, kitScene(0xb6978e), skinMeshes);

    const hidden = pivot.children.filter(
      (child) => (child as THREE.Mesh).isMesh && !child.visible,
    );
    expect(hidden.map((child) => child.name)).toEqual(['Head', 'Eye_L']);
    const kit = pivot.children.find((child) => child.name === 'HeadKit');
    expect(kit).toBeDefined();
    expect(kit?.children.map((child) => child.name)).toEqual([
      'KitSkin',
      'KitHair',
    ]);

    uninstall();
    expect(pivot.children.some((child) => child.name === 'HeadKit')).toBe(
      false,
    );
    expect(pivot.children.every((child) => child.visible)).toBe(true);
  });

  it('copies the kit skin tone onto the body and restores it on uninstall', () => {
    const pivot = pivotWithBaseHead();
    const bodyMaterial = standardMaterial('MergedSkin', 0x00ff00);
    const skinMeshes = [mesh('Merged_skin', bodyMaterial)];

    const uninstall = installHeadKit(pivot, kitScene(0xb6978e), skinMeshes);
    expect(bodyMaterial.color.getHex()).toBe(0xb6978e);

    uninstall();
    expect(bodyMaterial.color.getHex()).toBe(0x00ff00);
  });

  it('leaves the body alone when the kit has no Skin material', () => {
    const pivot = pivotWithBaseHead();
    const bodyMaterial = standardMaterial('MergedSkin', 0x00ff00);
    const skinMeshes = [mesh('Merged_skin', bodyMaterial)];

    const uninstall = installHeadKit(pivot, kitScene(null), skinMeshes);
    expect(bodyMaterial.color.getHex()).toBe(0x00ff00);
    uninstall();
  });

  it('survives a StrictMode install/uninstall/install cycle', () => {
    const pivot = pivotWithBaseHead();
    const scene = kitScene(0xb6978e);
    const bodyMaterial = standardMaterial('MergedSkin', 0x00ff00);
    const skinMeshes = [mesh('Merged_skin', bodyMaterial)];

    installHeadKit(pivot, scene, skinMeshes)();
    const uninstall = installHeadKit(pivot, scene, skinMeshes);

    const kits = pivot.children.filter((child) => child.name === 'HeadKit');
    expect(kits).toHaveLength(1);
    expect(
      pivot.children.filter(
        (child) => (child as THREE.Mesh).isMesh && child.visible,
      ),
    ).toHaveLength(0);

    uninstall();
    expect(pivot.children.some((child) => child.name === 'HeadKit')).toBe(
      false,
    );
    expect(
      pivot.children.filter(
        (child) => (child as THREE.Mesh).isMesh && child.visible,
      ),
    ).toHaveLength(2);
  });

  it('clones the kit instead of moving the cached glTF scene', () => {
    const pivot = pivotWithBaseHead();
    const scene = kitScene(0xb6978e);
    const before = scene.children.length;

    const uninstall = installHeadKit(pivot, scene, []);
    const kit = pivot.children.find((child) => child.name === 'HeadKit');
    expect(kit).not.toBe(scene);
    expect(scene.children).toHaveLength(before);

    uninstall();
    expect(scene.children).toHaveLength(before);
    expect(scene.visible).toBe(true);
  });
});
