import { z } from 'zod';

/**
 * Appearance data for real-person likeness head kits.
 *
 * This layer is deliberately separate from `src/data/avatars/schema.ts`
 * (fictional demo characters). A likeness asset may only be published after a
 * named human has reviewed the rendered result against a licensed photograph.
 */

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

export const LIKENESS_SCHEMA_VERSION = 1;

/** How a value was obtained. Defaults are never likeness evidence. */
export const ParameterBasisSchema = z.enum([
  'observed',
  'estimated',
  'default',
]);
export type ParameterBasis = z.infer<typeof ParameterBasisSchema>;

const UnitSchema = z.number().min(0).max(1);

export const NormalizedParameterSchema = z.object({
  value: UnitSchema,
  basis: ParameterBasisSchema,
  photoIds: z.array(z.string().min(1)),
});
export type NormalizedParameter = z.infer<typeof NormalizedParameterSchema>;

export const SignedParameterSchema = z.object({
  value: z.number().min(-1).max(1),
  basis: ParameterBasisSchema,
  photoIds: z.array(z.string().min(1)),
});
export type SignedParameter = z.infer<typeof SignedParameterSchema>;

export const FaceShapeSchema = z.enum([
  'oval',
  'round',
  'square',
  'heart',
  'oblong',
  'diamond',
]);

export const HairStyleSchema = z.enum([
  'short-crop',
  'short-side-part',
  'side-sweep',
  'center-part',
  'bob',
  'shoulder-length',
  'short-waves',
  'bun',
  'ponytail',
  'bald',
  'short-curl',
  'medium-straight',
  'slick-back',
]);
export type HairStyle = z.infer<typeof HairStyleSchema>;

export const GlassesStyleSchema = z.enum([
  'none',
  'rectangular',
  'round',
  'half-rim',
  'square',
]);

export const FacialHairStyleSchema = z.enum([
  'none',
  'mustache',
  'goatee',
  'full-beard',
  'stubble',
]);

const CategoricalParameterSchema = z.object({
  basis: ParameterBasisSchema,
  photoIds: z.array(z.string().min(1)),
});

export const GLASSES_DEFAULT = {
  enabled: false,
  style: 'none' as const,
  frameThickness: 0.3,
} as const;

export const FACIAL_HAIR_DEFAULT = {
  enabled: false,
  style: 'none' as const,
  density: 0.5,
} as const;

export const FACE_DEFAULTS = {
  faceShape: 'oval' as const,
  faceWidth: 0.5,
  faceLength: 0.5,
  jawWidth: 0.5,
  chinRoundness: 0.6,
  cheekFullness: 0.5,
  eyeSize: 0.55,
  eyeSpacing: 0.5,
  eyeHeight: 0.48,
  eyeTilt: 0,
  eyebrowThickness: 0.4,
  eyebrowAngle: 0,
  noseWidth: 0.4,
  noseLength: 0.45,
  mouthWidth: 0.45,
  mouthFullness: 0.45,
  hairStyle: 'short-crop' as const,
  hairVolume: 0.5,
} as const;

