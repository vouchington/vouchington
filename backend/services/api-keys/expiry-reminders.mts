import { getApiKeyExpiryLimits } from './work-limits.mts'
import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getApiKeysDueForExpiryReminder(
  afterId?: string,
  batchSize = getApiKeyExpiryLimits().batchSize,
  options: QueryOptions = {},
): Promise<string[]> {
  // Cost the first page's expiry range independently so it can seek the partial expiry index.
  // A continuation uses the ID cursor to seek past the expired prefix.
  const expiryWindow = afterId
    ? sql`expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'`
    : sql`expires_at > (SELECT NOW()) AND expires_at <= (SELECT NOW() + INTERVAL '7 days')`
  const eligible = sql`SELECT id FROM api_keys WHERE `.append(expiryWindow).append(sql`
    AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
    AND expiry_reminder_sent_at IS NULL
  `)
  const query = sql`/* getApiKeysDueForExpiryReminder */ `.append(eligible)
  if (afterId) {
    query.append(sql` AND id > ${afterId}::uuid`)
  } else {
    // The largest ID in any full sample cannot be earlier than the end of the ID page.
    // A short sample contains every eligible ID.
    query.append(sql` AND id <= (SELECT id FROM (`).append(eligible)
      .append(sql` ORDER BY expires_at, id LIMIT ${batchSize}) AS expiry_sample
        ORDER BY id DESC LIMIT 1)`)
  }
  query.append(sql` ORDER BY id LIMIT ${batchSize}`)
  const { rows } = await read<{ id: string }>(query, options)
  return rows.map(row => row.id)
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
