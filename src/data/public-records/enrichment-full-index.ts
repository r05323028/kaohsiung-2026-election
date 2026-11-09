import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type PublicRecordsEnrichmentDataset,
  validatePublicRecordsEnrichmentDataset,
} from './enrichment-schema';

const DATASET_PATH = resolve(
  process.cwd(),
  'data/public-records/research-enrichment/2026/full-roster.json',
);

export function loadPublicRecordsEnrichmentDataset(
  path = DATASET_PATH,
): PublicRecordsEnrichmentDataset {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read public-record enrichment dataset at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return validatePublicRecordsEnrichmentDataset(JSON.parse(raw) as unknown);
  } catch (error) {
    throw new Error(
      `Unable to parse public-record enrichment dataset at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const publicRecordsEnrichment = loadPublicRecordsEnrichmentDataset();

export type { PublicRecordsEnrichmentDataset };
