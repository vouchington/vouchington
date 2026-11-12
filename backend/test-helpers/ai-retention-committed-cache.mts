import { beginTransaction, read, write } from '@data-stores/psql'
import { insertTextEmbeddingForRetentionTest } from './entities/ai-retention.mts'
import { createExactRetentionWindow } from './retention-window.mts'

/** Committed, uniquely owned hashes exercise the cleanup's normal transaction resource. */
export async function createCommittedRetentionCacheFixture() {
  const { aged, ...window } = createExactRetentionWindow(90)
  await using setup = await beginTransaction()
  const contentHashes = await Promise.all([
    insertTextEmbeddingForRetentionTest(setup, aged),
    insertTextEmbeddingForRetentionTest(setup, aged),
    insertTextEmbeddingForRetentionTest(setup, window.now),
  ])
  const buffers = contentHashes.map(hash => Buffer.from(hash, 'hex'))
  const fixture = {
    options: { ...window, batchSize: 1, maxBatches: 1 },
    state: async () => {
      const { rows } = await read<{ content_sha256: string }>(
        `/* readCommittedRetentionCacheFixture */
        SELECT encode(content_sha256, 'hex') AS content_sha256
        FROM gemini_embedding_2_embeddings
        WHERE content_sha256 = ANY($1::bytea[])`,
        [buffers],
      )
      const remaining = new Set(rows.map(row => row.content_sha256))
      return contentHashes.map(hash => remaining.has(hash))
    },
    cleanup: async () => {
      await write(
        `/* deleteCommittedRetentionCacheFixture */
        DELETE FROM gemini_embedding_2_embeddings
        WHERE content_sha256 = ANY($1::bytea[])`,
        [buffers],
      )
    },
  }
  await setup.commit()
  return fixture
}
