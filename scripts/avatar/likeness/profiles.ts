import { z } from 'zod';

/**
 * Per-appearance choice of Blender generator. Kept in committed data instead of
 * the appearance record so re-running `avatars:likeness:extract` (which
 * rewrites appearances.json) cannot silently downgrade a sculpted candidate
 * back to the shared deform kit.
 */
export const HeadProfileSchema = z.enum(['deform', 'sculpted']);
export type HeadProfile = z.infer<typeof HeadProfileSchema>;

export const LikenessProfilesSchema = z.object({
  schemaVersion: z.literal(1),
  note: z.string().min(1).optional(),
  profiles: z.record(z.string().min(1), HeadProfileSchema),
});
export type LikenessProfiles = z.infer<typeof LikenessProfilesSchema>;

/** Blender entry points, relative to the repository root. */
export const HEAD_SCRIPTS: Record<HeadProfile, string> = {
  deform: 'scripts/avatar/blender/head_kit.py',
  sculpted: 'scripts/avatar/blender/head_sculpt.py',
};

export const DEFAULT_PROFILE: HeadProfile = 'deform';

export function parseLikenessProfiles(input: unknown): LikenessProfiles {
  return LikenessProfilesSchema.parse(input);
}

/** Unknown appearances keep the shared deform kit. */
export function profileFor(
  profiles: LikenessProfiles | null,
  appearanceId: string,
): HeadProfile {
  return profiles?.profiles[appearanceId] ?? DEFAULT_PROFILE;
}

export function scriptFor(
  profiles: LikenessProfiles | null,
  appearanceId: string,
) {
  return HEAD_SCRIPTS[profileFor(profiles, appearanceId)];
}
