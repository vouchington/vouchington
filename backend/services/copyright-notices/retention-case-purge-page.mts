import { beginBoundedTransaction } from '@data-stores/psql'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import { FINAL_USER_PURGE_LOCK_KEY } from '../data-retention/cleanup-soft-deleted-user.mts'
import { isCopyrightEvidenceRetentionDeletionEnabled } from './config.mts'
import { copyrightCasePurgeEligibilitySql } from './retention-case-purge-eligibility.mts'
import { getCopyrightCasePurgePageSize } from '../../queues/psql/enqueues/ordering-config.mts'
import { runLockedPage } from './retention-case-purge-phases.mts'
import { enterCopyrightCasePurgePhase } from './retention-case-purge-phase-state.mts'
import { deleteCopyrightCaseResidualPartyPage } from './retention-case-purge-residual.mts'

type PageResult = { data: CopyrightCasePurgeJobData; hasMore: boolean; deferred?: boolean }
type EligibleNotice = { id: string; jurisdiction: string; last_legal_activity_at: Date }
type LockedNotice = {
  id: string
  legal_clock: string
  received_clock: string
  decision_clock: string | null
  decision_outcome: string | null
  evidence_clock: string | null
  guest_clock: string | null
  party_generation: string | null
  blocker_generation: string | null
}

function caseProofSql(noticeId: string, lock: boolean): SQLStatement {
  const statement = sql`/* readCopyrightCasePurgeProof */
    SELECT notice.id, notice.last_legal_activity_at::text AS legal_clock,
      notice.received_at::text AS received_clock,
      notice.territorial_decided_at::text AS decision_clock,
      notice.territorial_decision_outcome::text AS decision_outcome,
      notice.evidence_erased_at::text AS evidence_clock,
      notice.last_guest_capability_activity_at::text AS guest_clock,
      party.generation::text AS party_generation,
      blocker.generation::text AS blocker_generation
    FROM copyright_notices notice
    LEFT JOIN copyright_notice_thread_party_generations party
      ON party.copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_thread_blocker_generations blocker
      ON blocker.copyright_notice_id = notice.id
    WHERE notice.id = ${noticeId}::uuid`
  if (lock) statement.append(sql` FOR UPDATE OF notice`)
  return statement
}

function proofVersion(row: LockedNotice): string {
  return JSON.stringify([
    row.legal_clock,
    row.received_clock,
    row.decision_clock,
    row.decision_outcome,
    row.evidence_clock,
    row.guest_clock,
    row.party_generation,
    row.blocker_generation,
  ])
}

/** Each page starts a fresh transaction and rechecks the notice after the shared legal gates. */
export async function runCopyrightCasePurgePage(
  data: CopyrightCasePurgeJobData,
  now: Date = new Date(),
): Promise<PageResult> {
  if (data.phase === 'residual_parties') return deleteCopyrightCaseResidualPartyPage(data)
  if (!(await isCopyrightEvidenceRetentionDeletionEnabled())) return { data, hasMore: false }
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  if (data.phase === 'final')
    await query(sql`/* lockCopyrightCasePurgeAccountFinalization */
      SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
  await query(sql`/* lockCopyrightCasePurgePreservation */
    SELECT pg_advisory_xact_lock_shared(hashtextextended('copyright-preservation-retention', 0))`)
  const { rows: dirtyAccounts } = await query<{ id: string }>(sql`
    /* readPendingCopyrightAccountClockSync */
    SELECT id FROM retained_user_identities
    WHERE is_copyright_case_clock_sync_pending ORDER BY id LIMIT 1`)
  if (dirtyAccounts.length > 0) {
    await query.commit()
    return { data, hasMore: true, deferred: true }
  }
  const { rows: locked } = await query<LockedNotice>(caseProofSql(data.noticeId, true))
  if (locked.length === 0) {
    await query.commit()
    return await deleteCopyrightCaseResidualPartyPage(
      enterCopyrightCasePurgePhase(data, 'residual_parties'),
    )
  }
  const { rows: eligible } = await query<EligibleNotice>(
    copyrightCasePurgeEligibilitySql(data.noticeId, now),
  )
  if (eligible.length === 0) return { data, hasMore: false }
  const lock = locked[0]!
  const clock = lock.legal_clock
  const beforeVersion = proofVersion(lock)
  const pageSize = getCopyrightCasePurgePageSize()
  const changed = data.proofVersion !== null && data.proofVersion !== beforeVersion
  const current: CopyrightCasePurgeJobData = changed
    ? {
        ...enterCopyrightCasePurgePhase(data, 'parties'),
        legalClockAt: clock,
        proofVersion: beforeVersion,
      }
    : { ...data, legalClockAt: clock, proofVersion: beforeVersion }
  const result = await runLockedPage(query, current, eligible[0]!, pageSize)
  const { rows: after } = await query<LockedNotice>(caseProofSql(data.noticeId, false))
  if (after[0]) {
    result.data.proofVersion = proofVersion(after[0])
    result.data.legalClockAt = after[0].legal_clock
  }
  await query.commit()
  return result
}
