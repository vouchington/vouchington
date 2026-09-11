import { beforeAll, describe, expect, it } from 'vitest'
import getRecommendedTopicsTool from './get-recommended-topics.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('get_recommended_topics tool — real DB', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns the correct result shape', async () => {
    const execute = getRecommendedTopicsTool.function(user)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(Array.isArray(result.results)).toBe(true)
    for (const r of result.results) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('score')
      expect(r).toHaveProperty('reason')
      expect(typeof r.score).toBe('number')
      expect(typeof r.reason).toBe('string')
    }
  })

  it('respects the limit parameter', async () => {
    const execute = getRecommendedTopicsTool.function(user)
    const result = await execute({ limit: 5 })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeLessThanOrEqual(5)
  })

  it('caps limit at 25', async () => {
    const execute = getRecommendedTopicsTool.function(user)
    const result = await execute({ limit: 999 })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeLessThanOrEqual(25)
  })

  it('hydrates BasicUser callers before loading recommendations', async () => {
    const basicUser: BasicUser = { __entity_type: 'user', id: user.id, roles: [] }
    const execute = getRecommendedTopicsTool.function(basicUser)
    const result = await execute({ limit: 1 })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeLessThanOrEqual(1)
  })

  it('rejects unknown current users', async () => {
    const basicUser: BasicUser = { __entity_type: 'user', id: randomUUID(), roles: [] }
    const execute = getRecommendedTopicsTool.function(basicUser)

    await expect(execute({})).rejects.toMatchObject({ status: 401 })
  })
})
