import { vi } from 'vitest'
import * as crawlerEnqueues from '../queues/crawler/enqueues.mts'
import { crawlUrls } from '../queues/crawler/queues.mts'

function hasStringUrlId(value: unknown): value is { url_id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url_id' in value &&
    typeof value.url_id === 'string'
  )
}

export function createEntityRelationCrawlObserver(ownedObjectIds: ReadonlySet<string>) {
  const enqueueSpy = vi.spyOn(crawlerEnqueues, 'enqueueBulkCrawlUrls')
  const ownedPromises = () =>
    enqueueSpy.mock.results.flatMap((result, index) =>
      result.type === 'return' &&
      enqueueSpy.mock.calls[index]?.[0].some(entry => ownedObjectIds.has(entry.urlId))
        ? [result.value]
        : [],
    )

  async function removeOwnedJob(jobId: string): Promise<void> {
    const persistedJob = await crawlUrls.getJob(jobId)
    if (!persistedJob) return
    if (!hasStringUrlId(persistedJob.data) || !ownedObjectIds.has(persistedJob.data.url_id)) {
      throw new Error('Observed crawl job no longer belongs to this test')
    }
    await persistedJob.remove()
  }

  return {
    enqueueSpy,
    ownedPromises,
    async [Symbol.asyncDispose]() {
      try {
        const results = await Promise.allSettled(ownedPromises())
        const failures: unknown[] = results.flatMap(result =>
          result.status === 'rejected' ? [result.reason] : [],
        )
        const removals = results.flatMap(result =>
          result.status === 'fulfilled'
            ? result.value.flatMap(job =>
                job && hasStringUrlId(job.data) && ownedObjectIds.has(job.data.url_id)
                  ? [removeOwnedJob(job.id)]
                  : [],
              )
            : [],
        )
        const removalResults = await Promise.allSettled(removals)
        failures.push(
          ...removalResults.flatMap(result =>
            result.status === 'rejected' ? [result.reason] : [],
          ),
        )
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Failed to drain owned entity relation crawl jobs')
        }
      } finally {
        enqueueSpy.mockRestore()
      }
    },
  }
}
