import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getBatchListingPageSize } from '@services/bedrock-embeddings/batch/config'

export type StaleBatchCursor = {
  afterId: string
  afterStaleAt: string
  throughId: string
  cutoffAt: string
}

export type StaleBatchPage = {
  batches: Array<{ id: string; job_arn: string }>
  hasMore: boolean
  nextCursor?: StaleBatchCursor
}

export async function getStaleBatches(
  ttlHours: number,
  cursor?: StaleBatchCursor,
): Promise<StaleBatchPage> {
  const limit = getBatchListingPageSize()
  const throughId = cursor?.throughId ?? getMinUUIDv7ForDate(new Date(Date.now() + 1))
  const cutoffAt =
    cursor?.cutoffAt ?? new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString()
  const afterClause = cursor
    ? 'AND (COALESCE(in_progress_at, submitted_at), id) > ($2::timestamptz, $3::uuid)'
    : ''
  const { rows } = await read<{ id: string; job_arn: string; stale_at: string }>(
    `/* getStaleBatches */
    SELECT id, job_arn, COALESCE(in_progress_at, submitted_at)::text AS stale_at
    FROM bedrock_embedding_batches
    WHERE submitted_at IS NOT NULL AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL AND job_arn IS NOT NULL
      AND COALESCE(in_progress_at, submitted_at) < $1::timestamptz
      ${afterClause}
      AND id < $${cursor ? 4 : 2}::uuid
    ORDER BY COALESCE(in_progress_at, submitted_at), id LIMIT $${cursor ? 5 : 3}`,
    cursor
      ? [cutoffAt, cursor.afterStaleAt, cursor.afterId, throughId, limit + 1]
      : [cutoffAt, throughId, limit + 1],
  )
  const batches = rows.slice(0, limit).map(({ id, job_arn }) => ({ id, job_arn }))
  const hasMore = rows.length > limit
  const last = rows[limit - 1]
  return {
    batches,
    hasMore,
    ...(hasMore &&
      last && {
        nextCursor: {
          afterId: last.id,
          afterStaleAt: last.stale_at,
          throughId,
          cutoffAt,
        },
      }),
  }
}
