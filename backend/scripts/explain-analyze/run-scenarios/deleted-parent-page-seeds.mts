import { beginTransaction, write } from '@data-stores/psql'
import { ensureCurrentPostModerationVersion } from '@services/post-clearance/moderation-ledger-versions'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { seedUuid } from '../seed-data/common.mts'
import { seedPostId, seedUser } from '../run-support.mts'

// Posts 0..9999 already carry an explain-retention version. A newer version on
// one of those posts enters the retention-due index, and the idle-keeper generic
// plan then sorts instead of walking that index.
export const DELETED_PARENT_MODERATION_POST_ID = seedUuid(10_000, '05')

const SELECTED_RECIPIENT_IDS = Array.from({ length: 100 }, (_, index) => seedUuid(index, 'cf'))

export const SELECTED_DISTRIBUTION_ID = '019e0000-7d02-7000-8000-000000000001'
const SELECTED_DISTRIBUTION_IDS = [
  SELECTED_DISTRIBUTION_ID,
  ...Array.from({ length: 100 }, (_, index) => seedUuid(index, 'ce')),
]

export async function seedSelectedRecipients(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedDeletedParentRecipients */
     INSERT INTO follower_distributions (id, sender_user_id, action, audience, post_id)
     SELECT id, $2, 'post_send', 'selected_followers', $3 FROM unnest($1::uuid[]) AS distribution(id)
     ORDER BY id ON CONFLICT (id) DO NOTHING`,
    [SELECTED_DISTRIBUTION_IDS, seedUser.id, seedPostId],
  )
  await transaction(
    `/* seedDeletedParentRecipientUsers */
     INSERT INTO users (id, username, deleted_at)
     SELECT id, 'seed-selected-recipient-' || ordinal,
       CASE WHEN ordinal % 3 = 0 THEN NULL ELSE CURRENT_TIMESTAMP END
     FROM unnest($1::uuid[]) WITH ORDINALITY AS recipient(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [SELECTED_RECIPIENT_IDS],
  )
  await transaction(
    `/* seedDeletedParentRecipientRows */
     INSERT INTO follower_distribution_selected_recipients (distribution_id, recipient_user_id)
     SELECT distribution.id, recipient.user_id
     FROM unnest($1::uuid[]) AS distribution(id)
     CROSS JOIN unnest($2::uuid[]) AS recipient(user_id)
     ORDER BY distribution.id, recipient.user_id ON CONFLICT DO NOTHING`,
    [SELECTED_DISTRIBUTION_IDS, SELECTED_RECIPIENT_IDS],
  )
  await transaction.commit()
  await write('/* analyzeDeletedParentRecipientUsers */ ANALYZE users')
  await write(
    '/* analyzeDeletedParentRecipientRows */ ANALYZE follower_distribution_selected_recipients',
  )
}

export async function seedSavedRssItems(): Promise<string[]> {
  const { rows } = await write<{ object_id: string }>(
    `/* seedDeletedParentSavedItems */
     INSERT INTO relation__user__save__rss_feed_item (subject_id, object_id, created_by_id)
     SELECT $1, item.id, $1 FROM rss_feed_items item ORDER BY item.id LIMIT 250
     ON CONFLICT DO NOTHING
     RETURNING object_id`,
    [seedUser.id],
  )
  await write('/* analyzeDeletedParentSavedItems */ ANALYZE relation__user__save__rss_feed_item')
  return rows.map(row => row.object_id)
}

export async function deleteSavedRssItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  await write(
    `/* cleanupDeletedParentSavedItems */
     DELETE FROM relation__user__save__rss_feed_item
     WHERE subject_id = $1 AND object_id = ANY($2::uuid[])`,
    [seedUser.id, itemIds],
  )
}

export async function seedFollowedFeedPage(): Promise<string[]> {
  const { rows } = await write<{ object_id: string }>(
    `/* seedDeletedParentFollowedFeeds */
     WITH selected_feeds AS (
       SELECT id, row_number() OVER (ORDER BY (deleted_at IS NULL), id DESC) AS ordinal
       FROM rss_feeds
       ORDER BY (deleted_at IS NULL), id DESC
       LIMIT 250
     )
     INSERT INTO relation__user__follow__rss_feed
       (subject_id, object_id, created_by_id, created_at)
     SELECT $1, feed.id, $1,
       CURRENT_TIMESTAMP - feed.ordinal * INTERVAL '1 second'
     FROM selected_feeds feed
     ON CONFLICT DO NOTHING
     RETURNING object_id`,
    [seedUser.id],
  )
  await write('/* analyzeDeletedParentFollowedFeeds */ ANALYZE relation__user__follow__rss_feed')
  return rows.map(row => row.object_id)
}

export async function deleteFollowedFeedPage(feedIds: string[]): Promise<void> {
  if (feedIds.length === 0) return
  await write(
    `/* cleanupDeletedParentFollowedFeeds */
     DELETE FROM relation__user__follow__rss_feed
     WHERE subject_id = $1 AND object_id = ANY($2::uuid[])`,
    [seedUser.id, feedIds],
  )
}

export async function seedSourceFeedPage(itemId: string): Promise<string[]> {
  const { rows } = await write<{ rss_feed_id: string }>(
    `/* seedDeletedParentSourceFeeds */
     INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT feed.id, item.id, item.published_at
     FROM rss_feeds feed
     CROSS JOIN rss_feed_items item
     WHERE item.id = $1
       AND feed.deleted_at IS NULL
     ORDER BY feed.id
     LIMIT 1000
     ON CONFLICT DO NOTHING
     RETURNING rss_feed_id`,
    [itemId],
  )
  await write('/* analyzeDeletedParentSourceFeeds */ ANALYZE rss_feed_item_sources')
  return rows.map(row => row.rss_feed_id)
}

export async function deleteSourceFeedPage(itemId: string, feedIds: string[]): Promise<void> {
  if (feedIds.length === 0) return
  await write(
    `/* cleanupDeletedParentSourceFeeds */
     DELETE FROM rss_feed_item_sources
     WHERE rss_feed_item_id = $1 AND rss_feed_id = ANY($2::uuid[])`,
    [itemId, feedIds],
  )
}

export async function seedDeletedParentModerationVersion(): Promise<void> {
  await ensureCurrentPostModerationVersion(DELETED_PARENT_MODERATION_POST_ID)
  // The current policy is absent from the retention cohort analyzed by the seed runner.
  await write(
    '/* analyzeDeletedParentModerationVersion */ ANALYZE post_moderation_versions, post_moderation_attempts, post_moderation_dispositions, posts',
  )
}

export async function deleteDeletedParentModerationVersion(): Promise<void> {
  await write(
    `/* cleanupDeletedParentModerationVersion */
     DELETE FROM post_moderation_versions
     WHERE post_id = $1 AND policy_revision = $2`,
    [DELETED_PARENT_MODERATION_POST_ID, POST_MODERATION_POLICY_REVISION],
  )
}

export async function deleteSelectedRecipients(): Promise<void> {
  await write(
    `/* cleanupDeletedParentRecipients */
     DELETE FROM follower_distribution_selected_recipients WHERE distribution_id = ANY($1::uuid[])`,
    [SELECTED_DISTRIBUTION_IDS],
  )
  await write(
    `/* cleanupDeletedParentDistribution */ DELETE FROM follower_distributions WHERE id = ANY($1::uuid[])`,
    [SELECTED_DISTRIBUTION_IDS],
  )
  await write(
    '/* cleanupDeletedParentRecipientUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])',
    [SELECTED_RECIPIENT_IDS],
  )
}
