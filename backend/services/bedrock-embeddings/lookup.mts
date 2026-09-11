import { read } from '@data-stores/psql'
import { EMBEDDINGS_TABLE } from './config.mts'
import { EMBEDDING_BLOOM_READY_KEY, embeddingBloomFilter } from './bloom-filter/bloom-filter.mts'
import { bloomFilterConfig } from '@services/bloom-filter-config'

type ExistingEmbedding = {
  embedding: number[]
  input_token_count: number | null
  created_at: Date
}

/**
 * Looks up multiple existing embeddings by content SHA256 hashes from the centralized table.
 * Uses bloom filter to fast-path negative lookups, avoiding DB queries for non-existent items.
 *
 * Bloom filter benefits:
 * - Items definitely not in filter → skip DB query (fast path)
 * - Items in filter → still query DB (bloom has false positives)
 *
 * @param contentSha256s - Array of SHA256 hashes to look up
 * @returns Map keyed by hex string of hash, containing found embeddings
 */
export const lookupExistingEmbeddings = async (
  contentSha256s: Buffer[],
): Promise<Map<string, ExistingEmbedding>> => {
  if (contentSha256s.length === 0) {
    return new Map()
  }

  // Convert buffers to hex strings for bloom filter lookup
  const hexHashes = contentSha256s.map(buf => buf.toString('hex'))

  // Check bloom filter first (single roundtrip via BF.MEXISTS)
  const enabled = bloomFilterConfig.fields.get('embeddingBloomFilterEnabled') !== false
  const bloomResults = enabled
    ? await embeddingBloomFilter.mexistsIfReady(EMBEDDING_BLOOM_READY_KEY, hexHashes)
    : hexHashes.map(() => true)

  // null = filter missing (fall through to DB), true = maybe present, false = definitely absent
  const itemsToQuery = contentSha256s.filter((_, i) => bloomResults[i] !== false)

  if (itemsToQuery.length === 0) {
    return new Map()
  }

  const { rows } = await read(
    `/* lookupExistingEmbeddings */
    SELECT content_sha256, embedding, input_token_count, created_at
    FROM ${EMBEDDINGS_TABLE}
    WHERE content_sha256 = ANY($1)
  `,
    [itemsToQuery],
  )

  const resultMap = new Map<string, ExistingEmbedding>()
  for (const row of rows) {
    const hashHex = row.content_sha256.toString('hex')
    resultMap.set(hashHex, {
      embedding: row.embedding,
      input_token_count: row.input_token_count ?? null,
      created_at: row.created_at,
    })
  }

  return resultMap
}

/**
 * Looks up an existing embedding by content SHA256 from the centralized table.
 * Allows reusing embeddings when same content appears in different entities.
 * Uses bloom filter for fast negative lookups (delegated to lookupExistingEmbeddings).
 *
 * @param contentSha256 - SHA256 hash of content to look up
 * @returns Existing embedding if found, null otherwise
 */
export const lookupExistingEmbedding = async (
  contentSha256: Buffer,
): Promise<ExistingEmbedding | null> => {
  const hashHex = contentSha256.toString('hex')
  const resultMap = await lookupExistingEmbeddings([contentSha256])
  return resultMap.get(hashHex) || null
}
