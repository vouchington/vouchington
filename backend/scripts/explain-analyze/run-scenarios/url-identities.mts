import { write } from '@data-stores/psql'
import { addUrls } from '@services/urls/upsert'
import { findUrlIdByIdentity } from '@services/urls/url-identities'
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
  const variantHref = `http://www.identity-${suffix}.example.test/page/?utm_source=explain`
  await addUrls(seedUser.id, [ownerHref], { skipCreatedEvents: true })

  registerScenarioContract('url-identity-variant-insert', {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxProcessedRows', relation: 'url_identities', max: 3 }],
  })
  await runAndCapture(
    'url-identity-variant-insert',
    () => addUrls(seedUser.id, [variantHref], { skipCreatedEvents: true }),
    undefined,
    ['findNewUrlVariants', 'registerUrlIdentities', 'findUrlIdentityOwners'],
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
}
