import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/admin/moderation-analytics', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/admin/moderation-analytics').expect(401)
  })

  it('returns 403 for regular users', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/admin/moderation-analytics').expect(403)
  })

  it('returns 200 for admins with expected shape', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/admin/moderation-analytics').expect(200)

    expect(response.body.range).toBe('30d')
    expect(response.body.scope).toEqual({ type: 'global' })
    expect(response.body).toHaveProperty('queue_volume')
    expect(response.body).toHaveProperty('rule_violations')
    expect(response.body).toHaveProperty('automod_performance')
    expect(response.body).toHaveProperty('moderator_workload')
    expect(response.body).toHaveProperty('appeals')
    expect(response.body).toHaveProperty('new_user_friction')
    expect(Array.isArray(response.body.queue_volume.reports_over_time)).toBe(true)
    expect(Array.isArray(response.body.moderator_workload.moderators)).toBe(true)
    expect(typeof response.body.moderator_workload.users).toBe('object')
  })

  it('accepts valid range params', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)

    for (const range of ['today', '7d', '30d', '90d', 'all']) {
      const response = await request
        .get(`/api/v1/admin/moderation-analytics?range=${range}`)
        .expect(200)
      expect(response.body.range).toBe(range)
    }
  })

  it('falls back to 30d for invalid range params', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser)

    const response = await request
      .get('/api/v1/admin/moderation-analytics?range=invalid')
      .expect(200)

    expect(response.body.range).toBe('30d')
  })
})
