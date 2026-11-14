import {
  type DiscoveryFile,
  discoveryPath,
  fetchDocument,
  inferTopicTags,
  loadRoster,
  pool,
  type RosterCandidate,
  readJsonFile,
  sleep,
  type VerificationFile,
  verificationPath,
  writeJsonFile,
} from '../../src/data/news/pipeline';
import {
  assessIdentity,
  buildVerification,
  type CandidateIdentity,
  extractArticleDocument,
  NEWS_SOURCES,
  sha256,
} from '../../src/data/news/research';
import {
  articleIdFor,
  eventKeyFor,
  NEWS_POLICY_VERSION,
  NEWS_VERIFIER_VERSION,
  type NewsArticle,
  NewsArticleSchema,
  normalizeUrl,
} from '../../src/data/news/schema';
import { parseNewsArgs } from './args';

const MAX_ARTICLES_PER_CANDIDATE = 12;

function identityOf(candidate: RosterCandidate): CandidateIdentity {
  return {
    candidateId: candidate.id,
    name: candidate.name,
    aliases: [...new Set([candidate.shortName, candidate.name])].filter(
      (name) => name.length > 1,
    ),
    districtId: candidate.districtId,
    electionType: candidate.electionType,
    party: candidate.party,
    officeLabel: candidate.currentPosition,
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const options = parseNewsArgs(process.argv.slice(2));
  const roster = await loadRoster();
  const targets = roster.filter(
    (candidate) =>
      (!options.candidateIds ||
        options.candidateIds.has(candidate.id) ||
        options.candidateIds.has(candidate.slug)) &&
      (!options.districtIds || options.districtIds.has(candidate.districtId)),
  );
  const scoped = options.limit ? targets.slice(0, options.limit) : targets;

  let skipped = 0;
  let verifiedArticles = 0;
  let rejectedHits = 0;
  let processed = 0;

  await pool(scoped, options.concurrency, async (candidate) => {
    const discovery = await readJsonFile<DiscoveryFile>(
      discoveryPath(candidate.id),
    );
    if (!discovery || discovery.hits.length === 0) return;
    const existing = await readJsonFile<VerificationFile>(
      verificationPath(candidate.id),
    );
    if (existing && !options.refresh) {
      skipped += 1;
      return;
    }

    const identity = identityOf(candidate);
    const articles: NewsArticle[] = [];
    const rejected: VerificationFile['rejected'] = [];
    for (const hit of discovery.hits.slice(0, MAX_ARTICLES_PER_CANDIDATE)) {
      const response = await fetchDocument(hit.url, {
        retries: options.retries,
      });
      if (response.status !== 200 || !response.text) {
        rejected.push({
          url: hit.url,
          headline: hit.headline,
          reasons: ['source-unreachable:' + (response.error ?? 'empty')],
          httpStatus: response.status,
        });
        continue;
      }
      const document = extractArticleDocument(response.text, hit.url);
      const assessment = assessIdentity(
        identity,
        document.headline ?? hit.headline,
        document.bodyText,
      );
      const outcome = buildVerification(
        {
          claimedHeadline: hit.headline,
          claimedPublisher: NEWS_SOURCES[hit.sourceId].publisher,
          claimedDate: hit.publicationDate,
          document,
          identity: assessment,
          status: response.status,
        },
        identity,
      );
      const failed = outcome.checks.filter((check) => !check.passed);
      if (outcome.status !== 'verified' || outcome.excerpt.length < 20) {
        rejected.push({
          url: hit.url,
          headline: hit.headline,
          reasons:
            outcome.excerpt.length < 20
              ? [
                  ...failed.map((check) => 'failed:' + check.check),
                  'evidence-excerpt-too-short',
                ]
              : failed.map((check) => 'failed:' + check.check),
          httpStatus: response.status,
        });
        await sleep(250);
        continue;
      }

      const canonicalUrl = normalizeUrl(
        document.canonicalUrl &&
          document.canonicalUrl.includes(hostnameOf(hit.url))
          ? document.canonicalUrl
          : hit.url,
      );
      const headline = (document.headline ?? hit.headline).slice(0, 300);
      const draft = {
        articleId: articleIdFor(canonicalUrl),
        candidateIds: [candidate.id],
        headline,
        publisher: NEWS_SOURCES[hit.sourceId].publisher,
        publisherType: NEWS_SOURCES[hit.sourceId].publisherType,
        canonicalUrl,
        publicationDate: outcome.publicationDate,
        dateStatus: outcome.dateStatus,
        updatedDate: document.dateModified,
        retrievedAt: response.fetchedAt,
        summary: null,
        summaryBasis: null,
        topicTags: inferTopicTags(headline, document.description),
        contentType: 'reporting' as const,
        eventKey: eventKeyFor(headline, outcome.publicationDate),
        duplicateOf: null,
        relatedArticleIds: [],
        evidence: {
          excerpt: outcome.excerpt,
          excerptSha256: sha256(outcome.excerpt),
          documentSha256: response.sha256 ?? '',
          metadataSource: document.metadataSource,
          capturedAt: response.fetchedAt,
        },
        identity: assessment,
        verification: {
          status: outcome.status,
          verifiedAt: response.fetchedAt,
          verifierVersion: NEWS_VERIFIER_VERSION,
          checks: outcome.checks,
          notes: outcome.notes,
        },
        publication: {
          status: 'pending-review' as const,
          policyVersion: NEWS_POLICY_VERSION,
          decisionId: null,
          decidedAt: null,
          blockers: ['publication-policy-not-evaluated'],
          origin: null,
        },
      };
      const parsed = NewsArticleSchema.safeParse(draft);
      if (!parsed.success) {
        rejected.push({
          url: hit.url,
          headline: hit.headline,
          reasons: parsed.error.issues.map(
            (issue) => 'schema:' + issue.path.join('.') + ':' + issue.message,
          ),
          httpStatus: response.status,
        });
        await sleep(250);
        continue;
      }
      articles.push(parsed.data);
      verifiedArticles += 1;
      await sleep(250);
    }

    rejectedHits += rejected.length;
    processed += 1;
    const file: VerificationFile = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      verifiedAt: new Date().toISOString(),
      articles,
      rejected,
    };
    if (!options.dryRun) {
      await writeJsonFile(verificationPath(candidate.id), file);
    }
    if (options.verbose || articles.length > 0) {
      console.log(
        candidate.name,
        'verified=' + articles.length,
        'rejected=' + rejected.length,
      );
    }
  });

  console.log(
    JSON.stringify(
      {
        candidatesProcessed: processed,
        skippedExisting: skipped,
        verifiedArticles,
        rejectedHits,
        dryRun: options.dryRun,
      },
      null,
      2,
    ),
  );
}

await main();
