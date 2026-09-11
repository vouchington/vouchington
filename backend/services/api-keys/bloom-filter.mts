import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'

const BATCH_SIZE = 1000

const apiKeyBloomFilter = new ValkeyBloomFilter({
  name: 'api-keys',
  capacity: 100_000,
  errorRate: 0.001,
  batchSize: BATCH_SIZE,
  client: bloomValkeyClient,
})

// Marker key set after each successful rebuild — used by warmup as a reliable
// readiness check instead of a bloom membership probe (which can false-positive).
const BLOOM_READY_KEY = 'bloom-filter:api-keys:ready'

/**
 * Check if a key hash might be in the API key bloom filter.
 * Returns `true` (maybe present), `false` (definitely not present),
 * or `null` (filter not ready or connection error — caller should fall back to DB).
 */
export async function checkApiKeyBloomFilter(keyHash: Buffer): Promise<boolean | null> {
  try {
    return await apiKeyBloomFilter.existsIfReady(BLOOM_READY_KEY, keyHash.toString('hex'))
  } catch {
    return null
  }
}

/**
 * Add a key hash to the bloom filter.
 * On failure, if the filter was previously marked ready, invalidates the readiness marker
 * and enqueues a rebuild — callers fall back to DB until completeness is restored.
 * Skips invalidation if the filter was never ready (e.g. first warmup not yet complete).
 */
export async function addKeyHashToBloomFilter(keyHash: Buffer): Promise<void> {
  try {
    await apiKeyBloomFilter.addOrThrow([keyHash.toString('hex')])
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    try {
      const removed = await bloomValkeyClient.unlink([BLOOM_READY_KEY])
      if (Number(removed) > 0) {
        /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
        void enqueueRebuildBloomFilter({ filter: 'api-keys' })
      }
    } catch (unlinkErr) {
      onError(unlinkErr instanceof Error ? unlinkErr : new Error(String(unlinkErr)))
    }
  }
}

async function* apiKeyHashBatchesFromDb(): AsyncGenerator<string[]> {
  const batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<{ key_hash_hex: string }>(
    sql`/* apiKeyHashBatchesFromDb */
      SELECT encode(key_hash, 'hex') AS key_hash_hex
      FROM api_keys
      WHERE revoked_at IS NULL
    `,
    { batchSize: BATCH_SIZE },
  )) {
    batch.push(row.key_hash_hex)
    if (batch.length >= BATCH_SIZE) {
      yield batch.splice(0, BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
  }
}

/**
 * Rebuild the API key bloom filter from scratch using all active API key hashes.
 * Uses atomic RENAME for zero-downtime updates.
 * Sets BLOOM_READY_KEY after the atomic rename so warmup can safely detect readiness.
 */
export async function rebuildApiKeyBloomFilter(): Promise<void> {
  await apiKeyBloomFilter.rebuildFromStream(apiKeyHashBatchesFromDb())
  await bloomValkeyClient.set(BLOOM_READY_KEY, '1')
}

/**
 * Warm up the API key bloom filter on worker startup.
 * Checks the rebuild-complete marker (set by rebuildApiKeyBloomFilter after atomic rename)
 * rather than a bloom membership probe, avoiding false-positive misdetection.
 */
export async function warmUpApiKeyBloomFilter(): Promise<void> {
  if (await apiKeyBloomFilter.isReady(BLOOM_READY_KEY)) return

  /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
  void enqueueRebuildBloomFilter({ filter: 'api-keys' })
}

/**
 * Delete the API key bloom filter, any building key, and the ready marker.
 */
export async function deleteApiKeyBloomFilter(): Promise<void> {
  await apiKeyBloomFilter.deleteWithAdditionalKeys([BLOOM_READY_KEY])
}
