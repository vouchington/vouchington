import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('Individuals API Routes', () => {
    describe('GET /api/v1/me/individual', () => {
      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request.get('/api/v1/me/individual').expect(401)
      })

      it('should create an individual on first request and reuse it', async () => {
        const request = createRequest()
        await request.authenticateAs(user)

        const firstResponse = await request.get('/api/v1/me/individual').expect(200)
        const secondResponse = await request.get('/api/v1/me/individual').expect(200)

        expect(firstResponse.body.individual.id).toBeDefined()
        expect(secondResponse.body.individual.id).toBe(firstResponse.body.individual.id)
      })
    })

    describe('PATCH /api/v1/me/individual', () => {
      it('should not support the removed placeholder update endpoint', async () => {
        const request = createRequest()
        await request.authenticateAs(user)

        const response = await request.patch('/api/v1/me/individual').send({})

        expect([404, 405]).toContain(response.status)
      })
    })
  })
})
