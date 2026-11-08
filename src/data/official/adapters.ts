export type QualifiedMayor = { displayName: string; sourceId: string };
export type CecMayoralCandidate = {
  displayName: string;
  candidateNumber: string;
  politicalParty: string;
  birthDate: string;
  gender: string;
  home: string;
  portraitReference: string;
  sourceId: 'source-cec-vote2026-c1-64000';
};
export type KhecDrawingMetadata = {
  title: string;
  beginDate: string;
  fileId: string;
  fileName: string;
  isImageOnly: boolean;
};
export type CecArticleMetadata = {
  sourceId: string;
  title: string;
  publicationDate: string;
  attachmentFileIds: string[];
};
export type KhecBulletinArticle = {
  articleId: number;
  title: string;
  beginDate: string;
  sourceId: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Official source payload must be an object.');
  return value as Record<string, unknown>;
}

function compactDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{8}/.test(value))
    throw new Error(`${label} must begin with an eight-digit date.`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function compactRocDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{7}$/.test(value))
    throw new Error(`${label} must be a seven-digit ROC date.`);
  const year = Number(value.slice(0, 3)) + 1911;
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31)
    throw new Error(`${label} contains an invalid month or day.`);
  return (
    String(year).padStart(4, '0') +
    '-' +
    value.slice(3, 5) +
    '-' +
    value.slice(5, 7)
  );
}

export function parseCecMayoralCandidates(raw: unknown): CecMayoralCandidate[] {
  const root = asRecord(raw);
  const candidates = root.C1;
  if (!Array.isArray(candidates) || candidates.length !== 5)
    throw new Error(
      'CEC mayor candidate directory must contain exactly 5 records.',
    );
  return candidates.map((candidate, index) => {
    const record = asRecord(candidate);
    const displayName = record.name;
    const candidateNumber = record.candNo;
    const politicalParty = record.party;
    const gender = record.gender;
    const home = record.home;
    const portraitReference = record.img;
    if (
      typeof displayName !== 'string' ||
      typeof candidateNumber !== 'number' ||
      !Number.isInteger(candidateNumber) ||
      candidateNumber < 1 ||
      typeof politicalParty !== 'string' ||
      politicalParty.length === 0 ||
      record.type !== '縣市長' ||
      typeof gender !== 'string' ||
      typeof home !== 'string' ||
      typeof portraitReference !== 'string'
    )
      throw new Error(`CEC mayor candidate record ${index + 1} is incomplete.`);
    return {
      displayName,
      candidateNumber: String(candidateNumber),
      politicalParty,
      birthDate: compactRocDate(record.birth, `CEC ${displayName} birth`),
      gender,
      home,
      portraitReference,
      sourceId: 'source-cec-vote2026-c1-64000',
    };
  });
}

export function parseCecArticleMetadata(
  raw: unknown,
  sourceId: string,
): CecArticleMetadata {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const title = data.title;
  const beginTime = data.beginTime;
  const fileList = data.fileList;
  if (
    typeof title !== 'string' ||
    typeof beginTime !== 'string' ||
    !Array.isArray(fileList)
  )
    throw new Error(
      `CEC ${sourceId} is missing title, beginTime, or fileList metadata.`,
    );
  const attachmentFileIds = fileList.map((file) => {
    const record = asRecord(file);
    if (typeof record.fileId !== 'string')
      throw new Error(`CEC ${sourceId} contains an attachment without fileId.`);
    return record.fileId;
  });
  return {
    sourceId,
    title,
    publicationDate: compactDate(beginTime, `CEC ${sourceId} beginTime`),
    attachmentFileIds,
  };
}

export function parseKhecBulletin(raw: unknown): KhecBulletinArticle[] {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const bulletinList = data.bulletinList;
  if (!Array.isArray(bulletinList))
    throw new Error('KHEC bulletin is missing bulletinList metadata.');
  return bulletinList.flatMap((bulletin) => {
    const record = asRecord(bulletin);
    if (!Array.isArray(record.articleList)) return [];
    return record.articleList.map((article) => {
      const item = asRecord(article);
      const articleId = item.articleId;
      const title = item.title;
      const beginTime = item.beginTime;
      if (
        typeof articleId !== 'number' ||
        typeof title !== 'string' ||
        typeof beginTime !== 'string'
      )
        throw new Error('KHEC bulletin contains an invalid article entry.');
      return {
        articleId,
        title,
        beginDate: compactDate(
          beginTime,
          `KHEC article ${articleId} beginTime`,
        ),
        sourceId: 'source-khec-bulletin',
      };
    });
  });
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cecArticleText(raw: unknown): string {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const content = data.content;
  if (typeof content !== 'string')
    throw new Error('CEC article 65213 content is not a JSON string.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('CEC article 65213 content is not valid embedded JSON.');
  }
  const contentRoot = asRecord(parsed);
  const blocks = contentRoot.content;
  if (!Array.isArray(blocks))
    throw new Error('CEC article 65213 has no content blocks.');
  return blocks
    .map((block) => {
      const record = asRecord(block);
      return typeof record.content === 'string'
        ? stripMarkup(record.content)
        : '';
    })
    .join(' ');
}

export function parseCecQualifiedKaohsiungMayors(
  raw: unknown,
): QualifiedMayor[] {
  const text = cecArticleText(raw);
  const match = text.match(/（六）高雄市5人：([^。]+)/);
  if (!match?.[1])
    throw new Error(
      'CEC article 65213 does not contain the Kaohsiung five-person mayor list.',
    );
  const names = match[1]
    .split('、')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length !== 5)
    throw new Error(
      `CEC article 65213 expected 5 Kaohsiung mayor names, found ${names.length}.`,
    );
  return names.map((displayName) => ({
    displayName,
    sourceId: 'source-cec-central-65213',
  }));
}

export function parseKhecDrawingMetadata(raw: unknown): KhecDrawingMetadata {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const title = data.title;
  const beginTime = data.beginTime;
  const fileList = data.fileList;
  if (
    typeof title !== 'string' ||
    typeof beginTime !== 'string' ||
    !Array.isArray(fileList) ||
    fileList.length === 0
  ) {
    throw new Error(
      'KHEC article 65366 is missing title, beginTime, or fileList.',
    );
  }
  const file = asRecord(fileList[0]);
  const fileId = file.fileId;
  const fileName = file.fileName;
  const fileExt = file.fileExt;
  if (
    typeof fileId !== 'string' ||
    typeof fileName !== 'string' ||
    fileExt !== 'pdf'
  )
    throw new Error(
      'KHEC article 65366 does not expose the expected PDF attachment.',
    );
  return {
    title,
    beginDate: `${beginTime.slice(0, 4)}-${beginTime.slice(4, 6)}-${beginTime.slice(6, 8)}`,
    fileId,
    fileName,
    isImageOnly: true,
  };
}

export function sourceChangeStatus(
  expectedSha256: string,
  actualSha256: string,
): 'unchanged' | 'changed' {
  return expectedSha256 === actualSha256 ? 'unchanged' : 'changed';
}

export function normalizeMayorNames(
  cecRaw: unknown,
  approvedNames: string[],
): { names: string[]; matches: string[]; unexpected: string[] } {
  const names = parseCecQualifiedKaohsiungMayors(cecRaw).map(
    (candidate) => candidate.displayName,
  );
  const approvedSet = new Set(approvedNames);
  const sourceSet = new Set(names);
  return {
    names,
    matches: names.filter((name) => approvedSet.has(name)),
    unexpected: approvedNames.filter((name) => !sourceSet.has(name)),
  };
}
