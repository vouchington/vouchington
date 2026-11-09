import assert from 'http-assert'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import {
  beginTransaction,
  withTransactionOptions,
  registerPostCommitAction,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'
import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import { invalidate } from '@services/entity-cache/invalidate'

/**
 * Soft-deletes the source topic and disables the feed for a permanently-redirected feed.
 * Only marks the topic deleted if its topic_type is 'rss_feed' (avoids hiding manually-created topics).
 */
export async function disableAndHideSource(
  rssFeedId: string,
  options: QueryOptions = {},
): Promise<void> {
  if (!options.query) {
    if (options.client)
      return withTransactionOptions(options, query => disableAndHideSource(rssFeedId, { query }))
    await using query = await beginTransaction()
    await disableAndHideSource(rssFeedId, { query })
    await query.commit()
    return
  }
  return withTransactionOptions(options, query => hideSource(rssFeedId, query))
}

async function hideSource(rssFeedId: string, query: TransactionQuery): Promise<void> {
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  const { rows: sourceRows } = await query<{
    topic_id: string
    topic_type: string
    deleted_at: Date | null
  }>(
    `/* disableAndHideSource:topicId */ SELECT feed.topic_id, topic.topic_type, topic.deleted_at
      FROM rss_feeds feed JOIN topics topic ON topic.id = feed.topic_id AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL WHERE feed.id = $1::uuid`,
    [rssFeedId],
  )
  const topicIds = sourceRows.map(row => row.topic_id)
  // ast-grep-ignore: no-three-sequential-awaits -- Enablement, publication capture, and discoverability record one hide; the topic soft-delete uses the topic ids read above.
  await query(
    `/* disableAndHideSource:rss_feed */
       INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, changed_by_id, reason)
       VALUES ('enablement', $1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_discoverability_changed',
  })
  await query(
    `/* disableAndHideSource:discoverability */
       INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, changed_by_id, reason)
       VALUES ('discoverability', $1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  const retiringTopicIds = sourceRows.flatMap(row =>
    row.topic_type === 'rss_feed' && row.deleted_at === null ? [row.topic_id] : [],
  )
  await writeImageSurfaceMutation(
    query,
    retiringTopicIds.flatMap(topicId => [
      { surfaceKind: 'topic-logo-image' as const, topicId, nextImageId: null },
      { surfaceKind: 'topic-hero-image' as const, topicId, nextImageId: null },
    ]),
    null,
    async (before, scopeQuery) => {
      const result = await scopeQuery(
        `/* disableAndHideSource:topic */
      UPDATE topics SET deleted_at = CURRENT_TIMESTAMP
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) expected(id, logo_image_id, hero_image_id)
      WHERE topics.id = expected.id AND topics.topic_type = 'rss_feed' AND topics.deleted_at IS NULL
        AND topics.logo_image_id IS NOT DISTINCT FROM expected.logo_image_id
        AND topics.hero_image_id IS NOT DISTINCT FROM expected.hero_image_id`,
        [
          retiringTopicIds,
          retiringTopicIds.map((_, index) => before[2 * index]!.current_image_id),
          retiringTopicIds.map((_, index) => before[2 * index + 1]!.current_image_id),
        ],
      )
      assert(
        result.rowCount === retiringTopicIds.length,
        409,
        'RSS source images changed during retirement',
      )
    },
  )
  registerPostCommitAction(query, () => invalidate.rss_feeds(rssFeedId))
}
