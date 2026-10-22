import { read } from '@data-stores/psql'
import { expect } from 'vitest'

/** Checks the exact committed active row, leaving other accounting untouched. */
export async function assertOwnedSubmittedControl(id: string, expectedInputSizeMB = 1) {
  const { rows } = await read<{ id: string; input_size_mb: number }>(
    `/* embeddingQuotaFixture:submittedControl */
    SELECT id, (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
    FROM bedrock_embedding_batches
    WHERE id = $1 AND submitted_at IS NOT NULL
      AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL`,
    [id],
  )
  expect(rows).toEqual([{ id, input_size_mb: expectedInputSizeMB }])
}
