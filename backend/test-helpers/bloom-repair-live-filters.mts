import { ValkeyBloomFilter, bloomValkeyClient } from '@data-stores/valkey'
import { entityCacheBloomFilters } from '../services/entity-cache/bloom-filter-instances.mts'
import { embeddingBloomFilter } from '../services/bedrock-embeddings/bloom-filter/bloom-filter.mts'

/** Reserve absent live filters without rebuilding them or changing completeness markers. */
export async function ensureTestReconciliationBloomFilters() {
  const apiKeys = new ValkeyBloomFilter({
    name: 'api-keys',
    capacity: 100_000,
    errorRate: 0.001,
    client: bloomValkeyClient,
  })
  const urls = new ValkeyBloomFilter({
    name: 'url-blocklist',
    capacity: 5_000_000,
    errorRate: 0.01,
    client: bloomValkeyClient,
  })
  const emails = new ValkeyBloomFilter({
    name: 'email-blocklist',
    capacity: 500_000,
    errorRate: 0.01,
    client: bloomValkeyClient,
  })
  const filters = {
    ...entityCacheBloomFilters,
    apiKeys,
    urls,
    emails,
    embedding: embeddingBloomFilter,
  }
  for (const filter of Object.values(filters)) await filter.ensureExists()
  return filters
}
