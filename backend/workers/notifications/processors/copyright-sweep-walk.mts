import type { CopyrightSweepIdPage } from '@services/copyright-notices'

/** What one copyright reconcile job accepted and every error it collected across its sweeps. */
export type CopyrightSweepTally = { enqueued: number; errors: unknown[] }

export type CopyrightSweepPageRequest = { after?: string }

/** Runs one reconcile stage without rejecting: its item errors, or its own failure, go to the tally. */
export async function runCopyrightSweepStage(
  tally: CopyrightSweepTally,
  stage: () => Promise<unknown[]>,
): Promise<void> {
  try {
    tally.errors.push(...(await stage()))
  } catch (error) {
    tally.errors.push(error)
  }
}

/** Settles each page before advancing past it; returns the item errors. */
export async function walkCopyrightSweep(
  searchPage: (page: CopyrightSweepPageRequest) => Promise<CopyrightSweepIdPage>,
  settlePage: (ids: readonly string[]) => Promise<unknown[]>,
): Promise<unknown[]> {
  const errors: unknown[] = []
  let cursor: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- advance only after the page's items settle.
    const page = await searchPage(cursor ? { after: cursor } : {})
    // oxlint-disable-next-line no-await-in-loop -- preserves at-least-once handling before cursor advance.
    errors.push(...(await settlePage(page.results)))
    cursor = page.page_info.end_cursor ?? undefined
  } while (cursor)
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
    } catch (error) {
      errors.push(error)
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
): Promise<void> {
  await runCopyrightSweepStage(tally, () =>
    walkCopyrightSweep(searchPage, async ids => {
      const outcomes = await Promise.allSettled(ids.map(id => enqueue(id)))
      tally.enqueued += outcomes.filter(outcome => outcome.status === 'fulfilled').length
      return outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : []))
    }),
  )
}
