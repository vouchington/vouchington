import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

// An explicit `id` lets tests engineer tie-key (equal-timestamp) fixtures: `created_at` on
// user_passkeys is GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL, so it can only be
// controlled by crafting the UUIDv7 id itself (matching `msecs`, differing tail).
export async function insertTestPasskey(userId: string, suffix: string, id?: string) {
  const { rows } = await write(sql`
    INSERT INTO user_passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up, name)
    VALUES (
      ${id ?? v7()},
      ${userId},
      ${`cred-${suffix}`},
      ${Buffer.from(`fake-public-key-${suffix}`)},
      0,
      'singleDevice',
      FALSE,
      ${`Test Passkey ${suffix}`}
    )
    RETURNING id, name, device_type, backed_up, created_at, last_used_at
  `)
  return rows[0] as { id: string; name: string }
}

export async function countTestPasskeys(userId: string): Promise<number> {
  const { rows } = await read(sql`
    SELECT COUNT(*)::int AS count
    FROM user_passkeys
    WHERE user_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}
