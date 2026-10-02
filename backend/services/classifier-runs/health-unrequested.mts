import { write } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import {
  CLASSIFIER_UNREQUESTED_GRACE_MS,
  CLASSIFIER_UNREQUESTED_LOOKBACK_MS,
} from './health-thresholds.mts'
import type { ClassifierRunAdapter } from './types.mts'

/** Eligible subjects the classifier has no request or run for, and how long the oldest has waited. */
export type UnrequestedClassifierSubjects = { total: number; oldestAgeMs: number }

/** Narrows the scan; a test uses it to count only its own items in a database shared with others. */
export type ClassifierRunHealthScope = { rssFeedItemIds?: readonly string[] }

type UnrequestedRow = { total: number; oldest_since: Date | null }

/**
 * Live feed items that pass the adapter's own request eligibility yet have no request and no run
 * for their current content, left alone for at least the grace period. Null when the adapter does
 * not declare that its producers cover every feed item. The item rows are shaped like `request`, so
 * the adapter's predicate is reused verbatim, and the age is the item's last update: the embedding
 * write that made it eligible.
 */
export async function readUnrequestedClassifierFeedItems<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  now: Date,
  scope: ClassifierRunHealthScope = {},
): Promise<UnrequestedClassifierSubjects | null> {
  if (!adapter.requestsEveryEligibleFeedItem) return null
  const since = timestampToUuidv7LowerBound(now.getTime() - CLASSIFIER_UNREQUESTED_LOOKBACK_MS)
  const settledBefore = new Date(now.getTime() - CLASSIFIER_UNREQUESTED_GRACE_MS)
  const itemIds = scope.rssFeedItemIds ? [...scope.rssFeedItemIds] : null
  const { rows } = await write<UnrequestedRow>(
    sql`/* readUnrequestedClassifierFeedItems */
    SELECT count(*)::int AS total, min(request.eligible_since) AS oldest_since
    FROM (
      SELECT NULL::uuid AS post_id, item.id AS rss_feed_item_id,
        item.bedrock_nova_multimodal_v1_content_sha256 AS input_sha256,
        item.updated_at AS eligible_since
      FROM rss_feed_items item
      WHERE item.id >= ${since} AND item.deleted_at IS NULL
        AND item.bedrock_nova_multimodal_v1_content_sha256 IS NOT NULL
        AND item.updated_at <= ${settledBefore}
        AND (${itemIds}::uuid[] IS NULL OR item.id = ANY(${itemIds}::uuid[]))
    ) request
    WHERE (`
      .append(adapter.requestEligibility())
      .append(
        sql`)
      AND NOT EXISTS (
        SELECT 1 FROM classifier_run_requests existing
        JOIN classifiers classifier ON classifier.id = existing.classifier_id
        WHERE classifier.slug = ${adapter.slug}
          AND existing.rss_feed_item_id = request.rss_feed_item_id
          AND existing.input_sha256 = request.input_sha256
      )
      AND NOT EXISTS (
        SELECT 1 FROM classifier_runs run
        JOIN classifiers classifier ON classifier.id = run.classifier_id
        WHERE classifier.slug = ${adapter.slug}
          AND run.rss_feed_item_id = request.rss_feed_item_id
          AND run.input_sha256 = request.input_sha256
      )
  `,
      ),
  )
  const row = rows[0]
  if (!row?.total || !row.oldest_since) return { total: 0, oldestAgeMs: 0 }
  return { total: row.total, oldestAgeMs: now.getTime() - row.oldest_since.getTime() }
}
