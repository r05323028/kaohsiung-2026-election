import fs from 'node:fs';
import * as THREE from 'three';
import {
  type GLTF,
  GLTFLoader,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { candidateProfiles, toPublicCandidateProfile } from '../data';
import { buildCandidateModel } from './candidate-geometry';
import {
  CANDIDATE_LOD,
  CANDIDATE_MODEL,
  CANDIDATE_MODEL_HEIGHT,
  candidateScreenHeight,
  colorForRole,
  normalizeCandidateModel,
  resolveCandidateLod,
} from './candidate-model';
import { characterStyle } from './character-style';

const BASE = 'public/models/kaohsiung_chibi_base.glb';
const OVERVIEW = 'public/models/kaohsiung_chibi_overview.glb';

function parse(path: string): Promise<GLTF> {
  const bytes = fs.readFileSync(path);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, reject);
  });
}

function glbJson(path: string): {
  animations?: unknown[];
  images?: unknown[];
  materials: unknown[];
  meshes: unknown[];
  nodes: { name?: string }[];
  skins?: unknown[];
  textures?: unknown[];
} {
  const bytes = fs.readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) count += 1;
  });
  return count;
}

describe('candidate GLB assets', () => {
  it('ships valid glTF 2.0 binaries with no skeletal animation', () => {
    for (const path of [BASE, OVERVIEW]) {
      const bytes = fs.readFileSync(path);
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const json = glbJson(path);
      expect(json.animations ?? []).toHaveLength(0);
      expect(json.skins ?? []).toHaveLength(0);
      expect(json.images ?? []).toHaveLength(0);
      expect(json.textures ?? []).toHaveLength(0);
    }
    expect(glbJson(BASE).meshes).toHaveLength(50);
    expect(glbJson(BASE).materials).toHaveLength(18);
    expect(glbJson(OVERVIEW).meshes).toHaveLength(10);
  });

  it('has matching rigid pivots and normalized height across LODs', async () => {
    const base = await parse(BASE);
    const overview = await parse(OVERVIEW);
    for (const name of [
      'HeadPivot',
      'LeftArmPivot',
      'RightArmPivot',
      'LeftLegPivot',
      'RightLegPivot',
    ]) {
      expect(base.scene.getObjectByName(name)).toBeTruthy();
    }
    expect(overview.scene.getObjectByName('HeadPivot')).toBeUndefined();
    const baseBounds = new THREE.Box3().setFromObject(base.scene);
    const overviewBounds = new THREE.Box3().setFromObject(overview.scene);
    const baseHeight = baseBounds.max.y - baseBounds.min.y;
    const overviewHeight = overviewBounds.max.y - overviewBounds.min.y;
    expect(baseHeight).toBeCloseTo(CANDIDATE_MODEL.rawBaseHeight, 3);
    expect(overviewHeight).toBeCloseTo(CANDIDATE_MODEL.rawOverviewHeight, 3);
    expect(baseHeight).toBeCloseTo(overviewHeight, 1);
    expect(baseBounds.min.y).toBeCloseTo(overviewBounds.min.y, 1);
  });

  it('merges the detailed model into a shared bounded hierarchy', async () => {
    const gltf = await parse(BASE);
    const profile = candidateProfiles.find(
      (candidate) =>
        candidate.candidacy.slug === 'kaohsiung-council-04-23bd0041',
    );
    if (!profile) throw new Error('missing test candidate');
    const candidate = toPublicCandidateProfile(profile);
    const model = buildCandidateModel(gltf.scene, characterStyle(candidate));
    expect(model.pivots.head).toBeTruthy();
    expect(model.pivots.leftArm).toBeTruthy();
    expect(model.pivots.rightArm).toBeTruthy();
    expect(model.pivots.leftLeg).toBeTruthy();
    expect(model.pivots.rightLeg).toBeTruthy();
    expect(meshCount(model.root)).toBe(28);
    expect(model.ownedGeometries).toHaveLength(0);
    expect(model.ownedMaterials.length).toBeGreaterThan(0);
    expect(model.ownedMaterials.length).toBeLessThanOrEqual(28);

    const otherProfile = candidateProfiles.find(
      (candidate) =>
        candidate.candidacy.slug !== 'kaohsiung-council-04-23bd0041',
    );
    if (!otherProfile) throw new Error('missing second test candidate');
    const other = buildCandidateModel(
      gltf.scene,
      characterStyle(toPublicCandidateProfile(otherProfile)),
    );
    const geometries = new Set<THREE.BufferGeometry>();
    const otherGeometries = new Set<THREE.BufferGeometry>();
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    other.root.traverse((object) => {
      if (object instanceof THREE.Mesh) otherGeometries.add(object.geometry);
    });
    expect(other.ownedGeometries).toHaveLength(0);
    expect(otherGeometries).toEqual(geometries);
    expect(other.ownedMaterials[0]).not.toBe(model.ownedMaterials[0]);
    model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.root);
    const normalizedHeight = (bounds.max.y - bounds.min.y) * model.scale;
    const feet = bounds.min.y * model.scale + model.groundOffset;
    expect(normalizedHeight).toBeCloseTo(CANDIDATE_MODEL_HEIGHT, 3);
    expect(feet).toBeCloseTo(0, 6);
  });
});

describe('candidate LOD and palette rules', () => {
  it('derives screen size from orthographic zoom and uses hysteresis', () => {
    expect(candidateScreenHeight(18)).toBeCloseTo(8.316, 6);
    expect(candidateScreenHeight(66)).toBeGreaterThan(
      CANDIDATE_LOD.detailEnterPx,
    );
    expect(resolveCandidateLod(8, 'overview')).toBe('overview');
    expect(resolveCandidateLod(CANDIDATE_LOD.detailEnterPx, 'overview')).toBe(
      'detail',
    );
    expect(resolveCandidateLod(CANDIDATE_LOD.detailExitPx, 'detail')).toBe(
      'overview',
    );
    expect(resolveCandidateLod(CANDIDATE_LOD.detailExitPx + 1, 'detail')).toBe(
      'detail',
    );
  });

  it('normalizes raw authored height to the shared actor height', () => {
    const normalized = normalizeCandidateModel(0.052239, 3.022761);
    expect(normalized.scale).toBeCloseTo(CANDIDATE_MODEL_HEIGHT / 3.022761, 9);
    expect(0.052239 * normalized.scale + normalized.groundOffset).toBeCloseTo(
      0,
      9,
    );
  });

  it('keeps outfit variants deterministic and distinct across the roster', () => {
    const profiles = candidateProfiles.slice(0, 60);
    const styles = profiles.map((profile) =>
      characterStyle(toPublicCandidateProfile(profile)),
    );
    const signature = (style: ReturnType<typeof characterStyle>) =>
      [style.outfit, style.top, style.bottom, style.skirt].join('|');
    const first = characterStyle(toPublicCandidateProfile(profiles[0]!));
    expect(signature(first)).toBe(signature(styles[0]!));
    expect(new Set(styles.map(signature)).size).toBeGreaterThan(6);
    expect(styles.every((style) => /^#[0-9a-f]{6}$/i.test(style.top))).toBe(
      true,
    );
  });

  it('keeps trousers and cuffs on the lower-body palette', () => {
    const style = candidateProfiles
      .map((profile) => characterStyle(toPublicCandidateProfile(profile)))
      .find((candidate) => candidate.skirt);
    if (!style) throw new Error('missing skirt candidate');
    expect(style.skirt).toBe(true);
    expect(colorForRole('trousers', style)).toBe(style.bottom);
    expect(colorForRole('cuff', style)).not.toBe(style.skin);
  });
});
