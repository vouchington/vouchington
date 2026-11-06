import { beginTransaction, write } from '@data-stores/psql'
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
