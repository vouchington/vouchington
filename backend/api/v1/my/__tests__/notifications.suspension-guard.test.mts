import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestManualPostNotification,
  createTestPost,
  createTestUser,
  getNotificationById,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { listWebPushSubscriptionsPage, upsertWebPushSubscription } from '@services/notifications'

type Call = (
  request: ReturnType<typeof createRequest>,
  notificationId: string,
) => PromiseLike<{ status: number; body: { code?: string } }>

const calls: Array<[string, Call]> = [
  [
    'POST /api/v1/my/notifications/read-all',
    request => request.post('/api/v1/my/notifications/read-all'),
  ],
  [
    'PATCH /api/v1/my/notifications/:id',
    (request, id) => request.patch(`/api/v1/my/notifications/${id}`),
  ],
  [
    'DELETE /api/v1/my/notifications/:id',
    (request, id) => request.delete(`/api/v1/my/notifications/${id}`),
  ],
]

async function seedUnreadNotification(userId: string): Promise<string> {
  const sender = await createTestUser()
  const post = await createTestPost({ user: sender })
  return createTestManualPostNotification({ userId, sentByUserId: sender.id, postId: post.id })
}

function pushSubscription() {
  return {
    endpoint: `https://push.example/${crypto.randomUUID()}`,
    p256dh: 'p'.repeat(32),
    auth: 'a'.repeat(16),
  }
}

async function storedPushSubscriptions(userId: string) {
  return (await listWebPushSubscriptionsPage(userId, { limit: 100 })).results
}

describe('notification suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  async function suspend(userId: string) {
    await suspendTestUser(userId)
    suspendedUserIds.push(userId)
  }

  it.each(calls)(
    '%s refuses a suspended user without reading or deleting notifications',
    async (_name, call) => {
      const user = await createTestUser()
      const notificationId = await seedUnreadNotification(user.id)
      const otherId = await seedUnreadNotification(user.id)
      await suspend(user.id)
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await call(request, notificationId)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      for (const id of [notificationId, otherId]) {
        expect(await getNotificationById(id)).toMatchObject({ read_at: null, deleted_at: null })
      }
    },
  )

  it('POST /api/v1/my/notifications/read-all still marks an active user notifications read', async () => {
    const user = await createTestUser()
    const notificationId = await seedUnreadNotification(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/my/notifications/read-all').expect(204)

    expect((await getNotificationById(notificationId))?.read_at).toBeInstanceOf(Date)
  })

  it.each([
    ['a valid subscription', pushSubscription()],
    ['a malformed body', {}],
  ])(
    'POST /api/v1/my/notifications/push-subscriptions refuses a suspended user sending %s',
    async (_name, body) => {
      const user = await createTestUser()
      await upsertWebPushSubscription({ userId: user.id, ...pushSubscription() })
      const before = await storedPushSubscriptions(user.id)
      await suspend(user.id)
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request.post('/api/v1/my/notifications/push-subscriptions').send(body)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(before).toHaveLength(1)
      expect(await storedPushSubscriptions(user.id)).toEqual(before)
    },
  )

  it.each([['a stored subscription id'], ['a malformed id']])(
    'DELETE /api/v1/my/notifications/push-subscriptions/:id refuses a suspended user with %s',
    async name => {
      const user = await createTestUser()
      const stored = await upsertWebPushSubscription({ userId: user.id, ...pushSubscription() })
      const before = await storedPushSubscriptions(user.id)
      await suspend(user.id)
      const request = createRequest()
      await request.authenticateAs(user)

      const id = name === 'a malformed id' ? 'not-a-uuid' : stored.id
      const response = await request.delete(`/api/v1/my/notifications/push-subscriptions/${id}`)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(before).toEqual([expect.objectContaining({ id: stored.id })])
      expect(await storedPushSubscriptions(user.id)).toEqual(before)
    },
  )

  it('keeps the push subscription list available to a suspended user', async () => {
    const user = await createTestUser()
    const stored = await upsertWebPushSubscription({ userId: user.id, ...pushSubscription() })
    await suspend(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/notifications/push-subscriptions').expect(200)

    expect(response.body.results).toEqual([expect.objectContaining({ id: stored.id })])
  })

  describe('GET /api/v1/my/notifications/:id/redirect-target', () => {
    async function resolveRedirect(user: Awaited<ReturnType<typeof createTestUser>>) {
      const notificationId = await seedUnreadNotification(user.id)
      const request = createRequest()
      await request.authenticateAs(user)
      const listed = await request.get('/api/v1/my/notifications').expect(200)
      const targetPath = listed.body.notifications[notificationId].target_path as string
      const before = await getNotificationById(notificationId)
      const response = await request
        .get(`/api/v1/my/notifications/${notificationId}/redirect-target`)
        .expect(200)
      return { notificationId, targetPath, before, response }
    }

    it('still returns the target for a suspended user without recording the read', async () => {
      const user = await createTestUser()
      const sibling = await seedUnreadNotification(user.id)
      await suspend(user.id)

      const { notificationId, targetPath, before, response } = await resolveRedirect(user)

      expect(targetPath).toEqual(expect.any(String))
      expect(response.body).toEqual({ target_url: targetPath })
      expect(before).toMatchObject({ read_at: null })
      expect(await getNotificationById(notificationId)).toEqual(before)
      expect(await getNotificationById(sibling)).toMatchObject({ read_at: null })
    })

    it('records the read for an active user and returns the same target', async () => {
      const user = await createTestUser()
      const sibling = await seedUnreadNotification(user.id)

      const { notificationId, targetPath, response } = await resolveRedirect(user)

      expect(response.body).toEqual({ target_url: targetPath })
      expect((await getNotificationById(notificationId))?.read_at).toBeInstanceOf(Date)
      expect(await getNotificationById(sibling)).toMatchObject({ read_at: null })
    })

    it('answers 404 for a missing notification when the user is suspended', async () => {
      const user = await createTestUser()
      await suspend(user.id)
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .get(`/api/v1/my/notifications/${crypto.randomUUID()}/redirect-target`)
        .expect(404)
    })
  })
})
