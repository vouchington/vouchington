import type { QueryExecutor } from '@data-stores/psql'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql, { type SQLStatement } from 'sql-template-strings'

/** A current completed first-stage payload at exactly the request's content. */
export function followsCompletedClassifierRun(classifierSlug: string): SQLStatement {
  return sql`EXISTS (
      SELECT 1 FROM classifier_runs first_run
      JOIN classifiers first_classifier ON first_classifier.id = first_run.classifier_id
      WHERE first_classifier.slug = ${classifierSlug}
        AND first_run.input_sha256 = request.input_sha256
        AND first_run.completed_at IS NOT NULL AND first_run.superseded_at IS NULL
        AND (first_run.post_id = request.post_id OR first_run.rss_feed_item_id = request.rss_feed_item_id)
    )`
}

/**
 * Re-arms only requests the sweep retired as stale at this content version, when the same live
 * post or feed item becomes eligible again. It never creates a request or re-arms a settled one.
 */
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
      AND request.run_settled_at IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NOT NULL
      AND `
      .append(subject)
      .append(sql` AND (
        NOT EXISTS (
          SELECT 1 FROM classifiers classifier
          WHERE classifier.id = request.classifier_id AND classifier.slug = ${AUTOTAGGER_AGENT_SLUG}
        ) OR `)
      .append(followsCompletedClassifierRun(TAGGING_CLASSIFIER_SLUG))
      .append(')'),
  )
}
