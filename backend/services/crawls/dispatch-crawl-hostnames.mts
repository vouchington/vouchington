import { enqueueBulkCrawlHostname } from '@queues/crawl-hostnames/enqueues'
import type { CrawlHostnameDispatchCursor } from '@queues/crawl-hostnames/types'
import { getCrawlHostnameDispatchLimits } from './work-limits.mts'
import {
  getCrawlHostnameCandidates,
  getNextCrawlHostnameBucket,
} from './hostname-dispatch-candidates.mts'

/** Hourly bounded sweep of never-swept and overdue hostnames, resumed from the retained job. */
export const dispatchCrawlHostnames = async (
  saved?: CrawlHostnameDispatchCursor,
  saveProgress?: (cursor: CrawlHostnameDispatchCursor) => Promise<void>,
) => {
  const limits = getCrawlHostnameDispatchLimits()
  let cursor: CrawlHostnameDispatchCursor = saved ?? {
    sweepStartedAt: new Date().toISOString(),
    rangeLimit: limits.batchSize,
    afterBucketDays: -32769,
  }
  await saveProgress?.(cursor)
  let count = 0
  let probes = 0
  while (count + probes < limits.maxRows) {
    // oxlint-disable-next-line no-await-in-loop -- each page advances the retained index position after its enqueue succeeds
    const page = await dispatchHostnamePage(
      cursor,
      Math.min(limits.batchSize, limits.maxRows - count - probes),
      saveProgress,
    )
    cursor = page.cursor
    count += page.count
    probes += page.probes
    if (page.complete) return { count, hasMore: false }
  }
  return { count, hasMore: true }
}

async function dispatchHostnamePage(
  saved: CrawlHostnameDispatchCursor,
  remaining: number,
  saveProgress?: (cursor: CrawlHostnameDispatchCursor) => Promise<void>,
) {
  let cursor = saved
  let probes = 0
  let pageRemaining = remaining
  if (cursor.bucketDays === undefined) {
    const bucketDays = await getNextCrawlHostnameBucket(cursor.afterBucketDays)
    probes = 1
    if (bucketDays === undefined) return { cursor, count: 0, probes, complete: true }
    cursor = { ...cursor, bucketDays }
    await saveProgress?.(cursor)
    pageRemaining--
    if (pageRemaining === 0) return { cursor, count: 0, probes, complete: false }
  }
  const rows = await getCrawlHostnameCandidates(
    { ...cursor, bucketDays: cursor.bucketDays! },
    pageRemaining,
  )
  if (!rows.length) {
    cursor = {
      sweepStartedAt: cursor.sweepStartedAt,
      rangeLimit: cursor.rangeLimit,
      afterBucketDays: cursor.bucketDays!,
    }
  } else {
    await enqueueBulkCrawlHostname(rows.map(row => row.id))
    const next = { ...cursor }
    for (const row of rows) {
      next.rangeRows = next.range === row.range ? (next.rangeRows ?? 0) + 1 : 1
      next.range = row.range
      next.afterId = row.id
      if (row.crawl_swept_at) next.afterSweptAt = row.crawl_swept_at.toISOString()
    }
    cursor = next
  }
  await saveProgress?.(cursor)
  return { cursor, count: rows.length, probes, complete: false }
}
