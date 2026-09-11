import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { getActorKeyId } from '@modules/activitypub-uris'
import { encryptSecret, decryptSecret } from '@modules/token-secrets'

export interface ActorKeyPairRow {
  user_id: string
  key_id: string
  public_key_pem: string
  private_key_ciphertext: string
  created_at: Date
  updated_at: Date
}

function actorKeySecretPurpose(userId: string): string {
  return `ap:actor-key:${userId}`
}

type PostgresError = {
  code?: string
  constraint?: string
}

function isKeyIdUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const pgError = error as PostgresError
  return pgError.code === '23505' && pgError.constraint === 'idx_ap_actor_keys__key_id'
}

async function getActorKeyPairRow(userId: string): Promise<ActorKeyPairRow | null> {
  const { rows } = await read(sql`/* getActorKeyPairRow */
    SELECT user_id, key_id, public_key_pem, private_key_ciphertext, created_at, updated_at
    FROM ap_actor_keys
    WHERE user_id = ${userId}
    LIMIT 1
  `)
  return (rows[0] as ActorKeyPairRow | undefined) ?? null
}

// Idempotently returns the ActivityPub actor keypair for a local user, generating and persisting
// one on first call. A fresh RSA-2048 keypair is generated unconditionally before the write — the
// unique `user_id` primary key resolves a concurrent-first-call race for that constraint at the DB
// layer, and the loser's freshly-generated (unused) keypair is simply discarded. `key_id` is a pure
// function of `userId` (see @modules/activitypub-uris), so it also collides on its own separate
// unique index under a true concurrent race — a constraint `ON CONFLICT (user_id)` does not cover,
// since Postgres only resolves the named arbiter and still raises on any other unique violation.
export async function getOrCreateActorKeyPair(userId: string): Promise<ActorKeyPairRow> {
  const { publicKeyPem, privateKeyPem } = generateRsaSha256KeyPair()
  const keyId = getActorKeyId(userId)
  const privateKeyCiphertext = encryptSecret(privateKeyPem, actorKeySecretPurpose(userId))

  try {
    const { rows } = await write(sql`/* getOrCreateActorKeyPair */
      INSERT INTO ap_actor_keys (user_id, key_id, public_key_pem, private_key_ciphertext)
      VALUES (${userId}, ${keyId}, ${publicKeyPem}, ${privateKeyCiphertext})
      ON CONFLICT (user_id) DO UPDATE
        SET user_id = ap_actor_keys.user_id
      RETURNING user_id, key_id, public_key_pem, private_key_ciphertext, created_at, updated_at
    `)
    return rows[0] as ActorKeyPairRow
  } catch (error) {
    if (isKeyIdUniqueViolation(error)) {
      const existing = await getActorKeyPairRow(userId)
      if (existing) return existing
    }
    throw error
  }
}

// Returns the decrypted PEM-encoded private key for signing outbound requests (Phase C4). Throws
// if the user has no actor keypair yet — callers needing lazy creation should call
// getOrCreateActorKeyPair instead.
export async function getActorPrivateKeyPem(userId: string): Promise<string | null> {
  const { rows } = await read(sql`/* getActorPrivateKeyPem */
    SELECT private_key_ciphertext
    FROM ap_actor_keys
    WHERE user_id = ${userId}
    LIMIT 1
  `)
  const row = rows[0] as { private_key_ciphertext: string } | undefined
  if (!row) return null
  return decryptSecret(row.private_key_ciphertext, actorKeySecretPurpose(userId))
}
