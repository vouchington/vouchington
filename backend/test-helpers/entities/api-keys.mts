import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestApiKeyPermissions(
  apiKeyId: string,
  permissions: readonly string[],
): Promise<void> {
  await write(sql`/* setTestApiKeyPermissions */
    UPDATE api_keys
    SET scopes = ${permissions}::api_scopes[]
    WHERE id = ${apiKeyId}::uuid
  `)
}

export async function setTestApiKeyExpiry(apiKeyId: string, expiresAt: Date | null): Promise<void> {
  await write(sql`/* setTestApiKeyExpiry */ UPDATE api_keys SET expires_at = ${expiresAt}
    WHERE id = ${apiKeyId}::uuid`)
}

export async function getTestApiKeyLifecycle(apiKeyId: string) {
  const { rows } = await write(sql`/* getTestApiKeyLifecycle */
    SELECT expires_at, replaced_by_api_key_id, expiry_reminder_sent_at, last_used_at,
      EXTRACT(EPOCH FROM (expires_at - created_at)) AS lifetime_seconds
    FROM api_keys WHERE id = ${apiKeyId}::uuid`)
  return rows[0]
}

export async function countTestApiKeysForUser(userId: string): Promise<number> {
  const { rows } = await write(sql`/* countTestApiKeysForUser */
    SELECT COUNT(*)::integer AS count FROM api_keys WHERE user_id = ${userId}::uuid`)
  return rows[0]!.count as number
}

export async function withTestApiKeyRotationWriteFailure(userId: string, run: () => Promise<void>) {
  if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('Expected synthetic user UUID')
  const name = `test_api_key_rotation_${userId.replaceAll('-', '')}`
  // Scoped to a randomized owner: other parallel tests' key writes remain valid.
  await write(`/* withTestApiKeyRotationWriteFailure */ ALTER TABLE api_keys
    ADD CONSTRAINT ${name} CHECK (user_id <> '${userId}'::uuid OR replaced_by_api_key_id IS NULL) NOT VALID`)
  try {
    await run()
  } finally {
    await write(
      `/* withTestApiKeyRotationWriteFailure */ ALTER TABLE api_keys DROP CONSTRAINT ${name}`,
    )
  }
}

export async function insertTestApiKeysDueForReminder(
  userId: string,
  count: number,
): Promise<string[]> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestApiKeysDueForReminder */
    INSERT INTO api_keys (user_id, prefix, key_hash, type, label, scopes, expires_at)
    SELECT ${userId}::uuid, 'voucha_rss_test', sha256(uuid_send(uuidv7())), 'rss',
      'Reminder boundary ' || ordinal, ARRAY['rss:read']::api_scopes[], NOW() + INTERVAL '6 days'
    FROM generate_series(1, ${count}::integer) AS ordinal
    RETURNING id
  `)
  return rows.map(row => row.id)
}
