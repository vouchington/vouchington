import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getBatchListingPageSize } from '../config.mts'
import {
  toBatchListingPage,
  type BatchListingCursor,
  type BatchListingPage,
} from './listing-page.mts'
import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

export const getPendingBatches = async (
  cursor?: BatchListingCursor,
): Promise<BatchListingPage<{ id: string }>> => {
  const limit = getBatchListingPageSize()
  const throughId = cursor?.throughId ?? getMinUUIDv7ForDate(new Date(Date.now() + 1))
  const { rows } = await read<{ id: string }>(
    `/* getPendingBatches */
    SELECT id FROM bedrock_embedding_batches
    WHERE submitted_at IS NOT NULL AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL
      AND ($1::uuid IS NULL OR id > $1::uuid) AND id < $2::uuid
    ORDER BY id LIMIT $3`,
    [cursor?.afterId ?? null, throughId, limit + 1],
  )
  return toBatchListingPage(rows, limit, throughId)
}

export const getBatchRecordsCreatedInLastHour = async (
  referenceTime: Date,
  options: QueryOptions = {},
): Promise<number> => {
  const referenceTimeUtc = referenceTime.toISOString()
  const { rows } = await read(
    `/* getBatchRecordsCreatedInLastHour */
    SELECT COALESCE(SUM(records), 0) as records
    FROM bedrock_embedding_batches
    -- UUIDv7 timestamps have millisecond precision, so the next millisecond
    -- is the first one strictly after the one-hour cutoff.
    WHERE id >= fn_min_uuidv7($1::timestamptz - INTERVAL '1 hour' + INTERVAL '1 millisecond')
  `,
    [referenceTimeUtc],
    options,
  )

  return Number.parseInt(rows[0]?.records || '0', 10)
}

export const getActiveBatchStats = async (
  options: QueryOptions = {},
): Promise<{
  count: number
  inputSizeMB: number
}> => {
  const { rows } = await read(
    `/* getActiveBatchStats */
    SELECT
      COUNT(*) as count,
      COALESCE(SUM((data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION), 0) as input_size_mb
    FROM bedrock_embedding_batches
    WHERE submitted_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
    [],
    options,
  )

  return {
    count: Number.parseInt(rows[0]?.count || '0', 10),
    inputSizeMB: Number.parseFloat(rows[0]?.input_size_mb || '0'),
  }
}

export const getBatchIdByJobArn = async (jobArn: string): Promise<string | null> => {
  const { rows } = await read(
    `/* getBatchIdByJobArn */
    SELECT id FROM bedrock_embedding_batches WHERE job_arn = $1 LIMIT 1
  `,
    [jobArn],
  )
  return rows.length > 0 ? (rows[0].id as string) : null
}

export const getBatchInfo = async (
  batchId: string,
): Promise<{ job_type: string; data: Record<string, unknown> } | null> => {
  const { rows } = await read(
    `/* getBatchInfo */
    SELECT job_type, data
    FROM bedrock_embedding_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (rows.length === 0) {
    return null
  }

  return {
    job_type: rows[0].job_type,
    data: rows[0].data as Record<string, unknown>,
  }
}
