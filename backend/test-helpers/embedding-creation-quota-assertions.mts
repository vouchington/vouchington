import { expect } from 'vitest'
import { read } from '@data-stores/psql'

/** Teardown observes only owned identity; unrelated global accounting may keep changing. */
export async function assertOwnedAccountingRemoved(ids: string[]) {
  if (ids.length === 0) return
  const { rows } = await read<{ id: string }>(
    `/* embeddingQuotaFixture:ownedRemoval */
    SELECT id FROM bedrock_embedding_batches WHERE id = ANY($1)`,
    [ids],
  )
  expect(rows).toEqual([])
}

/** Verify a real completed hourly contribution, with no active count or size contribution. */
export async function assertOwnedCompletedControl(id: string) {
  const { rows } = await read<{ id: string; records: number; input_size_mb: number }>(
    `/* embeddingQuotaFixture:completedControl */
    SELECT id, records,
      (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
    FROM bedrock_embedding_batches
    WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NOT NULL
      AND failed_at IS NULL AND cancelled_at IS NULL
      AND created_at > NOW() - INTERVAL '1 hour'`,
    [id],
  )
  expect(rows).toEqual([{ id, records: 1, input_size_mb: 0 }])
}
