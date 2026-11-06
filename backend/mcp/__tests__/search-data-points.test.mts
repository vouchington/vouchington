import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { beforeAll, describe, expect, it } from 'vitest'
import searchDataPointsTool from '../search-data-points.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('read_data_points.search tool — real DB', () => {
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
    await insertTestDataPoint({
      title: `Tool Bank ${suffix}`,
      slug: `tool-dp-bank-${suffix}`,
      createdById: user.id,
      vertical: 'bank_account',
      topicId,
      result: 'approved',
    })
  })

  it('has correct schema name', () => {
    expect(getRegisteredToolByName('read_data_points')?.schema.name).toBe('read_data_points')
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
    expect(props).toHaveProperty('after')
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

  it('filters by vertical and credit score', async () => {
    const execute = searchDataPointsTool.function(user)
    const vertical = await execute({ topic_id: topicId, vertical: 'bank_account' })
    expect(vertical.success).toBe(true)
    if (!vertical.success) return
    expect(vertical.results.map(row => row.title)).toContain(`Tool Bank ${suffix}`)
    expect(vertical.results.every(row => row.data_point_vertical === 'bank_account')).toBe(true)

    const scored = await execute({ topic_id: topicId, credit_score_range: '670-739' })
    expect(scored.success).toBe(true)
    if (!scored.success) return
    expect(scored.results.every(row => row.structured_data?.credit_score_range === '670-739')).toBe(
      true,
    )
    expect(scored.results.map(row => row.title)).toContain(`Tool Approved ${suffix}`)
  })

  it('pages one post at a time without duplicate ids and caps at 25', async () => {
    const execute = searchDataPointsTool.function(user)
    const seen = new Set<string>()
    let after: string | undefined
    for (let pageNumber = 0; pageNumber < 6; pageNumber += 1) {
      const page = await execute({ topic_id: topicId, limit: 1, after })
      expect(page.success).toBe(true)
      if (!page.success) return
      expect(page.results.length).toBeLessThanOrEqual(1)
      for (const row of page.results) {
        expect(seen.has(row.id)).toBe(false)
        seen.add(row.id)
      }
      if (!page.page_info.has_next_page) break
      expect(page.page_info.end_cursor).toEqual(expect.any(String))
      after = page.page_info.end_cursor ?? undefined
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)

    const capped = await execute({ topic_id: topicId, limit: 999 })
    expect(capped.success).toBe(true)
    if (!capped.success) return
    expect(capped.results.length).toBeLessThanOrEqual(25)
    expect(capped.results.length).toBeGreaterThanOrEqual(3)
  })
})
