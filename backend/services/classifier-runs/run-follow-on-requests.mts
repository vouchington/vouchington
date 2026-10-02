import type { QueryExecutor } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ClassifierRunSubject } from './types.mts'

/**
 * Records, in the caller's transaction, that a classifier which runs after another one now has
 * something to wait for: the first classifier just completed at this content version. The request
 * commits or rolls back with the first classifier's effects, so a crash can neither strand the
 * follow-on nor request it for a run that never finished; the recovery sweep dispatches it.
 *
 * Unlike a producer's request this never re-arms a settled one. A request that already settled with
 * a run or as no work stays settled, so a second completion of the first classifier at the same
 * content (a replayed or reconfigured run) can never schedule the follow-on twice. Only a request
 * the sweep retired as stale, because the subject left this content version, is revived when the
 * subject is back at it.
 */
export async function requestFollowOnClassifierRun(
  query: QueryExecutor,
  input: { subject: ClassifierRunSubject; inputSha256: Buffer; classifierSlug: string },
): Promise<void> {
  const { subject } = input
  const conflict =
    subject.postId !== null
      ? sql`(classifier_id, post_id, input_sha256) WHERE post_id IS NOT NULL`
      : sql`(classifier_id, rss_feed_item_id, input_sha256) WHERE rss_feed_item_id IS NOT NULL`
  await query(
    sql`/* requestFollowOnClassifierRun */
    INSERT INTO classifier_run_requests (classifier_id, post_id, rss_feed_item_id, input_sha256)
    SELECT classifier.id, ${subject.postId}::uuid, ${subject.rssFeedItemId}::uuid, ${input.inputSha256}
    FROM classifiers classifier
    WHERE classifier.slug = ${input.classifierSlug}
    ON CONFLICT `
      .append(conflict)
      .append(' DO UPDATE SET stale_at = NULL WHERE classifier_run_requests.stale_at IS NOT NULL'),
  )
}

/**
 * SQL over `request` (classifier_run_requests) selecting the requests whose subject has a completed,
 * current run of `classifierSlug` at the exact content the request asked for. A terminal failure
 * never completes a run and a superseded run is not current, so neither unlocks a follow-on.
 */
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

/** The pure-read twin of `followsCompletedClassifierRun` for one subject at one content version. */
export async function hasCompletedClassifierRun(
  query: QueryExecutor,
  input: { subject: ClassifierRunSubject; inputSha256: Buffer; classifierSlug: string },
): Promise<boolean> {
  const { subject } = input
  const { rows } = await query(
    sql`/* hasCompletedClassifierRun */
    SELECT 1 FROM classifier_runs first_run
    JOIN classifiers first_classifier ON first_classifier.id = first_run.classifier_id
    WHERE first_classifier.slug = ${input.classifierSlug}
      AND first_run.input_sha256 = ${input.inputSha256}
      AND first_run.completed_at IS NOT NULL AND first_run.superseded_at IS NULL
      AND `.append(
      subject.postId !== null
        ? sql`first_run.post_id = ${subject.postId}`
        : sql`first_run.rss_feed_item_id = ${subject.rssFeedItemId}`,
    ),
  )
  return rows.length > 0
}
