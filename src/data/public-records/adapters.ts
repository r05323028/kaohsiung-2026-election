function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi,
    (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower === 'nbsp') return ' ';
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      const value = lower.startsWith('#x')
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    },
  );
}

export type KccMemberProfile = {
  sourceId: string;
  displayName: string;
  memberIdentifier: string;
  isCurrentMemberPage: boolean;
  text: string;
};

export type KccNewsArticle = {
  sourceId: string;
  title: string;
  publisher: string;
  text: string;
  mentionsCandidate: boolean;
};

function stripTags(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToText(raw: string): string {
  return decodeEntities(stripTags(raw));
}

function titleFromHtml(raw: string): string {
  const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1];
  return title ? htmlToText(title) : '';
}

export function parseKccMemberProfile(
  raw: string,
  sourceId: string,
): KccMemberProfile {
  const title = titleFromHtml(raw);
  const titleMatch = title.match(/本屆議員[-－]([^|_]+)/);
  const displayName = titleMatch?.[1]?.trim() ?? '';
  const memberIdentifier = sourceId.match(/member-(\d+)-/)?.[1] ?? '';
  const text = htmlToText(raw);
  if (!displayName || !memberIdentifier) {
    throw new Error(`Unable to parse KCC member identity for ${sourceId}.`);
  }
  return {
    sourceId,
    displayName,
    memberIdentifier,
    isCurrentMemberPage:
      text.includes('本屆議員') && text.includes(displayName),
    text,
  };
}

export function parseKccNewsArticle(
  raw: string,
  sourceId: string,
  candidateName: string,
): KccNewsArticle {
  const title = titleFromHtml(raw);
  const text = htmlToText(raw);
  if (!title || !text.includes('高雄市議會')) {
    throw new Error(`Unable to parse KCC news article ${sourceId}.`);
  }
  return {
    sourceId,
    title,
    publisher: '高雄市議會',
    text,
    mentionsCandidate: text.includes(candidateName),
  };
}

export function sourceContainsText(raw: string, expected: string): boolean {
  return htmlToText(raw).includes(expected);
}

export function sourceChangeStatus(
  expectedSha256: string,
  actualSha256: string,
): 'unchanged' | 'changed' {
  return expectedSha256 === actualSha256 ? 'unchanged' : 'changed';
}
