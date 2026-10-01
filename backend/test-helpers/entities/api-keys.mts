import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestApiKeyPermissions(
  apiKeyId: string,
  permissions: readonly string[],
): Promise<void> {
  await write(sql`/* setTestApiKeyPermissions */
    UPDATE api_keys
    SET permissions = ${permissions}
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
