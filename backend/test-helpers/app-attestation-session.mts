import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Hold one owned unique key insert so the verified HTTP request cannot finish storing it. */
export async function withBlockedAppAttestationInsert<Result>(
  key: { keyId: Buffer; did: string; publicKey: Buffer; bundleId: string },
  operation: (release: () => Promise<void>) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(sql`/* withBlockedAppAttestationInsert */
    INSERT INTO app_attestation_keys (key_id, did, public_key, bundle_id, environment)
    VALUES (${key.keyId}, ${key.did}, ${key.publicKey}, ${key.bundleId}, 'production')`)
  return await operation(() => query.rollback())
}

export async function getActiveTestSessionId(userId: string): Promise<string | null> {
  const { rows } = await write<{ id: string }>(sql`/* getActiveTestSessionId */
    SELECT id FROM user_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY id LIMIT 1`)
  return rows[0]?.id ?? null
}

export function createTestAttestationProof() {
  const keyId = randomBytes(32)
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    keyId,
    publicKey: key.publicKey.export({ type: 'spki', format: 'der' }),
    result: {
      keyId: keyId.toString('base64'),
      publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }),
      receipt: Buffer.alloc(0),
      environment: 'production' as const,
    },
  }
}
