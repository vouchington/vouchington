import { write } from '@data-stores/psql'
import { addUrls } from '@services/urls/upsert'
import { findUrlIdByIdentity } from '@services/urls/url-identities'
import { getCanonicalUrlsByIdBatch } from '@services/urls/get-canonical'
import { getHackerNewsLookupTargets } from '@services/urls/hacker-news-lookup-state'
import { setCanonicalUrl } from '@services/urls/set-canonical'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Variant inserts find their identity owner through the unique identity index, never a urls scan. */
export async function runUrlIdentityScenarios(): Promise<void> {
  // Production gives every addUrls row an identity; the raw seed rows get one so the index is measured at corpus size.
  await write(
    `/* seedExplainUrlIdentities */
    INSERT INTO url_identities (url_id, identity)
    SELECT id, 'explain-seed:' || id FROM urls
    ORDER BY id LIMIT 100000
    ON CONFLICT DO NOTHING`,
  )
  await write(`/* analyzeExplainUrlIdentities */ ANALYZE url_identities`)
  const suffix = crypto.randomUUID()
  const ownerHref = `https://identity-${suffix}.example.test/page`
  const variantHref = `http://www.identity-${suffix}.example.test/page?utm_source=explain`
  await addUrls(seedUser.id, [ownerHref], { skipCreatedEvents: true })

  let variantIds: string[] = []
  registerScenarioContract('url-identity-variant-insert', {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxProcessedRows', relation: 'url_identities', max: 3 }],
  })
  await runAndCapture(
    'url-identity-variant-insert',
    async () => {
      variantIds = (await addUrls(seedUser.id, [variantHref], { skipCreatedEvents: true })).map(
        url => url.id,
      )
    },
    undefined,
    ['registerUrlIdentities', 'linkNewUrlVariants'],
    {
      afterCapture: async () => {
        const { rows } = await write<{ canonical_url_id: string | null }>(
          `/* assertExplainVariantLinked */ SELECT canonical_url_id FROM urls WHERE id = ANY($1::uuid[])`,
          [variantIds],
        )
        if (rows.length !== 1 || rows[0]!.canonical_url_id === null)
          throw new Error('url-identity-variant-insert did not link the variant to its owner')
      },
    },
  )

  registerScenarioContract('url-identity-lookup', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['url_identities_identity_key'] },
      { kind: 'maxProcessedRows', relation: 'url_identities', max: 2 },
    ],
  })
  await runAndCapture(
    'url-identity-lookup',
    () => findUrlIdByIdentity(ownerHref),
    undefined,
    'findUrlIdByIdentity',
  )

  registerScenarioContract('url-canonical-root-read', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'urls', max: 10 }],
  })
  await runAndCapture(
    'url-canonical-root-read',
    () => getCanonicalUrlsByIdBatch(variantIds, { readOnly: false }),
    undefined,
    'getCanonicalUrlsByIdBatch',
  )

  registerScenarioContract('url-hacker-news-root-lookup', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'urls', max: 10 }],
  })
  await runAndCapture(
    'url-hacker-news-root-lookup',
    () => getHackerNewsLookupTargets(variantIds),
    undefined,
    'getHackerNewsLookupTargets',
  )

  const rewriteHref = `https://rewrite-${suffix}.example.test/page`
  const rewritten = await addUrls(seedUser.id, [rewriteHref], { skipCreatedEvents: true })
  const ownerId = await findUrlIdByIdentity(ownerHref)
  if (!rewritten[0] || !ownerId) throw new Error('Canonical rewrite fixture is missing')
  const incoming = await addUrls(seedUser.id, [`https://incoming-${suffix}.example.test/page`], {
    skipCreatedEvents: true,
  })
  if (!incoming[0]) throw new Error('Canonical back-reference fixture is missing')
  await setCanonicalUrl(incoming[0].id, rewritten[0].id)
  registerScenarioContract('url-canonical-rewrite', {
    // UPDATE statements return no rows; their real target scans remain bounded below.
    allowEmptyResult: true,
    expectations: [{ kind: 'maxProcessedRows', relation: 'urls', max: 10 }],
  })
  await runAndCapture(
    'url-canonical-rewrite',
    () => setCanonicalUrl(rewritten[0]!.id, ownerId),
    undefined,
    ['resolveCanonicalTargets', 'flattenCanonicalChain', 'setCanonicalUrl'],
  )
}
