import { beginTransaction } from '@data-stores/psql'
import { processAuthorDeletionPublicationBatch } from '../services/post-publication/capture-author-deletion-batch.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

export async function reassignPostAuthorWhileClearanceResets(
  author: { id: string; username: string | null },
  reset: () => Promise<boolean>,
): Promise<boolean> {
  await using reassignment = await beginTransaction()
  const { processed } = await processAuthorDeletionPublicationBatch(
    reassignment,
    author.id,
    author.username,
    1,
  )
  if (processed !== 1) throw new Error('Expected one authored post to be reassigned')

  const { rows } = await reassignment<{ process_id: number }>(
    '/* reassignPostAuthorWhileClearanceResets */ SELECT pg_backend_pid() AS process_id',
  )
  const releaseHolder = () => reassignment.commit()
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: rows[0]!.process_id,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'resetPostClearance:advanceVersion',
      releaseHolder,
    },
    async waitForLock => {
      const operation = reset()
      await waitForLock(operation)
      await releaseHolder()
      return operation
    },
  )
}
