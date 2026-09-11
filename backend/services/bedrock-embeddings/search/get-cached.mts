import { createHash } from 'node:crypto'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { EMBEDDINGS_TABLE } from '../config.mts'
import { createBedrockEmbedding } from '../single/request.mts'

const ONE_DAY_SECONDS = 60 * 60 * 24
const SEARCH_EMBEDDING_TIMEOUT_MS = 6_000

const cache = new ValkeyCache<string>({
  prefix: `${EMBEDDINGS_TABLE}_search_embeddings`,
  ttlSeconds: ONE_DAY_SECONDS,
  mode: 'json',
  // Disable stale-while-revalidate: re-fetching has Bedrock cost and the embedding
  // is deterministic for a normalized query, so SWR provides no freshness benefit.
  staleRefresh: false,
  // Hash the normalized query into the cache key while passing the readable string
  // into the inner fetch function.
  keySerializer: (normalizedQuery: string) =>
    createHash('sha256').update(normalizedQuery).digest('hex'),
})

async function directFetchEmbedding(normalizedQuery: string): Promise<{ embedding: number[] }> {
  const result = await createBedrockEmbedding(normalizedQuery, {
    entityType: 'search',
    abortSignal: AbortSignal.timeout(SEARCH_EMBEDDING_TIMEOUT_MS),
  })
  return { embedding: result.embedding }
}

async function fetchEmbedding(normalizedQuery: string): Promise<number[]> {
  // The AWS client selects its configured API transport; worker callers remain direct.
  const direct = await directFetchEmbedding(normalizedQuery)
  return direct.embedding
}

const fetchEmbeddingCached = cache.cacheGetByAny(fetchEmbedding)

export async function getCachedSearchEmbedding(query: string): Promise<number[]> {
  const normalized = normalizeSearchEmbeddingQuery(query)
  const result = await fetchEmbeddingCached(normalized)
  if (!result) throw new Error(`unexpected null embedding for query: ${query}`)
  return result
}

export function normalizeSearchEmbeddingQuery(query: string): string {
  return query.trim().replaceAll(/\s+/g, ' ').toLowerCase()
}
