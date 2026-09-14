import { describe, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('vote-weight', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let targetUser: PrivateUser

  beforeAll(async () => {
    const username = `vote-weight-target-${randomBytes(4).toString('hex')}`
    ;[admin, regularUser, targetUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: false }),
      createTestUserDirect({ username }),
    ])
  }, 60_000)

  describe('PUT /api/v1/users/:userId/vote-weight', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request
        .put(`/api/v1/users/${targetUser.id}/vote-weight`)
        .send({ weight: 1 })
        .expect(401)
    })

    it('returns 403 for non-admin', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .put(`/api/v1/users/${targetUser.id}/vote-weight`)
        .send({ weight: 1 })
        .expect(403)
    })

    it('returns 204 for admin with valid weight', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/users/${targetUser.id}/vote-weight`)
        .send({ weight: 2.5 })
        .expect(204)
    })

    it('returns 400 for negative weight', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/users/${targetUser.id}/vote-weight`)
        .send({ weight: -1 })
        .expect(400)
    })

    it('returns 400 for non-number weight', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/users/${targetUser.id}/vote-weight`)
        .send({ weight: 'abc' })
        .expect(400)
    })
  })

  describe('DELETE /api/v1/users/:userId/vote-weight', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/users/${targetUser.id}/vote-weight`).expect(401)
    })

    it('returns 403 for non-admin', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.delete(`/api/v1/users/${targetUser.id}/vote-weight`).expect(403)
    })

    it('returns 204 for admin', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/users/${targetUser.id}/vote-weight`).expect(204)
    })
  })
})
