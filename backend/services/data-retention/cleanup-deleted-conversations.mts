/* oxlint-disable no-await-in-loop -- child families must be drained in FK order within one capped transaction. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import type {
  OperationalTombstoneCandidate as Candidate,
  OperationalTombstoneCursor as Cursor,
  OperationalTombstonePageResult,
} from './cleanup-operational-tombstone-types.mts'
import { CHILD_STAGES } from './cleanup-deleted-conversation-stages.mts'

type CleanupOptions = {
  now?: Date
  lowerBoundDate?: Date
  borrowedQuery?: TransactionQuery
}

export async function cleanupDeletedConversationPage(
  batchSize: number,
  options: CleanupOptions,
): Promise<OperationalTombstonePageResult> {
  if (options.borrowedQuery) return cleanupPageWithQuery(batchSize, options, options.borrowedQuery)
  await using query = await beginTransaction()
  const result = await cleanupPageWithQuery(batchSize, options, query)
  await query.commit()
  return result
}

async function cleanupPageWithQuery(
  batchSize: number,
  options: CleanupOptions,
  query: TransactionQuery,
): Promise<OperationalTombstonePageResult> {
  const trackCursor = options.borrowedQuery !== undefined || options.lowerBoundDate === undefined
  let cursor: Cursor = { cursor_at: null, cursor_id: null, sweep_cutoff_at: null }
  if (trackCursor) {
    await query(
      `/* ensureDeletedConversationRetentionCursor */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ('deleted_conversations') ON CONFLICT DO NOTHING`,
    )
    cursor = (
      await query<Cursor>(
        `/* lockDeletedConversationRetentionCursor */
       SELECT cursor_at::text AS cursor_at, cursor_id, sweep_cutoff_at
       FROM operational_tombstone_retention_cursors
       WHERE cleanup_name = 'deleted_conversations' FOR UPDATE`,
      )
    ).rows[0]
  }
  const cutoff = cursor.sweep_cutoff_at ?? getRetentionCutoffDate(30, options.now)
  const candidate = await listCandidate(query, cutoff, cursor, options.lowerBoundDate)
  if (!candidate) {
    if (trackCursor) await checkpoint(query, null, null)
    return { deleted: 0, hasMore: false, continuation: null, stalled: false }
  }

  for (const stage of CHILD_STAGES) {
    // no-mistakes-disable-next-line query-reached-per-item: fixed FK-ordered child stages each delete at most batchSize rows in this one parent transaction
    const deleted = await query(stage.deletion, [candidate.id, batchSize])
    if ((deleted.rowCount ?? 0) > 0) {
      // no-mistakes-disable-next-line query-reached-per-item: checkpoint must follow the bounded child deletion in the same transaction
      if (trackCursor) await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: false }
    }
    // A skipped locked child must keep the parent until the next run; never let CASCADE
    // silently turn a bounded parent deletion into arbitrary child work.
    // no-mistakes-disable-next-line query-reached-per-item: each fixed child stage checks for remaining rows before the next FK-ordered stage
    const remains = await query<{ remaining: boolean }>(stage.remaining, [candidate.id])
    if (remains.rows[0]?.remaining) {
      // no-mistakes-disable-next-line query-reached-per-item: a skipped locked child keeps the parent and checkpoint together
      if (trackCursor) await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: true }
    }
  }
  const { rowCount } = await query(
    `/* deleteEmptyRetainedConversation */
     DELETE FROM conversations
     WHERE id = $1::uuid AND deleted_at < $2::timestamptz
       AND channel_type IN ('chat', 'direct_message')`,
    [candidate.id, cutoff],
  )
  if (trackCursor) await checkpoint(query, candidate, cutoff)
  return {
    deleted: rowCount ?? 0,
    hasMore: true,
    continuation: { at: candidate.position_at, id: candidate.id },
    stalled: false,
  }
}

async function listCandidate(
  query: TransactionQuery,
  cutoff: Date,
  cursor: Cursor,
  lowerBoundDate?: Date,
): Promise<Candidate | undefined> {
  const parameters: unknown[] = [cutoff]
  const lowerBound = lowerBoundDate
    ? `AND conversation.deleted_at >= $${parameters.push(lowerBoundDate)}::timestamptz`
    : ''
  const afterCursor =
    cursor.cursor_at && cursor.cursor_id
      ? `AND (conversation.deleted_at, conversation.id) >
       ($${parameters.push(cursor.cursor_at)}::timestamptz, $${parameters.push(cursor.cursor_id)}::uuid)`
      : ''
  const { rows } = await query<Candidate>(
    `/* no-mistakes: deadlock-safe -- one indexed candidate is locked with SKIP LOCKED after the cursor; no row waits behind another sweeper. */
     /* listDeletedConversationRetentionCandidate */
       SELECT conversation.id, conversation.deleted_at::text AS position_at
       FROM conversations conversation
       WHERE conversation.deleted_at < $1::timestamptz
         ${lowerBound}
         AND conversation.channel_type IN ('chat', 'direct_message')
         ${afterCursor}
         AND NOT EXISTS (
           SELECT 1 FROM notifications notification
           JOIN notification_push_intents intent
             ON intent.user_id = notification.user_id
            AND intent.notification_id = notification.id
           WHERE notification.conversation_id = conversation.id
             AND intent.status = 'pending'
         )
       ORDER BY conversation.deleted_at, conversation.id
       LIMIT 1 FOR UPDATE OF conversation SKIP LOCKED`,
    parameters,
  )
  return rows[0]
}

async function checkpoint(
  query: TransactionQuery,
  position: { position_at: string; id: string } | Cursor | null,
  cutoff: Date | null,
): Promise<void> {
  const at = position && 'position_at' in position ? position.position_at : position?.cursor_at
  const id = position && 'cursor_id' in position ? position.cursor_id : position?.id
  await query(
    `/* checkpointDeletedConversationRetentionCursor */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = $1::timestamptz, cursor_id = $2::uuid, sweep_cutoff_at = $3::timestamptz
     WHERE cleanup_name = 'deleted_conversations'`,
    [at ?? null, id ?? null, cutoff],
  )
}
