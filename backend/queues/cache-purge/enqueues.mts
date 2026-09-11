import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { MAX_TAGS_PER_REQUEST } from '@ts-shared/cache'
import type { JobOptions } from 'glide-mq'
import { DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { cachePurge } from './queues.mts'
import type { CachePurgeJobs } from './types.mts'

const JOB_NAME: CachePurgeJobs = 'processPurgeCacheTag'

// Splits `tags` into `<= MAX_TAGS_PER_REQUEST`-sized groups so each enqueued job maps to a single
// outbound purge HTTP call (see purge.mts's `purgeCacheTags`, which already accepts an array and
// truncates to this same cap). No shared chunk utility exists in backend/modules or ts-shared as
// of this writing (only private duplicates in a few unrelated services), so this stays local.
function chunkTags(tags: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < tags.length; index += size) {
    chunks.push(tags.slice(index, index + size))
  }
  return chunks
}

const enqueue = createBulkEnqueueFunction<string[], { tags: string[] }, CachePurgeJobs>({
  queue: cachePurge,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  buildJob: chunk => ({
    data: { tags: chunk },
    opts: {
      // Dedup key is derived from the sorted chunk content, not a single tag: two enqueue calls
      // only collapse into one job when they produce the exact same chunk. This is a narrower
      // dedup than the old per-tag debounce (an overlapping-but-not-identical chunk no longer
      // collapses), but chunking already collapses what used to be N one-tag jobs/HTTP calls into
      // one job per <=30 tags, so total purge-call volume still drops sharply in the common case
      // (e.g. one post edit producing 3 tags: 3 jobs/3 calls before, 1 job/1 call now). Worst case
      // of the narrower dedup is a few extra purge calls, never fewer purges than needed.
      deduplication: {
        id: `${JOB_NAME}__${chunk.toSorted().join(',')}`,
        mode: 'debounce' as const,
        ttl: DEDUPLICATION_TTL_MS,
      },
    },
  }),
})

// Fire-and-forget: enqueue failures are reported via onError inside createBulkEnqueueFunction.
// Callers must invoke this with `void`, never `await`, from request/mutation paths.
export function enqueueBulkPurgeCacheTags(tags: string[], priority?: number): EnqueueReturnType {
  const chunks = chunkTags(tags, MAX_TAGS_PER_REQUEST)
  return enqueue(chunks, { priority: priority ?? PRIORITY_DEFAULT } satisfies Partial<JobOptions>)
}
