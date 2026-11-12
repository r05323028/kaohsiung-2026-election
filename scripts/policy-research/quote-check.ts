import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

export function normalizeForQuoteCheck(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/\s+/g, '')
    .replace(/[，、]/g, ',')
    .replace(/[。]/g, '.');
}

export function readJsonFile<T>(relative: string): T {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      'Failed to read ' +
        relative +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

export function quotePresent(raw: string, quote: string): boolean {
  return normalizeForQuoteCheck(raw).includes(normalizeForQuoteCheck(quote));
}
