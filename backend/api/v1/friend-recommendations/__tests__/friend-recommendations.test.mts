import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  insertTestFriend,
} from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/friend-recommendations', () => {
  let user: PrivateUser

  const userGithubId = String(Math.floor(Math.random() * 1_000_000) + 900_000)
  let friendUser: PrivateUser
  const friendGithubId = String(Math.floor(Math.random() * 1_000_000) + 1_000_000)

  beforeAll(async () => {
    user = await createTestUser()
    friendUser = await createTestUser()

    // Set up github accounts and friendship
    await insertTestOAuthAccount('github', userGithubId, null)
    await connectTestOAuthAccount('github', user.id, userGithubId)

    await insertTestOAuthAccount('github', friendGithubId, null)
    await connectTestOAuthAccount('github', friendUser.id, friendGithubId)

    await insertTestFriend('github', userGithubId, friendGithubId)
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/friend-recommendations').expect(401)
  })

  it('returns recommendations for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/friend-recommendations').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
  })

  it('returns users map in response', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/friend-recommendations').expect(200)

    expect(response.body.users).toBeDefined()
    expect(typeof response.body.users).toBe('object')
  })

  it('includes friend in results', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/friend-recommendations').expect(200)

    const resultIds = response.body.results.map((r: { id: string }) => r.id)
    expect(resultIds).toContain(friendUser.id)
  })

  it('respects limit query parameter', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/friend-recommendations?limit=1').expect(200)

    expect(response.body.results.length).toBeLessThanOrEqual(1)
  })

  it('marks legacy cursor requests for rollout measurement', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const legacyCursor = encodeURIComponent(encodeCursor({ id: friendUser.id }))

    const response = await request
      .get(`/api/v1/my/friend-recommendations?after=${legacyCursor}`)
      .expect(200)

    expect(response.headers.deprecation).toBe('true')
  })

  it('returns empty results when no recommendations exist', async () => {
    const isolatedUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(isolatedUser)

    const response = await request.get('/api/v1/my/friend-recommendations').expect(200)

    expect(response.body.results).toEqual([])
    expect(response.body.page_info.has_next_page).toBe(false)
  })
})
