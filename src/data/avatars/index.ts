import manifestInput from '../../../data/avatars/manifest.json';
import {
  type AvatarAppearance,
  type AvatarAsset,
  type AvatarManifest,
  validateAvatarManifest,
} from './schema';

export * from './schema';

export const avatarManifest: AvatarManifest =
  validateAvatarManifest(manifestInput);

const assetsById = new Map(
  avatarManifest.assets.map((asset) => [asset.avatarId, asset]),
);
const appearancesByCandidateId = new Map(
  avatarManifest.appearances
    .filter(
      (appearance): appearance is AvatarAppearance & { candidateId: string } =>
        appearance.candidateId !== null,
    )
    .map((appearance) => [appearance.candidateId, appearance]),
);

const TECHNICALLY_LOADABLE_STATES = new Set<AvatarAsset['state']>([
  'generated',
  'validated',
  'approved',
]);

export type ResolvedAvatar =
  | { kind: 'glb'; appearance: AvatarAppearance; asset: AvatarAsset }
  | {
      kind: 'procedural-fallback';
      reason: 'no-mapping' | 'asset-not-loadable';
      appearance?: AvatarAppearance;
    };

export function getAvatarAppearance(
  avatarId: string,
): AvatarAppearance | undefined {
  return avatarManifest.appearances.find(
    (appearance) => appearance.avatarId === avatarId,
  );
}

export function resolveAvatar(candidateId: string): ResolvedAvatar {
  const appearance = appearancesByCandidateId.get(candidateId);
  if (!appearance) return { kind: 'procedural-fallback', reason: 'no-mapping' };
  const asset = assetsById.get(appearance.avatarId);
  if (
    !asset ||
    !appearance.modelPath ||
    !TECHNICALLY_LOADABLE_STATES.has(asset.state)
  )
    return {
      kind: 'procedural-fallback',
      reason: 'asset-not-loadable',
      appearance,
    };
  return { kind: 'glb', appearance, asset };
}

export function getMappedAvatarIds(): string[] {
  return [...appearancesByCandidateId.keys()];
}
