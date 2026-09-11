import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import { bloomValkeyClient } from '@data-stores/valkey'
import { EMBEDDINGS_TABLE } from '../config.mts'
import { EMBEDDING_BLOOM_READY_KEY, embeddingBloomFilter } from './bloom-filter.mts'

type ContentRow = { content_sha256: string }

const BATCH_SIZE = 1000

async function* hashBatchesFromDb(): AsyncGenerator<string[]> {
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
 * Populates the embedding bloom filter from all existing embeddings in the database.
 *
 * Streams embeddings using cursor-based pagination to avoid loading entire dataset
 * into memory. Called via job queue on startup or manually via admin endpoint.
 *
 * NOTE: ensureExists() must be called before addStream(). Post-#1955, bloom-filter-add.lua
 * no-ops when the live key does not exist, so ensureExists() here is load-bearing — it
 * reserves the filter with the correct capacity before addStream() writes any items.
 */
export async function populateEmbeddingBloomFilterFromDatabase(): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await embeddingBloomFilter.ensureExists()
  await embeddingBloomFilter.addStream(hashBatchesFromDb())
  await bloomValkeyClient.set(EMBEDDING_BLOOM_READY_KEY, '1')
}

/**
 * Clears and rebuilds the embedding bloom filter from scratch.
 *
 * Zero-downtime: builds under a separate key then atomically renames to live key.
 * Streams embeddings from DB to avoid loading entire dataset into memory.
 * Rebuilds at 2× current row count per CLAUDE.md to reduce immediate expansion chaining.
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
