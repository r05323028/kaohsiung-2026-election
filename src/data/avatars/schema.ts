import { z } from 'zod';

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD.');
const DateTimeSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Must be a lowercase SHA-256 digest.');
const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a six-digit hex color.');

export const AvatarAssetStateSchema = z.enum([
  'missing',
  'generated',
  'validated',
  'awaiting-visual-review',
  'approved',
  'rejected',
  'superseded',
]);
export type AvatarAssetState = z.infer<typeof AvatarAssetStateSchema>;

export const AvatarVisualReviewStatusSchema = z.enum([
  'not-applicable-fictional',
  'awaiting-visual-review',
  'approved',
  'rejected',
  'superseded',
]);

export const AvatarAnimationSetSchema = z.object({
  idle: z.string().min(1),
  selected: z.string().min(1),
  greeting: z.string().min(1),
  walking: z.string().min(1),
});

export const AvatarReferenceSchema = z.object({
  referenceId: z.string().min(1),
  sourceUrl: z.url().nullable(),
  publisher: z.string().min(1),
  retrievalDate: DateOnlySchema.nullable(),
  rightsStatus: z.enum([
    'fictional-original',
    'licensed',
    'permissible-reference-pending-review',
    'unknown',
  ]),
  visibleObservations: z.array(z.string().min(1)),
  reviewStatus: z.enum(['not-reviewed', 'reviewed', 'rejected']),
});

export const AvatarAssetSchema = z.object({
  avatarId: z.string().min(1),
  modelPath: z.string().regex(/^\/assets\/avatars\/[a-z0-9-]+\.glb$/),
  state: AvatarAssetStateSchema,
  assetVersion: z.string().min(1),
  generatedAt: DateTimeSchema,
  generator: z.string().min(1),
  sha256: Sha256Schema,
  fileSizeBytes: z.number().int().positive(),
  meshCount: z.number().int().positive(),
  triangleCount: z.number().int().positive(),
  materialCount: z.number().int().positive(),
  heightMeters: z.number().positive(),
  animationClips: z.array(z.string().min(1)).min(1),
  note: z.string().min(1),
});

export const AvatarAppearanceSchema = z.object({
  candidateId: z.string().min(1).nullable(),
  avatarId: z.string().min(1),
  bodyPreset: z.enum(['compact-adult', 'compact-adult-tall']),
  facePreset: z.enum(['soft-neutral', 'round-neutral', 'bright-neutral']),
  hairPreset: z.enum(['short-cap', 'bob', 'side-sweep', 'hat-crop']),
  hairColor: HexColorSchema,
  skinMaterial: z.enum(['warm-peach', 'soft-umber', 'sunlit-peach']),
  outfitPreset: z.enum([
    'harbor-teal',
    'coral-sand',
    'civic-blue',
    'warm-sand',
  ]),
  accessories: z.array(z.enum(['glasses', 'scarf', 'hat'])),
  modelPath: z
    .string()
    .regex(/^\/assets\/avatars\/[a-z0-9-]+\.glb$/)
    .nullable(),
  animationSet: AvatarAnimationSetSchema,
  referenceIds: z.array(z.string().min(1)),
  visualReviewStatus: AvatarVisualReviewStatusSchema,
  assetVersion: z.string().min(1),
  isFictional: z.boolean(),
});

export const AvatarManifestSchema = z.object({
  schemaVersion: z.literal('1'),
  generatedAt: DateTimeSchema,
  generator: z.string().min(1),
  coordinateSystem: z.object({
    up: z.literal('Y'),
    forward: z.literal('-Z'),
    units: z.literal('meters'),
    targetHeightMeters: z.number().positive(),
  }),
  assets: z.array(AvatarAssetSchema).min(1),
  appearances: z.array(AvatarAppearanceSchema).min(1),
  references: z.array(AvatarReferenceSchema),
  note: z.string().min(1),
});

export type AvatarAnimationSet = z.infer<typeof AvatarAnimationSetSchema>;
export type AvatarReference = z.infer<typeof AvatarReferenceSchema>;
export type AvatarAsset = z.infer<typeof AvatarAssetSchema>;
export type AvatarAppearance = z.infer<typeof AvatarAppearanceSchema>;
export type AvatarManifest = z.infer<typeof AvatarManifestSchema>;

export function validateAvatarManifest(input: unknown): AvatarManifest {
  const manifest = AvatarManifestSchema.parse(input);
  const assetIds = new Set<string>();
  const assetPaths = new Set<string>();
  for (const asset of manifest.assets) {
    if (assetIds.has(asset.avatarId))
      throw new Error(`Duplicate avatar asset ID: ${asset.avatarId}`);
    if (assetPaths.has(asset.modelPath))
      throw new Error(`Duplicate avatar asset path: ${asset.modelPath}`);
    assetIds.add(asset.avatarId);
    assetPaths.add(asset.modelPath);
  }
  const appearanceIds = new Set<string>();
  const referenceIds = new Set(
    manifest.references.map((reference) => reference.referenceId),
  );
  for (const appearance of manifest.appearances) {
    if (appearanceIds.has(appearance.avatarId))
      throw new Error(`Duplicate avatar appearance ID: ${appearance.avatarId}`);
    appearanceIds.add(appearance.avatarId);
    if (!assetIds.has(appearance.avatarId))
      throw new Error(
        `Appearance references missing asset: ${appearance.avatarId}`,
      );
    if (
      appearance.modelPath !==
      manifest.assets.find((asset) => asset.avatarId === appearance.avatarId)
        ?.modelPath
    )
      throw new Error(
        `Appearance model path does not match asset: ${appearance.avatarId}`,
      );
    for (const referenceId of appearance.referenceIds) {
      if (!referenceIds.has(referenceId))
        throw new Error(
          `Appearance references missing visual reference: ${referenceId}`,
        );
    }
    const asset = manifest.assets.find(
      (item) => item.avatarId === appearance.avatarId,
    );
    if (!asset)
      throw new Error(`Missing asset for appearance: ${appearance.avatarId}`);
    if (
      asset.state === 'approved' &&
      appearance.visualReviewStatus !== 'approved' &&
      !appearance.isFictional
    )
      throw new Error(
        `Approved real-person asset requires visual approval: ${appearance.avatarId}`,
      );
  }
  return manifest;
}
