import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getBatchListingPageSize } from '@services/embeddings/batch/config'
import type {
  BatchListingCursor,
  BatchListingPage,
} from '@services/embeddings/batch/orchestrator/listing-page'

export async function getStaleBatches(
  ttlHours: number,
  cursor?: BatchListingCursor,
): Promise<BatchListingPage<{ id: string; job_name: string }>> {
  const limit = getBatchListingPageSize()
  const throughId = cursor?.throughId ?? getMinUUIDv7ForDate(new Date(Date.now() + 1))
  const { rows } = await read<{ id: string; job_name: string | null; stale: boolean }>(
    `/* getStaleBatches */
    WITH raw_page AS MATERIALIZED (
      SELECT id, job_name, submitted_at, in_progress_at
      FROM gemini_embedding_batches
      WHERE submitted_at IS NOT NULL AND completed_at IS NULL
        AND failed_at IS NULL AND cancelled_at IS NULL
        AND id > $2::uuid AND id < $3::uuid
      ORDER BY id LIMIT $4
    )
    SELECT id, job_name,
      (job_name IS NOT NULL AND submitted_at < NOW() - ($1 || ' hours')::INTERVAL) AS stale
    FROM raw_page ORDER BY id`,
    [ttlHours, cursor?.afterId ?? '00000000-0000-0000-0000-000000000000', throughId, limit],
  )
  const rawPage = rows
  // A full raw page may be the tail; the next empty page resolves that without
  // reading a lookahead row outside the configured physical page budget.
  // ast-grep-ignore: pagination-no-exact-limit-has-next -- worker continuation conservatively confirms an exact-full raw page with a separate empty page instead of reading an out-of-budget lookahead row.
  const hasMore = rows.length === limit
  return {
    batches: rawPage
      .filter((row): row is typeof row & { job_name: string } => row.stale && row.job_name !== null)
      .map(({ id, job_name }) => ({ id, job_name })),
    hasMore,
    ...(hasMore && { nextCursor: { afterId: rawPage.at(-1)!.id, throughId } }),
  }
}
