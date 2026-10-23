import { beginBoundedTransaction } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import sql from 'sql-template-strings'
import { copyrightMinimalRecordPurgeEligibleSql } from './retention-minimal-purge-eligibility.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'
import { advanceCopyrightMinimalPurgeProof } from './retention-minimal-purge-proof.mts'
import { drainCopyrightMinimalPurgePostroot } from './retention-minimal-purge-postroot.mts'
import {
  isLateCopyrightChild,
  restartCopyrightMinimalPurgeAfterLateChild,
} from './retention-minimal-purge-late-child.mts'
import {
  copyrightMinimalPurgeGenerationMatches as isSameGeneration,
  readCopyrightMinimalPurgeGeneration,
} from './retention-minimal-purge-generation.mts'

const MAX_PAGE_SIZE = 50 // A lifecycle row may cascade its one rationale companion.
type PageOutcome = 'progress' | 'purged' | 'ineligible' | 'stale'
export type CopyrightMinimalPurgeOutcome = PageOutcome | 'more'

async function purgeCopyrightMinimalRecordPage(
  noticeId: string,
  options: { now: Date; cutoff: Date; pageSize: number },
): Promise<PageOutcome> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await transaction(sql`/* setCopyrightMinimalPurgeTimeouts */
    SELECT set_config('lock_timeout', '5s', true)`)
  // The final user purge takes this key exclusively before user/case-related row locks.
  // Keep each bounded case page before or after its factual purged_at update.
  await transaction(sql`/* lockCopyrightMinimalPurgeUserClock */
    SELECT pg_advisory_xact_lock_shared(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
  const { rows: sequences } = await transaction<{ current_sequence: string }>(sql`
    /* fenceCopyrightMinimalPurgeLegalMutations */
    SELECT current_sequence FROM copyright_legal_mutation_sequence_state
    WHERE singleton FOR SHARE`)
  const currentSequence = sequences[0]?.current_sequence
  if (currentSequence === undefined) throw new Error('Copyright mutation sequence is missing')
  const { rows: notices } = await transaction<{
    id: string
  }>(sql`/* lockCopyrightMinimalPurgeNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  const { rows: workRows } = await transaction<{
    phase_index: number
    root_purged_at: Date | null
  }>(sql`/* lockCopyrightMinimalPurgeWork */
    SELECT phase_index, root_purged_at FROM copyright_notice_minimal_purge_work
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE`)

  if (notices.length === 0) {
    const outcome = await drainCopyrightMinimalPurgePostroot(
      transaction,
      noticeId,
      options.pageSize,
      workRows[0]?.root_purged_at,
    )
    if (outcome !== 'ineligible') await transaction.commit()
    return outcome
  }
  const proof = await advanceCopyrightMinimalPurgeProof(
    transaction,
    noticeId,
    options.pageSize,
    currentSequence,
  )
  if (proof === 'ineligible') return 'ineligible'
  if (proof === 'progress') {
    await transaction.commit()
    return 'progress'
  }
  const initialGeneration = await readCopyrightMinimalPurgeGeneration(transaction, noticeId)
  const { rows: eligible } = await transaction<{ id: string }>(
    sql`
    /* recheckCopyrightMinimalPurgeEligibility */`
      .append(copyrightMinimalRecordPurgeEligibleSql(options.now, options.cutoff))
      .append(sql`SELECT id FROM purge_eligible WHERE id = ${noticeId}`),
  )
  if (eligible.length === 0) return 'ineligible'
  const { rows: catalog } = await transaction<{ complete: boolean }>(sql`
    /* requireCopyrightMinimalPurgeKnownFkGraph */
    SELECT fn_project_copyright_minimal_purge_catalog_complete() AS complete`)
  if (!catalog[0]?.complete)
    throw new Error('Copyright minimal purge manifest does not cover the current FK graph')
  const { rows: work } = await transaction<{ phase_index: number }>(sql`
    /* currentCopyrightMinimalPurgePhase */
    SELECT phase_index FROM copyright_notice_minimal_purge_work
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE`)
  let phaseIndex = work[0]?.phase_index
  if (phaseIndex === undefined || phaseIndex > COPYRIGHT_MINIMAL_PURGE_PHASES.length)
    throw new Error('Copyright minimal purge phase is missing or invalid')

  await transaction(sql`/* scopeCopyrightMinimalPurge */
    SELECT set_config('app.copyright_minimal_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_minimal_purge_now', ${options.now.toISOString()}, true),
      set_config('app.copyright_minimal_purge_cutoff', ${options.cutoff.toISOString()}, true)`)
  // oxlint-disable no-await-in-loop -- each fixed phase is scoped and committed in order.
  while (phaseIndex < COPYRIGHT_MINIMAL_PURGE_PHASES.length) {
    const phase = COPYRIGHT_MINIMAL_PURGE_PHASES[phaseIndex]!
    // no-mistakes-disable-next-line query-reached-per-item: fixed finite phase manifest advances only until one capped child page commits.
    await transaction(sql`/* scopeCopyrightMinimalPurgeChildPage */
      SELECT set_config('app.copyright_minimal_purge_phase_table', ${phase.table}, true),
        set_config('app.copyright_minimal_purge_phase_index', ${String(phaseIndex)}, true),
        set_config('app.copyright_minimal_purge_deleted_count', '0', true)`)
    // no-mistakes-disable-next-line query-reached-per-item: each fixed phase selects at most pageSize plus one and deletes at most pageSize rows.
    const { rows } = await transaction<{ scanned: number; deleted: number }>(
      phase.statement(noticeId, options.pageSize),
    )
    const page = rows[0]
    if (!page || page.deleted > options.pageSize || (page.scanned > 0 && page.deleted === 0))
      throw new Error(`Copyright minimal purge page failed for ${phase.table}`)
    if (page.scanned > 0) {
      // no-mistakes-disable-next-line query-reached-per-item: one generation point lookup follows this capped child page before its transaction commits.
      const generationMatches = await isSameGeneration(transaction, noticeId, initialGeneration)
      if (!generationMatches) {
        await transaction.rollback()
        return 'stale'
      }
      await transaction.commit()
      return 'progress'
    }
    phaseIndex++
    // no-mistakes-disable-next-line query-reached-per-item: this checkpoint occurs once for each of the finite empty phases.
    await transaction(sql`/* advanceCopyrightMinimalPurgePhase */
      UPDATE copyright_notice_minimal_purge_work SET phase_index = ${phaseIndex}
      WHERE copyright_notice_id = ${noticeId}`)
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
      UPDATE copyright_notice_minimal_purge_work SET phase_index = 0
      WHERE copyright_notice_id = ${noticeId}`)
    await transaction.commit()
    return 'progress'
  }
  if (!(await isSameGeneration(transaction, noticeId, initialGeneration))) {
    await transaction.rollback()
    return 'stale'
  }
  // The root guard repeats both checks atomically before its fixed marker cascade.
  const result = await transaction(sql`/* purgeCopyrightMinimalRecord */
    DELETE FROM copyright_notices WHERE id = ${noticeId}`)
  if (result.rowCount !== 1) return 'ineligible'
  await transaction(sql`/* recordCopyrightMinimalPurgeRootRemoval */
    UPDATE copyright_notice_minimal_purge_work
    SET root_purged_at = CURRENT_TIMESTAMP
    WHERE copyright_notice_id = ${noticeId} AND root_purged_at IS NULL`)
  await transaction.commit()
  return 'progress'
}

