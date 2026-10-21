import {
  beginTransaction,
  withTransactionOptions,
  registerPostCommitAction,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import {
  lockPostPublicationRssFeedScopes,
  recordPostPublicationChange,
} from '@services/post-publication'
import { lockTopicHostnameOwnership } from '@services/topics/hostname-ownership-lock'
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
  const { rows: sourceRows } = await query<{ topic_id: string }>(
    `/* disableAndHideSource:topicId */ SELECT topic_id FROM rss_feeds WHERE id = $1::uuid`,
    [rssFeedId],
  )
  const topicIds = sourceRows.map(row => row.topic_id)
  await lockTopicHostnameOwnership(query, topicIds, [])
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await lockPostPublicationRssFeedScopes(query, [rssFeedId])
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
  await query(
    `/* disableAndHideSource:topic */
       UPDATE topics
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE topics.id = ANY($1::uuid[])
         AND topics.topic_type = 'rss_feed'
         AND topics.deleted_at IS NULL
      `,
    [topicIds],
  )
  registerPostCommitAction(query, () => invalidate.rss_feeds(rssFeedId))
}
