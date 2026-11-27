import { getApiKeyExpiryLimits } from './work-limits.mts'
import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'

const cursorScope = 'api-key-expiry-reminders'

export async function getApiKeysDueForExpiryReminder(
  after?: string,
  batchSize = getApiKeyExpiryLimits().batchSize,
  options: QueryOptions = {},
): Promise<{ ids: string[]; nextCursor: string | undefined }> {
  const query = sql`/* getApiKeysDueForExpiryReminder */
    SELECT id, to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_expiry
    FROM api_keys
    WHERE expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'
      AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
      AND expiry_reminder_sent_at IS NULL`
  if (after) {
    const cursor = decodeScopedPreciseTimestampCursor(
      after,
      cursorScope,
      'Invalid expiry reminder cursor',
    )
    query.append(
      sql` AND (expires_at, id) > (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`,
    )
  }
  query.append(sql` ORDER BY expires_at, id LIMIT ${batchSize}`)
  const { rows } = await read<{ id: string; cursor_expiry: string }>(query, options)
  const last = rows.at(-1)
  return {
    ids: rows.map(row => row.id),
    nextCursor:
      rows.length === batchSize && last
        ? encodeScopedPreciseTimestampCursor(last.cursor_expiry, last.id, cursorScope)
        : undefined,
  }
}

export async function getApiKeyExpiryReminderDetails(id: string, options: QueryOptions = {}) {
  const { rows } = await read<{ user_id: string; label: string; expires_at: Date }>(
    sql`/* getApiKeyExpiryReminderDetails */
      SELECT user_id, label, expires_at FROM api_keys WHERE id = ${id}::uuid
        AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'
        AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
        AND expiry_reminder_sent_at IS NULL
    `,
    options,
  )
  return rows[0] ?? null
}

// Claim immediately before the provider call. Uncertain delivery is never retried.
export async function claimApiKeyExpiryReminder(
  id: string,
  options: QueryOptions = {},
): Promise<boolean> {
  const { rowCount } = await write(
    sql`/* claimApiKeyExpiryReminder */
      UPDATE api_keys SET expiry_reminder_sent_at = NOW()
      WHERE id = ${id}::uuid AND expires_at > NOW()
        AND expires_at <= NOW() + INTERVAL '7 days'
        AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
        AND expiry_reminder_sent_at IS NULL
    `,
    options,
  )
  return rowCount === 1
}
