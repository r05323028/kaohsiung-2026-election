import { readFileSync } from 'node:fs';

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string | undefined) =>
      code ? String.fromCodePoint(Number(code)) : '',
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string | undefined) =>
      code ? String.fromCodePoint(Number.parseInt(code, 16)) : '',
    );
}

export function cleanHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function listItemsBetween(html: string, start: string, end?: string): string[] {
  const startAt = html.indexOf(start);
  if (startAt < 0) return [];
  const endAt = end ? html.indexOf(end, startAt + start.length) : -1;
  const section = html.slice(startAt, endAt < 0 ? html.length : endAt);
  return [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map(cleanHtml)
    .filter(Boolean);
}

export type KccDirectoryObservation = {
  msn: string;
  observedName: string;
  observedParty: string | null;
  observedDistrict: string | null;
  excerpt: string;
};

export function parseKccDirectory(html: string): KccDirectoryObservation[] {
  const observations: KccDirectoryObservation[] = [];
  for (const match of html.matchAll(
    /MemberInfo_New\.aspx\?n=39&sms=9028&msn=(\d+)/g,
  )) {
    const msn = match[1];
    if (!msn || observations.some((item) => item.msn === msn)) continue;
    const matchIndex = match.index ?? 0;
    const linkStart = html.lastIndexOf('<a', matchIndex);
    const linkEnd = html.indexOf('</a>', matchIndex);
    const start = linkStart >= 0 ? linkStart : Math.max(0, matchIndex - 700);
    const end =
      linkEnd >= 0
        ? linkEnd + '</a>'.length
        : Math.min(html.length, matchIndex + 1600);
    const card = html.slice(start, end);
    const nameMatch = card.match(
      /<div\s+class=["']name["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    const districtMatch = card.match(
      /<div\s+title=["']([^"']+)["'][^>]*class=["'][^"']*detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    const observedName = cleanHtml(nameMatch?.[1] ?? '')
      .replace(/_ContentPage$/, '')
      .trim();
    const partyText = districtMatch?.[1];
    const districtText = districtMatch?.[2];
    const observedParty = partyText ? cleanHtml(partyText) : null;
    const observedDistrict = districtText ? cleanHtml(districtText) : null;
    if (!observedName) continue;
    observations.push({
      msn,
      observedName,
      observedParty,
      observedDistrict,
      excerpt: cleanHtml(card).slice(0, 360),
    });
  }
  return observations;
}

export type KccProfileObservation = {
  msn: string;
  observedName: string;
  observedParty: string | null;
  education: string[];
  experience: string[];
  excerpt: string;
};

export function parseKccProfile(
  html: string,
  msn: string,
): KccProfileObservation | null {
  const titleName = html.match(/本屆議員-([^<|]+)/)?.[1]?.trim();
  const identityText = cleanHtml(
    html.slice(
      Math.max(0, html.indexOf('所屬政黨')),
      Math.max(0, html.indexOf('所屬政黨')) + 250,
    ),
  );
  const party = identityText.match(/所屬政黨\s*[:：]\s*([^\s]+)/)?.[1] ?? null;
  const observedName =
    titleName || cleanHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  if (!observedName) return null;
  const education = listItemsBetween(html, '<h4>學歷', '<h4>經歷').filter(
    (item, index, all) => all.indexOf(item) === index,
  );
  const experience = listItemsBetween(html, '<h4>經歷', '<h4>政見').filter(
    (item, index, all) => all.indexOf(item) === index,
  );
  return {
    msn,
    observedName,
    observedParty: party,
    education,
    experience,
    excerpt: cleanHtml(
      html.slice(
        Math.max(0, html.indexOf('學經歷與政見')),
        Math.max(0, html.indexOf('學經歷與政見')) + 1800,
      ),
    ),
  };
}

export type MoiDetailObservation = {
  externalIdentifier: string;
  observedName: string;
  jurisdiction: string | null;
  fields: Record<string, string[]>;
  excerpt: string;
};

export function parseMoiDetail(
  html: string,
  externalIdentifier: string,
): MoiDetailObservation | null {
  const title = cleanHtml(
    html.match(/<div\s+class=["']title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '',
  );
  const observedName = cleanHtml(
    html.match(
      /<div\s+class=["']name["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
    )?.[1] ?? '',
  );
  if (!observedName) return null;
  const fields: Record<string, string[]> = {};
  const captions = [
    ...html.matchAll(/<div\s+class=["']caption["'][^>]*>([\s\S]*?)<\/div>/gi),
  ];
  captions.forEach((caption, index) => {
    const captionText = caption[1];
    if (!captionText) return;
    const label = cleanHtml(captionText).replace(/[：:]/g, '').trim();
    const start = (caption.index ?? 0) + caption[0].length;
    const end = captions[index + 1]?.index ?? html.length;
    const section = html.slice(start, end);
    const values = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((item) => item[1])
      .filter((value): value is string => Boolean(value))
      .map(cleanHtml)
      .filter(Boolean);
    const fallback = cleanHtml(section)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 30);
    fields[label] = values.length ? values : fallback;
  });
  return {
    externalIdentifier,
    observedName,
    jurisdiction: title || null,
    fields,
    excerpt: cleanHtml(
      html.slice(
        Math.max(0, html.indexOf('CCMS_Content')),
        Math.max(0, html.indexOf('CCMS_Content')) + 2600,
      ),
    ),
  };
}

export function readHtml(path: string): string {
  return readFileSync(path, 'utf8');
}
