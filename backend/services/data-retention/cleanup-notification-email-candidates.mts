import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'

export type NotificationEmailCleanupName =
  | 'ses_bounce_events'
  | 'system_pruned_notifications'
  | 'user_deleted_notifications'
  | 'moderation_email_sends'

export type Candidate = { id: string; user_id?: string; position_at: string | null }
export type Cursor = {
  cursor_at: string | null
  cursor_position: string | null
  cursor_partition_key: string | null
  sweep_cutoff_at: Date | null
}

export async function listNotificationEmailCandidates(
  query: TransactionQuery,
  name: NotificationEmailCleanupName,
  cutoff: Date,
  limit: number,
  cursor?: Cursor,
  lowerBoundDate?: Date,
): Promise<Candidate[]> {
  const notification = name.endsWith('_notifications')
  const source = notification
    ? 'notifications'
    : name === 'ses_bounce_events'
      ? 'amazon_ses_bounce_events'
      : 'user_moderation_email_sends'
  const alias = 'source'
  const parameters: unknown[] = [notification ? cutoff : getMinUUIDv7ForDate(cutoff)]
  let predicate = notification
    ? `${alias}.deleted_at < $1::timestamptz AND ${alias}.deleted_at IS NOT NULL AND ${alias}.delete_reason = '${name === 'system_pruned_notifications' ? 'system_pruned' : 'user_deleted'}'`
    : `${alias}.id < $1::uuid`
  if (lowerBoundDate) {
    parameters.push(notification ? lowerBoundDate : getMinUUIDv7ForDate(lowerBoundDate))
    predicate += notification
      ? ` AND ${alias}.deleted_at >= $${parameters.length}::timestamptz`
      : ` AND ${alias}.id >= $${parameters.length}::uuid`
  }
  if (cursor?.cursor_position) {
    if (notification) {
      parameters.push(cursor.cursor_at, cursor.cursor_position, cursor.cursor_partition_key)
      predicate += ` AND (${alias}.deleted_at, ${alias}.id, ${alias}.user_id) > ($${parameters.length - 2}::timestamptz, $${parameters.length - 1}::uuid, $${parameters.length}::uuid)`
    } else {
      parameters.push(cursor.cursor_position)
      predicate += ` AND ${alias}.id > $${parameters.length}::uuid`
    }
  }
  parameters.push(limit)
  // Notification tombstones span user partitions; the retention indexes serve this capped global keyset page.
  const { rows } = await query<Candidate>(
    `/* listNotificationEmailRetentionCandidates */
     SELECT ${notification ? `${alias}.user_id, ` : ''}${alias}.id,
       ${notification ? `${alias}.deleted_at::text` : 'NULL::text'} AS position_at
     FROM ${source} ${alias}
     WHERE ${predicate}
     ORDER BY ${notification ? `${alias}.deleted_at, ${alias}.id, ${alias}.user_id` : `${alias}.id`}
     LIMIT $${parameters.length}
     FOR UPDATE OF ${alias} SKIP LOCKED`,
    parameters,
  )
  return rows
}
