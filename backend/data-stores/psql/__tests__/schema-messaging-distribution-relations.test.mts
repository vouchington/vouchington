import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import { insertTestPostsForUser } from '../../../test-helpers/entities/posts-deletion.mts'
import {
  insertAllFollowersDistributionWithRecipient,
  insertChatMessageWithoutRole,
  insertDuplicateSelectedRecipient,
  insertLocalConversation,
  insertNotificationWithMissingPublicationPost,
  insertNotificationWithMissingPublicationRssItem,
  insertNotificationWithUserAsPublicationPost,
  insertOversizedSelectedRecipientSet,
  insertSelectedDistributionWithoutRecipients,
  insertUnknownSelectedRecipient,
  insertUserChatMessageWithError,
} from '../../../test-helpers/data-stores/psql/messaging-distribution-relations.mts'

describe('messaging and distribution relation constraints', () => {
  afterAll(onGracefulShutdown)

  it('rejects publication targets that are not retained post or RSS identities', async () => {
    const user = await createLocalTestUser()
    await expect(insertNotificationWithMissingPublicationPost(user.id)).rejects.toThrow(
      'fk_notifications__publication_post_id',
    )
    await expect(insertNotificationWithUserAsPublicationPost(user.id)).rejects.toThrow(
      'fk_notifications__publication_post_id',
    )
    await expect(insertNotificationWithMissingPublicationRssItem(user.id)).rejects.toThrow(
      'fk_notifications__publication_rss_feed_item_id',
    )
  })

  it('rejects invalid selected recipient ownership, duplicates, and size', async () => {
    const sender = await createLocalTestUser()
    const recipient = await createLocalTestUser()
    const [postId] = await insertTestPostsForUser(sender.id, 1)

    await expect(insertSelectedDistributionWithoutRecipients(sender.id, postId!)).rejects.toThrow(
      'selected_followers distributions require between 1 and 100 recipients',
    )
    await expect(
      insertAllFollowersDistributionWithRecipient(sender.id, postId!, recipient.id),
    ).rejects.toThrow('all_followers distributions cannot store selected recipients')
    await expect(
      insertDuplicateSelectedRecipient(sender.id, postId!, recipient.id),
    ).rejects.toThrow('duplicate key value violates unique constraint')
    await expect(insertUnknownSelectedRecipient(sender.id, postId!)).rejects.toThrow(
      'fk_fd_selected_recipients__user',
    )
    await expect(insertOversizedSelectedRecipientSet(sender.id, postId!)).rejects.toThrow(
      'selected_followers distributions require between 1 and 100 recipients',
    )
  })

  it('rejects chat rows that are not a user or assistant message', async () => {
    const user = await createLocalTestUser()
    const conversationId = await insertLocalConversation(user.id)
    await expect(insertChatMessageWithoutRole(conversationId, user.id)).rejects.toThrow(
      'chk_conversation_messages__kind_content',
    )
    await expect(insertUserChatMessageWithError(conversationId, user.id)).rejects.toThrow(
      'chk_conversation_messages__kind_content',
    )
  })
})
