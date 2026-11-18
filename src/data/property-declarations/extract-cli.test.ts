import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../../scripts/property-declarations/extract';

describe('property declaration extraction CLI arguments', () => {
  it('parses candidate and cache options deterministically', () => {
    const args = parseArgs([
      '--candidate',
      'official-mayor-zhang-jing-2026,official-mayor-ke-zhi-en-2026',
      '--pdf-dir',
      '/tmp/pdfs',
      '--out',
      '/tmp/out',
      '--scale',
      '2',
      '--max-pages',
      '3',
      '--force',
    ]);
    expect(args).toMatchObject({
      mode: 'candidate',
      candidateIds: [
        'official-mayor-zhang-jing-2026',
        'official-mayor-ke-zhi-en-2026',
      ],
      pdfDir: '/tmp/pdfs',
      outDir: '/tmp/out',
      scale: 2,
      maxPages: 3,
      force: true,
    });
  });

  it('rejects conflicting modes and invalid page limits', () => {
    expect(() => parseArgs(['--all', '--pdf', 'x.pdf'])).toThrow(
      'choose exactly one extraction mode',
    );
    expect(() => parseArgs(['--pdf', 'x.pdf', '--max-pages', '0'])).toThrow(
      '--max-pages must be a positive integer',
    );
  });
});
