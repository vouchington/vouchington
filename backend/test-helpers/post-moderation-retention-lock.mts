import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Commit a content reversion only after retention is waiting on the owned post row. */
export async function revertPostDuringTestModerationRetention<Result>(input: {
  postId: string
  contentSha256: Buffer
  start: () => Promise<Result>
}): Promise<Result> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* revertPostDuringTestModerationRetention.changeContent */
    UPDATE posts SET llm_moderation_content_sha256 = ${input.contentSha256}
    WHERE id = ${input.postId}
  `)
  const { rows } = await transaction<{ process_id: number }>(
    '/* revertPostDuringTestModerationRetention.process */ SELECT pg_backend_pid() AS process_id',
  )
  const holderProcessId = rows[0]!.process_id
  let released = false
  const releaseHolder = async () => {
    if (released) return
    await transaction.commit()
    released = true
  }
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'cleanupPostModerationLedgerPage.lockPagePosts',
      releaseHolder,
    },
    async waitForLock => {
      const operation = input.start()
      await waitForLock(operation)
      await releaseHolder()
      return operation
    },
  )
}
