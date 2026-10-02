import { afterEach, describe, expect, it } from 'vitest'
import { onceEntityListenerCompleted } from '@voucha/test-helpers/workers/entity-listeners/test-support'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestPost } from '@voucha/test-helpers/services/posts/test-support'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'

describe('suspended notification redirect lookup', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('returns the owned target and leaves the notification unread', async () => {
    const recipient = await createTestUser()
    const replier = await createTestUser()
    const root = await createTestPost({ user: recipient, title: `Root ${crypto.randomUUID()}` })
    await onceEntityListenerCompleted('processPostCreated', root.id)
    const reply = await createTestPost({
      user: replier,
      post_type: 'comment',
      parent_id: root.id,
      title: '',
      markdown: 'Reply body',
    })
    await reconcileNotificationsForPost(reply.id)

    const request = createRequest()
    await request.authenticateAs(recipient)
    const list = await request.get('/api/v1/my/notifications').expect(200)
    const notificationId = list.body.results[0].id as string
    const targetPath = list.body.notifications[notificationId].target_path as string

    suspendedUserIds.push(recipient.id)
    await suspendTestUser(recipient.id)

    const redirect = await request
      .get(`/api/v1/my/notifications/${notificationId}/redirect-target`)
      .expect(200)
    expect(redirect.body.target_url).toBe(targetPath)
    const unread = await request.get('/api/v1/my/notifications/unread').expect(200)
    expect(unread.body.unread_count).toBeGreaterThan(0)
  })
})
