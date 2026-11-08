import { readJson, readRaw, normalizeText } from '../scripts/remediation/lib';
const d = readJson<any>('data/enrichment/normalized/2026/zuoying-mayoral.json');
const strip = (v: string) => v.replace(/<script[\s\S]*?<\/script>/giu,' ').replace(/<style[\s\S]*?<\/style>/giu,' ').replace(/<[^>]+>/gu,' ').replace(/&nbsp;/giu,' ').replace(/&amp;/giu,'&').replace(/\s+/gu,' ').trim();
const get = (src: string) => { const a=[...d.sourceAttempts].reverse().find((x:any)=>x.sourceId===src); const raw=readRaw(a.rawPath); return { plain: strip(raw), raw }; };
const kcc = get('scope-kcc-profile-2185');
for (const needle of ['高雄市議會本屆議員','本屆議員','第4屆','第四選舉區','屆議員'])
  console.log('kcc2185', needle, normalizeText(kcc.plain).includes(normalizeText(needle)));
const i = kcc.plain.indexOf('議員');
console.log('ctx:', kcc.plain.slice(Math.max(0,i-80), i+120));
const ltn = get('scope-news-yin-li-ltn');
for (const needle of ['2026-05-13','2026/05/13','15:27','被爆拿高市府多項標案'])
  console.log('ltn', needle, ltn.plain.includes(needle));
const cna = get('scope-news-zhang-yili-cna');
console.log('cna headline literal', cna.plain.includes('張以理卸任青年局長 陳其邁肯定任內努力'));
const udn = get('scope-news-xue-zhaoji-udn');
console.log('udn headline', udn.plain.includes('大綠變小綠！謝長廷前幕僚薛兆基轉投入「台灣前進陣線」參選到底'));
console.log('udn ctx', udn.plain.slice(0, 300));
