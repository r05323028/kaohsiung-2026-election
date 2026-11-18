import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PROPERTY_DECLARATION_FINANCIAL_CATEGORIES,
  PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
  PROPERTY_DECLARATION_GAZETTE_LICENSE,
  PROPERTY_DECLARATIONS_GAZETTE_DATASET_ID,
  PROPERTY_DECLARATIONS_GAZETTE_SNAPSHOT_DATE,
  PROPERTY_DECLARATIONS_SCHEMA_VERSION,
  type PropertyDeclarationFinancialCategory,
  type PropertyDeclarationGazetteCategory,
  type PropertyDeclarationGazetteDataset,
  type PropertyDeclarationGazetteTotalBasis,
  validatePropertyDeclarationGazetteDataset,
} from '../../src/data/property-declarations/schema';

const DEFAULT_INPUT_DIR = '/tmp/gazette-cards';
const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  'data/normalized/2026/candidate-property-declaration-gazette.json',
);
const COUNT_ONLY_CATEGORIES = new Set<PropertyDeclarationFinancialCategory>([
  'land',
  'building',
  'vehicles',
  'securities',
  'insurance',
]);
const CATEGORY_BY_GAZETTE_KEY: Record<
  string,
  PropertyDeclarationFinancialCategory
> = {
  土地: 'land',
  建物: 'building',
  汽車: 'vehicles',
  現金: 'cash',
  存款: 'deposits',
  有價證券: 'securities',
  '珠寶、古董、字畫及其他具有相當價值之財產': 'valuable-property',
  保險: 'insurance',
  虛擬資產: 'virtual-assets',
  債權: 'claims',
  債務: 'debts',
  事業投資: 'business-investment',
};
interface GazetteAmountItem {
  amount_yuan: number | null;
  item_id: string;
}
interface GazetteAccount {
  amount_yuan: number | null;
  items: GazetteAmountItem[];
  key: string;
  unvalued_count: number;
  valued_count: number;
}
interface GazetteCardAccount {
  categories: GazetteAccount[];
  debt: GazetteAccount;
  declaration_date: string | null;
  filing_id: string;
}
interface GazetteRecord {
  candidate: {
    id: string;
    name: string;
    election_type: string;
    region: string;
    ballot_number: number;
  };
  property_summary: {
    card_accounts: GazetteCardAccount;
  };
  uuid: string;
}
interface GazetteExtract {
  source: string;
  retrieved: string;
  records: GazetteRecord[];
}
interface GazetteMatch {
  candidateId: string;
  gname: string;
  name: string;
  nameExact: boolean;
  uuid: string;
}
interface VerificationRecord {
  candidateId: string;
  pdfFileName: string;
  pdfSha256: string;
}
interface VerificationDataset {
  records: VerificationRecord[];
}
interface Roster {
  candidates: Array<{
    id: string;
    displayName: string;
    districtId: string;
    electionType: 'mayoral' | 'city-council' | 'indigenous-council';
    candidateNumber: string;
  }>;
}
function parseArgs(argv: string[]): {
  inputDir: string;
  output: string;
} {
  let inputDir = DEFAULT_INPUT_DIR;
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) break;
    if (arg === '--input-dir') {
      inputDir = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--input-dir=')) {
      inputDir = arg.slice('--input-dir='.length);
    } else if (arg === '--out') {
      output = argv[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('--out=')) {
      output = arg.slice('--out='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/property-declarations/gazette.ts [--input-dir <dir>] [--out <file>]',
      );
      process.exit(0);
    } else {
      throw new Error('Unknown argument: ' + arg);
    }
  }
  if (!inputDir || !output) {
    throw new Error('Both --input-dir and --out require a value.');
  }
  return { inputDir, output };
}
function categoryForAccount(account: GazetteAccount) {
  return CATEGORY_BY_GAZETTE_KEY[account.key];
}
function normalizeAccount(
  category: PropertyDeclarationFinancialCategory,
  account: GazetteAccount | undefined,
): PropertyDeclarationGazetteCategory {
  if (!account || account.items.length === 0) {
    return {
      category,
      status: 'not-determined',
      totalTwd: null,
      entryCount: null,
      totalBasis: null,
      valuedItemCount: 0,
      unvaluedItemCount: 0,
    };
  }
  const entryCount = account.items.length;
  const valuedItemCount = account.items.filter(
    (item) => item.amount_yuan !== null,
  ).length;
  const unvaluedItemCount = entryCount - valuedItemCount;
  let totalTwd: number | null = null;
  let totalBasis: PropertyDeclarationGazetteTotalBasis = 'unvalued';
  if (COUNT_ONLY_CATEGORIES.has(category)) {
    totalBasis = 'count-only-amounts-withheld';
  } else if (unvaluedItemCount === 0 && account.amount_yuan !== null) {
    totalTwd = account.amount_yuan;
    totalBasis = 'declared-item-sum';
  }
  return {
    category,
    status: 'reported',
    totalTwd,
    entryCount,
    totalBasis,
    valuedItemCount,
    unvaluedItemCount,
  };
}
function filingSha(value: string): string | null {
  const match = /^pdf:([a-f0-9]{64})$/.exec(value);
  return match?.[1] ?? null;
}
function dateOrNull(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Unexpected gazette declaration date: ' + value);
  }
  return value;
}
function sha256(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
async function main(): Promise<void> {
  const { inputDir, output } = parseArgs(process.argv.slice(2));
  const [extractedText, matchedText, verificationText, rosterText] =
    await Promise.all([
      readFile(path.join(inputDir, 'extracted.json'), 'utf8'),
      readFile(path.join(inputDir, 'matched.json'), 'utf8'),
      readFile(
        path.join(
          process.cwd(),
          'data/normalized/2026/candidate-property-declaration-verification.json',
        ),
        'utf8',
      ),
      readFile(
        path.join(process.cwd(), 'data/approved/2026/kaohsiung-election.json'),
        'utf8',
      ),
    ]);
  const extracted = JSON.parse(extractedText) as GazetteExtract;
  const matches = JSON.parse(matchedText) as GazetteMatch[];
  const verification = JSON.parse(verificationText) as VerificationDataset;
  const roster = JSON.parse(rosterText) as Roster;
  if (matches.length !== roster.candidates.length) {
    throw new Error(
      'Gazette mapping count does not match the canonical roster: ' +
        matches.length +
        ' vs ' +
        roster.candidates.length,
    );
  }
  const rosterById = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const gazetteByUuid = new Map(
    extracted.records.map((record) => [record.uuid, record]),
  );
  const verificationByCandidate = new Map(
    verification.records.map((record) => [record.candidateId, record]),
  );
  const records = await Promise.all(
    matches.map(async (match) => {
      const candidate = rosterById.get(match.candidateId);
      if (!candidate) {
        throw new Error(
          'Gazette match references an unknown candidate: ' + match.candidateId,
        );
      }
      const gazette = gazetteByUuid.get(match.uuid);
      if (!gazette) {
        throw new Error('Missing gazette record for ' + match.uuid);
      }
      if (
        String(gazette.candidate.ballot_number) !== candidate.candidateNumber
      ) {
        throw new Error(
          'Gazette ballot number does not match the canonical roster for ' +
            candidate.id,
        );
      }
      const card = gazette.property_summary.card_accounts;
      const accountByCategory = new Map<
        PropertyDeclarationFinancialCategory,
        GazetteAccount
      >();
      for (const account of [...card.categories, card.debt]) {
        const category = categoryForAccount(account);
        if (category) accountByCategory.set(category, account);
      }
      const categories = PROPERTY_DECLARATION_FINANCIAL_CATEGORIES.map(
        (category) =>
          normalizeAccount(category, accountByCategory.get(category)),
      );
      if (categories.length !== 14) {
        throw new Error('Unexpected gazette category count.');
      }
      const sourcePage = await readFile(
        path.join(inputDir, 'html', match.uuid + '.html'),
      );
      const official = verificationByCandidate.get(match.candidateId) ?? null;
      const candidateUrl =
        'https://gazette2026.taiwangogo.tw/candidates/' + match.uuid + '/';
      return {
        candidateId: match.candidateId,
        displayName: candidate.displayName,
        gazetteCandidateId: match.uuid,
        gazetteName: gazette.candidate.name,
        matchMethod: 'district+ballot-number' as const,
        matchEvidence: {
          gazetteRegion: gazette.candidate.region,
          gazetteBallotNumber: gazette.candidate.ballot_number,
          rosterDistrictId: candidate.districtId,
          rosterElectionType: candidate.electionType,
          rosterCandidateNumber: candidate.candidateNumber,
        },
        nameExact: match.nameExact,
        candidateUrl,
        propertyCardUrl: candidateUrl + 'cards/property/',
        retrievedAt: extracted.retrieved,
        sourcePageSha256: sha256(sourcePage),
        declarationDate: dateOrNull(card.declaration_date),
        officialPdfFileName: official?.pdfFileName ?? null,
        officialPdfSha256: official?.pdfSha256 ?? null,
        sourceDocumentSha256: filingSha(card.filing_id),
        categories,
      };
    }),
  );
  const candidateIds = new Set(records.map((record) => record.candidateId));
  if (candidateIds.size !== roster.candidates.length) {
    throw new Error('Gazette output does not cover every canonical candidate.');
  }
  const dataset: PropertyDeclarationGazetteDataset = {
    datasetId: PROPERTY_DECLARATIONS_GAZETTE_DATASET_ID,
    schemaVersion: PROPERTY_DECLARATIONS_SCHEMA_VERSION,
    snapshotDate: PROPERTY_DECLARATIONS_GAZETTE_SNAPSHOT_DATE,
    source: {
      publisher: '台灣前進',
      url: 'https://gazette2026.taiwangogo.tw/',
      attribution: PROPERTY_DECLARATION_GAZETTE_ATTRIBUTION,
      license: PROPERTY_DECLARATION_GAZETTE_LICENSE,
      retrievedAt: extracted.retrieved,
      note: 'Public 2026 civil election gazette property cards; the adapter retains only category-level counts and declared aggregate totals, excluding item titles, locations, identifiers and raw OCR.',
    },
    records: records.sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
    note: 'Civil gazette fallback snapshot. Official CEC declarations remain primary; these values fill only individually unresolved fields and never override verified official values or explicit zeros.',
  };
  validatePropertyDeclarationGazetteDataset(dataset);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(dataset, null, 2) + String.fromCharCode(10),
  );
  const reported = dataset.records.reduce(
    (total, record) =>
      total +
      record.categories.filter((category) => category.status === 'reported')
        .length,
    0,
  );
  console.log(
    'Normalized civil gazette property data for ' +
      dataset.records.length +
      ' candidates: ' +
      reported +
      ' reported category fields.',
  );
}
await main();
