import { addUrls } from '@services/urls/upsert'
import { findUrlIdByIdentity } from '@services/urls/url-identities'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Variant inserts find their identity owner through the identity primary key, never a urls scan. */
export async function runUrlIdentityScenarios(): Promise<void> {
  const suffix = crypto.randomUUID()
  const ownerHref = `https://identity-${suffix}.example.test/page`
  const variantHref = `http://www.identity-${suffix}.example.test/page/?utm_source=explain`
  await addUrls(seedUser.id, [ownerHref], { skipCreatedEvents: true })

  registerScenarioContract('url-identity-variant-insert', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['url_identities_pkey'] },
      { kind: 'maxProcessedRows', relation: 'url_identities', max: 3 },
    ],
  })
  await runAndCapture(
    'url-identity-variant-insert',
    () => addUrls(seedUser.id, [variantHref], { skipCreatedEvents: true }),
    undefined,
    ['findNewUrlVariants', 'registerUrlIdentities', 'findUrlIdentityOwners'],
  )

  registerScenarioContract('url-identity-lookup', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['url_identities_pkey'] },
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
