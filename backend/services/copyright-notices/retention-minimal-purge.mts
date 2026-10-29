import { isCopyrightMinimalPurgeCursorBusy } from './retention-minimal-purge-locks.mts'
import { purgeCopyrightMinimalRecordPage } from './retention-minimal-purge-case.mts'
import {
  COPYRIGHT_MINIMAL_PURGE_MAX_PHYSICAL_ROWS,
  type CopyrightMinimalPurgePageOutcome,
  type CopyrightMinimalPurgePageResult,
} from './retention-minimal-purge-types.mts'
import {
  isLateCopyrightChild,
  restartCopyrightMinimalPurgeAfterLateChild,
} from './retention-minimal-purge-late-child.mts'

const MAX_PAGE_SIZE = 50
const MAX_PAGE_BATCHES = 128
export type CopyrightMinimalPurgeOutcome = CopyrightMinimalPurgePageOutcome | 'more'

type PurgeOptions = {
  now: Date
  cutoff: Date
  pageSize?: number
  maxBatches?: number
  maxPhysicalRows?: number
}

/** Existing public outcome; all mutation work flows through the one budgeted implementation. */
export async function purgeCopyrightMinimalRecord(
  noticeId: string,
  options: PurgeOptions,
): Promise<CopyrightMinimalPurgeOutcome> {
  return (await purgeCopyrightMinimalRecordWithWork(noticeId, options)).outcome
}

/** Raw page and batch allowances are independent of the hard per-run physical DELETE ceiling. */
export async function purgeCopyrightMinimalRecordWithWork(
  noticeId: string,
  options: PurgeOptions,
): Promise<{ outcome: CopyrightMinimalPurgeOutcome; physicalRows: number }> {
  const maxPhysicalRows = options.maxPhysicalRows ?? COPYRIGHT_MINIMAL_PURGE_MAX_PHYSICAL_ROWS
  if (
    !Number.isInteger(maxPhysicalRows) ||
    maxPhysicalRows < 1 ||
    maxPhysicalRows > COPYRIGHT_MINIMAL_PURGE_MAX_PHYSICAL_ROWS
  )
    throw new RangeError(
      'Copyright minimal purge requires a physical budget within one hundred rows',
    )
  let physicalRows = 0
  const pageSize = options.pageSize ?? MAX_PAGE_SIZE
  const maxBatches = options.maxBatches ?? 16
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE ||
    !Number.isInteger(maxBatches) ||
    maxBatches < 1 ||
    maxBatches > MAX_PAGE_BATCHES
  )
    throw new RangeError('Copyright minimal purge requires finite positive page limits')
  // oxlint-disable no-await-in-loop -- each page commits before the next hold recheck.
  for (let batch = 0; batch < maxBatches; batch++) {
    let page: CopyrightMinimalPurgePageResult
    try {
      // no-mistakes-disable-next-line query-reached-per-item: maxBatches and pageSize are validated hard caps; each page needs its own hold recheck and commit.
      page = await purgeCopyrightMinimalRecordPage(noticeId, {
        now: options.now,
        cutoff: options.cutoff,
        pageSize,
        remainingPhysicalRows: maxPhysicalRows - physicalRows,
      })
    } catch (err) {
      if (isCopyrightMinimalPurgeCursorBusy(err)) return { outcome: 'more', physicalRows }
      if (!isLateCopyrightChild(err)) throw err
      // no-mistakes-disable-next-line query-reached-per-item: one exact late-child rollback resets the durable phase and returns without an internal retry.
      await restartCopyrightMinimalPurgeAfterLateChild(noticeId)
      return { outcome: 'more', physicalRows }
    }
    physicalRows += page.physicalRows
    if (physicalRows > maxPhysicalRows)
      throw new Error('Copyright purge exceeded its physical budget')
    if (page.outcome === 'stale') return { outcome: 'more', physicalRows }
    if (page.outcome !== 'progress') return { outcome: page.outcome, physicalRows }
    if (
      physicalRows === maxPhysicalRows ||
      (page.requiredRows !== undefined && page.requiredRows > maxPhysicalRows - physicalRows)
    )
      return { outcome: 'more', physicalRows }
  }
  // oxlint-enable no-await-in-loop
  return { outcome: 'more', physicalRows }
}
