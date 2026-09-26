import { beforeAll, describe, expect, it } from 'vitest'
import searchDataPointsTool from '../search-data-points.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('search_data_points tool — real DB', () => {
  let user: PrivateUser
  let topicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Tool Search DP Topic ${suffix}`,
      slug: `tool-search-dp-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    await insertTestDataPoint({
      title: `Tool Approved ${suffix}`,
      slug: `tool-dp-approved-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
    })
    await insertTestDataPoint({
      title: `Tool Denied ${suffix}`,
      slug: `tool-dp-denied-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
  })

  it('has correct schema name', () => {
    expect(searchDataPointsTool.schema.name).toBe('search_data_points')
  })

  it('schema has all expected properties', () => {
    const params = searchDataPointsTool.schema.parameters
    expect(params).not.toBeNull()
    const props = (params as Record<string, unknown>).properties as Record<string, unknown>
    expect(props).toHaveProperty('topic_id')
    expect(props).toHaveProperty('vertical')
    expect(props).toHaveProperty('result')
    expect(props).toHaveProperty('credit_score_range')
    expect(props).toHaveProperty('limit')
  })

  it('no required fields', () => {
    const params = searchDataPointsTool.schema.parameters as Record<string, unknown>
    expect(params?.required).toEqual([])
  })

  it('vertical enum includes credit_card and bank_account', () => {
    const params = searchDataPointsTool.schema.parameters as Record<string, unknown>
    const props = params?.properties as Record<string, { enum?: string[] }>
    expect(props.vertical.enum).toContain('credit_card')
    expect(props.vertical.enum).toContain('bank_account')
  })

  it('returns results for a topic', async () => {
    const execute = searchDataPointsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.results.length).toBeGreaterThanOrEqual(2)
    expect(result.results[0]).toHaveProperty('id')
    expect(result.results[0]).toHaveProperty('title')
    expect(result.results[0]).toHaveProperty('structured_data')
  })

  it('filters by result', async () => {
    const execute = searchDataPointsTool.function(user)
    const result = await execute({ topic_id: topicId, result: 'approved' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.results.length).toBeGreaterThanOrEqual(1)
    expect(result.results.every(r => r.structured_data?.result === 'approved')).toBe(true)
  })

  it('accepts a topic slug', async () => {
    const execute = searchDataPointsTool.function(user)
    const result = await execute({ topic_id: `tool-search-dp-topic-${suffix}`, result: 'denied' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.results.map(r => r.title)).toContain(`Tool Denied ${suffix}`)
  })

  it('searches every topic when none is given', async () => {
    const execute = searchDataPointsTool.function(user)
    const result = await execute({ result: 'denied' })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results.every(r => r.structured_data?.result === 'denied')).toBe(true)
  })

  it('reports an unknown topic', async () => {
    const execute = searchDataPointsTool.function(user)
    const result = await execute({ topic_id: '00000000-0000-7000-8000-000000000001' })

    expect(result).toEqual({ success: false, error: 'Topic not found' })
  })

  it('works for unauthenticated (null) user', async () => {
    const execute = searchDataPointsTool.function(null as never)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(Array.isArray(result.results)).toBe(true)
  })
})
