import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import { createTestUser } from '@voucha/test-helpers'

describe('users', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('GET /md/users/:idOrUsername', () => {
    it('should return 404 for non-existent user', async () => {
      const request = createRequest()
      await request.get('/md/users/does-not-exist-user-xyz').expect(404)
    })

    it('should return text/markdown for an existing user by id', async () => {
      const request = createRequest()
      const response = await request.get(`/md/users/${user.id}`).expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('username')
      expect(response.text).toContain('url')
    })

    it('should return user profile by username', async () => {
      const request = createRequest()
      const response = await request.get(`/md/users/${user.username}`).expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
      expect(response.text).toContain(user.username!)
    })

    it('should set Cache-Control header with max-age=300', async () => {
      const request = createRequest()
      const response = await request.get(`/md/users/${user.id}`).expect(200)
      expect(response.headers['cache-control']).toBe('public, max-age=300')
    })

    it('returns ETag header', async () => {
      const request = createRequest()
      const response = await request.get(`/md/users/${user.id}`).expect(200)
      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
    })

    it('returns 304 for matching If-None-Match', async () => {
      const request = createRequest()
      const res1 = await request.get(`/md/users/${user.id}`).expect(200)
      const etag = res1.headers['etag']
      await request.get(`/md/users/${user.id}`).set('If-None-Match', etag).expect(304)
    })
  })
})
