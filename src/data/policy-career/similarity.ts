/**
 * Deterministic Chinese text similarity used to relate policy commitments to
 * documented political actions.
 *
 * The score is a Jaccard overlap of character trigrams, but only trigrams that
 * are rare in the activity corpus (document frequency <= maxDf) are counted.
 * Common phrasing ("高雄市", "議員指出") therefore cannot manufacture a match;
 * a pair only scores when the two texts share distinctive wording.
 *
 * This is a review aid, not an editorial verdict: the approved dataset stores
 * the accepted relations explicitly, and the validator only re-checks that a
 * stored relation still clears the published threshold.
 */

export type SimilarityResult = {
  score: number;
  sharedTerms: string[];
};

export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, '');
}

const GRAM_SIZE = 3;
const MAX_REPORTED_TERMS = 6;

export function trigrams(text: string): Set<string> {
  const normalized = normalizeText(text);
  const grams = new Set<string>();
  for (let index = 0; index + GRAM_SIZE <= normalized.length; index += 1) {
    grams.add(normalized.slice(index, index + GRAM_SIZE));
  }
  return grams;
}

export function documentFrequency(documents: string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const document of documents) {
    for (const gram of trigrams(document)) {
      frequency.set(gram, (frequency.get(gram) ?? 0) + 1);
    }
  }
  return frequency;
}

function distinctive(
  grams: Set<string>,
  frequency: Map<string, number>,
  maxDf: number,
): Set<string> {
  const kept = new Set<string>();
  for (const gram of grams) {
    const df = frequency.get(gram) ?? 0;
    if (df > 0 && df <= maxDf) kept.add(gram);
  }
  // Very short texts (three-character platform items) can lose every trigram to
  // the corpus filter; fall back to the raw set so the pair is still scored.
  return kept.size >= 2 ? kept : grams;
}

export function semanticSimilarity(
  left: string,
  right: string,
  frequency: Map<string, number>,
  maxDf = 4,
): SimilarityResult {
  const leftGrams = distinctive(trigrams(left), frequency, maxDf);
  const rightGrams = distinctive(trigrams(right), frequency, maxDf);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return { score: 0, sharedTerms: [] };
  }
  const shared: string[] = [];
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) shared.push(gram);
  }
  // One shared trigram is a coincidence ("高雄市"); a relation needs at least
  // two distinctive grams of evidence.
  if (shared.length < 2) return { score: 0, sharedTerms: [] };
  const union = new Set<string>([...leftGrams, ...rightGrams]);
  const score = shared.length / union.size;
  const sharedTerms = [...shared]
    .sort((a, b) => {
      const dfA = frequency.get(a) ?? 0;
      const dfB = frequency.get(b) ?? 0;
      if (dfA !== dfB) return dfA - dfB;
      return a < b ? -1 : 1;
    })
    .slice(0, MAX_REPORTED_TERMS);
  return { score: Number(score.toFixed(4)), sharedTerms };
}

export const POLICY_ACTIVITY_RELATION_THRESHOLD = 0.3;
export const SAME_EVENT_THRESHOLD = 0.45;
