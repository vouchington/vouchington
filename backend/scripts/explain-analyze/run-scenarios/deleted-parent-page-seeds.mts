import { beginTransaction, write } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { seedPostId, seedUser } from '../run-support.mts'

export const SELECTED_DISTRIBUTION_ID = '019e0000-7d02-7000-8000-000000000001'

export async function seedSelectedRecipients(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedDeletedParentRecipients */
     INSERT INTO follower_distributions (id, sender_user_id, action, audience, post_id)
     VALUES ($1, $2, 'post_send', 'selected_followers', $3)
     ON CONFLICT (id) DO NOTHING`,
    [SELECTED_DISTRIBUTION_ID, seedUser.id, seedPostId],
  )
  await transaction(
    `/* seedDeletedParentRecipientRows */
     INSERT INTO follower_distribution_selected_recipients (distribution_id, recipient_user_id)
     SELECT $1, user_id FROM unnest($2::uuid[]) AS recipient(user_id)
     ON CONFLICT DO NOTHING`,
    [SELECTED_DISTRIBUTION_ID, [seedUser.id]],
  )
  await transaction.commit()
}

export async function seedSavedRssItems(): Promise<void> {
  await write(
    `/* seedDeletedParentSavedItems */
     INSERT INTO relation__user__save__rss_feed_item (subject_id, object_id, created_by_id)
     SELECT $1, item.id, $1 FROM rss_feed_items item ORDER BY item.id LIMIT 3
     ON CONFLICT DO NOTHING`,
    [seedUser.id],
  )
}

export async function deleteSavedRssItems(): Promise<void> {
  await write(
    `/* cleanupDeletedParentSavedItems */
     DELETE FROM relation__user__save__rss_feed_item WHERE subject_id = $1`,
    [seedUser.id],
  )
}

export async function seedDeletedParentModerationVersion(): Promise<void> {
  await write(
    `/* seedDeletedParentModerationVersion */
     INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision, deadline_at)
     SELECT post.id, post.llm_moderation_content_sha256, $2, CURRENT_TIMESTAMP + INTERVAL '1 day'
     FROM posts post
     WHERE post.id = $1
       AND post.deleted_at IS NULL
       AND post.llm_moderation_content_sha256 IS NOT NULL
     ON CONFLICT DO NOTHING`,
    [seedPostId, POST_MODERATION_POLICY_REVISION],
  )
}

export async function deleteDeletedParentModerationVersion(): Promise<void> {
  await write(
    `/* cleanupDeletedParentModerationVersion */
     DELETE FROM post_moderation_versions
     WHERE post_id = $1 AND policy_revision = $2`,
    [seedPostId, POST_MODERATION_POLICY_REVISION],
  )
}

export async function deleteSelectedRecipients(): Promise<void> {
  await write(
    `/* cleanupDeletedParentRecipients */
     DELETE FROM follower_distribution_selected_recipients WHERE distribution_id = $1`,
    [SELECTED_DISTRIBUTION_ID],
  )
  await write(
    `/* cleanupDeletedParentDistribution */ DELETE FROM follower_distributions WHERE id = $1`,
    [SELECTED_DISTRIBUTION_ID],
  )
}
