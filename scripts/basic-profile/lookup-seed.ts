import { candidates, districtLabelFor, readSeed } from './lib';

type SeedEntry = {
  candidateId: string;
  displayName: string;
  msn?: string;
  url: string;
  sha256: string;
  filename?: string;
  page?: number;
  file?: string;
  education: string[];
  experience: string[];
  excerpt: string;
};

const candidateId = process.argv[2];
const candidate = candidates.find((entry) => entry.id === candidateId);
if (!candidate) {
  console.error(`Unknown candidate: ${candidateId}`);
  process.exit(1);
}
console.log(
  `# ${candidate.displayName} (${candidate.id}) — ${districtLabelFor(candidate)}`,
);
const kcc = readSeed<SeedEntry>('kcc-profiles', 'profiles').find(
  (entry) => entry.candidateId === candidateId,
);
const bulletin = readSeed<SeedEntry>('cec-2022-bulletin', 'candidates').find(
  (entry) => entry.candidateId === candidateId,
);
if (!kcc && !bulletin) {
  console.log('NO_SEED_EVIDENCE');
}
if (kcc) {
  console.log('\n## KCC PROFILE');
  console.log(`URL: ${kcc.url}`);
  console.log(`SHA256: ${kcc.sha256}`);
  console.log(
    `SNAPSHOT: data/biographies/raw/2026-11-06/kcc/profiles/${kcc.filename ?? ''}`,
  );
  console.log('EDUCATION:');
  for (const line of kcc.education) console.log(`- ${line}`);
  console.log('EXPERIENCE:');
  for (const line of kcc.experience) console.log(`- ${line}`);
  console.log(`EXCERPT:\n${kcc.excerpt}`);
}
if (bulletin) {
  console.log('\n## CEC 2022 BULLETIN');
  console.log(`URL: ${bulletin.url}`);
  console.log(`SHA256: ${bulletin.sha256}`);
  console.log(`PAGE: ${bulletin.page ?? '?'} (file ${bulletin.file ?? '?'})`);
  console.log('EDUCATION:');
  for (const line of bulletin.education) console.log(`- ${line}`);
  console.log('EXPERIENCE:');
  for (const line of bulletin.experience) console.log(`- ${line}`);
  console.log(`EXCERPT:\n${bulletin.excerpt}`);
}
