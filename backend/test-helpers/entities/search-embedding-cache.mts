import { createHash } from 'node:crypto'
import { TimeUnit } from '@valkey/valkey-glide'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { EMBEDDINGS_TABLE } from './_bedrock-embeddings-support.mts'

const SEARCH_EMBEDDING_CACHE_PREFIX = `${EMBEDDINGS_TABLE}_search_embeddings`
const ONE_DAY_SECONDS = 60 * 60 * 24

/**
 * Pre-seeds the Valkey search embedding cache for a given query/embedding pair.
 * This lets deterministic tests exercise the `semantic_search_query` code path in
 * getTopicIds/getPostIds without making a real Bedrock API call.
 */
export async function seedSearchEmbeddingCache(query: string, embedding: number[]): Promise<void> {
  const normalized = query.trim().replaceAll(/\s+/g, ' ').toLowerCase()
  const sha256hex = createHash('sha256').update(normalized).digest('hex')
  const key = `cache:${SEARCH_EMBEDDING_CACHE_PREFIX}:{${sha256hex}}`
  await cacheValkeyClient.set(key, JSON.stringify(embedding), {
    expiry: { type: TimeUnit.Seconds, count: ONE_DAY_SECONDS },
  })
}
