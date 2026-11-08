import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifestInput from '../../../data/avatars/manifest.json';
import {
  avatarManifest,
  getMappedAvatarIds,
  resolveAvatar,
  validateAvatarManifest,
} from './index';

function publicAssetBytes(modelPath: string) {
  return readFileSync(`public${modelPath}`);
}

describe('avatar manifest and mappings', () => {
  it('validates the generated base and fictional variants', () => {
    const manifest = validateAvatarManifest(manifestInput);
    expect(manifest.assets).toHaveLength(5);
    expect(
      manifest.assets.some((asset) => asset.avatarId === 'avatar-base'),
    ).toBe(true);
    expect(
      manifest.appearances.filter(
        (appearance) => appearance.candidateId !== null,
      ),
    ).toHaveLength(4);
    expect(
      manifest.assets.every((asset) => asset.animationClips.includes('Idle')),
    ).toBe(true);
  });

  it('resolves only explicit fictional mappings to GLB assets', () => {
    expect(resolveAvatar('candidacy-lin-haixing-2026-demo').kind).toBe('glb');
    expect(resolveAvatar('official-mayor-zhang-jing-2026')).toEqual({
      kind: 'procedural-fallback',
      reason: 'no-mapping',
    });
    expect(getMappedAvatarIds()).toHaveLength(4);
  });

  it('rejects unsafe paths and unapproved real-person assets', () => {
    const unsafe = structuredClone(manifestInput) as typeof manifestInput;
    const unsafeAsset = unsafe.assets[0];
    if (!unsafeAsset)
      throw new Error('Avatar fixture is missing its base asset.');
    unsafeAsset.modelPath = '/assets/avatars/../outside.glb';
    expect(() => validateAvatarManifest(unsafe)).toThrow();

    const realPerson = structuredClone(manifestInput) as typeof manifestInput;
    const realAsset = realPerson.assets[0];
    const realAppearance = realPerson.appearances[0];
    if (!realAsset || !realAppearance)
      throw new Error('Avatar fixture is missing its base appearance.');
    realAsset.state = 'approved';
    realAppearance.isFictional = false;
    realAppearance.visualReviewStatus = 'awaiting-visual-review';
    expect(() => validateAvatarManifest(realPerson)).toThrow('visual approval');
  });
});

describe('generated GLB facts', () => {
  it('matches manifest hashes and binary GLB headers', () => {
    for (const asset of avatarManifest.assets) {
      const bytes = publicAssetBytes(asset.modelPath);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.byteLength).toBe(asset.fileSizeBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        asset.sha256,
      );
    }
  });
});
