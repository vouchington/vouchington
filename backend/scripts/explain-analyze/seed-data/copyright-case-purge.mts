import { write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const DAY_MS = 86_400_000

/**
 * One due case behind hundreds of cases that must never be read: recent cases that are not yet
 * due, and old cases of a jurisdiction the purge does not own. The idempotent fixture stays in this
 * disposable EXPLAIN database until the worktree database is removed.
 */
export async function seedPurgeCases(): Promise<string> {
  const dueId = seedUuidAtTimestamp(postSeedTimestampMs(0) - 2_700 * DAY_MS, 0)
  const recentPrefix = seedUuidAtTimestamp(postSeedTimestampMs(0) - 5 * DAY_MS, 0).slice(0, 24)
  const otherPrefix = seedUuidAtTimestamp(postSeedTimestampMs(0) - 2_800 * DAY_MS, 0).slice(0, 24)
  await write(
    `/* seedExplainCopyrightPurgeCases */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, last_legal_activity_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    SELECT cases.id, cases.jurisdiction::copyright_jurisdictions, 'copyright', cases.at, cases.at,
      $4::uuid, 'synthetic-ciphertext', 'EXPLAIN purge fixture', 'explain-fixture'
    FROM (
      SELECT $1::uuid AS id, 'us_dmca' AS jurisdiction, NOW() - INTERVAL '2700 days' AS at
      UNION ALL
      SELECT ($2::text || lpad(n::text, 12, '0'))::uuid, 'us_dmca', NOW() - INTERVAL '5 days'
        FROM generate_series(1, 300) AS n
      UNION ALL
      SELECT ($3::text || lpad(n::text, 12, '0'))::uuid, 'other', NOW() - INTERVAL '2800 days'
        FROM generate_series(1, 300) AS n
    ) cases ON CONFLICT DO NOTHING`,
    [dueId, recentPrefix, otherPrefix, seedUser.id],
  )
  // Finished purges leave no marker, so 20,000 identities carry none; three crashed ones leave the
  // pending marker that the recovery reads through its partial index.
  await write(
    `/* seedExplainCopyrightPurgeFinished */
    INSERT INTO retained_copyright_notice_identities (id)
    SELECT (substr($1::text, 1, 24) || lpad(n::text, 12, '0'))::uuid
    FROM generate_series(1, 20000) AS n ON CONFLICT DO NOTHING`,
    [seedUuid(0, 'c2')],
  )
  await write(
    `/* seedExplainCopyrightPurgeResidual */
    INSERT INTO retained_copyright_notice_identities (id, case_deleted_at)
    SELECT unnest($1::uuid[]), NOW() ON CONFLICT DO NOTHING`,
    [[1, 2, 3].map(index => seedUuid(index, 'c1'))],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:analyze */
    ANALYZE copyright_notices, retained_copyright_notice_identities`,
  )
  return dueId
}
