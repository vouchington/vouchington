import { write } from '@data-stores/psql'
import { ValkeyBloomFilter } from '@data-stores/valkey/bloom-filter'
import { bloomValkeyClient } from '@data-stores/valkey/clients'
import pgvector from 'pgvector/pg'

// Internal support module (leading underscore = not part of the public barrel).
// Duplicates the bedrock-embeddings domain's config constants and bulk-embeddings-insert logic
// so test-helpers does not depend on that service package, which would otherwise create a
// workspace dependency cycle (every backend service devDeps test-helpers for its tests). The
// bloom filter instance below is configured identically to the production one (same
// name/capacity/errorRate/expansionRate/client), so it reads and writes the SAME Valkey key —
// recall-avoidance checks elsewhere stay consistent with fixtures inserted here. The bulk insert
// below skips the COPY-FROM-STDIN temp-table path (test fixtures only ever insert a handful of
// rows at a time) and the invalidate-ready-marker-and-enqueue-rebuild error recovery path
// (queue-only, not test-relevant).

export const EMBEDDINGS_TABLE = 'bedrock_nova_multimodal_v1_embeddings'
export const EMBEDDING_DIMENSION = 1024

export const embeddingBloomFilter = new ValkeyBloomFilter({
  name: 'bedrock-nova-2-multimodal-embeddings-v1',
  capacity: 100_000,
  errorRate: 0.0001, // 0.01%
  expansionRate: 2,
  client: bloomValkeyClient,
})

export async function insertTestCentralizedEmbeddingsBulk(
  embeddings: Array<{
    content_sha256: Buffer
    embedding: number[]
    input_token_count?: number | null
  }>,
): Promise<void> {
  if (embeddings.length === 0) return

  for (const emb of embeddings) {
    await write(
      `/* insertTestCentralizedEmbeddingsBulk */
      INSERT INTO ${EMBEDDINGS_TABLE} (content_sha256, embedding, input_token_count)
      VALUES ($1, $2, $3)
      ON CONFLICT (content_sha256) DO UPDATE
        SET input_token_count = EXCLUDED.input_token_count
        WHERE ${EMBEDDINGS_TABLE}.input_token_count IS NULL
          AND EXCLUDED.input_token_count IS NOT NULL`,
      [emb.content_sha256, pgvector.toSql(emb.embedding), emb.input_token_count ?? null],
    )
  }

  await embeddingBloomFilter.addOrThrow(embeddings.map(e => e.content_sha256.toString('hex')))
}
