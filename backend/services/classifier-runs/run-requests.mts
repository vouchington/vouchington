import type { QueryExecutor } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { ClassifierRunSubject } from './types.mts'

function requestSubject(subject: ClassifierRunSubject): SQLStatement {
  return subject.postId !== null
    ? sql`request.post_id = ${subject.postId}`
    : sql`request.rss_feed_item_id = ${subject.rssFeedItemId}`
}

/**
 * Records that a subject became eligible, in the caller's transaction and independent of any
 * classifier configuration, so the sweep can recover it even if no receipt is ever reserved.
 * Re-approval re-arms the same content version; an unsettled request for older content is stale.
 */
export async function requestClassifierRuns(
  query: QueryExecutor,
  input: { subject: ClassifierRunSubject; inputSha256: Buffer; classifierSlugs: readonly string[] },
): Promise<void> {
  if (input.classifierSlugs.length === 0) return
  const slugs = [...input.classifierSlugs]
  await query(
    sql`/* markStaleClassifierRunRequests */
    UPDATE classifier_run_requests request
    SET stale_at = clock_timestamp()
    FROM classifiers classifier
    WHERE classifier.id = request.classifier_id AND classifier.slug = ANY(${slugs}::text[])
      AND request.input_sha256 <> ${input.inputSha256}
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NULL
      AND `.append(requestSubject(input.subject)),
  )
  const conflict =
    input.subject.postId !== null
      ? sql`(classifier_id, post_id, input_sha256) WHERE post_id IS NOT NULL`
      : sql`(classifier_id, rss_feed_item_id, input_sha256) WHERE rss_feed_item_id IS NOT NULL`
  await query(
    sql`/* upsertClassifierRunRequests */
    INSERT INTO classifier_run_requests (classifier_id, post_id, rss_feed_item_id, input_sha256)
    SELECT classifier.id, ${input.subject.postId}::uuid, ${input.subject.rssFeedItemId}::uuid,
      ${input.inputSha256}
    FROM classifiers classifier
    WHERE classifier.slug = ANY(${slugs}::text[])
    ON CONFLICT `
      .append(conflict)
      .append(' DO UPDATE SET run_id = NULL, no_work_at = NULL, stale_at = NULL'),
  )
}

/**
 * Returns the requests the sweep retired as stale at this content version to the sweep, in the
 * caller's transaction, when the subject is live at that content again (a post approved again after
 * the sweep retired its requests while it was not approved). It only revives: it never creates a
 * request, never widens the classifiers a producer asked for, and never re-arms one settled by a run
 * or as no work.
 */
export async function reviveClassifierRunRequests(
  query: QueryExecutor,
  input: { subject: ClassifierRunSubject; inputSha256: Buffer },
): Promise<void> {
  await query(
    sql`/* reviveClassifierRunRequests */
    UPDATE classifier_run_requests request
    SET stale_at = NULL
    WHERE request.input_sha256 = ${input.inputSha256}
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NOT NULL
      AND `.append(requestSubject(input.subject)),
  )
}

/**
 * Records requests for a batch of just-upserted feed items at their current content digest, in the
 * upsert transaction. Unlike a re-approval, a re-upsert of the same content never re-arms a request
 * that settled with a run or as no work; an unsettled request for older content is stale. A request
 * the sweep retired as stale (the item was deleted, or its content moved on) is re-armed, because
 * the item is live at that content again.
 */
export async function requestRssFeedItemClassifierRuns(
  query: QueryExecutor,
  rssFeedItemIds: readonly string[],
  classifierSlugs: readonly string[],
): Promise<void> {
  if (rssFeedItemIds.length === 0 || classifierSlugs.length === 0) return
  const ids = [...rssFeedItemIds]
  const slugs = [...classifierSlugs]
  await query(sql`/* markStaleRssFeedItemClassifierRunRequests */
    UPDATE classifier_run_requests request
    SET stale_at = clock_timestamp()
    FROM classifiers classifier, rss_feed_items item
    WHERE classifier.id = request.classifier_id AND classifier.slug = ANY(${slugs}::text[])
      AND item.id = request.rss_feed_item_id AND item.id = ANY(${ids}::uuid[])
      AND request.input_sha256 <> item.bedrock_nova_multimodal_v1_content_sha256
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NULL
  `)
  await query(sql`/* insertRssFeedItemClassifierRunRequests */
    INSERT INTO classifier_run_requests (classifier_id, rss_feed_item_id, input_sha256)
    SELECT classifier.id, item.id, item.bedrock_nova_multimodal_v1_content_sha256
    FROM rss_feed_items item
    CROSS JOIN classifiers classifier
    WHERE item.id = ANY(${ids}::uuid[]) AND classifier.slug = ANY(${slugs}::text[])
    ON CONFLICT (classifier_id, rss_feed_item_id, input_sha256)
      WHERE rss_feed_item_id IS NOT NULL
      DO UPDATE SET stale_at = NULL WHERE classifier_run_requests.stale_at IS NOT NULL
  `)
}

export type ClassifierRunRequestSettlement =
  | { kind: 'run'; runId: string; inputSha256: Buffer }
  | { kind: 'no-work'; inputSha256: Buffer }
  /** Settles every unsettled request of the subject, or only the one for `inputSha256` when given. */
  | { kind: 'stale'; inputSha256?: Buffer }

/** Settles the subject's request in the transaction that decided its outcome. */
export async function settleClassifierRunRequest(
  query: QueryExecutor,
  slug: string,
  subject: ClassifierRunSubject,
  settlement: ClassifierRunRequestSettlement,
): Promise<void> {
  const runId = settlement.kind === 'run' ? settlement.runId : null
  const unsettled = sql` AND request.run_id IS NULL AND request.no_work_at IS NULL
      AND request.stale_at IS NULL`
  const scope =
    settlement.kind !== 'stale'
      ? sql` AND request.input_sha256 = ${settlement.inputSha256}`
      : settlement.inputSha256
        ? unsettled.append(sql` AND request.input_sha256 = ${settlement.inputSha256}`)
        : unsettled
  await query(
    sql`/* settleClassifierRunRequest */
    UPDATE classifier_run_requests request
    SET run_id = ${runId},
      no_work_at = CASE WHEN ${settlement.kind === 'no-work'} THEN clock_timestamp() END,
      stale_at = CASE WHEN ${settlement.kind === 'stale'} THEN clock_timestamp() END
    FROM classifiers classifier
    WHERE classifier.id = request.classifier_id AND classifier.slug = ${slug}
      AND `
      .append(requestSubject(subject))
      .append(scope),
  )
}

/** A superseded run with no replacement returns its request to the sweep. */
export async function reopenClassifierRunRequests(
  query: QueryExecutor,
  runId: string,
): Promise<void> {
  await query(sql`/* reopenClassifierRunRequests */
    UPDATE classifier_run_requests SET run_id = NULL WHERE run_id = ${runId}
  `)
}
