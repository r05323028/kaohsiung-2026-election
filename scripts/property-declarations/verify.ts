import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import financialInput from '../../data/normalized/2026/candidate-property-declaration-financial-summaries.json';
import verificationInput from '../../data/normalized/2026/candidate-property-declaration-verification.json';
import {
  validatePropertyDeclarationFinancialSummaryDataset,
  validatePropertyDeclarationVerificationDataset,
} from '../../src/data/property-declarations/schema';
import { assertPropertyDeclarationFinancialEvidence } from '../../src/data/property-declarations/verification';

function parsePdfDir(): string | undefined {
  const inline = process.argv.find((argument) =>
    argument.startsWith('--pdf-dir='),
  );
  if (inline) return inline.slice('--pdf-dir='.length);
  const index = process.argv.indexOf('--pdf-dir');
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('--pdf-dir requires a directory path.');
  }
  return value;
}

const verification =
  validatePropertyDeclarationVerificationDataset(verificationInput);
const financial =
  validatePropertyDeclarationFinancialSummaryDataset(financialInput);
assertPropertyDeclarationFinancialEvidence(verification, financial);

const agreementCount = verification.records.reduce(
  (total, record) =>
    total +
    record.categoryAgreements.filter((item) => item.outcome === 'agree').length,
  0,
);

const pdfDir = parsePdfDir();
if (!pdfDir) {
  console.log(
    '[property-declarations:verify] ' +
      verification.records.length +
      ' records and ' +
      agreementCount +
      ' category agreements match the financial summaries. ' +
      'PDF bytes were not checked; pass --pdf-dir <dir> to verify PDF hashes and page counts.',
  );
} else {
  const absolutePdfDir = resolve(pdfDir);
  if (!existsSync(absolutePdfDir) || !statSync(absolutePdfDir).isDirectory()) {
    throw new Error('PDF directory does not exist: ' + absolutePdfDir);
  }

  let checked = 0;
  for (const record of verification.records) {
    if (basename(record.pdfFileName) !== record.pdfFileName) {
      throw new Error(
        'Unsafe PDF file name in verification manifest: ' + record.pdfFileName,
      );
    }
    const pdfPath = [
      join(absolutePdfDir, record.pdfFileName),
      join(absolutePdfDir, record.candidateId + '__' + record.pdfFileName),
    ].find((candidate) => existsSync(candidate));
    if (!pdfPath) {
      throw new Error(
        'Missing source PDF for ' +
          record.pdfFileName +
          ' (also tried the candidate-prefixed name).',
      );
    }
    const digest = createHash('sha256')
      .update(readFileSync(pdfPath))
      .digest('hex');
    if (digest !== record.pdfSha256) {
      throw new Error(
        'PDF SHA-256 mismatch for ' +
          record.pdfFileName +
          ': expected ' +
          record.pdfSha256 +
          ', got ' +
          digest,
      );
    }
    const info = execFileSync('pdfinfo', [pdfPath], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
    });
    const pageMatch = info.match(/^Pages:\s+(\d+)$/m);
    if (!pageMatch) {
      throw new Error('Unable to read page count from ' + pdfPath);
    }
    const pageCount = Number(pageMatch[1]);
    if (pageCount !== record.physicalPageCount) {
      throw new Error(
        'PDF page count mismatch for ' +
          record.pdfFileName +
          ': expected ' +
          record.physicalPageCount +
          ', got ' +
          pageCount,
      );
    }
    checked += 1;
  }

  console.log(
    '[property-declarations:verify] ' +
      checked +
      ' PDFs hashed and page bounds verified against ' +
      agreementCount +
      ' category agreements.',
  );
}
