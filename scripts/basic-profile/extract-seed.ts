import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseKccProfile } from '../../src/data/biographies/adapters';
import {
  artifactsDir,
  candidateByName,
  districtById,
  isoNow,
  normalizeName,
  root,
  seedDir,
  sha256,
  writeJson,
} from './lib';

const CEC_BULLETIN_BASE =
  'https://bulletin.cec.gov.tw/01%E9%81%B8%E8%88%89%E5%85%AC%E5%A0%B1/05%E7%9B%B4%E8%BD%84%E5%B8%82%E8%AD%B0%E5%93%A1/111%E5%B9%B4/06%E9%AB%98%E9%9B%84%E5%B8%82';

type BulletinFile = {
  key: string;
  districtId: string | null;
  filename: string;
};

const councilFiles: BulletinFile[] = Array.from({ length: 11 }, (_, index) => {
  const number = index + 1;
  return {
    key: `d${number}`,
    districtId: `district-kaohsiung-council-${String(number).padStart(2, '0')}`,
    filename: `高雄市第${number}選區.pdf`,
  };
});
councilFiles.push({
  key: 'd12-15',
  districtId: null,
  filename: '高雄市第12.13.14.15選區.pdf',
});

type Word = { x: number; y: number; text: string };

function pageWords(pageXml: string): Word[] {
  const words: Word[] = [];
  const pattern = /<word\s+([^>]*)>([^<]*)<\/word>/g;
  for (const match of pageXml.matchAll(pattern)) {
    const attributes = Object.fromEntries(
      [...(match[1] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        attribute[2],
      ]),
    );
    const y = Number.parseFloat(attributes.yMin ?? '0');
    if (y <= 340) continue;
    words.push({
      x: Number.parseFloat(attributes.xMin ?? '0'),
      y,
      text: match[2] ?? '',
    });
  }
  return words;
}

export type BulletinCandidateRow = {
  page: number;
  name: string;
  education: string[];
  experience: string[];
  excerpt: string;
};

function extractPageRows(
  pageXml: string,
  page: number,
): BulletinCandidateRow[] {
  const words = pageWords(pageXml);
  if (words.length === 0) return [];
  const nameWords = words
    .filter((word) => word.x >= 315 && word.x <= 355)
    .sort((left, right) => left.y - right.y);
  const groups: Word[][] = [];
  for (const word of nameWords) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (
      group &&
      previous &&
      word.y - previous.y < 62 &&
      word.x - previous.x < 25
    ) {
      group.push(word);
    } else {
      groups.push([word]);
    }
  }
  const names = groups
    .map((group) => ({
      y: group[0]?.y ?? 0,
      name: group.map((word) => word.text).join(''),
    }))
    .filter((entry) => entry.name.length >= 2 && entry.name.length <= 20);

  return names.map((entry, index) => {
    const endY = names[index + 1]?.y ?? Number.POSITIVE_INFINITY;
    const education = words
      .filter(
        (word) =>
          word.x >= 510 &&
          word.x <= 662 &&
          word.y >= entry.y - 1 &&
          word.y < endY - 1,
      )
      .sort((left, right) => left.y - right.y)
      .map((word) => word.text);
    const experience = words
      .filter(
        (word) =>
          word.x >= 663 &&
          word.x <= 830 &&
          word.y >= entry.y - 1 &&
          word.y < endY - 1,
      )
      .sort((left, right) => left.y - right.y)
      .map((word) => word.text);
    return {
      page,
      name: entry.name,
      education,
      experience,
      excerpt: [...education, ...experience].join('\n'),
    };
  });
}

function parseBulletinPdf(pdfPath: string): BulletinCandidateRow[] {
  const xmlPath = `${pdfPath}.xml`;
  execFileSync('pdftotext', ['-bbox-layout', pdfPath, xmlPath]);
  const xml = readFileSync(xmlPath, 'utf8');
  const pages = xml.split('<page ').slice(1);
  return pages.flatMap((pageXml, index) => extractPageRows(pageXml, index + 1));
}

async function ensurePdf(url: string, target: string): Promise<void> {
  if (existsSync(target)) return;
  mkdirSync(join(target, '..'), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bulletin download failed: HTTP ${response.status} ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, bytes);
}

function districtForBulletinName(
  name: string,
  file: BulletinFile,
): { candidateId: string; districtId: string } | null {
  const candidate = candidateByName.get(normalizeName(name));
  if (!candidate) return null;
  if (file.districtId) {
    return candidate.districtId === file.districtId
      ? { candidateId: candidate.id, districtId: candidate.districtId }
      : null;
  }
  return [
    'district-kaohsiung-indigenous-flat-12',
    'district-kaohsiung-indigenous-mountain-13',
    'district-kaohsiung-indigenous-mountain-14',
    'district-kaohsiung-indigenous-mountain-15',
  ].includes(candidate.districtId)
    ? { candidateId: candidate.id, districtId: candidate.districtId }
    : null;
}

