import type { CopyrightSweepIdPage } from '@services/copyright-notices'

export type CopyrightSweepPageRequest = { after?: string; limit?: number }

/** The item errors and enqueue count of one settled page. */
export type CopyrightSweepSettled = { errors: readonly unknown[]; enqueued: number }

/** What a walk settled, plus the cursor where its next run resumes when pages remain. */
export type CopyrightSweepWalkResult = CopyrightSweepSettled & { after?: string }

export type CopyrightSweepWalkOptions = {
  after?: string
  limits: { batchSize: number; maxBatches: number }
}

/**
 * Settles each page before advancing past it, for at most `limits.maxBatches` pages. Returns the
 * item errors and the cursor where an unfinished walk resumes; a failed page read rejects.
 */
export async function walkCopyrightSweep<TPage extends CopyrightSweepIdPage>(
  searchPage: (page: CopyrightSweepPageRequest) => Promise<TPage>,
  settlePage: (ids: readonly string[], page: TPage) => Promise<CopyrightSweepSettled>,
  options: CopyrightSweepWalkOptions,
): Promise<CopyrightSweepWalkResult> {
  const walkFrom = async (
    cursor: string | undefined,
    pagesLeft: number,
    carried: CopyrightSweepSettled,
  ): Promise<CopyrightSweepWalkResult> => {
    if (pagesLeft === 0) return { ...carried, after: cursor }
    const page = await searchPage({
      ...(cursor ? { after: cursor } : {}),
      limit: options.limits.batchSize,
    })
    const settled = await settlePage(page.results, page)
    const total = {
      errors: [...carried.errors, ...settled.errors],
      enqueued: carried.enqueued + settled.enqueued,
    }
    const next = page.page_info.has_next_page ? (page.page_info.end_cursor ?? undefined) : undefined
    return next ? walkFrom(next, pagesLeft - 1, total) : total
  }
  return walkFrom(options.after, options.limits.maxBatches, { errors: [], enqueued: 0 })
}

/** Settles each id in turn, collecting its failure so one item never stops its siblings. */
export async function settleCopyrightSweepSequentially(
  ids: readonly string[],
  settle: (id: string) => Promise<unknown>,
): Promise<CopyrightSweepSettled> {
  const settleFrom = async (index: number, errors: readonly unknown[]): Promise<unknown[]> => {
    if (index >= ids.length) return [...errors]
    const failure = await settle(ids[index]!)
      .then(() => [])
      .catch((err: unknown) => [err])
    return settleFrom(index + 1, [...errors, ...failure])
  }
  return { errors: await settleFrom(0, []), enqueued: 0 }
}

/** Settles a page by adding all its ids in one bulk call; a failed add is reported, not thrown. */
export function settleCopyrightSweepByBulkEnqueue(
  enqueueBulk: (ids: string[]) => unknown,
): (ids: readonly string[]) => Promise<CopyrightSweepSettled> {
  return async ids => {
    if (ids.length === 0) return { errors: [], enqueued: 0 }
    try {
      await enqueueBulk([...ids])
    } catch (err) {
      return { errors: [err], enqueued: 0 }
    }
    return { errors: [], enqueued: ids.length }
  }
}
