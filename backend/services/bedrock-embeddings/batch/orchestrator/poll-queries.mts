import { read } from '@data-stores/psql'

export const getPendingBatches = async (): Promise<Array<{ id: string }>> => {
  const { rows } = await read(
    `/* getPendingBatches */
    SELECT id
    FROM bedrock_embeddings_batches
    WHERE submitted_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
  )

  return rows.map(row => ({ id: row.id }))
}

export const getBatchRecordsCreatedInLastHour = async (): Promise<number> => {
  const { rows } = await read(
    `/* getBatchRecordsCreatedInLastHour */
    SELECT COALESCE(SUM(records), 0) as records
    FROM bedrock_embeddings_batches
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `,
  )

  return Number.parseInt(rows[0]?.records || '0', 10)
}

export const getActiveBatchStats = async (): Promise<{
  count: number
  inputSizeMB: number
}> => {
  const { rows } = await read(
    `/* getActiveBatchStats */
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(input_size_mb), 0) as input_size_mb
    FROM bedrock_embeddings_batches
    WHERE submitted_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
  )

  return {
    count: Number.parseInt(rows[0]?.count || '0', 10),
    inputSizeMB: Number.parseFloat(rows[0]?.input_size_mb || '0'),
  }
}

export const getBatchIdByJobArn = async (jobArn: string): Promise<string | null> => {
  const { rows } = await read(
    `/* getBatchIdByJobArn */
    SELECT id FROM bedrock_embeddings_batches WHERE job_arn = $1 LIMIT 1
  `,
    [jobArn],
  )
  return rows.length > 0 ? (rows[0].id as string) : null
}

export const getBatchInfo = async (
  batchId: string,
): Promise<{ job_type: string; output_s3_uri: string; input_size_mb: number } | null> => {
  const { rows } = await read(
    `/* getBatchInfo */
    SELECT job_type, output_s3_uri, input_size_mb
    FROM bedrock_embeddings_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (rows.length === 0) {
    return null
  }

  return {
    job_type: rows[0].job_type,
    output_s3_uri: rows[0].output_s3_uri as string,
    input_size_mb: Number(rows[0].input_size_mb),
  }
}
