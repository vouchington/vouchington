import { deleteCopyrightMinimalPurgeRoot } from './retention-minimal-purge-root.mts'
import {
  lockCopyrightMinimalPurgeCursorReferences,
  lockCopyrightMinimalPurgeUserClock,
} from './retention-minimal-purge-locks.mts'
import { deleteCopyrightMinimalPurgePhasePage } from './retention-minimal-purge-deletions.mts'
import type { CopyrightMinimalPurgePageResult } from './retention-minimal-purge-types.mts'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { getCopyrightCaseRetentionMonths, getCopyrightRetentionWindows } from './config.mts'
import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightMinimalRecordPurgeEligibleSql } from './retention-minimal-purge-eligibility.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'
import { advanceCopyrightMinimalPurgeProof } from './retention-minimal-purge-proof.mts'
import { drainCopyrightMinimalPurgePostroot } from './retention-minimal-purge-postroot.mts'
import {
  copyrightMinimalPurgeGenerationMatches as isSameGeneration,
  readCopyrightMinimalPurgeGeneration,
} from './retention-minimal-purge-generation.mts'

export async function purgeCopyrightMinimalRecordPage(
  noticeId: string,
  options: { now: Date; cutoff: Date; pageSize: number; remainingPhysicalRows: number },
  nowOverride?: Date,
): Promise<CopyrightMinimalPurgePageResult> {
  const retentionMonths = await getCopyrightCaseRetentionMonths()
  if (retentionMonths === null) return { outcome: 'ineligible', physicalRows: 0 }
  const windows = { ...getCopyrightRetentionWindows(), caseMonths: retentionMonths }
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await lockCopyrightMinimalPurgeUserClock(transaction)
  const { rows: sequences } = await transaction<{ current_sequence: string }>(sql`
    /* fenceCopyrightMinimalPurgeLegalMutations */
    SELECT current_sequence FROM copyright_legal_mutation_sequence_states
    WHERE is_singleton FOR SHARE`)
  const currentSequence = sequences[0]?.current_sequence
  if (currentSequence === undefined) throw new Error('Copyright mutation sequence is missing')
  const { rows: notices } = await transaction<{
    id: string
  }>(sql`/* lockCopyrightMinimalPurgeNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  if (notices.length) await lockCopyrightMinimalPurgeCursorReferences(transaction, noticeId)
  const now = nowOverride ?? new Date()
  const freshCutoff = shiftUtcCalendarMonths(now, -retentionMonths)
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(options.cutoff.getTime()) ||
    options.now > now ||
    options.cutoff > shiftUtcCalendarMonths(options.now, -retentionMonths)
  )
    return { outcome: 'ineligible', physicalRows: 0 }
  const cutoff = new Date(Math.min(options.cutoff.getTime(), freshCutoff.getTime()))
  const { rows: workRows } = await transaction<{
    phase_index: number
    root_purged_at: Date | null
  }>(sql`/* lockCopyrightMinimalPurgeWork */
    SELECT phase_index, root_purged_at FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} FOR UPDATE`)
  if (notices.length === 0) {
    const outcome = await drainCopyrightMinimalPurgePostroot(
      transaction,
      noticeId,
      options.pageSize,
      workRows[0]?.root_purged_at,
      options.remainingPhysicalRows,
    )
    if (outcome.outcome !== 'ineligible') await transaction.commit()
    return outcome
  }
  const proof = await advanceCopyrightMinimalPurgeProof(
    transaction,
    noticeId,
    options.pageSize,
    currentSequence,
    now,
    windows.complaintMonths,
  )
  if (proof === 'ineligible') {
    await transaction.commit()
    return { outcome: 'ineligible', physicalRows: 0 }
  }
  if (proof === 'progress') {
    await transaction.commit()
    return { outcome: 'progress', physicalRows: 0 }
  }
  const initialGeneration = await readCopyrightMinimalPurgeGeneration(transaction, noticeId)
  const { rows: eligible } = await transaction<{ id: string }>(
    sql`
    /* recheckCopyrightMinimalPurgeEligibility */`
      .append(copyrightMinimalRecordPurgeEligibleSql(now, cutoff, windows))
      .append(sql`SELECT id FROM purge_eligible WHERE id = ${noticeId}`),
  )
  if (eligible.length === 0) return { outcome: 'ineligible', physicalRows: 0 }
  const { rows: catalog } = await transaction<{ complete: boolean }>(sql`
    /* requireCopyrightMinimalPurgeKnownFkGraph */
    SELECT fn_project_copyright_minimal_purge_catalog_complete() AS complete`)
  if (!catalog[0]?.complete)
    throw new Error('Copyright minimal purge manifest does not cover the current FK graph')
  const { rows: work } = await transaction<{
    phase_index: number
    cursor_purge_record_id: string | null
  }>(sql`
    /* currentCopyrightMinimalPurgePhase */
    SELECT phase_index, cursor_purge_record_id FROM copyright_notice_minimal_purge_continuations
    WHERE copyright_notice_identity_id = ${noticeId} FOR UPDATE`)
  let cursor = work[0]?.cursor_purge_record_id ?? null
  let phaseIndex = work[0]?.phase_index
  if (phaseIndex === undefined || phaseIndex > COPYRIGHT_MINIMAL_PURGE_PHASES.length)
    throw new Error('Copyright minimal purge phase is missing or invalid')
  await transaction(sql`/* scopeCopyrightMinimalPurge */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_minimal_purge_now', ${now.toISOString()}, true),
      set_config('app.copyright_minimal_purge_cutoff', ${cutoff.toISOString()}, true),
      set_config('app.copyright_case_retention_months', ${String(windows.caseMonths)}, true),
      set_config('app.copyright_complaint_window_months', ${String(windows.complaintMonths)}, true),
      set_config('app.copyright_minimal_purge_delete_limit', ${String(options.remainingPhysicalRows)}, true),
      set_config('app.copyright_minimal_purge_physical_count', '0', true)`)
  // oxlint-disable no-await-in-loop -- each fixed phase is scoped and committed in order.
  while (phaseIndex < COPYRIGHT_MINIMAL_PURGE_PHASES.length) {
    const phase = COPYRIGHT_MINIMAL_PURGE_PHASES[phaseIndex]!
    const unitSize = phase.maxPhysicalRowsPerParent ?? 1
    const rawLimit = Math.min(
      options.pageSize,
      Math.floor(options.remainingPhysicalRows / unitSize),
    )
    if (rawLimit < 1) return { outcome: 'progress', physicalRows: 0, requiredRows: unitSize }
    // no-mistakes-disable-next-line query-reached-per-item: fixed finite phase manifest advances only until one capped child page commits.
    await transaction(sql`/* scopeCopyrightMinimalPurgeChildPage */
      SELECT set_config('app.copyright_minimal_purge_phase_table', ${phase.table}, true),
        set_config('app.copyright_minimal_purge_phase_index', ${String(phaseIndex)}, true),
        set_config('app.copyright_minimal_purge_physical_count', '0', true)`)
    // no-mistakes-disable-next-line query-reached-per-item: each fixed phase selects at most pageSize plus one and deletes at most pageSize rows.
    const page = await deleteCopyrightMinimalPurgePhasePage(
      transaction,
      phase,
      noticeId,
      rawLimit,
      cursor,
    )
    if (page.scanned > 0) {
      // no-mistakes-disable-next-line query-reached-per-item: one generation point lookup follows this capped child page before its transaction commits.
      const generationMatches = await isSameGeneration(transaction, noticeId, initialGeneration)
      if (!generationMatches) {
        await transaction.rollback()
        return { outcome: 'stale', physicalRows: 0 }
      }
      if (phase.scanCursor) {
        if (!page.lastId) throw new Error('Copyright purge raw cursor did not advance')
        // no-mistakes-disable-next-line query-reached-per-item: one cursor checkpoint follows the capped raw owner page and commits before any next page.
        await transaction(sql`/* checkpointCopyrightMinimalPurgeRawPage */
          UPDATE copyright_notice_minimal_purge_continuations SET cursor_purge_record_id = ${page.lastId}::uuid
          WHERE copyright_notice_identity_id = ${noticeId}`)
      }
      await transaction.commit()
      return { outcome: 'progress', physicalRows: page.physicalRows }
    }
    phaseIndex++
    cursor = null
    // no-mistakes-disable-next-line query-reached-per-item: this checkpoint occurs once for each of the finite empty phases.
    await transaction(sql`/* advanceCopyrightMinimalPurgePhase */
      UPDATE copyright_notice_minimal_purge_continuations SET phase_index = ${phaseIndex}, cursor_purge_record_id = NULL
      WHERE copyright_notice_identity_id = ${noticeId}`)
  }
  // oxlint-enable no-await-in-loop
  const { rows: graph } = await transaction<{
    catalog_complete: boolean
    children_drained: boolean
  }>(sql`/* verifyCopyrightMinimalPurgeGraph */
    SELECT fn_project_copyright_minimal_purge_catalog_complete() AS catalog_complete,
      fn_project_copyright_minimal_purge_children_drained(${noticeId}) AS children_drained`)
  if (!graph[0]?.catalog_complete)
    throw new Error('Copyright minimal purge manifest does not cover the current FK graph')
  if (!graph[0].children_drained) {
    // A late descendant may have appeared after its phase. Revisit the fixed manifest
    // under the next page's fresh hold and eligibility check.
    await transaction(sql`/* restartCopyrightMinimalPurgeAfterLateChild */
      UPDATE copyright_notice_minimal_purge_continuations SET phase_index = 0, cursor_purge_record_id = NULL
      WHERE copyright_notice_identity_id = ${noticeId}`)
    await transaction.commit()
    return { outcome: 'progress', physicalRows: 0 }
  }
  if (!(await isSameGeneration(transaction, noticeId, initialGeneration))) {
    await transaction.rollback()
    return { outcome: 'stale', physicalRows: 0 }
  }
  const root = await deleteCopyrightMinimalPurgeRoot(
    transaction,
    noticeId,
    options.remainingPhysicalRows,
  )
  if (root.physicalRows) await transaction.commit()
  return root
}
