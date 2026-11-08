/** Runs capped pages; a short page ends the run and a full final page reports continuation. */
export async function runBoundedPages(
  limits: { batchSize: number; maxBatches: number },
  processPage: (batchSize: number) => Promise<number>,
): Promise<{ processed: number; hasMore: boolean }> {
  for (const name of ['batchSize', 'maxBatches'] as const)
    if (!Number.isInteger(limits[name]) || limits[name] <= 0)
      throw new Error(`${name} must be a positive integer`)
  let processed = 0
  let hasMore = false
  for (let page = 0; page < limits.maxBatches; page++) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded page decides whether another is needed
    const count = await processPage(limits.batchSize)
    processed += count
    hasMore = count === limits.batchSize
    if (!hasMore) break
  }
  return { processed, hasMore }
}
