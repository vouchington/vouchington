import { beginTransaction, withTransactionOptions, type QueryExecutor } from '@data-stores/psql'
import { addUrl } from '../services/urls/upsert.mts'
import { retryCanonicalWrite } from '../services/urls/canonical-write-retry.mts'
import { writeCanonicalUrl } from '../services/urls/set-canonical-batch.mts'
import { setCanonicalUrl } from '../services/urls/set-canonical.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/** Rewrite a resolved target before its caller flattens back-references, then retry the real writer. */
export async function setCanonicalUrlDuringConcurrentTargetRewriteForTest(
  sourceId: string,
  targetId: string,
  concurrentSourceId: string,
  concurrentTargetId: string,
): Promise<void> {
  let targetRewritten = false
  await retryCanonicalWrite(async () => {
    await using transaction = await beginTransaction()
    await withTransactionOptions({ query: transaction }, async query => {
      const observedQuery = new Proxy(query, {
        async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
          const result = await Reflect.apply(target, thisArgument, argumentsList)
          const [input] = argumentsList
          const statement = typeof input === 'string' ? input : input.text
          if (!targetRewritten && statement.includes('/* resolveCanonicalTargets */')) {
            targetRewritten = true
            await setCanonicalUrl(concurrentSourceId, concurrentTargetId)
          }
          return result
        },
      })
      await writeCanonicalUrl({ urlId: sourceId, canonicalUrlId: targetId }, observedQuery)
    })
    await transaction.commit()
  })
}

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
