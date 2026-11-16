import { createHash } from 'node:crypto';
import type { BiographyPublicationSnapshot } from './schema';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function canonicalize(value: unknown): CanonicalJson {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }
  throw new TypeError('Unsupported value in biography checksum input.');
}

export function calculateBiographySnapshotChecksum(
  input: Omit<BiographyPublicationSnapshot, 'checksum'>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}
