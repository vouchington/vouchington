import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const routes = [
  { method: 'get', path: '/api/v1/bookmarks/topic/not-a-uuid' },
  { method: 'put', path: '/api/v1/bookmarks/topic/not-a-uuid/follow' },
  { method: 'delete', path: '/api/v1/bookmarks/topic/not-a-uuid/follow' },
] as const

describe('bookmark routes - request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe.each(routes)('$method $path', ({ method, path }) => {
    it('returns 401 without a validation diagnostic for an anonymous caller', async () => {
      const response = await createRequest()[method](path).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 422 for a malformed entity id once authenticated', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request[method](path).expect(422)
    })
  })
})
