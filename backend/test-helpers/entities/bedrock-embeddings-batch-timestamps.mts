import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestBatchTerminalTimestamps(batchId: string): Promise<{
  completed_at: Date | null
  failed_at: Date | null
  cancelled_at: Date | null
} | null> {
  const { rows } = await read<{
    completed_at: Date | null
    failed_at: Date | null
    cancelled_at: Date | null
  }>(sql`
    /* getTestBatchTerminalTimestamps */
    SELECT completed_at, failed_at, cancelled_at
    FROM bedrock_embedding_batches
    WHERE id = ${batchId}
  `)
  return rows[0] ?? null
}
