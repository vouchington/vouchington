import { createRandomString } from '../../data.mts'
import { insertTestPost } from '../../entities/posts.mts'

export function closedSubscriptionWindow() {
  const entityCreatedAt = new Date(Date.now() - 2_000)
  return {
    subscribedAt: new Date(entityCreatedAt.getTime() - 1_000),
    entityCreatedAt,
    unsubscribedAt: new Date(entityCreatedAt.getTime() + 1_000),
  }
}

export function insertNotificationTestPost(authorId: string, title: string, createdAt?: Date) {
  const random = createRandomString(10)
  return insertTestPost({
    createdById: authorId,
    title: `${title} ${random}`,
    slug: `notification-test-post-${random}`,
    markdown: `Notification test post body ${random}`,
    createdAt,
  })
}

export function insertNotificationTestComment(input: {
  authorId: string
  parentId: string
  rootId: string
  createdAt: Date
}) {
  const random = createRandomString(10)
  return insertTestPost({
    createdById: input.authorId,
    title: '',
    slug: `notification-test-comment-${random}`,
    markdown: `Notification test comment body ${random}`,
    postType: 'comment',
    parentId: input.parentId,
    rootId: input.rootId,
    createdAt: input.createdAt,
  })
}
