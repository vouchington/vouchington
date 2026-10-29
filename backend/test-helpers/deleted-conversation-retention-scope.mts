import { beginTransaction } from '@data-stores/psql'
import { cleanupOperationalTombstonePages } from '../services/data-retention/cleanup-operational-tombstones.mts'
import { scopeOperationalRetentionQuery } from './operational-retention-scopes.mts'

type CursorState = {
  cursor_at: string | null
  cursor_record_id: string | null
  sweep_cutoff_at: string | null
}

const EMPTY_CURSOR: CursorState = {
  cursor_at: null,
  cursor_record_id: null,
  sweep_cutoff_at: null,
}

/** Each real page commits owned deletion while publishing no fixture cursor state. */
export function createScopedDeletedConversationRetentionForTest(ids: readonly string[], now: Date) {
  let position: CursorState = EMPTY_CURSOR
  const openTransaction: typeof beginTransaction = async options => {
    const transaction = await beginTransaction(options)
    try {
      const created = await transaction(
        `/* ensureOwnedDeletedConversationRetentionCursorForTest */
         INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
         VALUES ('deleted_conversations') ON CONFLICT DO NOTHING`,
      )
      const { rows } = await transaction<CursorState>(
        `/* lockOwnedDeletedConversationRetentionCursorForTest */
         SELECT cursor_at::text AS cursor_at, cursor_record_id,
                sweep_cutoff_at::text AS sweep_cutoff_at
         FROM operational_tombstone_retention_cursors
         WHERE cleanup_name = 'deleted_conversations' FOR UPDATE`,
      )
      const previous = rows[0]
      if (!previous) throw new Error('Expected locked deleted-conversation cursor')
      await transaction(
        `/* initializeOwnedDeletedConversationRetentionCursorForTest */
         UPDATE operational_tombstone_retention_cursors
         SET cursor_at = $1::timestamptz, cursor_record_id = $2::uuid,
             sweep_cutoff_at = $3::timestamptz
         WHERE cleanup_name = 'deleted_conversations'`,
        [position.cursor_at, position.cursor_record_id, position.sweep_cutoff_at],
      )
      const scoped = scopeOperationalRetentionQuery(transaction, 'deleted_conversations', ids)
      return new Proxy(transaction, {
        apply(_target, thisArgument, args: Parameters<typeof transaction>) {
          return Reflect.apply(scoped, thisArgument, args)
        },
        get(target, property, receiver) {
          if (property !== 'commit') return Reflect.get(target, property, receiver)
          return async () => {
            const { rows: updated } = await transaction<CursorState>(
              `/* readOwnedDeletedConversationRetentionCursorForTest */
               SELECT cursor_at::text AS cursor_at, cursor_record_id,
                      sweep_cutoff_at::text AS sweep_cutoff_at
               FROM operational_tombstone_retention_cursors
               WHERE cleanup_name = 'deleted_conversations'`,
            )
            const next = updated[0]
            if (!next) throw new Error('Expected owned deleted-conversation cursor')
            if (created.rowCount === 1) {
              await transaction(
                `/* deleteOwnedDeletedConversationRetentionCursorForTest */
                 DELETE FROM operational_tombstone_retention_cursors
                 WHERE cleanup_name = 'deleted_conversations'`,
              )
            } else {
              await transaction(
                `/* restoreOwnedDeletedConversationRetentionCursorForTest */
                 UPDATE operational_tombstone_retention_cursors
                 SET cursor_at = $1::timestamptz, cursor_record_id = $2::uuid,
                     sweep_cutoff_at = $3::timestamptz
                 WHERE cleanup_name = 'deleted_conversations'`,
                [previous.cursor_at, previous.cursor_record_id, previous.sweep_cutoff_at],
              )
            }
            await transaction.commit()
            position = next
          }
        },
      })
    } catch (err) {
      await transaction[Symbol.asyncDispose]()
      throw err
    }
  }
  return (limits: { batchSize?: number; maxBatches: number }) =>
    cleanupOperationalTombstonePages('deleted_conversations', { ...limits, now }, openTransaction)
}