export const LikenessAppearanceSchema = z
  .object({
    appearanceId: z.string().regex(/^[a-z0-9-]+$/),
    candidateId: z.string().min(1),
    schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
    faceShape: FaceShapeSchema,
    faceWidth: NormalizedParameterSchema,
    faceLength: NormalizedParameterSchema,
    jawWidth: NormalizedParameterSchema,
    chinRoundness: NormalizedParameterSchema,
    cheekFullness: NormalizedParameterSchema,
    eyeSize: NormalizedParameterSchema,
    eyeSpacing: NormalizedParameterSchema,
    eyeHeight: NormalizedParameterSchema,
    eyeTilt: SignedParameterSchema,
    eyebrowThickness: NormalizedParameterSchema,
    eyebrowAngle: SignedParameterSchema,
    noseWidth: NormalizedParameterSchema,
    noseLength: NormalizedParameterSchema,
    mouthWidth: NormalizedParameterSchema,
    mouthFullness: NormalizedParameterSchema,
    hairStyle: HairStyleSchema,
    hairVolume: NormalizedParameterSchema,
    glasses: z.object({
      enabled: z.boolean(),
      style: GlassesStyleSchema,
      frameThickness: UnitSchema,
    }),
    facialHair: z.object({
      enabled: z.boolean(),
      style: FacialHairStyleSchema,
      density: UnitSchema,
    }),
    /** Observed colors are recorded for review only; runtime keeps neutral palette. */
    observedColors: z.object({
      hair: HexColorSchema.nullable(),
      skin: HexColorSchema.nullable(),
    }),
    categoricalEvidence: z.object({
      faceShape: CategoricalParameterSchema,
      hairStyle: CategoricalParameterSchema,
      glasses: CategoricalParameterSchema,
      facialHair: CategoricalParameterSchema,
    }),
    sourcePhotoIds: z.array(z.string().min(1)),
    /** Parameters that had no usable evidence and fell back to defaults. */
    defaultedParameters: z.array(z.string().min(1)),
    extraction: z.object({
      tool: z.string().min(1),
      toolVersion: z.string().min(1),
      extractedAt: DateTimeSchema,
      script: z.string().min(1),
    }),
    /** Machine states only; human likeness review lives in review.json. */
    reviewStatus: z.enum(['extracted', 'validated']),
  })
  .superRefine((appearance, ctx) => {
    if (appearance.glasses.enabled && appearance.glasses.style === 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['glasses', 'style'],
        message: 'Enabled glasses need a frame style.',
      });
    }
    if (!appearance.glasses.enabled && appearance.glasses.style !== 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['glasses', 'style'],
        message: 'Disabled glasses must use style "none".',
      });
    }
    if (
      appearance.facialHair.enabled &&
      appearance.facialHair.style === 'none'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['facialHair', 'style'],
        message: 'Enabled facial hair needs a style.',
      });
    }
    if (
      !appearance.facialHair.enabled &&
      appearance.facialHair.style !== 'none'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['facialHair', 'style'],
        message: 'Disabled facial hair must use style "none".',
      });
    }
    const defaulted = new Set(appearance.defaultedParameters);
    for (const [key, parameter] of Object.entries(appearance)) {
      if (typeof parameter !== 'object' || parameter === null) continue;
      if (!('basis' in parameter)) continue;
      const basis = (parameter as { basis: string }).basis;
      if (basis === 'default' && !defaulted.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `Parameter ${key} fell back to a default and must be listed in defaultedParameters.`,
        });
      }
      if (basis !== 'default' && defaulted.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `Parameter ${key} is listed as defaulted but carries basis ${basis}.`,
        });
      }
    }
    for (const key of defaulted) {
      if (!(key in appearance)) {
        ctx.addIssue({
          code: 'custom',
          path: ['defaultedParameters'],
          message: `Unknown parameter in defaultedParameters: ${key}`,
        });
      }
    }
  });
export type LikenessAppearance = z.infer<typeof LikenessAppearanceSchema>;

export const DerivateUseSchema = z.enum([
  'allowed-with-attribution',
  'allowed-with-attribution-share-alike',
  'not-allowed',
  'unverified',
]);

