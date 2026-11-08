import { readJson, readRaw, normalizeText } from '../scripts/remediation/lib';
const d = readJson<any>('data/enrichment/normalized/2026/zuoying-mayoral.json');
const strip = (v: string) => v.replace(/<[^>]+>/gu,' ').replace(/&nbsp;/giu,' ').replace(/&amp;/giu,'&').replace(/\s+/gu,' ').trim();
const get = (src: string) => { const a=[...d.sourceAttempts].reverse().find((x:any)=>x.sourceId===src); return strip(readRaw(a.rawPath)); };
const p = get('scope-kcc-profile-2185');
for (const needle of ['第4屆議員','第4屆','本屆議員']) {
  let idx = -1;
  while ((idx = p.indexOf(needle, idx + 1)) >= 0) { console.log(needle, '→', p.slice(Math.max(0,idx-60), idx+60).replace(/\s+/g,' ')); idx += 1; if (idx > 4000) break; }
}
