import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import approvedInput from '../data/approved/2026/kaohsiung-election.json';
import councilRosterInput from '../data/normalized/2026/kaohsiung-council-roster.json';
import manifestInput from '../data/official-source-manifest.json';
import cecConstituencies from '../data/raw/official/2026/cec-central-63625.json';
import cecRegistration from '../data/raw/official/2026/cec-central-64009.json';
import cecQualification from '../data/raw/official/2026/cec-central-65213.json';
import khecDrawing from '../data/raw/official/2026/khec-65366.json';
import khecAlias from '../data/raw/official/2026/khec-65368.json';
import khecBulletin from '../data/raw/official/2026/khec-bulletin.json';
import cecMayoralDirectory from '../data/raw/official/2026/research/cec-vote2026-c1-64000.json';
import {
  parseCecArticleMetadata,
  parseCecMayoralCandidates,
  parseCecQualifiedKaohsiungMayors,
  parseKhecBulletin,
  parseKhecDrawingMetadata,
  sourceChangeStatus,
} from '../src/data/official/adapters';
import {
  khecAliasStatus,
  validateCouncilRoster,
} from '../src/data/official/council';
import {
  reconcileOfficialData,
  reconciliationMarkdown,
} from '../src/data/official/reconcile';
import { validateOfficialDataset } from '../src/data/official/schema';

type ManifestSource = {
  id: string;
  rawPath?: string | null;
  attachmentPath?: string | null;
  sha256?: string | null;
  attachmentSha256?: string | null;
};
const root = process.cwd();
const manifest = manifestInput as { sources: ManifestSource[] };
const dataset = validateOfficialDataset(approvedInput);
const councilRoster = validateCouncilRoster(councilRosterInput);
const constituencyMetadata = parseCecArticleMetadata(
  cecConstituencies,
  'source-cec-central-63625',
);
const registrationMetadata = parseCecArticleMetadata(
  cecRegistration,
  'source-cec-central-64009',
);
const bulletinArticles = parseKhecBulletin(khecBulletin);
const qualifiedMayors = parseCecQualifiedKaohsiungMayors(cecQualification);
const directoryMayors = parseCecMayoralCandidates(cecMayoralDirectory);
const drawing = parseKhecDrawingMetadata(khecDrawing);
const aliasDrawing = parseKhecDrawingMetadata(khecAlias);
const aliasStatus = khecAliasStatus(
  drawing.fileId,
  aliasDrawing.fileId,
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
  '9bcbf34a3f18c634b3b619192288a2ff4712ef080d9d05343a90d5cf4a550aa1',
);
if (
  constituencyMetadata.publicationDate !== '2026-08-20' ||
  registrationMetadata.publicationDate !== '2026-08-27' ||
  !bulletinArticles.some((article) => article.articleId === 65366)
)
  throw new Error(
    'Official article metadata does not match retained snapshots.',
  );
if (
  drawing.fileId !== '9bd4f559-e527-4f55-a4ef-21653d340f79' ||
  aliasDrawing.fileId !== drawing.fileId ||
  !drawing.isImageOnly ||
  aliasStatus !== 'duplicate-alias'
)
  throw new Error(
    'KHEC drawing metadata or duplicate alias does not match the retained official files.',
  );
if (
  councilRoster.totalRowCount !== 101 ||
  councilRoster.constituencies.length !== 15
)
  throw new Error(
    'Council roster must contain 101 rows across 15 constituencies.',
  );
const approvedNames = dataset.candidates
  .filter((candidate) => candidate.electionType === 'mayoral')
  .map((candidate) => candidate.displayName);
const qualifiedNames = qualifiedMayors.map(
  (candidate) => candidate.displayName,
);
if (
  JSON.stringify(approvedNames) !==
  JSON.stringify(['張靜', '王肇民', '柯志恩', '洪方隆', '賴瑞隆'])
)
  throw new Error('Approved mayor order changed unexpectedly.');
if (
  JSON.stringify(qualifiedNames.sort()) !==
  JSON.stringify(approvedNames.slice().sort())
)
  throw new Error('CEC qualified roster does not match approved mayor names.');
const directoryByName = new Map(
  directoryMayors.map((candidate) => [candidate.displayName, candidate]),
);
for (const candidate of dataset.candidates.filter(
  (item) => item.electionType === 'mayoral',
)) {
  const directoryCandidate = directoryByName.get(candidate.displayName);
  if (!directoryCandidate)
    throw new Error(
      `CEC directory is missing approved mayor ${candidate.displayName}.`,
    );
  if (
    candidate.candidateNumber !== directoryCandidate.candidateNumber ||
    candidate.politicalParty !== directoryCandidate.politicalParty ||
    candidate.birthDate !== directoryCandidate.birthDate ||
    !candidate.sourceIds.includes(directoryCandidate.sourceId) ||
    candidate.partyStatus !== 'published'
  )
    throw new Error(
      'Approved identity fields do not match CEC directory for ' +
        candidate.displayName +
        '.',
    );
}
for (const source of manifest.sources) {
  for (const [field, expected] of [
    ['rawPath', source.sha256],
    ['attachmentPath', source.attachmentSha256],
  ] as const) {
    const relative = source[field];
    if (!relative || !expected) continue;
    const bytes = await readFile(path.join(root, relative));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (sourceChangeStatus(expected, actual) === 'changed')
      throw new Error(
        `Source checksum mismatch for ${source.id} ${field}: expected ${expected}, got ${actual}.`,
      );
  }
}
const report = reconcileOfficialData(dataset, qualifiedNames, councilRoster);
if (
  report.counts.councilSourceRows !== 101 ||
  report.counts.councilNormalizedRows !== 101 ||
  report.counts.councilApprovedRows !== 101 ||
  report.counts.councilPublishedRows !== 101 ||
  !report.publication.councilCandidatesPublished
)
  throw new Error(
    'Council roster reconciliation must cover 101 published preliminary rows.',
  );
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/election-reconciliation.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(
  path.join(root, 'reports/election-reconciliation.md'),
  reconciliationMarkdown(report),
  'utf8',
);
console.log(
  `Validated official snapshot ${dataset.snapshotDate}: ${report.counts.approvedMayors} approved mayors, ${report.counts.councilPublishedRows} preliminary council rows, ${report.counts.officialDistricts} districts, ${report.counts.pendingReviewScopes} pending review scope.`,
);