export const LikenessPhotoSchema = z.object({
  photoId: z.string().regex(/^[a-z0-9-]+$/),
  candidateId: z.string().min(1),
  sourceUrl: z.url(),
  fileTitle: z.string().min(1).nullable(),
  sourceKind: z.enum([
    'wikimedia-commons',
    'official-government',
    'election-commission',
    'campaign-official',
  ]),
  publisher: z.string().min(1),
  author: z.string().min(1).nullable(),
  licenseName: z.string().min(1),
  licenseUrl: z.url().nullable(),
  derivativeUse: DerivateUseSchema,
  attributionRequired: z.boolean(),
  retrievedAt: DateOnlySchema,
  /** Hash of the bytes this pipeline inspected; bytes are never committed. */
  bytesSha256: Sha256Schema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  view: z.enum([
    'frontal',
    'three-quarter-left',
    'three-quarter-right',
    'profile-left',
    'profile-right',
    'unusable',
  ]),
  faceBox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .nullable(),
  /** 'source-linked' means the file is the lead image of the candidate's own article
   * or an official register, not that a face was matched. */
  identityConfidence: z.enum(['source-linked', 'probable', 'unverified']),
  identityEvidence: z.array(z.string().min(1)).min(1),
  usability: z.enum(['usable', 'low-resolution', 'obscured', 'not-a-portrait']),
  reviewerNote: z.string().min(1),
});
export type LikenessPhoto = z.infer<typeof LikenessPhotoSchema>;

const HeadKitBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
});

export const LIKENESS_HEAD_KIT_PATH =
  /^\/assets\/avatars\/likeness\/[a-z0-9-]+-head\.glb$/;

export const LikenessHeadKitSchema = z.object({
  path: z.string().regex(LIKENESS_HEAD_KIT_PATH),
  sha256: Sha256Schema,
  fileSizeBytes: z.number().int().positive(),
  meshCount: z.number().int().min(6),
  materialCount: z.number().int().min(4).max(16),
  triangleCount: z.number().int().min(2_000).max(14_000),
  /** World units in HeadPivot-local space; front is +Z. */
  bounds: HeadKitBoundsSchema,
  generator: z.string().min(1),
  blenderVersion: z.string().min(1),
});
export type LikenessHeadKit = z.infer<typeof LikenessHeadKitSchema>;

export const LikenessGenerationStateSchema = z.enum([
  'blocked-no-photo',
  'blocked-license',
  'research-pending',
  'extracted',
  'generated',
]);
export type LikenessGenerationState = z.infer<
  typeof LikenessGenerationStateSchema
>;

/**
 * Generation facts for one candidate. This file is produced by
 * `npm run avatars:likeness:generate`; it never claims human approval.
 * Human likeness decisions live in review.json and are pinned to asset hashes.
 */
export const LikenessDispositionSchema = z.object({
  candidateId: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  photoIds: z.array(z.string().min(1)),
  /** Weakest identity link among the backing photos; null when there are none. */
  photoIdentityConfidence: z
    .enum(['source-linked', 'probable', 'unverified'])
    .nullable(),
  appearanceId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .nullable(),
  appearanceSha256: Sha256Schema.nullable(),
  state: LikenessGenerationStateSchema,
  headKit: LikenessHeadKitSchema.nullable(),
  blockedReason: z.string().min(1).nullable(),
});
export type LikenessDisposition = z.infer<typeof LikenessDispositionSchema>;

export const LikenessManifestSchema = z
  .object({
    schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
    pipelineVersion: z.string().min(1),
    generatedAt: DateTimeSchema,
    roster: z.object({
      source: z.string().min(1),
      candidateCount: z.number().int().positive(),
      sha256: Sha256Schema,
    }),
    candidates: z.array(LikenessDispositionSchema),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of manifest.candidates.entries()) {
      if (seen.has(entry.candidateId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'candidateId'],
          message: `Duplicate disposition for ${entry.candidateId}`,
        });
      }
      seen.add(entry.candidateId);

      if (entry.state === 'generated' && !entry.headKit) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'headKit'],
          message: 'Generated dispositions require a head kit.',
        });
      }
      if (
        (entry.state === 'extracted' || entry.state === 'generated') &&
        !entry.appearanceId
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'appearanceId'],
          message: `State ${entry.state} requires an appearance record.`,
        });
      }
      if (entry.state !== 'generated' && entry.headKit) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'headKit'],
          message: `State ${entry.state} must not carry a head kit.`,
        });
      }
      if (
        entry.headKit &&
        entry.headKit.path !== `/assets/avatars/likeness/${entry.slug}-head.glb`
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'headKit', 'path'],
          message:
            'Head kit path must be /assets/avatars/likeness/<slug>-head.glb',
        });
      }
      if (
        (entry.state === 'blocked-no-photo' ||
          entry.state === 'blocked-license') &&
        !entry.blockedReason
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['candidates', index, 'blockedReason'],
          message: 'Blocked dispositions require a reason.',
        });
      }
    }
    if (seen.size !== manifest.candidates.length) {
      ctx.addIssue({ code: 'custom', message: 'Dispositions must be unique.' });
    }
    if (manifest.candidates.length !== manifest.roster.candidateCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['roster', 'candidateCount'],
        message: 'Every official candidate needs exactly one disposition.',
      });
    }
  });
