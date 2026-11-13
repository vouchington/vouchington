import {
  awaitReportedEnqueueAdmission,
  createBackgroundBulkEnqueue,
  createBackgroundEnqueue,
} from '@queues/background/enqueues'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { MAX_TAGS_PER_REQUEST } from '@ts-shared/cache'
import { LEGAL_REMOVAL_TAG } from '@ts-shared/cache/cache-tags'
import { DEDUPLICATION_TAG_SEPARATOR } from './config.mts'

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
    // Ordinary invalidations coalesce identical sorted chunks while a purge is pending or active.
    // Legal removals use a distinct per-intent identity below so one action cannot absorb another.
    deduplication: {
      id: `${CACHE_PURGE_TAGS_JOB.name}__${chunk.toSorted().join(DEDUPLICATION_TAG_SEPARATOR)}`,
      mode: 'debounce' as const,
    },
  },
}))

const enqueueLegalRemoval = createBackgroundEnqueue(CACHE_PURGE_TAGS_JOB)

/** A separate identity per legal action preserves a later removal while another purge is active. */
export async function enqueueLegalRemovalPurgeCacheTag(intentId: string): Promise<void> {
  await enqueueLegalRemoval(
    { tags: [LEGAL_REMOVAL_TAG] },
    {
      deduplication: { id: `cache-purge:legal-removal:${intentId}`, mode: 'simple' },
    },
  )
}

// Failures are reported by createBulkEnqueueFunction. Post-commit completion awaits this
// admission promise; it does not imply that purge workers have finished.
export function enqueueBulkPurgeCacheTags(tags: string[], priority?: number): Promise<unknown> {
  const chunks = chunkTags(tags, MAX_TAGS_PER_REQUEST)
  return enqueue(chunks, priority === undefined ? {} : { priority })
}

export function enqueueBulkPurgeCacheTagsBestEffort(tags: string[]): Promise<void> {
  return awaitReportedEnqueueAdmission(() => {
    return enqueueBulkPurgeCacheTags(tags)
  })
}
