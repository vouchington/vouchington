import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** A request without a real subject or run must not pin a retained identity root. */
export async function deleteDeletedSubjectClassifierRequests(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteDeletedSubjectClassifierRequests */
    DELETE FROM classifier_run_requests request
    WHERE request.id = ANY(${[...ids]}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM classifier_runs run
        WHERE run.id = request.run_identity_id)
      AND (
        (request.post_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM posts post WHERE post.id = request.post_id
        ))
        OR (request.rss_feed_item_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM rss_feed_items item WHERE item.id = request.rss_feed_item_id
        ))
      )`)
  return rowCount ?? 0
}
