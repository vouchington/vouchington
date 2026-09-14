import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, assertValidIsoDateString } from '@voucha/test-helpers'
// Real, service-calling fixture (not the raw `@voucha/test-helpers` one) — this file waits on
// `processPostCreated` via `onceEntityListenerCompleted`, which only fires for posts created
// through the actual `createPost` write path.
import { createTestPost } from '@services/posts/test-support'
import { deleteNotification } from '@services/notifications/mutations'
import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'

describe('GET /api/v1/my/notifications/push-subscriptions', () => {
  it('paginates the authenticated user subscriptions', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    for (const suffix of ['a', 'b']) {
      await request
        .post('/api/v1/my/notifications/push-subscriptions')
        .send({
          endpoint: `https://push.example/${suffix}-${crypto.randomUUID()}`,
          p256dh: 'p'.repeat(32),
          auth: 'a'.repeat(16),
        })
        .expect(201)
    }
    const first = await request
      .get('/api/v1/my/notifications/push-subscriptions?limit=1')
      .expect(200)
    expect(first.body.page_info.has_next_page).toBe(true)
    const second = await request
      .get(
        `/api/v1/my/notifications/push-subscriptions?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
      )
      .expect(200)
    expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
  })
})

describe('DELETE /api/v1/my/notifications/push-subscriptions/:id', () => {
  it('is idempotent without deleting a replacement generation', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const endpoint = `https://push.example/${crypto.randomUUID()}`
    const createGeneration = () =>
      request.post('/api/v1/my/notifications/push-subscriptions').send({
        endpoint,
        p256dh: 'p'.repeat(32),
        auth: 'a'.repeat(16),
      })
    const first = (await createGeneration().expect(201)).body.web_push_subscription
    const replacement = (await createGeneration().expect(201)).body.web_push_subscription

    await request.delete(`/api/v1/my/notifications/push-subscriptions/${first.id}`).expect(204)
    const active = await request.get('/api/v1/my/notifications/push-subscriptions').expect(200)
    expect(active.body.results).toEqual([
      expect.objectContaining({ id: replacement.id, endpoint: replacement.endpoint }),
    ])

    await request
      .delete(`/api/v1/my/notifications/push-subscriptions/${replacement.id}`)
      .expect(204)
    await request
      .delete(`/api/v1/my/notifications/push-subscriptions/${replacement.id}`)
      .expect(204)
  })
})

describe('GET /api/v1/my/notifications', () => {
  it('returns notifications for the authenticated user', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()
    if (!author || !replier) throw new Error('Failed to create users')

    const root = await createTestPost({ user: author, title: 'Root post' })
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
    await request.authenticateAs(author)

    const response = await request.get('/api/v1/my/notifications').expect(200)
    expect(response.body.results).toHaveLength(1)
    expect(response.body.notifications[response.body.results[0].id].post_id).toBe(reply.id)
  })

  it('returns valid ISO date strings for all notification fields', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()

    const root = await createTestPost({ user: author, title: 'Date test root' })
    await onceEntityListenerCompleted('processPostCreated', root.id)
    const reply = await createTestPost({
      user: replier,
      post_type: 'comment',
      parent_id: root.id,
      title: '',
      markdown: 'Date validation reply',
    })
    await reconcileNotificationsForPost(reply.id)

    const request = createRequest()
    await request.authenticateAs(author)
    const response = await request.get('/api/v1/my/notifications').expect(200)

    expect(response.body.results.length).toBeGreaterThan(0)
    for (const result of response.body.results) {
      const notification = response.body.notifications[result.id]
      assertValidIsoDateString(notification.created_at, `notification[${result.id}].created_at`)
      assertValidIsoDateString(notification.updated_at, `notification[${result.id}].updated_at`)
    }
  })

  it('marks a notification as read', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()
    if (!author || !replier) throw new Error('Failed to create users')

    const root = await createTestPost({ user: author, title: 'Root post' })
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
    await request.authenticateAs(author)
    const listResponse = await request.get('/api/v1/my/notifications').expect(200)
    const notificationId = listResponse.body.results[0].id as string

    await request.patch(`/api/v1/my/notifications/${notificationId}`).expect(204)

    const unreadResponse = await request.get('/api/v1/my/notifications/unread').expect(200)
    expect(unreadResponse.body.unread_count).toBe(0)
  })

  it('marks a notification as read when resolving its redirect target', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()
    if (!author || !replier) throw new Error('Failed to create users')

    const root = await createTestPost({ user: author, title: 'Root post' })
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
    await request.authenticateAs(author)
    const listResponse = await request.get('/api/v1/my/notifications').expect(200)
    const notificationId = listResponse.body.results[0].id as string
    const targetPath = listResponse.body.notifications[notificationId].target_path

    const redirectResponse = await request
      .get(`/api/v1/my/notifications/${notificationId}/redirect-target`)
      .expect(200)
    expect(redirectResponse.body.target_url).toBe(targetPath)

    const unreadResponse = await request.get('/api/v1/my/notifications/unread').expect(200)
    expect(unreadResponse.body.unread_count).toBe(0)
  })

  it('does not recreate a notification after deleting it through the API', async () => {
    const author = await createTestUser()
    const replier = await createTestUser()
    if (!author || !replier) throw new Error('Failed to create users')

    const root = await createTestPost({ user: author, title: 'Root post' })
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
    await request.authenticateAs(author)

    const initialResponse = await request.get('/api/v1/my/notifications').expect(200)
    const notificationId = initialResponse.body.results[0].id as string

    await request.delete(`/api/v1/my/notifications/${notificationId}`).expect(204)
    await deleteNotification(author.id, notificationId)
    await reconcileNotificationsForPost(reply.id)

    const response = await request.get('/api/v1/my/notifications').expect(200)
    expect(response.body.results).toHaveLength(0)
  })
})
