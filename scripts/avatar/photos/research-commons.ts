/**
 * Stage 1 of the likeness photo pipeline: collect candidate photographs from
 * two structured sources for every candidate in the approved 2026 roster:
 *
 * 1. zh.wikipedia lead image (`prop=pageimages`), accepted only when the same
 *    article states the person's Kaohsiung office (議員 / 議會 / 市長).
 * 2. Wikimedia Commons category membership of Kaohsiung council/mayor
 *    categories, accepted only when the file description or categories name
 *    the office and the candidate.
 *
 * Free-text Commons search is deliberately not used: it returns scanned books
 * and gazettes whose OCR happens to contain the characters of a name.
 *
 * This script never downloads image bytes and never decides identity by title
 * alone. It records license metadata and the office evidence it saw so a
 * curator can accept or reject each entry in `photo-selection.json`.
 *
 * Output: tmp/avatar-pipeline/commons-candidates.json (gitignored staging).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import { validateOfficialDataset } from '../../../src/data/official/schema';
import type { LikenessPhoto } from '../../../src/data/avatars/likeness/schema';

type DerivateUse = LikenessPhoto['derivativeUse'];

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA_API = 'https://zh.wikipedia.org/w/api.php';
const USER_AGENT =
  'KaohsiungCivicStoriesLikenessResearch/1.0 (https://github.com/r05323028/kaohsiung-2026-election; civic likeness reference; node tsx)';
const REQUEST_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 40;
const STAGING_PATH = path.join(
  process.cwd(),
  'tmp/avatar-pipeline/commons-candidates.json',
);

/** Commons categories whose members are Kaohsiung office holders. */
const OFFICE_CATEGORIES = [
  'Category:Members of the 4th Kaohsiung City Council',
  'Category:Members of the 3rd Kaohsiung City Council',
  'Category:Members of the 2nd Kaohsiung City Council',
  'Category:Members of the 1st Kaohsiung City Council',
  'Category:Members of the Kaohsiung City Council',
  'Category:Mayors of Kaohsiung',
  'Category:Politicians of Kaohsiung',
];

const ExtMetadataValueSchema = z.object({ value: z.unknown() });
const ImageInfoSchema = z.object({
  url: z.string(),
  descriptionurl: z.string(),
  width: z.number(),
  height: z.number(),
  mime: z.string().optional(),
  extmetadata: z.record(z.string(), ExtMetadataValueSchema).optional(),
});
type ImageInfo = z.infer<typeof ImageInfoSchema>;

export type LicenseAssessment = {
  licenseName: string;
  licenseUrl: string | null;
  author: string | null;
  attributionRequired: boolean;
  derivativeUse: DerivateUse;
  reason: string;
};

export type StagedPhoto = {
  fileTitle: string;
  pageId: number | null;
  descriptionUrl: string;
  originalUrl: string;
  mime: string;
  width: number;
  height: number;
  license: LicenseAssessment;
  discoveredBy: string[];
  officeEvidence: string[];
  matchedFields: string[];
  titleNameShape:
    | 'exact'
    | 'suffixed'
    | 'prefixed'
    | 'extended'
    | 'embedded'
    | 'absent';
  observedNameMentions: string[];
  description: string | null;
  credit: string | null;
  categories: string[];
  warnings: string[];
  screen: 'pursue' | 'reject';
  screenReason: string;
};

export type StagedCandidate = {
  candidateId: string;
  displayName: string;
  slug: string;
  party: string | null;
  districtLabel: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  wikipedia: {
    title: string;
    pageId: number;
    leadFile: string | null;
    roleSentence: string | null;
    note: string;
  } | null;
  photos: StagedPhoto[];
  notes: string[];
};

const PORTRAIT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const OTHER_CITY_OFFICE =
  /(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)(?:議會|議員|市長|縣長|市長候選人)/u;
const KAOHSIUNG_OFFICE =
  /(?:高雄市議會|高雄市議員|高雄市市長|高雄市長)|Members of the \d(?:st|nd|rd|th) Kaohsiung City Council|Kaohsiung City Council|Mayor of Kaohsiung/iu;
