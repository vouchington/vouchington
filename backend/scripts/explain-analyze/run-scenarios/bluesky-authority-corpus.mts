import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'

export const BLUESKY_AUTHORITY_CORPUS_ROWS = 3_000

/** Pending provider generations make ID-based authority lookups representative and selective. */
export async function seedBlueskyAuthorityCorpus(): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* seedBlueskyAuthorityCorpus */ WITH flows AS (
    INSERT INTO bluesky_link_authorizations
      (user_id, handle, callback_mode, callback_claimed_at, claimed_did, expires_at)
    SELECT $1::uuid, 'explain.example', 'web', CURRENT_TIMESTAMP,
      'did:plc:explain' || uuidv7()::text, CURRENT_TIMESTAMP + INTERVAL '1 day'
    FROM generate_series(1, $2::integer) RETURNING id, claimed_did
  ), accounts AS (
    INSERT INTO bluesky_linked_accounts (link_authorization_id, bluesky_did, session_ciphertext)
    SELECT id, claimed_did, 'synthetic-ciphertext' FROM flows RETURNING link_authorization_id
  ) SELECT id FROM flows`,
    [seedUuid(19_991, '01'), BLUESKY_AUTHORITY_CORPUS_ROWS],
  )
  await write('/* analyzeBlueskyAuthorityFlows */ ANALYZE bluesky_link_authorizations')
  await write('/* analyzeBlueskyAuthorityAccounts */ ANALYZE bluesky_linked_accounts')
  return rows.map(row => row.id)
}

export async function cleanupBlueskyAuthorityCorpus(ids: readonly string[]): Promise<void> {
  await write(
    '/* cleanupBlueskyAuthorityAccounts */ DELETE FROM bluesky_linked_accounts WHERE link_authorization_id = ANY($1::uuid[])',
    [ids],
  )
  await write(
    '/* cleanupBlueskyAuthorityFlows */ DELETE FROM bluesky_link_authorizations WHERE id = ANY($1::uuid[])',
    [ids],
  )
  await write(
    '/* vacuumBlueskyAuthorityCorpus */ VACUUM (ANALYZE) bluesky_link_authorizations, bluesky_linked_accounts',
  )
}
