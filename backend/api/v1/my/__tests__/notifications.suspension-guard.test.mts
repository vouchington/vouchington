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

describe('notification suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(calls)(
    '%s refuses a suspended user without reading or deleting notifications',
    async (_name, call) => {
      const user = await createTestUser()
      const notificationId = await seedUnreadNotification(user.id)
      const otherId = await seedUnreadNotification(user.id)
      await suspendTestUser(user.id)
      suspendedUserIds.push(user.id)
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
})
