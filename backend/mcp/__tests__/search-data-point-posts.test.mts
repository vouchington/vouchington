import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from '../../services/mcp-tools/call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from '../../services/mcp-tools/config.mts'
import searchPostsTool from '../search-posts.mts'
import { getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('read_posts data-point filters', () => {
  let user: PrivateUser & { membership_plan: null }
  let topicId: string
  let approvedId: string
  let deniedId: string
  const suffix = crypto.randomUUID()
  const slug = `data-point-search-${suffix}`

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
    topicId = await insertTestTopic({ name: slug, slug, createdById: user.id, topicType: 'card' })
    approvedId = await insertTestDataPoint({
      title: `Approved ${suffix}`,
      slug: `approved-${suffix}`,
      createdById: user.id,
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
    })
    deniedId = await insertTestDataPoint({
      title: `Denied ${suffix}`,
      slug: `denied-${suffix}`,
      createdById: user.id,
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
  })

  it('removes the replaced tool from the catalog', () => {
    expect(getRegisteredToolByName('read_data_points')).toBeUndefined()
  })

  it('filters by result and score using topic slugs and ids', async () => {
    const execute = searchPostsTool.function(user)
    const approved = await execute({ data_point_topic: slug, data_point_result: 'approved' })
    expect(approved).toMatchObject({
      success: true,
      results: [expect.objectContaining({ id: approvedId })],
    })
    const denied = await execute({
      data_point_topic: topicId,
      data_point_credit_score_range: '580-669',
    })
    expect(denied).toMatchObject({
      success: true,
      results: [expect.objectContaining({ id: deniedId })],
    })
    const none = await execute({
      data_point_topic: topicId,
      data_point_result: 'denied',
      data_point_credit_score_range: '670-739',
    })
    expect(none).toMatchObject({ success: true, results: [] })
  })

  it.each([
    { data_point_result: 'not-a-result' },
    { data_point_credit_score_range: 'not-a-range' },
  ])('rejects unsupported filter values: %j', async args => {
    await expect(
      callMcpTool(
        'read_posts',
        optionArgs('search', args),
        user,
        ['posts:read'],
        USER_MCP_SERVER_CONFIG,
      ),
    ).rejects.toMatchObject({ code: -32602 })
  })

  it('reads structured data through canonical post details', async () => {
    const result = await callStructuredMcpTool(
      user,
      'read_posts',
      optionArgs('details', {
        post_id: approvedId,
      }),
      ['posts:read'],
    )
    expect(result).toMatchObject({
      success: true,
      post: {
        id: approvedId,
        data_point_vertical: 'credit_card',
        structured_data: expect.objectContaining({
          result: 'approved',
          credit_score_range: '670-739',
        }),
      },
    })
  })

  it('pages matching data points through read_posts with posts:read', async () => {
    const result = await callStructuredMcpTool(
      user,
      'read_posts',
      optionArgs('search', {
        data_point_topic: topicId,
        data_point_result: 'approved',
        limit: 1,
      }),
      ['posts:read'],
    )
    expect(result).toMatchObject({
      success: true,
      results: [expect.objectContaining({ id: approvedId })],
    })
  })
})
