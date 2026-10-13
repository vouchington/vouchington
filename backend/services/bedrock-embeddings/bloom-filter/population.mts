import { getEmbeddingBloomPopulationBatchSize } from '../batch/config.mts'
import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { bloomValkeyClient } from '@data-stores/valkey'
import { EMBEDDINGS_TABLE } from '../config.mts'
import { EMBEDDING_BLOOM_READY_KEY, embeddingBloomFilter } from './bloom-filter.mts'

type ContentRow = { content_sha256: string }

async function* hashBatchesFromDb(): AsyncGenerator<string[]> {
  const BATCH_SIZE = getEmbeddingBloomPopulationBatchSize()
  const batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<ContentRow>(
    `/* hashBatchesFromDb */ SELECT encode(content_sha256, 'hex') as content_sha256 FROM ${EMBEDDINGS_TABLE}`,
    { batchSize: BATCH_SIZE },
  )) {
    batch.push(row.content_sha256)
    if (batch.length >= BATCH_SIZE) {
      yield batch.splice(0, BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
  }
}

/**
 * Clears and rebuilds the embedding bloom filter from scratch.
 *
 * Zero-downtime: builds under a separate key then atomically renames to live key.
 * Streams embeddings from DB to avoid loading entire dataset into memory.
 * Rebuilds at 2× current row count per AGENTS.md to reduce immediate expansion chaining.
 */
export async function rebuildEmbeddingBloomFilter(): Promise<void> {
  const { rows } = await read(
    `/* rebuildEmbeddingBloomFilter */ SELECT COUNT(*)::int AS count FROM ${EMBEDDINGS_TABLE}`,
    [],
  )
  const count: number = rows[0]?.count ?? 0
  const capacity = Math.max(embeddingBloomFilter.getConfig().capacity, 2 * count)
  await embeddingBloomFilter.rebuildFromStream(hashBatchesFromDb(), capacity)
  await bloomValkeyClient.set(EMBEDDING_BLOOM_READY_KEY, '1')
}
