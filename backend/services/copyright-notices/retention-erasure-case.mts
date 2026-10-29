import { getCopyrightRetentionKeyBucket } from './encryption-key-objects.mts'
import { beginBoundedTransaction } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import sql from 'sql-template-strings'
import { getCopyrightCaseRetentionMonths, getCopyrightRetentionWindows } from './config.mts'
import { copyrightRetentionEligibleSql } from './retention-erasure-eligibility.mts'
import { advanceCopyrightMinimalPurgeProof } from './retention-minimal-purge-proof.mts'
import {
  copyrightErasureTokenPageSql,
  lockCopyrightErasurePageBeforeParent,
} from './retention-erasure-prelocks.mts'
import { eraseCopyrightRawObjectPage } from './retention-erasure-objects.mts'
import {
  readCopyrightErasureWork,
  fenceCopyrightErasureIntakePage,
  redactCopyrightErasurePage,
  destroyCopyrightErasureKeyPage,
  type CopyrightErasureWork,
} from './retention-erasure-progress.mts'
import { COPYRIGHT_RETENTION_ERASURE } from './retention-erasure-spec.mts'

export type CopyrightRetentionCaseOutcome = 'erased' | 'ineligible' | 'progress'

/** Exactly one finite proof page or one durable destruction page per selected case. */
export async function eraseCopyrightRetentionCase(
  noticeId: string,
): Promise<CopyrightRetentionCaseOutcome> {
  const retentionMonths = await getCopyrightCaseRetentionMonths()
  if (retentionMonths === null) return 'ineligible'
  const limits = getCopyrightRetentionWindows()
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  // ast-grep-ignore: no-three-sequential-awaits -- Set transaction deadlines before acquiring global then case lifetime locks in canonical order.
  await query(sql`/* setCopyrightRetentionTimeouts */ SELECT set_config('lock_timeout', '5s', true),
    set_config('idle_in_transaction_session_timeout', '120s', true)`)
  await query(sql`/* lockCopyrightErasureLegalMutationLifetime */
    SELECT pg_advisory_xact_lock_shared(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
  await query(sql`/* lockCopyrightErasureCaseLifetime */
    SELECT pg_advisory_xact_lock(hashtextextended('copyright-erasure:' || ${noticeId}::uuid::text, 0))`)
  const { rows: sequenceRows } = await query<{
    current_sequence: string
  }>(sql`/* fenceCopyrightErasureLegalMutations */
    SELECT current_sequence FROM copyright_legal_mutation_sequence_states WHERE is_singleton FOR SHARE`)
  const sequence = sequenceRows[0]?.current_sequence
  if (sequence === undefined) throw new Error('Copyright legal mutation sequence is missing')
  const { rows: prior } =
    await query<CopyrightErasureWork>(sql`/* readCopyrightErasurePrelockPhase */
    SELECT erasure_started_at, erasure_legal_clock_at, erasure_stage_index, erasure_table_index,
      erasure_intake_cursor, erasure_object_owner_cursor, erased_object_count
    FROM copyright_notice_minimal_purge_continuations WHERE copyright_notice_identity_id = ${noticeId}`)
  const locks = await lockCopyrightErasurePageBeforeParent(
    query,
    noticeId,
    prior[0],
    limits.proofPageSize,
  )
  await query(
    sql`/* lockCopyrightRetentionNotice */ SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`,
  )
  // Read the actual clock after every lifetime lock wait. Candidate selection is never authority.
  const now = new Date()
  const cutoff = shiftUtcCalendarMonths(now, -retentionMonths)
  const proof = await advanceCopyrightMinimalPurgeProof(
    query,
    noticeId,
    limits.proofPageSize,
    sequence,
    now,
    limits.complaintMonths,
  )
  if (proof !== 'ready') {
    await query.commit()
    return proof
  }
  const { rows: eligible } = await query(
    sql`/* recheckCopyrightRetentionEligibility */`
      .append(
        copyrightRetentionEligibleSql(now, cutoff, { ...limits, caseMonths: retentionMonths }),
      )
      .append(sql`SELECT id FROM eligible WHERE id = ${noticeId}`),
  )
  if (!eligible.length) return 'ineligible'
  // Every case owns an authoritative key object, including cases without raw attachments.
  // Refuse missing provider configuration before admitting or continuing private-data overwrite.
  getCopyrightRetentionKeyBucket()
  const work = await readCopyrightErasureWork(query, noticeId)
  if (!work.erasure_started_at) {
    await query(sql`/* admitCopyrightBoundedErasure */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_started_at = clock_timestamp(), erasure_legal_clock_at =
        fn_project_copyright_minimal_record_legal_clock(${noticeId}, ${limits.complaintMonths})
      WHERE copyright_notice_identity_id = ${noticeId} AND erasure_started_at IS NULL`)
    await query.commit()
    return 'progress'
  }
  if (work.erasure_stage_index !== locks.stage || work.erasure_table_index !== locks.table)
    return 'progress'
  await query(
    sql`/* enableCopyrightRetentionErasure */ SET LOCAL app.copyright_retention_erasure = 'on'`,
  )
  if (work.erasure_stage_index === 0) {
    await fenceCopyrightErasureIntakePage(
      query,
      noticeId,
      work,
      limits.proofPageSize,
      locks.intakeIds,
    )
  } else if (work.erasure_stage_index === 1) {
    await eraseCopyrightRawObjectPage(query, noticeId, work, limits.proofPageSize)
  } else if (work.erasure_stage_index === 2) {
    let tokenHasMore = false
    if (
      COPYRIGHT_RETENTION_ERASURE[work.erasure_table_index]?.table ===
      'copyright_notice_email_thread_tokens'
    ) {
      const { rows: tokens } = await query<{ id: string }>(
        copyrightErasureTokenPageSql(noticeId, limits.proofPageSize + 1),
      )
      if (tokens.slice(0, limits.proofPageSize).some(row => !locks.tokenIds.includes(row.id)))
        return 'progress'
      tokenHasMore = tokens.length > limits.proofPageSize
    }
    await redactCopyrightErasurePage(
      query,
      noticeId,
      work,
      limits.proofPageSize,
      locks.tokenIds,
      tokenHasMore,
    )
  } else if (work.erasure_stage_index === 3) {
    await destroyCopyrightErasureKeyPage(query, noticeId, work)
  } else if (work.erasure_stage_index === 4) {
    if (!work.erasure_legal_clock_at) throw new Error('Copyright erasure legal clock is missing')
    await query(sql`/* insertCopyrightRetentionErasure */ INSERT INTO copyright_notice_retention_erasures (
      copyright_notice_id, retention_days, erased_object_count, legal_clock_at)
      VALUES (${noticeId}, ${Math.ceil((now.getTime() - cutoff.getTime()) / 86_400_000)},
        ${work.erased_object_count}, ${work.erasure_legal_clock_at})`)
    await query.commit()
    return 'erased'
  } else throw new Error('Invalid copyright erasure stage')
  await query.commit()
  return 'progress'
}
