import onError from '@modules/on-error'
import { createHash } from 'node:crypto'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { EMBEDDINGS_TABLE } from '../config.mts'
import { createEmbedding } from '../single/request.mts'
import { requireDenseEmbedding } from '../single/require-dense-embedding.mts'

const ONE_DAY_SECONDS = 60 * 60 * 24
const SEARCH_EMBEDDING_TIMEOUT_MS = 6_000

const cache = new ValkeyCache({
  prefix: `${EMBEDDINGS_TABLE}_search_embeddings`,
  ttlSeconds: ONE_DAY_SECONDS,
  mode: 'json',
  // Disable stale-while-revalidate: re-fetching has provider cost and the embedding
  // is deterministic for a normalized query, so SWR provides no freshness benefit.
  staleRefresh: false,
  // Hash the normalized query into the cache key while passing the readable string
  // into the inner fetch function.
  keySerializer: (normalizedQuery: string) =>
    createHash('sha256').update(normalizedQuery).digest('hex'),
})

async function directFetchEmbedding(normalizedQuery: string): Promise<{ embedding: number[] }> {
  const result = await createEmbedding(normalizedQuery, {
    entityType: 'search',
    abortSignal: AbortSignal.timeout(SEARCH_EMBEDDING_TIMEOUT_MS),
  })
  return { embedding: requireDenseEmbedding(result.embedding) }
}

async function fetchEmbedding(normalizedQuery: string): Promise<number[]> {
  // The Vertex request selects its configured provider transport.
  const direct = await directFetchEmbedding(normalizedQuery)
  return direct.embedding
}

export async function getCachedSearchEmbedding(query: string): Promise<number[]> {
  const normalized = normalizeSearchEmbeddingQuery(query)
  const cached = await cache.get(normalized).catch(onError)
  if (cached != null) return requireDenseEmbedding(cached)
  const result = await fetchEmbedding(normalized)
  // Publish the cached vector before returning so the next request avoids a paid model call.
  await cache.set(normalized, result).catch(onError)
  return result
}

export function normalizeSearchEmbeddingQuery(query: string): string {
  return query.trim().replaceAll(/\s+/g, ' ').toLowerCase()
}