async function extractBulletin(): Promise<void> {
  const retrievedAt = isoNow();
  const files: Array<Record<string, unknown>> = [];
  const matched: Array<Record<string, unknown>> = [];
  const unmatched: Array<Record<string, unknown>> = [];
  const districtMismatches: Array<Record<string, unknown>> = [];
  const byCandidate = new Map<string, Record<string, unknown>>();

  const allFiles = [...councilFiles];

  for (const file of allFiles) {
    const base = CEC_BULLETIN_BASE;
    const url = `${base}/${encodeURIComponent(file.filename)}`;
    const pdfPath = join(artifactsDir, 'cec-bulletin-2022', `${file.key}.pdf`);
    await ensurePdf(url, pdfPath);
    const hash = sha256(readFileSync(pdfPath));
    const rows = parseBulletinPdf(pdfPath);
    files.push({
      key: file.key,
      districtId: file.districtId,
      filename: file.filename,
      url,
      sha256: hash,
      rowCount: rows.length,
    });
    for (const row of rows) {
      const identity = districtForBulletinName(row.name, {
        key: file.key,
        districtId: file.districtId,
        filename: file.filename,
      });
      const rosterCandidate = candidateByName.get(normalizeName(row.name));
      if (!identity) {
        if (rosterCandidate) {
          districtMismatches.push({
            name: row.name,
            rosterDistrictId: rosterCandidate.districtId,
            bulletinDistrictId: file.districtId,
            file: file.key,
          });
        } else {
          unmatched.push({ name: row.name, file: file.key, page: row.page });
        }
        continue;
      }
      const entry = {
        candidateId: identity.candidateId,
        displayName: rosterCandidate?.displayName ?? row.name,
        districtId: identity.districtId,
        districtLabel: districtById.get(identity.districtId)?.name ?? '',
        file: file.key,
        page: row.page,
        education: row.education,
        experience: row.experience,
        excerpt: row.excerpt,
        url,
        sha256: hash,
        note: '2022-11-26 地方公職人員選舉選舉公報；學歷與經歷由候選人自行填列，屬歷史資料。',
      };
      matched.push(entry);
      const existing = byCandidate.get(identity.candidateId);
      if (!existing) {
        byCandidate.set(identity.candidateId, entry);
      } else {
        byCandidate.set(identity.candidateId, {
          ...existing,
          education: [
            ...new Set([...(existing.education as string[]), ...row.education]),
          ],
          experience: [
            ...new Set([
              ...(existing.experience as string[]),
              ...row.experience,
            ]),
          ],
        });
      }
    }
  }

  writeJson(join(seedDir, 'cec-2022-bulletin.json'), {
    datasetId: 'kaohsiung-2026-basic-profile-seed-cec-bulletin',
    source: '2022 年中華民國地方公職人員選舉高雄市選舉公報',
    electionDate: '2022-11-26',
    retrievedAt,
    note: 'Extracted from official CEC bulletin PDFs. Only exact roster-name matches inside the matching electoral district are retained. The PDFs and extracted rows are historical candidate-filled statements, not independent verification.',
    files,
    candidates: [...byCandidate.values()],
    districtMismatches,
    unmatched,
  });
  console.log(
    `Bulletin: ${files.length} files, ${byCandidate.size} roster candidates matched, ${districtMismatches.length} district mismatches, ${unmatched.length} unmatched names.`,
  );
}

function extractKcc(): void {
  const snapshotDate = '2026-11-06';
  const directory = join(
    root,
    'data/biographies/raw',
    snapshotDate,
    'kcc/profiles',
  );
  const files = readdirSync(directory).filter((file) => file.endsWith('.html'));
  const profiles: Array<Record<string, unknown>> = [];
  const unmatched: Array<{ name: string; file: string }> = [];
  for (const file of files) {
    const path = join(directory, file);
    const html = readFileSync(path, 'utf8');
    const msn = file.replace(/\.html$/, '');
    const profile = parseKccProfile(html, msn);
    if (!profile) continue;
    const candidate = candidateByName.get(normalizeName(profile.observedName));
    if (!candidate) {
      unmatched.push({ name: profile.observedName, file });
      continue;
    }
    profiles.push({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      msn,
      url: `https://www.kcc.gov.tw/MemberInfo_New.aspx?n=39&sms=9028&msn=${msn}`,
      filename: file,
      sha256: sha256(readFileSync(path)),
      observedParty: profile.observedParty,
      education: profile.education,
      experience: profile.experience,
      excerpt: profile.excerpt,
      snapshotDate,
      note: '高雄市議會本屆議員簡介（2026-11-06 快照）；學經歷由議員提供並由議會刊載。',
    });
  }
  writeJson(join(seedDir, 'kcc-profiles.json'), {
    datasetId: 'kaohsiung-2026-basic-profile-seed-kcc',
    publisher: '高雄市議會',
    snapshotDate,
    retrievedAt: `${snapshotDate}T00:00:00.000Z`,
    note: 'Parsed from retained KCC member profile snapshots. Only exact roster-name matches are retained.',
    profiles,
    unmatched,
  });
  console.log(
    `KCC: ${profiles.length} roster profiles matched, ${unmatched.length} unmatched.`,
  );
}

await extractBulletin();
extractKcc();