export type LikenessManifest = z.infer<typeof LikenessManifestSchema>;

/**
 * Human likeness review. Hand-authored only: a named editor compares the
 * rendered kit with the licensed photograph and signs the hashes that were
 * reviewed. Regenerating either artefact invalidates the decision.
 */
export const LikenessReviewDecisionSchema = z.object({
  candidateId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
  reviewer: z.string().min(1),
  reviewedAt: DateOnlySchema,
  appearanceSha256: Sha256Schema,
  headKitSha256: Sha256Schema,
  note: z.string().min(1),
});
export type LikenessReviewDecision = z.infer<
  typeof LikenessReviewDecisionSchema
>;

export const LikenessReviewFileSchema = z
  .object({
    schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
    note: z.string().min(1),
    decisions: z.array(LikenessReviewDecisionSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const [index, decision] of file.decisions.entries()) {
      if (seen.has(decision.candidateId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['decisions', index, 'candidateId'],
          message: `Duplicate review decision for ${decision.candidateId}`,
        });
      }
      seen.add(decision.candidateId);
    }
  });
export type LikenessReviewFile = z.infer<typeof LikenessReviewFileSchema>;

/** Build-time input for the runtime: approved kits only. */
export const LikenessLoadableKitSchema = z.object({
  candidateId: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string().regex(LIKENESS_HEAD_KIT_PATH),
  sha256: Sha256Schema,
});
export type LikenessLoadableKit = z.infer<typeof LikenessLoadableKitSchema>;

export const LikenessLoadableFileSchema = z.object({
  schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
  note: z.string().min(1),
  manifestSha256: Sha256Schema,
  reviewSha256: Sha256Schema,
  kits: z.array(LikenessLoadableKitSchema),
});
export type LikenessLoadableFile = z.infer<typeof LikenessLoadableFileSchema>;

export const LikenessPhotoFileSchema = z.object({
  schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
  retrievedAt: DateOnlySchema,
  cacheNote: z.string().min(1),
  photos: z.array(LikenessPhotoSchema),
});

export const LikenessAppearanceFileSchema = z.object({
  schemaVersion: z.literal(LIKENESS_SCHEMA_VERSION),
  appearances: z.array(LikenessAppearanceSchema),
});

export function parseLikenessManifest(input: unknown): LikenessManifest {
  return LikenessManifestSchema.parse(input);
}

export function parseLikenessPhotos(
  input: unknown,
): z.infer<typeof LikenessPhotoFileSchema> {
  return LikenessPhotoFileSchema.parse(input);
}

export function parseLikenessAppearances(
  input: unknown,
): z.infer<typeof LikenessAppearanceFileSchema> {
  return LikenessAppearanceFileSchema.parse(input);
}

export function parseLikenessReview(input: unknown): LikenessReviewFile {
  return LikenessReviewFileSchema.parse(input);
}

export function validateLikenessLoadable(input: unknown): LikenessLoadableFile {
  return LikenessLoadableFileSchema.parse(input);
}

/** Approved kits keyed by candidateId; empty until a human approves one. */
export function loadableKitsById(loadable: LikenessLoadableFile) {
  return new Map(loadable.kits.map((kit) => [kit.candidateId, kit] as const));
}
