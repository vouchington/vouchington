import { expect } from 'vitest'
import { read } from '@data-stores/psql'
import { insertTestEmbeddingsBatch } from './entities/bedrock-embeddings-batches.mts'

/** A committed owned batch fills the active-size budget without consuming hourly records. */
export async function insertActiveSizeControl(id: string, inputSizeMB: number) {
  await insertTestEmbeddingsBatch({
    id,
    bedrockStatus: 'Submitted',
    batchData: { metadata: { inputSizeMB } },
  })
  const { rows } = await read<{ id: string; input_size_mb: number }>(
    `/* embeddingQuotaFixture:activeSizeControl */
    SELECT id, (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
    FROM bedrock_embedding_batches
    WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL`,
    [id],
  )
  expect(rows).toEqual([{ id, input_size_mb: inputSizeMB }])
  return { id, inputSizeMB }
}
