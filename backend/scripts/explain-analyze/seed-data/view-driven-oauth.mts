import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// One recoverable callback, a pending flow, and an expired callback exercise
// the base-table status and expiry gates before view hydration.
export async function seedViewDrivenOAuth(): Promise<void> {
  await using transaction = await beginTransaction()
  const values: unknown[] = []
  const rows: string[] = []
  for (let index = 0; index < 3; index += 1) {
    const offset = values.length
    values.push(
      seedUuid(index, '3a'),
      seedUuid(index, '38'),
      seedUuid(index, '39'),
      String(index + 1),
      index,
    )
    rows.push(`($${offset + 1}::uuid, 'github', 'authenticate', 'web', $${offset + 2}::uuid,
      $${offset + 3}::uuid, 'https://example.com/oauth/callback', repeat($${offset + 4}::text, 64),
      'seed-ciphertext', CASE WHEN $${offset + 5}::int = 2 THEN CURRENT_TIMESTAMP - INTERVAL '1 day'
        ELSE CURRENT_TIMESTAMP + INTERVAL '1 day' END,
      CASE WHEN $${offset + 5}::int = 1 THEN NULL ELSE CURRENT_TIMESTAMP END,
      CASE WHEN $${offset + 5}::int = 1 THEN NULL ELSE 'seed-callback-ciphertext' END)`)
  }
  await transaction(
    `/* seedViewDrivenOAuth */ INSERT INTO oauth_authorizations
        (id, provider, purpose, callback_mode, initiating_device_id, initiating_session_id,
         redirect_uri, state_hash, pkce_verifier_ciphertext, expires_at,
         callback_received_at, callback_code_ciphertext)
       VALUES ${rows.join(',')} ON CONFLICT (id) DO NOTHING`,
    values,
  )
  await transaction.commit()
}
