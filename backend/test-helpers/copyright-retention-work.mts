import { afterEach, vi } from 'vitest'
import { beginTransaction, write } from '@data-stores/psql'
import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import sql from 'sql-template-strings'
import { copyrightConfig } from '../services/copyright-notices/config.mts'
import { eraseCopyrightRetentionCase } from '../services/copyright-notices/retention-erasure-case.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

const MAX_ERASURE_WORK_PAGES = 256

/** Freeze only Date and configure the current six-year retention contract for this test fork. */
export function useCopyrightRetentionWorkClock(): (
  now: Date,
  options?: {
    caseRetentionMonths?: number
    retentionCaseBatchSize?: number
    retentionProofMaxPages?: number
  },
) => Promise<void> {
  let detached = false
  let clockActive = false
  let restoreConfig: (() => void) | undefined
  afterEach(() => {
    if (clockActive) vi.useRealTimers()
    clockActive = false
    restoreConfig?.()
    restoreConfig = undefined
  })
  return async (now, options = {}) => {
    const caseRetentionMonths = options.caseRetentionMonths ?? 72
    const retentionCaseBatchSize = options.retentionCaseBatchSize ?? 25
    const retentionProofMaxPages = options.retentionProofMaxPages ?? 32
    if (
      !Number.isSafeInteger(caseRetentionMonths) ||
      caseRetentionMonths < 0 ||
      caseRetentionMonths > 1200
    )
      throw new RangeError('Invalid copyright retention test month window')
    if (
      !Number.isSafeInteger(retentionCaseBatchSize) ||
      retentionCaseBatchSize < 1 ||
      retentionCaseBatchSize > 100
    )
      throw new RangeError('Invalid copyright retention test case page cap')
    if (
      !Number.isSafeInteger(retentionProofMaxPages) ||
      retentionProofMaxPages < 1 ||
      retentionProofMaxPages > 64
    )
      throw new RangeError('Invalid copyright retention test work page budget')
    if (clockActive) vi.useRealTimers()
    clockActive = false
    restoreConfig?.()
    restoreConfig = undefined
    if (!detached) {
      await copyrightConfig.waitForInitialization()
      await copyrightConfig.close()
      detached = true
    }
    restoreConfig = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      evidenceRetentionDeletion: true,
      caseRetentionMonths,
      complaintWindowMonths: 6,
      retentionCaseBatchSize,
      retentionProofPageSize: 50,
      retentionProofMaxPages,
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    clockActive = true
  }
}

/** Execute at most this many one-page production case promises, stopping at a terminal result. */
export async function advanceCopyrightRetentionWorkPages(
  noticeId: string,
  pageCount = MAX_ERASURE_WORK_PAGES,
): Promise<Array<'erased' | 'ineligible' | 'progress'>> {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > MAX_ERASURE_WORK_PAGES)
    throw new RangeError('Copyright erasure work page count is outside its fixed test bound')
  const outcomes: Array<'erased' | 'ineligible' | 'progress'> = []
  for (let page = 0; page < pageCount; page++) {
    const outcome = await eraseCopyrightRetentionCase(noticeId)
    outcomes.push(outcome)
    // Neither terminal result can advance without a change to the case or retention clock.
    if (outcome !== 'progress') break
  }
  return outcomes
}

/** Hold the real final-user-purge lifetime lock around a chosen account purge instant. */
export async function beginCopyrightAccountPurge(
  accountId: string,
  purgedAt: Date,
): Promise<Awaited<ReturnType<typeof beginTransaction>>> {
  const transaction = await beginTransaction()
  try {
    await transaction(sql`/* lockCopyrightRetentionTestAccountPurge */
      SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
    await transaction(sql`/* completeCopyrightRetentionTestAccountPurge */
      UPDATE retained_user_identities SET purged_at = ${purgedAt}
      WHERE id = ${accountId}`)
    return transaction
  } catch (err) {
    await transaction.rollback()
    throw err
  }
}

/** Position an existing, real erasure continuation at one owned minimal-purge phase. */
export async function setCopyrightMinimalPurgePhaseForRetentionTest(
  noticeId: string,
  phaseIndex: number,
): Promise<void> {
  await write(sql`/* positionCopyrightMinimalPurgeRetentionFixture */
    UPDATE copyright_notice_minimal_purge_continuations
    SET phase_index = ${phaseIndex}
    WHERE copyright_notice_identity_id = ${noticeId}`)
}
