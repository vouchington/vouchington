import { beginTransaction } from '@data-stores/psql'
import { addUrl } from '../services/urls/upsert.mts'
import { writeCanonicalUrl } from '../services/urls/set-canonical-batch.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Insert a new identity variant while its former terminal owner is being rewritten. */
export async function insertVariantDuringCanonicalRewriteForTest(
  ownerId: string,
  targetId: string,
  variantHref: string,
): Promise<string | null> {
  await using holder = await beginTransaction()
  await writeCanonicalUrl({ urlId: ownerId, canonicalUrlId: targetId }, holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  const variant = await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'linkNewUrlVariants',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = addUrl(null, variantHref)
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
  return variant?.canonical_url_id ?? null
}
