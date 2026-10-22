import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Re-arms unsettled requests when the same post or feed content becomes eligible again. */
export async function reviveClassifierRunRequests(
  query: QueryExecutor,
  input: {
    subject: { postId: string; rssFeedItemId: null } | { postId: null; rssFeedItemId: string }
    inputSha256: Buffer
  },
): Promise<void> {
  const subject =
    input.subject.postId !== null
      ? sql`request.post_id = ${input.subject.postId}`
      : sql`request.rss_feed_item_id = ${input.subject.rssFeedItemId}`
  await query(
    sql`/* reviveClassifierRunRequests */
    UPDATE classifier_run_requests request
    SET stale_at = NULL
    WHERE request.input_sha256 = ${input.inputSha256}
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NOT NULL
      AND `.append(subject),
  )
}
