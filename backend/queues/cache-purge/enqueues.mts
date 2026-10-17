import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { MAX_TAGS_PER_REQUEST } from '@ts-shared/cache'
import { DEDUPLICATION_TTL_MS } from './config.mts'

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

const enqueue = createBackgroundBulkEnqueue(CACHE_PURGE_TAGS_JOB, (chunk: string[]) => ({
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
      id: `${CACHE_PURGE_TAGS_JOB.name}__${chunk.toSorted().join(',')}`,
      mode: 'debounce' as const,
      ttl: DEDUPLICATION_TTL_MS,
    },
  },
}))

// Failures are reported by createBulkEnqueueFunction. Post-commit completion awaits this
// admission promise; it does not imply that purge workers have finished.
export function enqueueBulkPurgeCacheTags(tags: string[], priority?: number): EnqueueReturnType {
  const chunks = chunkTags(tags, MAX_TAGS_PER_REQUEST)
  return enqueue(chunks, priority === undefined ? {} : { priority })
}
