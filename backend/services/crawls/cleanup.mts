import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getCrawlCleanupLimits } from './work-limits.mts'
import sql from 'sql-template-strings'

export function getCrawlCleanupCutoff(): string {
  const { ageDays } = getCrawlCleanupLimits()
  return getMinUUIDv7ForDate(new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000))
}

/** Deletion is the durable resume marker; each retained run removes only its configured allowance. */
export async function deleteOldInvalidCrawls(
  options: { cutoffId?: string; ids?: readonly string[]; limit?: number } = {},
): Promise<{ deleted: number; hasMore: boolean }> {
  const batchSize = Math.min(options.limit ?? Infinity, getCrawlCleanupLimits().batchSize)
  const cutoffId = options.cutoffId ?? getCrawlCleanupCutoff()
  const { rows } = await write(sql`/* deleteOldInvalidCrawls */
    WITH candidates AS MATERIALIZED (
      SELECT id FROM crawls
      WHERE id < ${cutoffId}::uuid
        AND (${options.ids ?? null}::uuid[] IS NULL OR id = ANY(${options.ids ?? null}::uuid[]))
        AND (network_error IS NOT NULL OR completed_at IS NULL)
      ORDER BY id LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM crawls crawl USING candidates
    WHERE crawl.id = candidates.id
    RETURNING crawl.id
  `)
  return { deleted: rows.length, hasMore: rows.length === batchSize }
}
