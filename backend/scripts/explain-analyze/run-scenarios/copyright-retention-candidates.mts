import { read, write } from '@data-stores/psql'
import assert from 'node:assert/strict'
import { selectCandidates } from '@services/copyright-notices/retention-erasure'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { postSeedTimestampMs, seedUuidAtTimestamp } from '../seed-data/common.mts'

export async function runCopyrightRetentionCandidateScenario(): Promise<void> {
  const oldId = seedUuidAtTimestamp(postSeedTimestampMs(0) - 400 * 86_400_000, 0)
  const oldIdPrefix = oldId.slice(0, 24)
  // Legal notice identities are immutable and retained. The idempotent fixture remains in this
  // disposable EXPLAIN database until the worktree database is removed.
  await write(
    `/* seedExplainCopyrightRetention */
       INSERT INTO copyright_notices
         (id, jurisdiction, legal_basis, received_at, claimant_user_id,
          claimant_contact_ciphertext, work_description, policy_version)
       SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
         'us_dmca', 'copyright', NOW() - INTERVAL '400 days', $2::uuid,
         'synthetic-ciphertext', 'EXPLAIN retention fixture', 'explain-fixture'
       FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [oldIdPrefix, seedUser.id],
  )
  await write(`/* seedExplainCopyrightRetention:analyze */ ANALYZE copyright_notices`)
  registerScenarioContract('copyright-evidence-retention-candidates', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'copyright_notice_targets', max: 12_500 }],
    seededRows: {
      copyright_notices: 1_100,
      copyright_notice_targets: 12_500,
      copyright_notice_delivery_work_items: 1_100,
      copyright_notice_email_intakes: 1_000,
      copyright_notice_email_intake_receipts: 1_000,
    },
  })
  const now = new Date()
  const cutoff = new Date(now.getTime() - 100 * 86_400_000)
  await runAndCapture(
    'copyright-evidence-retention-candidates',
    async () => {
      const candidates = await selectCandidates({
        now,
        cutoff,
        limit: 25,
      })
      assert.equal(candidates.length, 25, 'The aged notice fixture must fill one candidate page')
      const { rows } = await read<{ count: string }>(
        `/* assertExplainCopyrightRetentionCandidatesAged */
         SELECT COUNT(*)::text AS count FROM copyright_notices
         WHERE id = ANY($1::uuid[]) AND jurisdiction = 'us_dmca'
           AND uuid_extract_timestamp(id) <= $2::timestamptz`,
        [candidates, cutoff],
      )
      assert.equal(Number(rows[0]?.count), candidates.length)
    },
    undefined,
    'selectCopyrightRetentionErasureCandidates',
  )
}
