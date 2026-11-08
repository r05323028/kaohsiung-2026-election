import { readJson, readRaw, normalizeText } from '../scripts/remediation/lib';
const d = readJson<any>('data/enrichment/normalized/2026/zuoying-mayoral.json');
const rep = readJson<any>('reports/semantic-review-execution.json');
const proposals = new Map<string, string[]>();
for (const inv of rep.invocations) {
  const p = inv.result?.proposedCorrection;
  if (!p) continue;
  const key = inv.claimId;
  const list = proposals.get(key) ?? [];
  if (typeof p.proposedWording === 'string') list.push(p.proposedWording);
  proposals.set(key, list);
}
const strip = (v: string) => v.replace(/<script[\s\S]*?<\/script>/giu,' ').replace(/<style[\s\S]*?<\/style>/giu,' ').replace(/<[^>]+>/gu,' ').replace(/&nbsp;/giu,' ').replace(/&amp;/giu,'&').replace(/\s+/gu,' ').trim();
const targets = (readJson<any>('reports/autonomous-remediation-root-causes.json').corrections as any[]).map((c) => c.claimId);
console.log('targets', targets.length, 'proposalClaims', proposals.size);
for (const id of targets) {
  const claim = d.claims.find((c: any) => c.claimId === id);
  const att = [...d.sourceAttempts].reverse().find((a: any) => a.sourceId === claim.sourceIds[0]);
  const raw = readRaw(att.rawPath); const plain = strip(raw);
  const pl = proposals.get(id) ?? [];
  const lit = pl.map((p) => ({ p, inText: normalizeText(plain).includes(normalizeText(p)) }));
  console.log(id, claim.claimType, att.sourceId, 'plainLen', plain.length, 'proposals', pl.length, 'literal', lit.filter((x) => x.inText).length);
  for (const { p, inText } of lit) console.log('   ', inText ? 'LIT' : '---', p.slice(0, 90));
}
