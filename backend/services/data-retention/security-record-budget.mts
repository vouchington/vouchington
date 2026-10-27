type Page = { deleted: number; hasMore: boolean }

/**
 * Spend at most `budget` pages round-robin over `sources`, starting at `start`. A source leaves
 * the rotation once a page reports no more work; `hasMore` means the budget ran out first.
 */
export async function spendSecurityPageBudget<Source>(
  sources: readonly Source[],
  start: number,
  budget: number,
  cleanupPage: (source: Source) => Promise<Page>,
): Promise<Page> {
  const pending = sources.map((_, offset) => sources[(start + offset) % sources.length]!)
  let deleted = 0
  let cursor = 0
  /* oxlint-disable no-await-in-loop -- each page commits its own cursor and bounded deletion. */
  for (let spent = 0; spent < budget && pending.length > 0; spent++) {
    const source = pending[cursor]!
    const page = await cleanupPage(source)    deleted += page.deleted
    if (page.hasMore) cursor++
    else pending.splice(cursor, 1)
    if (cursor >= pending.length) cursor = 0
  }
  /* oxlint-enable no-await-in-loop */
  return { deleted, hasMore: pending.length > 0 }
}
