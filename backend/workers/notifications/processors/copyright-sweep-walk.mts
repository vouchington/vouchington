import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import type { CopyrightSweepIdPage } from '@services/copyright-notices'

/** What one copyright reconcile job accepted and every error it collected across its sweeps. */
export type CopyrightSweepTally = { enqueued: number; errors: unknown[] }

export type CopyrightSweepPageRequest = { after?: string; limit?: number }

export type CopyrightSweepWalkOptions = {
  after?: string
  skip?: boolean
  onMore?: (after: string) => void
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
  if (options.skip) return []
  const { batchSize, maxBatches } = getCopyrightSweepLimits()
  let cursor = options.after
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's items settle.
    const page = await searchPage({ ...(cursor ? { after: cursor } : {}), limit: batchSize })
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once handling before cursor advance.
    errors.push(...(await settlePage(page.results)))
    cursor = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
    if (!cursor) return errors
  }
  if (cursor) options.onMore?.(cursor)
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
 * Walks one sweep as a stage, enqueueing each page of at most 100 IDs together. Accepted jobs add to
 * `tally.enqueued`; a failed enqueue or page read is recorded without skipping the rest.
 */
export async function enqueueEveryCopyrightSweepPage(
  tally: CopyrightSweepTally,
  searchPage: (page: CopyrightSweepPageRequest) => Promise<CopyrightSweepIdPage>,
  enqueue: (id: string) => unknown,
  options: CopyrightSweepWalkOptions = {},
): Promise<void> {
  await runCopyrightSweepStage(tally, () =>
    walkCopyrightSweep(
      searchPage,
      async ids => {
        const outcomes = await Promise.allSettled(ids.map(id => enqueue(id)))
        tally.enqueued += outcomes.filter(outcome => outcome.status === 'fulfilled').length
        return outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : []))
      },
      options,
    ),
  )
}
