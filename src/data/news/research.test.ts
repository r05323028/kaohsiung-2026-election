import { describe, expect, it } from 'vitest';
import {
  assessIdentity,
  type CandidateIdentity,
  extractArticleDocument,
  parseCnaSearch,
  parseEttodaySearch,
  parseLtnSearch,
  parseSearchResults,
} from './research';

const LTN_HTML = `
<ul class="list">
  <li>
    <a href="https://news.ltn.com.tw/news/politics/breakingnews/5639051" class="tit" title="高雄市長參選人成立競選總部">高雄市長參選人成立競選總部</a>
    <span class="time">2026/11/01</span>
    <p>高雄市長參選人今天在左營成立競選總部，多位地方民代到場。</p>
  </li>
  <li><a href="/about">no result row</a></li>
</ul>`;

const ETtoday_HTML = `
<div class="result">
  <a href="https://www.ettoday.net/news/20261102/2373869.htm">高雄市議員參選人成立競選總部</a>
  <a href="https://www.ettoday.net/news/20261102/2373869.htm">重複連結</a>
</div>`;

const CNA_HTML = `
<script type="application/ld+json">
{"@type":"ItemList","itemListElement":[
  {"name":"高雄市長參選人公布政策白皮書","url":"https://www.cna.com.tw/news/aipl/202611030001.aspx"}
]}
</script>`;

describe('search result parsers', () => {
  it('parses LTN list items with date and snippet', () => {
    const hits = parseLtnSearch(LTN_HTML);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe(
      'https://news.ltn.com.tw/news/politics/breakingnews/5639051',
    );
    expect(hits[0]?.headline).toBe('高雄市長參選人成立競選總部');
    expect(hits[0]?.publicationDate).toBe('2026-11-01');
    expect(hits[0]?.snippet).toContain('競選總部');
  });

  it('parses ETtoday anchors and takes the date from the URL', () => {
    const hits = parseEttodaySearch(ETtoday_HTML);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.publicationDate).toBe('2026-11-02');
  });

  it('parses CNA JSON-LD results and derives the date from the URL', () => {
    const hits = parseCnaSearch(CNA_HTML);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.headline).toBe('高雄市長參選人公布政策白皮書');
    expect(hits[0]?.publicationDate).toBe('2026-11-03');
  });

  it('drops duplicate urls after normalisation', () => {
    const hits = parseSearchResults('ettoday', ETtoday_HTML);
    expect(hits).toHaveLength(1);
  });
});

describe('extractArticleDocument', () => {
  it('prefers a JSON-LD NewsArticle node', () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"NewsArticle",
       "headline":"高雄市長參選人成立競選總部",
       "datePublished":"2026-11-01T10:00:00+08:00",
       "description":"參選人在左營成立競選總部。",
       "publisher":{"@type":"Organization","name":"自由時報"},
       "articleBody":"${'高雄市長參選人在左營成立競選總部，現場湧入支持者。'.repeat(12)}"}
      </script>
      <link rel="canonical" href="https://news.ltn.com.tw/news/politics/breakingnews/5639051" />
      </head><body></body></html>`;
    const doc = extractArticleDocument(
      html,
      'https://news.ltn.com.tw/news/politics/breakingnews/5639051',
    );
    expect(doc.metadataSource).toBe('json-ld');
    expect(doc.headline).toBe('高雄市長參選人成立競選總部');
    expect(doc.publisher).toBe('自由時報');
    expect(doc.datePublished).toBe('2026-11-01');
    expect(doc.canonicalUrl).toBe(
      'https://news.ltn.com.tw/news/politics/breakingnews/5639051',
    );
    expect(doc.bodyText.length).toBeGreaterThan(200);
  });

  it('falls back to open graph metadata and paragraph harvest', () => {
    const html = `<html><head>
      <meta property="og:title" content="高雄市議員參選人說明交通政見" />
      <meta property="og:site_name" content="ETtoday新聞雲" />
      <meta property="article:published_time" content="2026-11-02T08:30:00+08:00" />
      </head><body>
      <p>${'參選人表示將爭取捷運延伸與公車路網改善。'.repeat(6)}</p>
      <p>${'他並主張增加夜間托育與長照據點。'.repeat(6)}</p>
      <script>window.__junk = function () {};</script>
      </body></html>`;
    const doc = extractArticleDocument(
      html,
      'https://www.ettoday.net/news/20261102/2373869.htm',
    );
    expect(doc.metadataSource).toBe('open-graph');
    expect(doc.headline).toBe('高雄市議員參選人說明交通政見');
    expect(doc.publisher).toBe('ETtoday新聞雲');
    expect(doc.datePublished).toBe('2026-11-02');
    expect(doc.bodyText).not.toContain('window.__junk');
  });
});

const candidate: CandidateIdentity = {
  candidateId: 'official-candidate-test',
  name: '王小明',
  aliases: [],
  districtId: 'district-kaohsiung-council-04',
  electionType: 'council',
  party: '民主進步黨',
  officeLabel: '高雄市議員',
};

describe('assessIdentity', () => {
  it('marks low risk when the name and district context both appear', () => {
    const result = assessIdentity(
      candidate,
      '王小明爭取左營捷運延伸',
      '高雄市議員王小明今天在左營說明政見。',
    );
    expect(result.namesakeRisk).toBe('low');
    expect(result.matchedIn).toBe('headline-and-body');
    expect(result.contextSignals).toContain('左營');
  });

  it('marks medium risk when the name appears without district context', () => {
    const result = assessIdentity(
      candidate,
      '王小明出席同學會',
      '王小明今天回到母校。',
    );
    expect(result.namesakeRisk).toBe('medium');
  });

  it('does not clear a two-character name that is only part of a longer name', () => {
    const shortNameCandidate: CandidateIdentity = {
      candidateId:
        'official-candidate-2026-district-kaohsiung-council-07-f42af7ef',
      name: '林彥',
      aliases: [],
      districtId: 'district-kaohsiung-council-07',
      electionType: 'council',
      party: '無黨籍',
      officeLabel: '高雄市議員',
    };
    const result = assessIdentity(
      shortNameCandidate,
      '竹市議員林彥甫批市府用人標準',
      '新竹市議員林彥甫今天在議會質詢，要求市府說明人事任用。',
    );
    expect(result.namesakeRisk).not.toBe('low');
  });

  it('marks high risk when the name is absent', () => {
    const result = assessIdentity(
      candidate,
      '高雄市議員質詢交通局',
      '議會今天質詢交通局。',
    );
    expect(result.namesakeRisk).toBe('high');
    expect(result.matchedIn).toBe('body');
  });
});
