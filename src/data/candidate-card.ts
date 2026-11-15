import type { PublicCandidateProfile } from './view';

/**
 * Card-level projection of a candidate profile: exactly the fields the city
 * explorer island, the roster and the 3D scene read. Everything else
 * (career, policies, basic profile, sources, ...) is only needed by the
 * profile tabs and stays out of the island props.
 */
export type PublicCandidateCard = Pick<
  PublicCandidateProfile,
  'candidacy' | 'district' | 'person' | 'visual'
>;

export function toPublicCandidateCard(
  profile: PublicCandidateProfile,
): PublicCandidateCard {
  return {
    candidacy: profile.candidacy,
    district: profile.district,
    person: profile.person,
    visual: profile.visual,
  };
}
