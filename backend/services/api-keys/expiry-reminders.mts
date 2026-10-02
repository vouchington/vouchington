import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getApiKeysDueForExpiryReminder(afterId?: string): Promise<string[]> {
  const query = sql`/* getApiKeysDueForExpiryReminder */
    SELECT id FROM api_keys
    WHERE expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'
      AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
      AND expiry_reminder_sent_at IS NULL
  `
  if (afterId) query.append(sql` AND id > ${afterId}::uuid`)
  query.append(sql` ORDER BY id LIMIT 100`)
  const { rows } = await read<{ id: string }>(query)
  return rows.map(row => row.id)
}

export async function getApiKeyExpiryReminderDetails(id: string) {
  const { rows } = await read<{ user_id: string; label: string; expires_at: Date }>(sql`
    /* getApiKeyExpiryReminderDetails */
    SELECT user_id, label, expires_at FROM api_keys WHERE id = ${id}::uuid
      AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'
      AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
      AND expiry_reminder_sent_at IS NULL
  `)
  return rows[0] ?? null
}

// Claim immediately before the provider call. Uncertain delivery is never retried.
export async function claimApiKeyExpiryReminder(id: string): Promise<boolean> {
  const { rowCount } = await write(sql`/* claimApiKeyExpiryReminder */
    UPDATE api_keys SET expiry_reminder_sent_at = NOW()
    WHERE id = ${id}::uuid AND expires_at > NOW()
      AND expires_at <= NOW() + INTERVAL '7 days'
      AND revoked_at IS NULL AND replaced_by_api_key_id IS NULL
      AND expiry_reminder_sent_at IS NULL
  `)
  return rowCount === 1
}