/** A run commits at most maxBatches bounded child or retained-party pages. */
export async function purgeCopyrightMinimalRecord(
  noticeId: string,
  options: { now: Date; cutoff: Date; pageSize?: number; maxBatches?: number },
): Promise<CopyrightMinimalPurgeOutcome> {
  const pageSize = options.pageSize ?? MAX_PAGE_SIZE
  const maxBatches = options.maxBatches ?? 16
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE ||
    !Number.isInteger(maxBatches) ||
    maxBatches < 1
  )
    throw new RangeError('Copyright minimal purge requires finite positive page limits')
  // oxlint-disable no-await-in-loop -- each page commits before the next hold recheck.
  for (let batch = 0; batch < maxBatches; batch++) {
    let outcome: PageOutcome
    try {
      // no-mistakes-disable-next-line query-reached-per-item: maxBatches and pageSize are validated hard caps; each page needs its own hold recheck and commit.
      outcome = await purgeCopyrightMinimalRecordPage(noticeId, {
        now: options.now,
        cutoff: options.cutoff,
        pageSize,
      })
    } catch (err) {
      if (!isLateCopyrightChild(err)) throw err
      // no-mistakes-disable-next-line query-reached-per-item: one exact late-child rollback resets the durable phase and returns without an internal retry.
      await restartCopyrightMinimalPurgeAfterLateChild(noticeId)
      return 'more'
    }
    if (outcome === 'stale') return 'more'
    if (outcome !== 'progress') return outcome
  }
  // oxlint-enable no-await-in-loop
  return 'more'
}
