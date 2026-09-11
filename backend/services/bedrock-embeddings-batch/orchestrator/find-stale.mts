import { read } from '@data-stores/psql'

export async function getStaleBatches(
  ttlHours: number,
): Promise<Array<{ id: string; job_arn: string }>> {
  const { rows } = await read(
    `/* getStaleBatches */
    SELECT id, job_arn
    FROM bedrock_embeddings_batches
    WHERE submitted_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
      AND job_arn IS NOT NULL
      AND COALESCE(in_progress_at, submitted_at) < NOW() - ($1 || ' hours')::INTERVAL`,
    [ttlHours],
  )

  return rows.map(row => ({ id: row.id as string, job_arn: row.job_arn as string }))
}