const DISAMBIGUATION_HINT = /可以指|可能是指|消歧義/u;

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function metadataValue(
  extmetadata: Record<string, { value: unknown }> | undefined,
  key: string,
): string | null {
  const raw = extmetadata?.[key]?.value;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') return stripHtml(raw);
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return stripHtml(JSON.stringify(raw));
}

export function classifyLicense(
  licenseName: string | null,
  licenseUrl: string | null,
  copyrighted: string | null,
  categories: string[] = [],
): LicenseAssessment {
  const name = (licenseName ?? '').trim();
  const url = licenseUrl?.trim() ? licenseUrl.trim() : null;
  const nameLower = name.toLowerCase();

  const rejected = (reason: string): LicenseAssessment => ({
    licenseName: name || 'unspecified',
    licenseUrl: url,
    author: null,
    attributionRequired: true,
    derivativeUse: 'not-allowed',
    reason,
  });

  if (!name) {
    if (copyrighted === '0' || copyrighted?.toLowerCase() === 'false')
      return {
        licenseName: 'public-domain (metadata Copyrighted=false)',
        licenseUrl: url,
        author: null,
        attributionRequired: false,
        derivativeUse: 'allowed-with-attribution',
        reason: 'Commons reports Copyrighted=false without a license template.',
      };
    return rejected('No license template in Commons metadata.');
  }

  if (/fair ?use|non-?free|all rights reserved|©/iu.test(nameLower))
    return rejected(`License forbids reuse: ${name}`);

  // GWOIA (政府網站資料開放宣告) files carry the generic short name
  // "Attribution" plus the GWOIA / "Attribution only license" categories.
  if (
    nameLower === 'attribution' &&
    (categories.includes('GWOIA') ||
      categories.includes('Attribution only license'))
  )
    return {
      licenseName: 'GWOIA (Attribution only license)',
      licenseUrl: url ?? 'https://commons.wikimedia.org/wiki/Template:GWOIA',
      author: null,
      attributionRequired: true,
      derivativeUse: 'allowed-with-attribution',
      reason:
        'Government Website Open Information Announcement: derivative use allowed with attribution.',
    };

  if (/^ogdl/iu.test(nameLower))
    return {
      licenseName: name,
      licenseUrl: url ?? 'https://data.gov.tw/license',
      author: null,
      attributionRequired: true,
      derivativeUse: 'allowed-with-attribution',
      reason:
        'Open Government Data License Taiwan 1.0: derivative use allowed with attribution.',
    };

  if (/gfdl/iu.test(nameLower))
    return rejected(
      'GFDL requires shipping the full license text; treat as incompatible for this asset pipeline.',
    );

  const isPublicDomain =
    /^cc0\b|cc-zero|public domain|^pd\b|^pd-|no known copyright|no restrictions/iu.test(
      nameLower,
    );
  const isShareAlike =
    /cc[ -]?by[ -]?sa/iu.test(nameLower) || /by-sa/iu.test(url ?? '');
  const isAttributionOnly =
    !isShareAlike &&
    (/cc[ -]?by\b/iu.test(nameLower) || /licenses\/by\//iu.test(url ?? ''));

  if (isPublicDomain)
    return {
      licenseName: name,
      licenseUrl: url,
      author: null,
      attributionRequired: false,
      derivativeUse: 'allowed-with-attribution',
      reason:
        'Public-domain dedication: derivative use allowed, no attribution required.',
    };
  if (isShareAlike)
    return {
      licenseName: name,
      licenseUrl: url,
      author: null,
      attributionRequired: true,
      derivativeUse: 'allowed-with-attribution-share-alike',
      reason:
        'CC BY-SA: derivative use allowed, attribution and share-alike required.',
    };
  if (isAttributionOnly)
    return {
      licenseName: name,
      licenseUrl: url,
      author: null,
      attributionRequired: true,
      derivativeUse: 'allowed-with-attribution',
      reason: 'CC BY: derivative use allowed with attribution.',
    };
  return rejected(`Unrecognised license template: ${name}`);
}

const TITLE_NAME_SUFFIXES = [
  '議員',
  '委員',
  '議長',
  '副議長',
  '市長',
  '肖像',
  '大頭照',
  '候選人',
  'portrait',
];

/**
 * Reports how a file title names the candidate. Office labels before the name
 * (`立法委員賴瑞隆`, `高雄市議會副議長曾俊傑`) are acceptable, because the label
 * itself states the office. A name that only appears inside a longer word
 * (`張靜` in `張靜愚`) is not usable evidence of identity.
 */
export function titleNameShape(
  title: string,
  displayName: string,
): 'exact' | 'suffixed' | 'prefixed' | 'extended' | 'embedded' | 'absent' {
  const base = title
    .replace(/^File:/u, '')
    .replace(/\.[^.]+$/u, '')
    .replace(/\s*\([^)]*\)/gu, '')
    .trim();
  const index = base.indexOf(displayName);
  if (index < 0) return 'absent';

  const before = base.slice(0, index);
  const after = base.slice(index + displayName.length);
  const trailing = after
    .replace(/^[\s(（_-]+/u, '')
    .replace(/[\s)）]+$/u, '')
    .trim();
  const trailingIsLabel =
    trailing === '' ||
    /^\d{4}$/u.test(trailing) ||
    TITLE_NAME_SUFFIXES.some(
      (suffix) =>
        trailing === suffix || trailing.toLowerCase() === suffix.toLowerCase(),
    );

  if (before.trim() === '') {
    if (trailing === '') return 'exact';
    return trailingIsLabel ? 'suffixed' : 'extended';
  }

  const leadingLabel = before
    .replace(/[\s_-]+$/u, '')
    .replace(/^[\s(（]+/u, '');
  const leadingIsOffice =
    /(?:議員|議長|副議長|委員|市長|候選人|肖像|大頭照|第[一二三四五六七八九十\d]屆議員|立法委員|Mayor|Councillor)$/iu.test(
      leadingLabel,
    );
  if (leadingIsOffice && trailingIsLabel) return 'prefixed';
  return 'embedded';
}

function fileExtension(title: string): string {
  const match = /\.([a-z0-9]+)$/iu.exec(title);
  return (match?.[1] ?? '').toLowerCase();
}

/** Commons normalises underscores in file titles; compare on that form. */
function commonsFileKey(title: string): string {
  return title
    .replace(/^File:/u, '')
    .replace(/_/gu, ' ')
    .trim();
}

async function apiGet(
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    ...params,
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?${query.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(
          `${endpoint} responded ${response.status} ${response.statusText}`,
        );
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${endpoint} request failed`);
}

const WikiPageSchema = z.object({
  pageid: z.number().optional(),
  title: z.string(),
  missing: z.boolean().optional(),
  invalid: z.boolean().optional(),
  pageimage: z.string().optional(),
  extract: z.string().optional(),
  pageprops: z.record(z.string(), z.unknown()).optional(),
});
const WikiResponseSchema = z.object({
  query: z.object({ pages: z.array(WikiPageSchema) }).optional(),
});

type WikiPage = z.infer<typeof WikiPageSchema>;

function rolePattern(electionType: StagedCandidate['electionType']): RegExp {
  return electionType === 'mayoral'
    ? /高雄市(?:市)?長|高雄市長候選人/u
    : /高雄市(?:議會|議員)/u;
}

function roleSentence(
  extract: string,
  electionType: StagedCandidate['electionType'],
): string | null {
  const sentences = extract
    .split(/(?<=[。！？])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const pattern = rolePattern(electionType);
  for (const sentence of sentences) {
    if (pattern.test(sentence) && sentence.includes('高雄')) return sentence;
  }
  return null;
}

async function fetchWikipedia(
  displayNames: string[],
): Promise<Map<string, WikiPage>> {
  const pages = new Map<string, WikiPage>();
  for (let index = 0; index < displayNames.length; index += BATCH_SIZE) {
    const batch = displayNames.slice(index, index + BATCH_SIZE);
    const payload = WikiResponseSchema.parse(
      await apiGet(WIKIPEDIA_API, {
        prop: 'pageimages|pageprops|extracts',
        piprop: 'original|name',
        exintro: '1',
        explaintext: '1',
        redirects: '1',
        titles: batch.join('|'),
      }),
    );
    const normalized = new Map<string, string>();
    for (const page of payload.query?.pages ?? []) {
      if (page.missing || page.invalid) continue;
      pages.set(page.title, page);
      normalized.set(page.title.replace(/ /gu, '_'), page.title);
    }
    await delay(200);
  }
  return pages;
}

/** Matches a Wikipedia page to a roster name via the article title. */
function pageForName(
  pages: Map<string, WikiPage>,
  displayName: string,
): WikiPage | null {
  const direct = pages.get(displayName);
  if (direct) return direct;
  for (const [title, page] of pages) {
    if (title === displayName) return page;
    if (title.startsWith(`${displayName} (`)) return page;
  }
  return null;
}

async function fetchCategoryFiles(): Promise<Map<string, string[]>> {
  const files = new Map<string, string[]>();
  for (const category of OFFICE_CATEGORIES) {
    let cont: string | undefined;
    for (let page = 0; page < 4; page += 1) {
      const params: Record<string, string> = {
        list: 'categorymembers',
        cmtitle: category,
        cmtype: 'file',
        cmlimit: '500',
      };
      if (cont) params.cmcontinue = cont;
      const payload = z
        .object({
          continue: z.record(z.string(), z.string()).optional(),
          query: z
            .object({
              categorymembers: z
                .array(z.object({ title: z.string() }))
                .optional(),
            })
            .optional(),
        })
        .parse(await apiGet(COMMONS_API, params));
      for (const member of payload.query?.categorymembers ?? []) {
        const existing = files.get(member.title) ?? [];
        existing.push(category);
        files.set(member.title, existing);
      }
      const next = payload.continue?.cmcontinue;
      if (!next) break;
      cont = next;
      await delay(150);
    }
    await delay(150);
  }
  return files;
}

async function fetchImageInfo(
  fileTitles: string[],
): Promise<Map<string, ImageInfo>> {
  const info = new Map<string, ImageInfo>();
  for (let index = 0; index < fileTitles.length; index += 50) {
    const batch = fileTitles.slice(index, index + 50);
    const payload = z
      .object({
        query: z
          .object({
            pages: z.array(
              z.object({
                pageid: z.number().optional(),
                title: z.string(),
                imageinfo: z.array(ImageInfoSchema).optional(),
              }),
            ),
          })
          .optional(),
      })
      .parse(
        await apiGet(COMMONS_API, {
          titles: batch.join('|'),
          prop: 'imageinfo',
          iiprop: 'url|size|extmetadata|mime',
          iilimit: '1',
        }),
      );
    for (const page of payload.query?.pages ?? []) {
      const first = page.imageinfo?.[0];
      if (first) info.set(page.title, first);
    }
    await delay(200);
  }
  return info;
}

type FileCandidateMatch = {
  candidateName: string;
  matchedFields: string[];
  mentions: string[];
};

/** Finds roster candidates explicitly named by a file's metadata. */
function matchFileToCandidates(
  fileTitle: string,
  description: string | null,
  objectName: string | null,
  categoriesRaw: string | null,
  names: string[],
): FileCandidateMatch[] {
  const matches: FileCandidateMatch[] = [];
  for (const name of names) {
    const matchedFields: string[] = [];
    const mentions: string[] = [];
    const shape = titleNameShape(fileTitle, name);
    if (shape === 'exact' || shape === 'suffixed') {
      matchedFields.push('title');
      mentions.push(`title: ${fileTitle}`);
    }
    if (objectName?.includes(name)) {
      matchedFields.push('objectName');
      mentions.push(`objectName: ${objectName}`);
    }
    if (description?.includes(name)) {
      matchedFields.push('description');
      mentions.push(`description: ${description.slice(0, 160)}`);
    }
    if (matchedFields.length === 0 && categoriesRaw?.includes(name)) {
      matchedFields.push('categories');
      mentions.push(`categories: ${categoriesRaw.slice(0, 160)}`);
    }
    if (matchedFields.length > 0)
      matches.push({ candidateName: name, matchedFields, mentions });
  }
  return matches;
}

function screenPhoto(
  fileTitle: string,
  info: ImageInfo,
  match: FileCandidateMatch,
  discoveredBy: string[],
  wikipediaRole: string | null,
): StagedPhoto | null {
  const extension = fileExtension(fileTitle);
  if (!PORTRAIT_EXTENSIONS.has(extension)) return null;

  const extmetadata = info.extmetadata;
  const objectName = metadataValue(extmetadata, 'ObjectName');
  const description = metadataValue(extmetadata, 'ImageDescription');
  const categoriesRaw = metadataValue(extmetadata, 'Categories');
  const author = metadataValue(extmetadata, 'Artist');
  const credit = metadataValue(extmetadata, 'Credit');
  const categories = (categoriesRaw ?? '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const license = classifyLicense(
    metadataValue(extmetadata, 'LicenseShortName'),
    metadataValue(extmetadata, 'LicenseUrl'),
    metadataValue(extmetadata, 'Copyrighted'),
    categories,
  );
  if (license.derivativeUse !== 'not-allowed' && author)
    license.author = author;

  const officeHaystack = [description, categoriesRaw, credit, objectName]
    .filter((value): value is string => Boolean(value))
    .join(' | ');
  const officeEvidence: string[] = [];
  if (KAOHSIUNG_OFFICE.test(officeHaystack))
    officeEvidence.push(
      `Commons metadata names a Kaohsiung office: ${(KAOHSIUNG_OFFICE.exec(officeHaystack)?.[0] ?? '').trim()}`,
    );
  const otherCity = OTHER_CITY_OFFICE.exec(officeHaystack);
  if (otherCity)
    officeEvidence.push(
      `Commons metadata names another municipality: ${otherCity[0]}`,
    );
  if (wikipediaRole)
    officeEvidence.push(`zh.wikipedia article states: ${wikipediaRole}`);

  const shape = titleNameShape(fileTitle, match.candidateName);
  const warnings: string[] = [];
  const rejections: string[] = [];
  const shortSide = Math.min(info.width, info.height);
  if (shortSide < 200)
    warnings.push(`low-resolution (short side ${shortSide}px)`);
  if (shape === 'extended' || shape === 'embedded')
    warnings.push(
      `title name form is '${shape}' (name embedded in a longer word)`,
    );
  // Either the Commons metadata names the office, or the file is the lead
  // image of a zh.wikipedia article whose own text states the Kaohsiung
  // office. The second case is the article identity binding, not a guess.
  const officeStated =
    officeEvidence.some((entry) =>
      entry.startsWith('Commons metadata names a Kaohsiung'),
    ) || wikipediaRole !== null;
  if (!officeStated)
    rejections.push('no source states the person holds a Kaohsiung office');
  if (otherCity)
    rejections.push(
      `Commons metadata describes a different municipality (${otherCity[0]})`,
    );
  if (license.derivativeUse === 'not-allowed') rejections.push(license.reason);
  if (shape === 'extended' || shape === 'embedded')
    rejections.push('file title only names the candidate inside a longer word');

  return {
    fileTitle,
    pageId: null,
    descriptionUrl: info.descriptionurl,
    originalUrl: info.url,
    mime: info.mime ?? `image/${extension}`,
    width: info.width,
    height: info.height,
    license,
    discoveredBy,
    officeEvidence,
    matchedFields: match.matchedFields,
    titleNameShape: shape,
    observedNameMentions: match.mentions,
    description,
    credit,
    categories,
    warnings,
    screen: rejections.length === 0 ? 'pursue' : 'reject',
    screenReason:
      rejections.length === 0
        ? `Licensed for derivative use (${license.licenseName}); review identity and view by eye.`
        : rejections.join('; '),
  };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const dataset = validateOfficialDataset(approvedInput);
  const districtLabelById = new Map(
    dataset.districts.map((district) => [district.id, district.districtLabel]),
  );

  const staged: StagedCandidate[] = dataset.candidates.map((candidate) => ({
    candidateId: candidate.id,
    displayName: candidate.displayName,
    slug: candidate.slug,
    party: candidate.politicalParty,
    districtLabel:
      districtLabelById.get(candidate.districtId) ?? candidate.districtId,
    electionType: candidate.electionType,
    wikipedia: null,
    photos: [],
    notes: [],
  }));
  const byName = new Map(staged.map((entry) => [entry.displayName, entry]));

  const wikiPages = await fetchWikipedia(
    staged.map((entry) => entry.displayName),
  );
  const leadFiles = new Map<
    string,
    { candidate: StagedCandidate; role: string | null }
  >();

  for (const entry of staged) {
    const page = pageForName(wikiPages, entry.displayName);
    if (!page || page.pageid === undefined) {
      entry.notes.push('No zh.wikipedia article with this exact title.');
      continue;
    }
    const extract = page.extract ?? '';
    if (DISAMBIGUATION_HINT.test(extract) || page.pageprops?.disambiguation) {
      entry.notes.push(
        `zh.wikipedia article "${page.title}" is a disambiguation page; no lead image can be attributed.`,
      );
      continue;
    }
    const role = roleSentence(extract, entry.electionType);
    entry.wikipedia = {
      title: page.title,
      pageId: page.pageid,
      leadFile: page.pageimage ?? null,
      roleSentence: role,
      note: role
        ? 'Article states the Kaohsiung office; lead image may be attributed to it.'
        : 'Article intro does not state the Kaohsiung office; lead image is not identity evidence.',
    };
    // Every name-matching article contributes its lead image to the review
    // pile, even without an office sentence: the Commons metadata is screened
    // separately and a reject still becomes documented evidence.
    if (page.pageimage)
      leadFiles.set(commonsFileKey(page.pageimage), {
        candidate: entry,
        role,
      });
    if (!role)
      entry.notes.push(
        `zh.wikipedia article exists but the intro does not state a Kaohsiung office.`,
      );
    await delay(20);
  }

  const categoryFiles = await fetchCategoryFiles();
  const fileTitles = new Set<string>([
    ...[...leadFiles.keys()].map((name) => `File:${name}`),
    ...categoryFiles.keys(),
  ]);

  console.log(
    `zh.wikipedia lead images: ${leadFiles.size}; category files: ${categoryFiles.size}; unique files: ${fileTitles.size}`,
  );

  const imageInfo = await fetchImageInfo([...fileTitles]);

  let stagedPhotos = 0;
  for (const [fileTitle, info] of imageInfo) {
    const extmetadata = info.extmetadata;
    const description = metadataValue(extmetadata, 'ImageDescription');
    const objectName = metadataValue(extmetadata, 'ObjectName');
    const categoriesRaw = metadataValue(extmetadata, 'Categories');
    const matches = matchFileToCandidates(
      fileTitle,
      description,
      objectName,
      categoriesRaw,
      staged.map((entry) => entry.displayName),
    );
    if (matches.length === 0) continue;

    for (const match of matches) {
      const candidate = byName.get(match.candidateName);
      if (!candidate) continue;
      const lead = leadFiles.get(commonsFileKey(fileTitle));
      const discoveredBy: string[] = [];
      if (lead && lead.candidate.candidateId === candidate.candidateId)
        discoveredBy.push('zh.wikipedia-lead-image');
      const categories = categoryFiles.get(fileTitle);
      if (categories)
        for (const category of categories)
          discoveredBy.push(
            `commons-category:${category.replace('Category:', '')}`,
          );
      const role =
        lead && lead.candidate.candidateId === candidate.candidateId
          ? lead.role
          : null;
      const photo = screenPhoto(
        fileTitle,
        info,
        match,
        discoveredBy.length > 0
          ? discoveredBy
          : ['commons-metadata-name-match'],
        role,
      );
      if (!photo) continue;
      candidate.photos.push(photo);
      stagedPhotos += 1;
    }
  }

  for (const entry of staged) {
    entry.photos.sort((left, right) =>
      left.fileTitle.localeCompare(right.fileTitle),
    );
  }

  await mkdir(path.dirname(STAGING_PATH), { recursive: true });
  await writeFile(
    STAGING_PATH,
    `${JSON.stringify(
      {
        retrievedAt: new Date().toISOString().slice(0, 10),
        sources: [
          'zh.wikipedia action=query prop=pageimages|pageprops|extracts (lead image + office sentence)',
          'Commons action=query list=categorymembers on Kaohsiung council/mayor categories',
          'Commons action=query prop=imageinfo iiprop=url|size|extmetadata|mime',
        ],
        userAgent: USER_AGENT,
        candidates: staged,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const withPhotos = staged.filter((entry) => entry.photos.length > 0).length;
  const pursue = staged.reduce(
    (sum, entry) =>
      sum + entry.photos.filter((photo) => photo.screen === 'pursue').length,
    0,
  );
  console.log(
    `Staged ${stagedPhotos} files for ${withPhotos}/${staged.length} candidates (${pursue} pursue) in ${Math.round((Date.now() - startedAt) / 1000)}s -> ${path.relative(process.cwd(), STAGING_PATH)}`,
  );
}

await main();
