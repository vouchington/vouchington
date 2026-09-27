import { describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'

describe('communities', () => {
  describe('GET /api/v1/communities', () => {
    it('reuses the anonymous community search cache for logged-out requests', async () => {
      const owner = await createTestUser()
      const suffix = createRandomString(8)
      const first = await insertTestCommunity({
        createdById: owner.id,
        name: `Cached List Community ${suffix} One`,
        slug: `cached-list-community-${suffix}-one`,
      })
      const query = `/api/v1/communities?q=${suffix}&limit=10`

      const firstResponse = await createRequest().get(query).expect(200)
      expect(firstResponse.headers['cache-control']).toContain('public')
      expect(resultIds(firstResponse.body.results)).toContain(first.id)

      const second = await insertTestCommunity({
        createdById: owner.id,
        name: `Cached List Community ${suffix} Two`,
        slug: `cached-list-community-${suffix}-two`,
      })

      const cachedResponse = await createRequest().get(query).expect(200)
      const cachedIds = resultIds(cachedResponse.body.results)
      expect(cachedIds).toContain(first.id)
      expect(cachedIds).not.toContain(second.id)

      const authenticated = createRequest()
      await authenticated.authenticateAs(owner)
      const freshIds = resultIds((await authenticated.get(query).expect(200)).body.results)
      expect(freshIds).toContain(first.id)
      expect(freshIds).toContain(second.id)
    })
  })
})

function resultIds(results: Array<{ id: string }>): string[] {
  return results.map(result => result.id)
}
