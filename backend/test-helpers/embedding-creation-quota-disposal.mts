import type { PoolClient } from '@data-stores/psql/types'
import { assertOwnedAccountingRemoved } from './embedding-creation-quota-assertions.mts'
import {
  releaseEmbeddingQuotaSession,
  type claimEmbeddingQuotaLease,
} from './embedding-creation-quota-lease.mts'
import { cleanupTestEmbeddingsBatches } from './entities/bedrock-embeddings-batches.mts'

type Lease = Awaited<ReturnType<typeof claimEmbeddingQuotaLease>>
type Drain = { run(): Promise<void>; safeAfterFailure?: () => boolean }

export async function disposeEmbeddingQuotaFixture(input: {
  prepared: Promise<void>
  drains: Drain[]
  writes: Promise<unknown>[]
  configRestorers: Array<() => Promise<void>>
  leaseReleaseCallbacks: Array<() => Promise<void>>
  restoreConfig?: () => void
  ids: string[]
  lease?: Lease
  client?: PoolClient
  key: string
  acquired: boolean
}) {
  await input.prepared
  const errors: unknown[] = []
  const attempt = async (action: () => unknown) => {
    try {
      await action()
    } catch (err) {
      errors.push(err)
    }
  }
  let safeToRestore = true
  for (const drain of input.drains) {
    if (!safeToRestore && !drain.safeAfterFailure) continue
    const [result] = await Promise.allSettled([Promise.resolve().then(drain.run)])
    if (result!.status === 'rejected') {
      errors.push(result!.reason)
      let safe = false
      await attempt(() => {
        safe = drain.safeAfterFailure?.() ?? false
      })
      safeToRestore = safeToRestore && safe
    }
  }
  for (const write of input.writes) await attempt(() => write)
  if (safeToRestore) {
    const beforeConfigRestoration = errors.length
    for (const restore of input.configRestorers) await attempt(restore)
    if (errors.length !== beforeConfigRestoration) safeToRestore = false
  }
  if (safeToRestore && input.restoreConfig) {
    const beforeRestoration = errors.length
    await attempt(() => input.restoreConfig?.())
    await attempt(() => cleanupTestEmbeddingsBatches(input.ids))
    await attempt(() => assertOwnedAccountingRemoved(input.ids))
    if (errors.length === beforeRestoration) {
      for (const release of input.leaseReleaseCallbacks) await attempt(release)
    }
    if (errors.length === beforeRestoration)
      await attempt(() => input.lease?.removeAfterRestoration())
  }
  await releaseEmbeddingQuotaSession(input.client, input.key, input.acquired, errors)
  if (errors.length)
    throw new AggregateError(
      errors,
      safeToRestore
        ? 'Quota fixture teardown failed'
        : 'Quota fixture teardown failed; config/accounting restoration withheld after unsafe cleanup',
      { cause: errors[0] },
    )
}
