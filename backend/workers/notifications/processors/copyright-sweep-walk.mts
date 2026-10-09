import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import type { CopyrightSweepIdPage } from '@services/copyright-notices'

/** What one copyright reconcile job accepted and every error it collected across its sweeps. */
export type CopyrightSweepTally = { enqueued: number; errors: unknown[] }

export type CopyrightSweepPageRequest = { after?: string; limit?: number }

export type CopyrightSweepWalkOptions = {
  after?: string
  singlePage?: boolean
  onMore?: (after?: string) => void
  onPageReadError?: () => void
  budget?: ReturnType<typeof createCopyrightSweepBudget>
}

export function createCopyrightSweepBudget() {
  const { batchSize, maxBatches } = getCopyrightSweepLimits()
  return { batchSize, remainingPages: maxBatches }
}

/** Runs one reconcile stage without rejecting: its item errors, or its own failure, go to the tally. */
export async function runCopyrightSweepStage(
  tally: CopyrightSweepTally,
  stage: () => Promise<unknown[]>,
): Promise<void> {
  try {
    tally.errors.push(...(await stage()))
  } catch (err) {
    tally.errors.push(err)
  }
}

/** Settles each page before advancing past it; returns the item errors. */
export async function walkCopyrightSweep(
  searchPage: (page: CopyrightSweepPageRequest) => Promise<CopyrightSweepIdPage>,
  settlePage: (ids: readonly string[]) => Promise<unknown[]>,
  options: CopyrightSweepWalkOptions = {},
): Promise<unknown[]> {
  const errors: unknown[] = []
  const budget = options.budget ?? createCopyrightSweepBudget()
  let cursor = options.after
  while (budget.remainingPages > 0) {
    budget.remainingPages--
    let page: CopyrightSweepIdPage
    try {
      // oxlint-disable-next-line no-await-in-loop -- one selected stage consumes one shared page allowance.
      page = await searchPage({ ...(cursor ? { after: cursor } : {}), limit: budget.batchSize })
    } catch (err) {
      options.onMore?.(cursor)
      options.onPageReadError?.()
      throw err
    }
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once handling before cursor advance.
    errors.push(...(await settlePage(page.results)))
    cursor = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
    if (!cursor) return errors
    if (options.singlePage) break
  }
  options.onMore?.(cursor)
  return errors
}

export async function settleCopyrightSweepSequentially(
  ids: readonly string[],
  settle: (id: string) => Promise<unknown>,
): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const id of ids) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each item takes its own row and advisory locks.
      await settle(id)
    } catch (err) {
      errors.push(err)
    }
  }
  return errors
}

/**
 * Walks one sweep as a stage, enqueueing each page of at most 100 IDs in one bulk add. Accepted
 * pages add to `tally.enqueued`; a failed bulk add or page read is recorded without skipping the
 * rest.
 */
export async function enqueueBulkCopyrightSweepPages(
  tally: CopyrightSweepTally,
  searchPage: (page: CopyrightSweepPageRequest) => Promise<CopyrightSweepIdPage>,
  enqueueBulk: (ids: string[]) => unknown,
  options: CopyrightSweepWalkOptions = {},
): Promise<void> {
  await runCopyrightSweepStage(tally, () =>
    walkCopyrightSweep(
      searchPage,
      async ids => {
        if (ids.length === 0) return []
        try {
          await enqueueBulk([...ids])
        } catch (err) {
          return [err]
        }
        tally.enqueued += ids.length
        return []
      },
      options,
    ),
  )
}
