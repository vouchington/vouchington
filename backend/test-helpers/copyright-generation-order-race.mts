import { beginTransaction } from '@data-stores/psql'
import { lockCopyrightActionGenerationsForWrite } from '../services/copyright-notices/action-delivery-generation.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/**
 * Holds the listed case generations like a writer that owns them first, starts the operation under
 * test, and proves it queues on a generation before taking any other row lock. Only then does the
 * holder write rows the operation could also have locked, so any other lock order would deadlock.
 */
export async function runWhileCopyrightGenerationsHeld<Result>(input: {
  heldNoticeIds: readonly string[]
  start: () => Promise<Result>
  waitMarker?: string
  holderWrites: (holder: Awaited<ReturnType<typeof beginTransaction>>) => Promise<void>
}): Promise<Result> {
  await using holder = await beginTransaction()
  await lockCopyrightActionGenerationsForWrite(input.heldNoticeIds, holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: input.waitMarker ?? 'lockCopyrightActionGeneration',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = input.start()
      await waitForLock(pending)
      await input.holderWrites(holder)
      await holder.commit()
      return pending
    },
  )
}
