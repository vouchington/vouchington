import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getBatchListingPageSize } from '@services/bedrock-embeddings/batch/config'
import {
  toBatchListingPage,
  type BatchListingCursor,
  type BatchListingPage,
} from '@services/bedrock-embeddings/batch/orchestrator/listing-page'

export async function getStaleBatches(
  ttlHours: number,
  cursor?: BatchListingCursor,
): Promise<BatchListingPage<{ id: string; job_arn: string }>> {
  const limit = getBatchListingPageSize()
  const throughId = cursor?.throughId ?? getMinUUIDv7ForDate(new Date(Date.now() + 1))
  const { rows } = await read<{ id: string; job_arn: string }>(
    `/* getStaleBatches */
    SELECT id, job_arn FROM bedrock_embedding_batches
    WHERE submitted_at IS NOT NULL AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL AND job_arn IS NOT NULL
      AND COALESCE(in_progress_at, submitted_at) < NOW() - ($1 || ' hours')::INTERVAL
      AND ($2::uuid IS NULL OR id > $2::uuid) AND id < $3::uuid
    ORDER BY id LIMIT $4`,
    [ttlHours, cursor?.afterId ?? null, throughId, limit + 1],
  )
  return toBatchListingPage(rows, limit, throughId)
}
