import { beginTransaction, read, write } from '@data-stores/psql'
import { insertTextEmbeddingForRetentionTest } from './entities/ai-retention.mts'
import { createIsolatedRetentionWindow } from './retention-window.mts'

/** Committed, uniquely owned hashes exercise the cleanup's normal transaction resource. */
export async function createCommittedRetentionCacheFixture() {
  const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
  await using setup = await beginTransaction()
  const contentHashes = await Promise.all([
    insertTextEmbeddingForRetentionTest(setup, at(122)),
    insertTextEmbeddingForRetentionTest(setup, at(122)),
    insertTextEmbeddingForRetentionTest(setup, now),
  ])
  const buffers = contentHashes.map(hash => Buffer.from(hash, 'hex'))
  const fixture = {
    options: { now, lowerBoundDate, batchSize: 1, maxBatches: 1 },
    state: async () => {
      const { rows } = await read<{ content_sha256: string }>(
        `/* readCommittedRetentionCacheFixture */
        SELECT encode(content_sha256, 'hex') AS content_sha256
        FROM bedrock_nova_multimodal_v1_embeddings
        WHERE content_sha256 = ANY($1::bytea[])`,
        [buffers],
      )
      const remaining = new Set(rows.map(row => row.content_sha256))
      return contentHashes.map(hash => remaining.has(hash))
    },
    cleanup: async () => {
      await write(
        `/* deleteCommittedRetentionCacheFixture */
        DELETE FROM bedrock_nova_multimodal_v1_embeddings
        WHERE content_sha256 = ANY($1::bytea[])`,
        [buffers],
      )
    },
  }
  await setup.commit()
  return fixture
}
