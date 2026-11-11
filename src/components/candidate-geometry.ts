import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  baseNodeRole,
  type CandidateMaterialRole,
  colorForRole,
  normalizeCandidateModel,
} from './candidate-model';
import type { CharacterStyle } from './character-style';

const PIVOT_NAMES = [
  'HeadPivot',
  'LeftArmPivot',
  'RightArmPivot',
  'LeftLegPivot',
  'RightLegPivot',
] as const;

type PivotName = (typeof PIVOT_NAMES)[number];

export type CandidatePivotMap = {
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
};

export type CandidateRestMap = {
  head: THREE.Euler;
  leftArm: THREE.Euler;
  rightArm: THREE.Euler;
  leftLeg: THREE.Euler;
  rightLeg: THREE.Euler;
};

export type CandidateModel = {
  root: THREE.Group;
  pivots: CandidatePivotMap;
  rest: CandidateRestMap;
  scale: number;
  groundOffset: number;
  ownedMaterials: THREE.Material[];
  ownedGeometries: THREE.BufferGeometry[];
};

type MergeGroup = {
  role: CandidateMaterialRole | null;
  source: THREE.Material | null;
  meshes: THREE.Mesh[];
};

type PivotBucket = {
  origin: THREE.Object3D;
  groups: Map<string, MergeGroup>;
};

type CandidateTemplate = {
  root: THREE.Group;
  scale: number;
  groundOffset: number;
};

/**
 * Geometry is merged once per GLB source and shared by every candidate. The
 * previous per-instance merge rebuilt ~73k triangles for each mounted actor;
 * cycling through all districts could take seconds per focus. Only materials
 * are cloned per instance, so palette changes never mutate shared resources.
 */
const TEMPLATE_CACHE = new WeakMap<THREE.Group, CandidateTemplate>();

const ROLE_PLACEHOLDER = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.86,
  metalness: 0,
  side: THREE.DoubleSide,
});

function pivotNameFor(mesh: THREE.Mesh): PivotName | 'body' {
  let node: THREE.Object3D | null = mesh.parent;
  while (node) {
    if ((PIVOT_NAMES as readonly string[]).includes(node.name)) {
      return node.name as PivotName;
    }
    node = node.parent;
  }
  return 'body';
}

function sourceMaterial(mesh: THREE.Mesh): THREE.Material {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials[0] ?? ROLE_PLACEHOLDER;
}

function mergedGeometry(
  meshes: THREE.Mesh[],
  origin: THREE.Object3D,
): THREE.BufferGeometry | null {
  const inverse = new THREE.Matrix4().copy(origin.matrixWorld).invert();
  const geometries: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      inverse,
      mesh.matrixWorld,
    );
    const flat = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    flat.applyMatrix4(matrix);
    flat.deleteAttribute('uv');
    flat.deleteAttribute('uv1');
    flat.deleteAttribute('tangent');
    flat.clearGroups();
    geometries.push(flat);
  }
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function roleMaterial(
  role: CandidateMaterialRole,
  style: CharacterStyle,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colorForRole(role, style),
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function templateFor(source: THREE.Group): CandidateTemplate {
  const cached = TEMPLATE_CACHE.get(source);
  if (cached) return cached;

  const root = source.clone(true);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.0001);
  const { scale, groundOffset } = normalizeCandidateModel(bounds.min.y, height);
  const characterRoot =
    root.getObjectByName('CharacterRoot') ??
    root.children.find(
      (child): child is THREE.Group => child instanceof THREE.Group,
    ) ??
    root;

  const pivotObjects = new Map<PivotName, THREE.Object3D>();
  for (const name of PIVOT_NAMES) {
    const node = root.getObjectByName(name);
    if (node) pivotObjects.set(name, node);
  }

  const buckets = new Map<THREE.Object3D, PivotBucket>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const pivot = pivotNameFor(object);
    const origin = pivot === 'body' ? characterRoot : pivotObjects.get(pivot);
    if (!origin) return;
    let bucket = buckets.get(origin);
    if (!bucket) {
      bucket = { origin, groups: new Map() };
      buckets.set(origin, bucket);
    }
    const role = baseNodeRole(object.name);
    const material = sourceMaterial(object);
    const key = role ? 'role:' + role : 'material:' + material.uuid;
    let group = bucket.groups.get(key);
    if (!group) {
      group = { role, source: role ? null : material, meshes: [] };
      bucket.groups.set(key, group);
    }
    group.meshes.push(object);
  });

  for (const bucket of buckets.values()) {
    for (const group of bucket.groups.values()) {
      const geometry = mergedGeometry(group.meshes, bucket.origin);
      for (const mesh of group.meshes) mesh.parent?.remove(mesh);
      if (!geometry) continue;
      const material = group.source ?? ROLE_PLACEHOLDER;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'Merged_' + (group.role ?? 'authored');
      mesh.userData.candidateRole = group.role ?? undefined;
      mesh.userData.candidateSourceMaterial = group.source ?? undefined;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      bucket.origin.add(mesh);
    }
  }

  const template = { root, scale, groundOffset };
  TEMPLATE_CACHE.set(source, template);
  return template;
}

/**
 * Clones the shared template hierarchy and installs per-candidate materials.
 * The returned root owns only its materials; its geometry is shared with every
 * other candidate using the same source GLB and must not be disposed here.
 */
export function buildCandidateModel(
  source: THREE.Group,
  style: CharacterStyle,
): CandidateModel {
  const template = templateFor(source);
  const root = template.root.clone(true);
  root.updateMatrixWorld(true);

  const ownedMaterials: THREE.Material[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = object.userData.candidateRole as
      | CandidateMaterialRole
      | undefined;
    if (role) {
      const material = roleMaterial(role, style);
      object.material = material;
      ownedMaterials.push(material);
    }
  });

  const pivot = (name: string) => root.getObjectByName(name) ?? null;
  const rest = (node: THREE.Object3D | null) =>
    node ? node.rotation.clone() : new THREE.Euler();
  return {
    root,
    pivots: {
      head: pivot('HeadPivot'),
      leftArm: pivot('LeftArmPivot'),
      rightArm: pivot('RightArmPivot'),
      leftLeg: pivot('LeftLegPivot'),
      rightLeg: pivot('RightLegPivot'),
    },
    rest: {
      head: rest(pivot('HeadPivot')),
      leftArm: rest(pivot('LeftArmPivot')),
      rightArm: rest(pivot('RightArmPivot')),
      leftLeg: rest(pivot('LeftLegPivot')),
      rightLeg: rest(pivot('RightLegPivot')),
    },
    scale: template.scale,
    groundOffset: template.groundOffset,
    ownedMaterials,
    ownedGeometries: [],
  };
}
