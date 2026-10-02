import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getProfile, updateProfileMarkdown } from '@services/my/profile'
import { createProfileLink, listProfileLinks } from '@services/my/profile-links'

type Call = (
  request: ReturnType<typeof createRequest>,
  linkIds: string[],
) => PromiseLike<{ status: number; body: { code?: string } }>

const calls: Array<[string, Call]> = [
  [
    'PATCH /api/v1/my/profile',
    request => request.patch('/api/v1/my/profile').send({ markdown: 'Changed while suspended' }),
  ],
  [
    'POST /api/v1/my/profile/links',
    request =>
      request.post('/api/v1/my/profile/links').send({ link_type: 'github', handle: 'suspended' }),
  ],
  [
    'PUT /api/v1/my/profile/links/order',
    (request, linkIds) =>
      request.put('/api/v1/my/profile/links/order').send({ ids: [...linkIds].reverse() }),
  ],
  [
    'PATCH /api/v1/my/profile/links/:id',
    (request, linkIds) =>
      request.patch(`/api/v1/my/profile/links/${linkIds[0]}`).send({ handle: 'changed' }),
  ],
  [
    'DELETE /api/v1/my/profile/links/:id',
    (request, linkIds) => request.delete(`/api/v1/my/profile/links/${linkIds[0]}`),
  ],
]

describe('profile suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(calls)(
    '%s refuses a suspended user without changing the profile or its links',
    async (_name, call) => {
      const user = await createTestUser()
      await updateProfileMarkdown(user.id, 'Before suspension')
      const first = await createProfileLink(user.id, { link_type: 'github', handle: 'first' })
      const second = await createProfileLink(user.id, { link_type: 'twitter', handle: 'second' })
      const before = { profile: await getProfile(user.id), links: await listProfileLinks(user.id) }
      await suspendTestUser(user.id)
      suspendedUserIds.push(user.id)
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await call(request, [first.id, second.id])

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await getProfile(user.id)).toEqual(before.profile)
      expect(await listProfileLinks(user.id)).toEqual(before.links)
    },
  )
})
