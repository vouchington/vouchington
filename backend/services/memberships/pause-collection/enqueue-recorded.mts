import { read } from '@data-stores/psql'
import onError from '@modules/on-error'
import { enqueueSyncMembershipPauseCollection } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'

/** Enqueues the committed generation. A lost enqueue remains recoverable from the work row. */
export async function enqueueRecordedMembershipPauseCollection(userId: string): Promise<void> {
  const { rows } = await read<{ requested_at: Date }>(
    sql`/* enqueueRecordedMembershipPauseCollection */
      SELECT requested_at FROM membership_pause_collection_work_items
      WHERE user_id = ${userId}
      LIMIT 1
    `,
  )
  const requestedAt = rows[0]?.requested_at
  if (!requestedAt) return
  await enqueueSyncMembershipPauseCollection({
    userId,
    requestedAt: requestedAt.toISOString(),
  })
}

export async function enqueueRecordedMembershipPauseCollectionBestEffort(
  userId: string,
): Promise<void> {
  try {
    await enqueueRecordedMembershipPauseCollection(userId)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
