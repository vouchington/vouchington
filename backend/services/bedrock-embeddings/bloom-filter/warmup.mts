import { read } from '@data-stores/psql'
import { EMBEDDINGS_TABLE } from '../config.mts'
import { EMBEDDING_BLOOM_READY_KEY, embeddingBloomFilter } from './bloom-filter.mts'
import { enqueuePopulateBloomFilter } from '@queues/bloom-filters/enqueues'

/**
 * Check if bloom filter is already populated; if not, enqueue population job
 *
 * Called during worker startup to ensure bloom filter is available for fast
 * embedding lookups. Uses a quick check to avoid unnecessary population if
 * filter already has data.
 *
 * @returns Resolves when check/enqueue is complete
 */
export async function warmUpEmbeddingBloomFilter(): Promise<void> {
  // Quick check: does the DB have any embeddings?
  const { rows: countRows } = await read(
    `/* warmUpEmbeddingBloomFilter */ SELECT COUNT(*)::int AS count FROM ${EMBEDDINGS_TABLE}`,
    [],
  )
  const totalEmbeddings: number = countRows[0]?.count ?? 0

  if (totalEmbeddings === 0) {
    // No embeddings in DB, nothing to populate
    return
  }

  if (await embeddingBloomFilter.isReady(EMBEDDING_BLOOM_READY_KEY)) return

  // Bloom filter is empty, enqueue background population job
  await enqueuePopulateBloomFilter()
}
