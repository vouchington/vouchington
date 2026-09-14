import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestAiUsageRecord, insertTestCommunity } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/admin/ai-costs', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    const communities = await Promise.all([
      insertTestCommunity({ createdById: adminUser.id }),
      insertTestCommunity({ createdById: adminUser.id }),
    ])
    await Promise.all(
      communities.map(community => insertTestAiUsageRecord({ communityId: community.id })),
    )
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/admin/ai-costs').expect(401)
  })

  it('returns 403 for regular users', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/admin/ai-costs').expect(403)
  })

  it('returns 200 for admins with expected shape', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/admin/ai-costs').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    for (const result of response.body.results) {
      expect(result.total_cost.amount).toMatch(/^(0|[1-9]\d*)$/)
    }
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
    expect(response.body.page_info).toHaveProperty('start_cursor')
    expect(response.body.page_info).toHaveProperty('end_cursor')
  })

  it('continues with its opaque composite cursor without duplicating results', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const firstPage = await request.get('/api/v1/admin/ai-costs?limit=1').expect(200)
    expect(firstPage.body.page_info.has_next_page).toBe(true)

    const secondPage = await request
      .get(
        `/api/v1/admin/ai-costs?limit=1&after=${encodeURIComponent(
          firstPage.body.page_info.end_cursor,
        )}`,
      )
      .expect(200)

    expect(secondPage.body.results[0].community_id).not.toBe(firstPage.body.results[0].community_id)
  })

  it('returns 400 for an invalid composite cursor', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    await request.get('/api/v1/admin/ai-costs?after=not-a-cursor').expect(400)
  })
})
